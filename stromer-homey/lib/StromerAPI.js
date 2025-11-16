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

    this.log('[StromerAPI] DEBUG: Authentication request details:');
    this.log(`  - API Version: ${apiVersion}`);
    this.log(`  - Login URL: ${loginUrl}`);
    this.log(`  - Username: ${username}`);
    this.log(`  - Client ID: ${clientId}`);
    this.log(`  - Password: ${password ? '***' + password.slice(-3) : 'NOT SET'}`);

    try {
      const loginPayload = {
        username: username,
        password: password
      };
      
      this.log('[StromerAPI] DEBUG: Sending login request...');
      
      const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginPayload),
      });

      this.log(`[StromerAPI] DEBUG: Login response status: ${loginResponse.status} ${loginResponse.statusText}`);
      this.log('[StromerAPI] DEBUG: Login response headers:', Object.fromEntries(loginResponse.headers.entries()));

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        this.error('[StromerAPI] DEBUG: Login failed response body:', errorText);
        
        let error;
        try {
          error = JSON.parse(errorText);
        } catch (e) {
          error = { error: errorText || `HTTP ${loginResponse.status}` };
        }
        
        let errorMessage = error.error || error.message || `Login failed with status ${loginResponse.status}`;
        
        if (loginResponse.status === 403) {
          errorMessage = `Authentication rejected (403): This usually means wrong password, locked account, or invalid API credentials. Please verify:\n` +
            `  1. Your Stromer password is correct\n` +
            `  2. Your account is not locked (try logging into stromer-portal.ch)\n` +
            `  3. Client ID is current (may need to capture fresh one from mobile app)\n` +
            `  Original error: ${errorMessage}`;
        } else if (loginResponse.status === 401) {
          errorMessage = `Invalid credentials (401): Wrong username or password. Original error: ${errorMessage}`;
        } else if (loginResponse.status === 429) {
          errorMessage = `Rate limit exceeded (429): Too many login attempts. Please wait a few minutes. Original error: ${errorMessage}`;
        }
        
        throw new Error(errorMessage);
      }
      
      const loginData = await loginResponse.json();
      this.log('[StromerAPI] DEBUG: Login successful, received:', Object.keys(loginData));

      const tokenBody = {
        grant_type: 'password',
        username: username,
        password: password,
        client_id: clientId
      };

      if (clientSecret) {
        tokenBody.client_secret = clientSecret;
      }

      this.log('[StromerAPI] DEBUG: Requesting OAuth token...');
      this.log(`  - Token URL: ${tokenUrl}`);
      this.log(`  - Grant type: password`);
      this.log(`  - Client ID: ${clientId}`);

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tokenBody),
      });

      this.log(`[StromerAPI] DEBUG: Token response status: ${tokenResponse.status} ${tokenResponse.statusText}`);
      this.log('[StromerAPI] DEBUG: Token response headers:', Object.fromEntries(tokenResponse.headers.entries()));

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        this.error('[StromerAPI] DEBUG: Token request failed response body:', errorText);
        
        let error;
        try {
          error = JSON.parse(errorText);
        } catch (e) {
          error = { error: errorText || `HTTP ${tokenResponse.status}` };
        }
        
        let errorMessage = error.error_description || error.error || `Token request failed with status ${tokenResponse.status}`;
        
        if (tokenResponse.status === 403 || tokenResponse.status === 401) {
          errorMessage = `OAuth token rejected (${tokenResponse.status}): Invalid client_id. The client_id may have expired or been rotated by Stromer. ` +
            `You need to capture a fresh client_id from the official Stromer mobile app using MITM. Original error: ${errorMessage}`;
        } else if (tokenResponse.status === 400) {
          errorMessage = `Invalid OAuth request (400): ${errorMessage}. This could indicate API version mismatch or malformed request.`;
        }
        
        throw new Error(errorMessage);
      }

      const tokenData = await tokenResponse.json();
      this.log('[StromerAPI] DEBUG: Token received successfully');
      
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
