'use strict';

const Homey = require('homey');

class StromerBikeDevice extends Homey.Device {
  async onInit() {
    this.log('StromerBikeDevice has been initialized');

    this.authService = this.homey.app.getAuthService();

    const settings = this.getSettings();
    this.pollInterval = (settings.poll_interval || 10) * 60 * 1000;
    this.activePollInterval = (settings.active_poll_interval || 30) * 1000;
    this.isActive = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.lastStatsFetch = 0;
    this.statsInterval = 60 * 60 * 1000;

    await this.setUnavailable('Connecting to Stromer...').catch(this.error);

    await this.updateBikeData();

    this.startPolling();

    this.registerCapabilityListener('onoff', async (value) => {
      return this.setLight(value ? 'on' : 'off');
    });

    this.registerCapabilityListener('locked', async (value) => {
      return this.setLock(value);
    });
  }

  async onDeleted() {
    this.log('StromerBikeDevice has been deleted');
    this.stopPolling();
  }

  async onUninit() {
    this.log('StromerBikeDevice has been uninited');
    this.stopPolling();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Settings changed');
    
    if (changedKeys.includes('poll_interval')) {
      this.pollInterval = newSettings.poll_interval * 60 * 1000;
    }
    
    if (changedKeys.includes('active_poll_interval')) {
      this.activePollInterval = newSettings.active_poll_interval * 1000;
    }

    if (changedKeys.includes('poll_interval') || changedKeys.includes('active_poll_interval')) {
      this.stopPolling();
      this.startPolling();
    }
  }

  startPolling() {
    this.stopPolling();
    
    const interval = this.isActive ? this.activePollInterval : this.pollInterval;
    this.log(`Starting polling with interval: ${interval}ms`);
    
    this.pollTimer = this.homey.setTimeout(async () => {
      await this.updateBikeData();
      this.startPolling();
    }, interval);
  }

