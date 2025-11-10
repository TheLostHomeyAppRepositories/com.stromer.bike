'use strict';

const fetch = require('node-fetch');

class StromerAPI {
  constructor(log) {
    this.log = log || console.log;
    this.error = log ? log.bind(null, '[ERROR]') : console.error;
    
    this.baseUrl = 'https://api3.stromer-portal.ch';
    this.tokens = null;
    this.clientId = null;
    this.clientSecret = null;
    this.username = null;
    this.password = null;
  }

  async authenticate(username, password, clientId, clientSecret = null) {
    this.username = username;
    this.password = password;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    
    const apiVersion = clientSecret ? 'v3' : 'v4';
    const loginUrl = apiVersion === 'v4'
      ? `${this.baseUrl}/mobile/v4/login/`
      : `${this.baseUrl}/users/login/`;
    
    const tokenUrl = apiVersion === 'v4'
      ? `${this.baseUrl}/mobile/v4/o/token/`
      : `${this.baseUrl}/o/token/`;

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
        throw new Error(error.error || `Login failed with status ${loginResponse.status}`);
      }

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
        throw new Error(error.error_description || error.error || `Token request failed with status ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json();
      
      this.tokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_in: tokenData.expires_in || 3600,
        expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000)
      };

      this.log('[StromerAPI] Authentication successful');
      return this.tokens;
    } catch (error) {
      this.error('[StromerAPI] Authentication failed:', error.message);
      throw error;
    }
  }

  async refreshToken() {
    if (!this.tokens || !this.tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    const apiVersion = this.clientSecret ? 'v3' : 'v4';
    const tokenUrl = apiVersion === 'v4'
      ? `${this.baseUrl}/mobile/v4/o/token/`
      : `${this.baseUrl}/o/token/`;

    try {
      const tokenBody = {
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refresh_token,
        client_id: this.clientId
      };

      if (this.clientSecret) {
        tokenBody.client_secret = this.clientSecret;
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
        throw new Error(error.error_description || error.error || 'Token refresh failed');
      }

      const tokenData = await tokenResponse.json();
      
      this.tokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || this.tokens.refresh_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_in: tokenData.expires_in || 3600,
        expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000)
      };

      this.log('[StromerAPI] Token refreshed successfully');
      return this.tokens;
    } catch (error) {
      this.error('[StromerAPI] Token refresh failed:', error.message);
      throw error;
    }
  }

  async ensureValidToken() {
    if (!this.tokens) {
      throw new Error('Not authenticated');
    }

    const expiryBuffer = 5 * 60 * 1000;
    if (this.tokens.expires_at - Date.now() < expiryBuffer) {
      await this.refreshToken();
    }
  }

  async apiCall(endpoint, method = 'GET', body = null) {
    await this.ensureValidToken();

    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Authorization': `${this.tokens.token_type} ${this.tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (response.status === 401) {
        this.log('[StromerAPI] Token expired, refreshing...');
        await this.refreshToken();
        options.headers['Authorization'] = `${this.tokens.token_type} ${this.tokens.access_token}`;
        const retryResponse = await fetch(url, options);
        
        if (!retryResponse.ok) {
          throw new Error(`API call failed with status ${retryResponse.status}`);
        }
        
        return await retryResponse.json();
      }

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.error(`[StromerAPI] API call to ${endpoint} failed:`, error.message);
      throw error;
    }
  }

  async getBikes() {
    const data = await this.apiCall('/rapi/mobile/v2/bike/');
    return data || [];
  }

  async getBikeState(bikeId) {
    return await this.apiCall(`/rapi/mobile/v2/bike/${bikeId}/state/`);
  }

  async getBikePosition(bikeId) {
    return await this.apiCall(`/rapi/mobile/v2/bike/${bikeId}/position/`);
  }

  async setBikeLock(bikeId, lock) {
    return await this.apiCall(
      `/rapi/mobile/v2/bike/${bikeId}/lock/`,
      'PUT',
      { lock: lock ? 'true' : 'false' }
    );
  }

  async setBikeLight(bikeId, mode) {
    return await this.apiCall(
      `/rapi/mobile/v2/bike/${bikeId}/light/`,
      'PUT',
      { mode: mode }
    );
  }

  async resetTripData(bikeId) {
    return await this.apiCall(
      `/rapi/mobile/v2/bike/${bikeId}/trip_data/`,
      'DELETE'
    );
  }

  setTokens(tokens) {
    this.tokens = tokens;
  }

  setCredentials(username, password, clientId, clientSecret = null) {
    this.username = username;
    this.password = password;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  getTokens() {
    return this.tokens;
  }
}

module.exports = StromerAPI;
