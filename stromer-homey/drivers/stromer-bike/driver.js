'use strict';

const Homey = require('homey');
const StromerAPI = require('../../lib/StromerAPI');

class StromerBikeDriver extends Homey.Driver {
  async onInit() {
    this.log('StromerBikeDriver has been initialized');
  }

  async onPair(session) {
    let stromerAPI = null;
    let bikes = [];

    session.setHandler('showView', async (viewId) => {
      this.log(`showView called with viewId: ${viewId}`);
      
      if (viewId === 'login_credentials') {
        session.setHandler('login', async (data) => {
          const { username, password, client_id } = data;
          
          if (!username || !password || !client_id) {
            throw new Error('Missing required credentials');
          }

          try {
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
            this.error('Login failed:', error.message);
            throw new Error(`Authentication failed: ${error.message}`);
          }
        });
        
        this.log('Login handler registered for pairing');
      }
    });

    session.setHandler('list_devices', async () => {
      if (!bikes || bikes.length === 0) {
        throw new Error('No bikes available. Please login first.');
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
    session.setHandler('showView', async (viewId) => {
      this.log(`Repair: showView called with viewId: ${viewId}`);
      
      if (viewId === 'login_credentials') {
        session.setHandler('login', async (data) => {
          const { username, password, client_id } = data;
          
          if (!username || !password || !client_id) {
            throw new Error('Missing required credentials');
          }

          try {
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
        
        this.log('Login handler registered for repair');
      }
    });
  }
}

module.exports = StromerBikeDriver;
