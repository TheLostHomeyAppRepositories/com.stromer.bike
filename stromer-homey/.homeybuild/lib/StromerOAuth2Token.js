'use strict';

const { OAuth2Token } = require('homey-oauth2app');

class StromerOAuth2Token extends OAuth2Token {
  constructor({ access_token, refresh_token, token_type, expires_in, client_id, client_secret, api_version }) {
    super({ access_token, refresh_token, token_type, expires_in });
    this.client_id = client_id;
    this.client_secret = client_secret;
    this.api_version = api_version || 'v4';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      client_id: this.client_id,
      client_secret: this.client_secret,
      api_version: this.api_version,
    };
  }
}

module.exports = StromerOAuth2Token;
