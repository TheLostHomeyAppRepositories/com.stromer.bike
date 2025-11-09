'use strict';

const { OAuth2Client, OAuth2Error } = require('homey-oauth2app');
const fetch = require('node-fetch');

class StromerOAuth2Client extends OAuth2Client {
  static API_URL = 'https://api3.stromer-portal.ch';
  static TOKEN_URL = 'https://api3.stromer-portal.ch/o/token/';
  static AUTHORIZATION_URL = 'https://api3.stromer-portal.ch/o/authorize/';
  static SCOPES = [];

  async onHandleNotOK({ body, status, statusText, headers }) {
    if (status === 401) {
      throw new OAuth2Error('Unauthorized', status);
    }
    
    if (body && body.error) {
      throw new OAuth2Error(body.error_description || body.error, status);
    }
    
    throw new OAuth2Error(`HTTP ${status}: ${statusText}`, status);
  }

  async onRefreshToken() {
    const token = this.getToken();
    if (!token || !token.refresh_token) {
      throw new OAuth2Error('No refresh token available');
    }

    const tokenUrl = token.api_version === 'v4' 
      ? `${this.constructor.API_URL}/mobile/v4/o/token/`
      : `${this.constructor.API_URL}/o/token/`;

    const body = {
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: token.client_id
    };

    if (token.client_secret) {
      body.client_secret = token.client_secret;
    }

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new OAuth2Error(error.error_description || 'Failed to refresh token');
      }

      const data = await response.json();
      
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || token.refresh_token,
        token_type: data.token_type || 'Bearer',
        expires_in: data.expires_in || 3600,
        client_id: token.client_id,
        client_secret: token.client_secret,
        api_version: token.api_version,
      };
    } catch (error) {
      this.log('Token refresh failed:', error.message);
      throw new OAuth2Error('Failed to refresh token', error);
    }
  }

  async getBikes() {
    return this.get({
      path: '/rapi/mobile/v4.1/bike/',
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async getBikeStatus(bikeId) {
    return this.get({
      path: `/rapi/mobile/v4.1/bike/${bikeId}/state/`,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async getBikePosition(bikeId) {
    return this.get({
      path: `/rapi/mobile/v4.1/bike/${bikeId}/position/`,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async getBikeStatistics(bikeId) {
    return this.get({
      path: `/rapi/mobile/v4.1/bike/${bikeId}/trip_data/`,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async setBikeLight(bikeId, mode) {
    return this.post({
      path: `/rapi/mobile/v4.1/bike/${bikeId}/light/`,
      json: {
        mode: mode
      },
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async setBikeLock(bikeId, lock) {
    return this.post({
      path: `/rapi/mobile/v4.1/bike/${bikeId}/lock/`,
      json: {
        status: lock ? 'locked' : 'unlocked'
      },
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  async resetTripDistance(bikeId) {
    return this.post({
      path: `/rapi/mobile/v4.1/bike/${bikeId}/trip/reset/`,
      json: {},
      headers: {
        'Accept': 'application/json',
      },
    });
  }
}

module.exports = StromerOAuth2Client;
