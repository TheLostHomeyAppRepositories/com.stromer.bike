'use strict';

const { OAuth2Driver } = require('homey-oauth2app');
const fetch = require('node-fetch');
const StromerOAuth2Token = require('../../lib/StromerOAuth2Token');

class StromerBikeDriver extends OAuth2Driver {
  async onOAuth2Init() {
    this.log('StromerBikeDriver has been initialized');
  }

  async onPair(session) {
    let username;
    let password;
    let clientId;
    let clientSecret;
    let oAuth2Client;

    session.setHandler('login', async (data) => {
      username = data.username;
      password = data.password;
      clientId = data.client_id;
      
      const token = await this.authenticateWithCredentials(username, password, clientId, clientSecret);
      
      const client = await this.onOAuth2SessionCreated({ sessionId: session.id, token });
      oAuth2Client = client;
      
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!oAuth2Client) {
        throw new Error('Not logged in');
      }

      try {
        const bikes = await oAuth2Client.getBikes();
        
        if (!bikes || !Array.isArray(bikes) || bikes.length === 0) {
          throw new Error('No bikes found in your account');
        }

        return bikes.map(bike => ({
          name: bike.nickname || bike.name || `Stromer ${bike.biketype}`,
          data: {
            id: bike.id.toString(),
            bike_id: bike.id
          },
          store: {
            nickname: bike.nickname,
            biketype: bike.biketype,
            color: bike.color,
            bikenumber: bike.bikenumber
          }
        }));
      } catch (error) {
        this.error('Failed to list devices:', error);
        throw new Error('Failed to fetch bikes from Stromer: ' + error.message);
      }
    });

    return await super.onPair(session);
  }

  async onRepair(session, device) {
    let username;
    let password;

    session.setHandler('login', async (data) => {
      username = data.username;
      password = data.password;

      return true;
    });

    return await super.onRepair(session, device);
  }

  async onOAuth2SessionFactory(sessionId, oAuth2ConfigId, data) {
    const clientId = data.username.includes('client_id:') 
      ? data.username.split('client_id:')[1].trim()
      : '4P3VE9rBYdueKQioWb7nv7RJDU8EQsn2wiQaNqhG';
    
    const clientSecret = data.username.includes('client_secret:')
      ? data.username.split('client_secret:')[1].split(',')[0].trim()
      : null;

    const username = data.username.split('client_id:')[0].trim();
    const password = data.password;

    const token = await this.authenticateWithCredentials(username, password, clientId, clientSecret);
    
    return this.onOAuth2SessionCreated({ sessionId, token });
  }

  async authenticateWithCredentials(username, password, clientId, clientSecret) {
    const apiVersion = clientSecret ? 'v3' : 'v4';
    const loginUrl = apiVersion === 'v4'
      ? 'https://api3.stromer-portal.ch/mobile/v4/login/'
      : 'https://api3.stromer-portal.ch/users/login/';
    
    const tokenUrl = apiVersion === 'v4'
      ? 'https://api3.stromer-portal.ch/mobile/v4/o/token/'
      : 'https://api3.stromer-portal.ch/o/token/';

    try {
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password
        }),
      });

      if (!loginResponse.ok) {
        const error = await loginResponse.json().catch(() => ({}));
        throw new Error(error.error || 'Login failed');
      }

      const loginData = await loginResponse.json();
      
      const tokenBody = {
        grant_type: 'password',
        username: username,
        password: password,
        client_id: clientId
      };

      if (clientSecret) {
        tokenBody.client_secret = clientSecret;
      }

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tokenBody),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json().catch(() => ({}));
        throw new Error(error.error_description || 'Token request failed');
      }

      const tokenData = await tokenResponse.json();

      return new StromerOAuth2Token({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_in: tokenData.expires_in || 3600,
        client_id: clientId,
        client_secret: clientSecret,
        api_version: apiVersion
      });
    } catch (error) {
      this.error('Authentication failed:', error);
      throw new Error(`Stromer authentication failed: ${error.message}`);
    }
  }
}

module.exports = StromerBikeDriver;
