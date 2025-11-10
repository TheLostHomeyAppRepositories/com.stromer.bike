'use strict';

const Homey = require('homey');

class StromerApp extends Homey.App {
  async onInit() {
    this.log('Stromer app has been initialized');

    this.homey.flow.getDeviceTriggerCard('battery_low')
      .registerRunListener(async (args, state) => {
        return args.threshold >= state.threshold;
      });

    this.homey.flow.getDeviceTriggerCard('battery_health_low')
      .registerRunListener(async (args, state) => {
        return args.threshold >= state.threshold;
      });

    this.homey.flow.getDeviceTriggerCard('trip_distance_exceeds')
      .registerRunListener(async (args, state) => {
        return state.distance >= args.distance;
      });

    this.homey.flow.getDeviceTriggerCard('trip_speed_exceeds')
      .registerRunListener(async (args, state) => {
        return state.speed >= args.speed;
      });

    this.homey.flow.getActionCard('reset_trip_distance')
      .registerRunListener(async (args) => {
        return args.device.resetTripDistance();
      });

    this.homey.flow.getActionCard('toggle_light')
      .registerRunListener(async (args) => {
        return args.device.setLight(args.light_mode);
      });

    this.homey.flow.getActionCard('lock_bike')
      .registerRunListener(async (args) => {
        return args.device.setLock(true);
      });

    this.homey.flow.getActionCard('unlock_bike')
      .registerRunListener(async (args) => {
        return args.device.setLock(false);
      });

    this.homey.flow.getActionCard('send_bike_notification')
      .registerRunListener(async (args) => {
        const device = args.device;
        const battery = device.getCapabilityValue('measure_battery') || 0;
        const tripDistance = device.getCapabilityValue('stromer_trip_distance') || 0;
        const message = `${device.getName()}: Battery ${battery}%, Trip ${tripDistance}km`;
        await this.homey.notifications.createNotification({
          excerpt: message
        });
        return true;
      });

    this.homey.flow.getConditionCard('battery_above')
      .registerRunListener(async (args) => {
        const battery = args.device.getCapabilityValue('measure_battery');
        return battery > args.threshold;
      });

    this.homey.flow.getConditionCard('battery_health_above')
      .registerRunListener(async (args) => {
        const health = args.device.getCapabilityValue('stromer_battery_health');
        return health > args.threshold;
      });

    this.homey.flow.getConditionCard('is_locked')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('locked');
      });

    this.homey.flow.getConditionCard('light_on')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('onoff');
      });

    this.homey.flow.getConditionCard('theft_active')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('alarm_theft');
      });

    this.homey.flow.getConditionCard('temp_in_range')
      .registerRunListener(async (args) => {
        const temp = args.sensor === 'motor' 
          ? args.device.getCapabilityValue('stromer_motor_temp_c')
          : args.device.getCapabilityValue('stromer_battery_temp_c');
        return temp >= args.min && temp <= args.max;
      });

    this.log('Flow cards registered');
  }
}

module.exports = StromerApp;
