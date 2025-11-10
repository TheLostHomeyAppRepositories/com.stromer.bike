'use strict';

const Homey = require('homey');
const StromerAPI = require('../../lib/StromerAPI');

class StromerBikeDriver extends Homey.Driver {
  async onInit() {
    this.log('StromerBikeDriver has been initialized');
  }

  async onPair(session) {
    let username = '';
    let password = '';
    let client_id = '';
    let stromerAPI = null;
    let bikes = [];

    session.setHandler('login', async (data) => {
      this.log('Login handler called with data:', { username: data.username, hasPassword: !!data.password });
      username = data.username;
      password = data.password;

      if (!username || !password) {
        throw new Error('Email and password are required');
      }

      this.log('Credentials received, waiting for client_id in next step');
      return true;
    });

    session.setHandler('set_client_id', async (data) => {
      this.log('Client ID handler called');
      client_id = data.client_id;

      if (!client_id) {
        throw new Error('Client ID is required');
      }

      if (!username || !password) {
        throw new Error('Please complete login first');
      }

      try {
        this.log('Authenticating with Stromer API...');
        stromerAPI = new StromerAPI(this.log.bind(this));
        
        await stromerAPI.authenticate(username, password, client_id, null);
        
        this.log('Authentication successful, fetching bikes...');
        bikes = await stromerAPI.getBikes();
        
        if (!bikes || bikes.length === 0) {
          throw new Error('No bikes found in your account');
        }

        this.log(`Found ${bikes.length} bike(s)`);
        return true;
      } catch (error) {
        this.error('Authentication failed:', error.message);
        throw new Error(`Authentication failed: ${error.message}`);
      }
    });

    session.setHandler('list_devices', async () => {
      if (!bikes || bikes.length === 0) {
        throw new Error('No bikes available. Please complete authentication first.');
      }

      return bikes.map(bike => {
        const bikeName = bike.nickname || bike.name || `Stromer ${bike.biketype || 'Bike'}`;
        const bikeId = bike.bikeid || bike.id;
        
        return {
          name: bikeName,
          data: {
            id: String(bikeId)
          },
          store: {
            nickname: bike.nickname,
            biketype: bike.biketype,
            color: bike.color,
            bikenumber: bike.bikenumber,
            client_id: stromerAPI.clientId,
            tokens: stromerAPI.getTokens()
          }
        };
      });
    });
  }

  async onRepair(session, device) {
    let username = '';
    let password = '';
    let client_id = '';

    session.setHandler('login', async (data) => {
      this.log('Repair: Login handler called');
      username = data.username;
      password = data.password;

      if (!username || !password) {
        throw new Error('Email and password are required');
      }

      this.log('Repair: Credentials received, waiting for client_id');
      return true;
    });

    session.setHandler('set_client_id', async (data) => {
      this.log('Repair: Client ID handler called');
      client_id = data.client_id;

      if (!client_id) {
        throw new Error('Client ID is required');
      }

      if (!username || !password) {
        throw new Error('Please complete login first');
      }

      try {
        this.log('Repair: Authenticating with Stromer API...');
        const stromerAPI = new StromerAPI(this.log.bind(this));
        await stromerAPI.authenticate(username, password, client_id, null);
        
        await device.setStoreValue('client_id', client_id);
        await device.setStoreValue('tokens', stromerAPI.getTokens());
        
        await device.onInit();
        
        this.log('Device repaired successfully');
        return true;
      } catch (error) {
        this.error('Repair failed:', error.message);
        throw new Error(`Re-authentication failed: ${error.message}`);
      }
    });
  }
}

module.exports = StromerBikeDriver;
