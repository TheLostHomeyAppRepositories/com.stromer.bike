'use strict';

const { OAuth2Device } = require('homey-oauth2app');

class StromerBikeDevice extends OAuth2Device {
  async onOAuth2Init() {
    this.log('StromerBikeDevice has been initialized');

    const settings = this.getSettings();
    this.pollInterval = (settings.poll_interval || 10) * 60 * 1000;
    this.activePollInterval = (settings.active_poll_interval || 30) * 1000;
    this.isActive = false;
    this.retryCount = 0;
    this.maxRetries = 5;

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

  async onOAuth2Deleted() {
    this.log('StromerBikeDevice has been deleted');
    this.stopPolling();
  }

  async onOAuth2Uninit() {
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

    this.stopPolling();
    this.startPolling();
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
      const bikeId = this.getData().bike_id;
      
      const [status, position, statistics] = await Promise.all([
        this.oAuth2Client.getBikeStatus(bikeId).catch(err => {
          this.error('Failed to get bike status:', err);
          return null;
        }),
        this.oAuth2Client.getBikePosition(bikeId).catch(err => {
          this.error('Failed to get bike position:', err);
          return null;
        }),
        this.oAuth2Client.getBikeStatistics(bikeId).catch(err => {
          this.error('Failed to get bike statistics:', err);
          return null;
        })
      ]);

      if (!status && !position && !statistics) {
        throw new Error('Failed to fetch any bike data');
      }

      this.retryCount = 0;

      if (status) {
        await this.updateStatusCapabilities(status);
      }

      if (position) {
        await this.updatePositionCapabilities(position);
      }

      if (statistics) {
        await this.updateStatisticsCapabilities(statistics);
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

  async updateStatusCapabilities(status) {
    const capabilities = {
      'measure_battery': status.bike_battery_percentage,
      'stromer_battery_health': status.battery_health || status.bike_battery_health,
      'alarm_theft': status.theft_flag || false,
      'stromer_motor_temp_c': status.motor_temp,
      'stromer_battery_temp_c': status.battery_temp,
      'stromer_bike_speed': status.speed || 0,
      'stromer_assistance_level': status.assistance_level || status.power_level,
      'onoff': status.light_on || false,
      'locked': status.lock_status === 'locked' || status.bike_lock === true
    };

    for (const [capability, value] of Object.entries(capabilities)) {
      if (value !== undefined && value !== null && this.hasCapability(capability)) {
        await this.setCapabilityValue(capability, value).catch(err => {
          this.error(`Failed to set ${capability}:`, err);
        });
      }
    }

    const oldTheftFlag = this.getCapabilityValue('alarm_theft');
    if (capabilities.alarm_theft && !oldTheftFlag) {
      await this.homey.flow.getDeviceTriggerCard('theft_activated')
        .trigger(this, {}, {})
        .catch(this.error);
    }

    const oldLocked = this.getCapabilityValue('locked');
    if (oldLocked && !capabilities.locked) {
      await this.homey.flow.getDeviceTriggerCard('bike_unlocked')
        .trigger(this, {}, {})
        .catch(this.error);
    }
  }

  async updatePositionCapabilities(position) {
    if (position.latitude && position.longitude) {
      await this.setCapabilityValue('stromer_latitude', position.latitude).catch(this.error);
      await this.setCapabilityValue('stromer_longitude', position.longitude).catch(this.error);
    }
  }

  async updateStatisticsCapabilities(statistics) {
    const capabilities = {
      'stromer_trip_distance': statistics.trip_distance / 1000,
      'stromer_average_speed_trip': statistics.trip_average_speed,
      'stromer_distance_total': statistics.distance / 1000,
      'stromer_distance_avg_speed': statistics.distance_average_speed,
      'stromer_year_distance': statistics.year_distance / 1000,
      'stromer_year_avg_speed': statistics.year_average_speed,
      'stromer_month_distance': statistics.month_distance / 1000,
      'stromer_month_avg_speed': statistics.month_average_speed,
      'stromer_day_avg_speed': statistics.day_average_speed,
      'stromer_avg_energy': statistics.average_energy_consumption,
      'stromer_total_distance': statistics.total_distance / 1000,
      'stromer_lifetime_total_km': (statistics.legacy_distance + statistics.total_distance) / 1000
    };

    for (const [capability, value] of Object.entries(capabilities)) {
      if (value !== undefined && value !== null && this.hasCapability(capability)) {
        await this.setCapabilityValue(capability, value).catch(err => {
          this.error(`Failed to set ${capability}:`, err);
        });
      }
    }

    const oldBattery = this.getCapabilityValue('measure_battery');
    const newBattery = this.getCapabilityValue('measure_battery');
    
    const oldBatteryHealth = this.getCapabilityValue('stromer_battery_health');
    const newBatteryHealth = this.getCapabilityValue('stromer_battery_health');
  }

  checkIfActive(status) {
    if (!status) return false;
    
    if (status.theft_flag) return true;
    
    if (status.lock_status === 'unlocked' || status.bike_lock === false) return true;
    
    if (status.speed && status.speed > 0) return true;
    
    return false;
  }

  async setLight(mode) {
    try {
      const bikeId = this.getData().bike_id;
      await this.oAuth2Client.setBikeLight(bikeId, mode);
      
      await this.setCapabilityValue('onoff', mode === 'on' || mode === 'bright').catch(this.error);
      
      return true;
    } catch (error) {
      this.error('Failed to set light:', error);
      throw new Error('Failed to control bike light');
    }
  }

  async setLock(lock) {
    try {
      const bikeId = this.getData().bike_id;
      await this.oAuth2Client.setBikeLock(bikeId, lock);
      
      await this.setCapabilityValue('locked', lock).catch(this.error);
      
      return true;
    } catch (error) {
      this.error('Failed to set lock:', error);
      throw new Error('Failed to control bike lock');
    }
  }

  async resetTripDistance() {
    try {
      const bikeId = this.getData().bike_id;
      await this.oAuth2Client.resetTripDistance(bikeId);
      
      await this.setCapabilityValue('stromer_trip_distance', 0).catch(this.error);
      
      return true;
    } catch (error) {
      this.error('Failed to reset trip distance:', error);
      throw new Error('Failed to reset trip distance');
    }
  }
}

module.exports = StromerBikeDevice;