  stopPolling() {
    if (this.pollTimer) {
      this.homey.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async updateBikeData() {
    try {
      const bikeId = this.getData().id;
      
      const fetchPromises = [
        this.authService.getBikeState(bikeId).catch(err => {
          this.error('Failed to get bike status:', err);
          return null;
        }),
        this.authService.getBikePosition(bikeId).catch(err => {
          this.error('Failed to get bike position:', err);
          return null;
        })
      ];

      const now = Date.now();
      const shouldFetchStats = (now - this.lastStatsFetch) > this.statsInterval;
      
      let bikeDetails = null;
      let yearStats = null;
      let monthStats = null;
      let dayStats = null;

      if (shouldFetchStats) {
        this.log('[DEBUG] Fetching statistics (bike is active, last fetch > 1 hour ago)');
        fetchPromises.push(
          this.authService.getBikeDetails(bikeId).catch(err => {
            this.error('Failed to get bike details:', err);
            return null;
          }),
          this.authService.getYearStatistics(bikeId).catch(err => {
            this.error('Failed to get year statistics:', err);
            return null;
          }),
          this.authService.getMonthStatistics(bikeId).catch(err => {
            this.error('Failed to get month statistics:', err);
            return null;
          }),
          this.authService.getDayStatistics(bikeId).catch(err => {
            this.error('Failed to get day statistics:', err);
            return null;
          })
        );
      }

      const results = await Promise.all(fetchPromises);
      const [status, position] = results;
      
      if (shouldFetchStats) {
        [, , bikeDetails, yearStats, monthStats, dayStats] = results;
        if (bikeDetails || yearStats || monthStats || dayStats) {
          this.lastStatsFetch = now;
        }
      }

      if (!status && !position) {
        throw new Error('Failed to fetch bike data');
      }

      this.log('[DEBUG] Raw API status response:', JSON.stringify(status, null, 2));
      this.log('[DEBUG] Raw API position response:', JSON.stringify(position, null, 2));
      if (bikeDetails) this.log('[DEBUG] Raw API bike details:', JSON.stringify(bikeDetails, null, 2));
      if (yearStats) {
        this.log('[STATS] Year statistics response:', JSON.stringify(yearStats, null, 2));
      } else {
        this.log('[STATS] Year statistics: null or not fetched');
      }
      if (monthStats) {
        this.log('[STATS] Month statistics response:', JSON.stringify(monthStats, null, 2));
      } else {
        this.log('[STATS] Month statistics: null or not fetched');
      }
      if (dayStats) {
        this.log('[STATS] Day statistics response:', JSON.stringify(dayStats, null, 2));
      } else {
        this.log('[STATS] Day statistics: null or not fetched');
      }

      this.retryCount = 0;

      if (status) {
        await this.updateStatusCapabilities(status, yearStats, monthStats, dayStats);
      }

      if (position) {
        await this.updatePositionCapabilities(position);
      }

      if (bikeDetails) {
        await this.updateBikeDetailsCapabilities(bikeDetails);
      }

      const wasActive = this.isActive;
      this.isActive = this.checkIfActive(status);
      
      if (wasActive !== this.isActive) {
        this.log(`Bike activity changed to: ${this.isActive ? 'active' : 'inactive'}`);
        this.stopPolling();
        this.startPolling();
      }

      await this.setAvailable().catch(this.error);

    } catch (error) {
      this.error('Failed to update bike data:', error);
      
      if (error.message && (error.message.includes('credentials') || error.message.includes('authentication') || error.message.includes('401'))) {
        await this.setUnavailable('Authentication failed. Please check App Settings and update credentials.').catch(this.error);
        this.stopPolling();
        return;
      }
      
      this.retryCount++;
      
      if (this.retryCount >= this.maxRetries) {
        await this.setUnavailable(`Failed to connect to bike: ${error.message}`).catch(this.error);
      }
      
      const backoffDelay = Math.min(Math.pow(2, this.retryCount) * 1000, 60000);
      this.log(`Retry ${this.retryCount}/${this.maxRetries}, backing off ${backoffDelay}ms`);
      
      this.stopPolling();
      this.pollTimer = this.homey.setTimeout(async () => {
        await this.updateBikeData();
        this.startPolling();
      }, backoffDelay);
    }
  }

  async updatePositionCapabilities(position) {
    if (position && position.latitude != null && position.longitude != null) {
      const locationString = `${position.latitude}, ${position.longitude}`;
      await this.setCapabilityValue('stromer_location', locationString).catch(this.error);
    }
  }

  async updateBikeDetailsCapabilities(details) {
    this.log('[DEBUG] Raw bike details for user total distance:', JSON.stringify(details, null, 2));
    
    if (details) {
      let userTotalDistance = null;
      
      if (details.user && details.user.total_distance !== undefined) {
        userTotalDistance = details.user.total_distance;
      } else if (details.bike && details.bike.user && details.bike.user.total_distance !== undefined) {
        userTotalDistance = details.bike.user.total_distance;
      } else if (details.total_distance !== undefined) {
        userTotalDistance = details.total_distance;
      }
      
      if (userTotalDistance !== null && this.hasCapability('stromer_user_total_distance')) {
        await this.setCapabilityValue('stromer_user_total_distance', userTotalDistance).catch(this.error);
      }
    }
  }

  async updateStatusCapabilities(status, yearStats = null, monthStats = null, dayStats = null) {
    const oldBattery = this.getCapabilityValue('measure_battery');
    const oldBatteryHealth = this.getCapabilityValue('stromer_battery_health');
    const oldTheftFlag = this.getCapabilityValue('alarm_theft');
    const oldLocked = this.getCapabilityValue('locked');

    const capabilities = {
      'measure_battery': status.battery_SOC || 0,
      'stromer_battery_health': status.battery_health || 100,
      'alarm_theft': status.theft_flag || false,
      'stromer_motor_temp_c': status.motor_temp || 0,
      'stromer_battery_temp_c': status.battery_temp || 0,
      'stromer_assistance_level': status.assistance_level || 0,
      'onoff': status.light_on || status.light === 'on' || false,
      'locked': status.lock === 'locked' || status.lock_status === 'locked' || status.bike_lock === true || false,
      'stromer_trip_distance': status.trip_distance || 0,
      'stromer_average_speed_trip': status.average_speed_trip || 0,
      'stromer_distance_total': status.total_distance || 0,
      'stromer_distance_avg_speed': status.average_speed_total || 0,
      'stromer_avg_energy': status.average_energy_consumption || 0,
      'stromer_total_distance': status.total_distance || 0,
      'stromer_lifetime_total_km': status.total_distance || 0,
      'stromer_power_cycles': status.power_on_cycles || 0,
      'stromer_atmospheric_pressure': status.atmospheric_pressure || 0,
      'stromer_total_energy_consumption': status.total_energy_consumption || 0
    };

    if (yearStats) {
      this.log('[STATS] Mapping year stats - distance:', yearStats.distance, 'avg_speed:', yearStats.avg_speed);
      if (yearStats.distance !== undefined) capabilities['stromer_year_distance'] = yearStats.distance;
      if (yearStats.avg_speed !== undefined) capabilities['stromer_year_avg_speed'] = yearStats.avg_speed;
    }

    if (monthStats) {
      this.log('[STATS] Mapping month stats - distance:', monthStats.distance, 'avg_speed:', monthStats.avg_speed);
      if (monthStats.distance !== undefined) capabilities['stromer_month_distance'] = monthStats.distance;
      if (monthStats.avg_speed !== undefined) capabilities['stromer_month_avg_speed'] = monthStats.avg_speed;
    }

    if (dayStats) {
      this.log('[STATS] Mapping day stats - avg_speed:', dayStats.avg_speed);
      if (dayStats.avg_speed !== undefined) capabilities['stromer_day_avg_speed'] = dayStats.avg_speed;
    }

    for (const [capability, value] of Object.entries(capabilities)) {
      if (value !== undefined && value !== null && this.hasCapability(capability)) {
        await this.setCapabilityValue(capability, value).catch(err => {
          this.error(`Failed to set ${capability}:`, err);
        });
      }
    }

    if (capabilities.alarm_theft && !oldTheftFlag) {
      await this.homey.flow.getDeviceTriggerCard('theft_activated')
        .trigger(this, {}, {})
        .catch(this.error);
    }

    if (oldLocked && !capabilities.locked) {
      await this.homey.flow.getDeviceTriggerCard('bike_unlocked')
        .trigger(this, {}, {})
        .catch(this.error);
    }

    if (oldBattery !== null && capabilities.measure_battery < oldBattery) {
      await this.homey.flow.getDeviceTriggerCard('battery_low')
        .trigger(this, {}, { threshold: capabilities.measure_battery })
        .catch(this.error);
    }

    if (oldBatteryHealth !== null && capabilities.stromer_battery_health < oldBatteryHealth) {
      await this.homey.flow.getDeviceTriggerCard('battery_health_low')
        .trigger(this, {}, { threshold: capabilities.stromer_battery_health })
        .catch(this.error);
    }
  }

  checkIfActive(status) {
    if (!status) return false;
    
    if (status.theft_flag) return true;
    
    if (status.lock === 'unlocked' || status.lock_status === 'unlocked' || status.bike_lock === false) return true;
    
    if ((status.bike_speed || status.speed) && (status.bike_speed || status.speed) > 0) return true;
    
    return false;
  }

  async setLight(mode) {
    try {
      const bikeId = this.getData().id;
      await this.authService.setBikeLight(bikeId, mode);
      
      await this.setCapabilityValue('onoff', mode === 'on' || mode === 'bright').catch(this.error);
      
      await this.updateBikeData();
      
      return true;
    } catch (error) {
      this.error('Failed to set light:', error);
      throw new Error('Failed to control bike light');
    }
  }

  async setLock(lock) {
    try {
      const bikeId = this.getData().id;
      await this.authService.setBikeLock(bikeId, lock);
      
      await this.setCapabilityValue('locked', lock).catch(this.error);
      
      await this.updateBikeData();
      
      return true;
    } catch (error) {
      this.error('Failed to set lock:', error);
      throw new Error('Failed to control bike lock');
    }
  }

  async resetTripDistance() {
    try {
      const bikeId = this.getData().id;
      await this.authService.resetTripData(bikeId);
      
      await this.setCapabilityValue('stromer_trip_distance', 0).catch(this.error);
      
      await this.updateBikeData();
      
      return true;
    } catch (error) {
      this.error('Failed to reset trip distance:', error);
      throw new Error('Failed to reset trip distance');
    }
  }
}

module.exports = StromerBikeDevice;
