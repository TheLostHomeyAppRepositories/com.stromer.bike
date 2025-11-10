# Stromer Bike App for Homey

## Overview

This is a Homey app (Node.js, SDK v3) that integrates Stromer e-bikes with the Homey smart home platform. The app enables users to monitor their Stromer bikes, track battery status, trip statistics, location, and control bike features (lights, locks) through Homey's automation platform.

Key features:
- Direct username/password authentication to obtain OAuth2 tokens from Stromer API
- Multi-bike support with device enumeration
- 20 custom capabilities including battery health, trip statistics, location tracking
- Remote control capabilities (lights, lock)
- Adaptive polling based on bike activity state
- 17 Flow cards for comprehensive automation
- Homey Insights integration for all data points

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Platform Framework
The application is built on **Homey SDK v3** without using the homey-oauth2app framework. This was a deliberate architectural decision because:

1. Stromer uses **username/password authentication** to obtain OAuth2 tokens, NOT standard OAuth2 redirect flow
2. The homey-oauth2app framework is designed for redirect-based OAuth2, which doesn't match Stromer's authentication pattern
3. Direct implementation provides better control over the two-step authentication flow (credentials → client_id → tokens)

**Rationale**: A custom implementation ensures compatibility with Stromer's authentication requirements while maintaining security best practices.

### Authentication Architecture
The app implements direct username/password authentication to obtain OAuth2 tokens from the Stromer API:

**Authentication Flow**:
1. User provides email, password, and client_id during pairing
2. App sends credentials to Stromer API v4 endpoint: `/mobile/v4/login/`
3. API returns OAuth2 access token and refresh token
4. Tokens are persisted in device store (passwords are NEVER stored)
5. When tokens expire, device becomes unavailable and user must repair (re-authenticate)

**API Implementation** (`lib/StromerAPI.js`):
- `authenticate(username, password, client_id)`: Exchanges credentials for tokens
- `refreshToken(client_id, refresh_token)`: Refreshes expired access tokens
- `getBikes(access_token)`: Enumerates bikes associated with account
- `getBikeStatus(access_token, bike_id)`: Retrieves real-time telemetry
- `setBikeLight(access_token, bike_id, state)`: Controls bike lights
- `setBikeLock(access_token, bike_id, state)`: Controls bike lock

**Security Design**:
- Passwords are collected during pairing but NEVER persisted
- Only OAuth2 tokens and client_id are stored in device data
- When refresh tokens expire, device becomes unavailable (requires repair)
- No plaintext credentials stored anywhere in the system

**Rationale**: This approach balances security (no stored passwords) with user experience (OAuth2 tokens enable long-term access until expiry).

### Device Pairing Flow
The pairing process uses a **two-step custom flow** leveraging Homey SDK v3's built-in and custom view capabilities:

**Pairing Steps**:
1. **login_credentials** (built-in template): User enters email and password
   - Uses Homey's standard `login_credentials` template with custom branding
   - Built-in "Ga Door" button automatically advances to next step
   
2. **client_id_input** (custom view): User enters Stromer API client_id
   - Custom HTML view for app-specific credential
   - Auto-discovered by Homey via `id` → `/pair/client_id_input.html` mapping
   - No explicit `template` or `url` declaration needed (SDK v3 convention)
   
3. **list_devices** (built-in template): User selects bike(s) to add
   - Driver calls Stromer API to enumerate bikes
   - User can add multiple bikes from same account
   
4. **add_devices** (built-in template): Confirmation and device creation

**Repair Flow** (when tokens expire):
1. **login_credentials**: User re-enters email and password
2. **client_id_input**: User re-enters client_id
3. New tokens obtained and persisted, device becomes available again

**Implementation Details** (`driver.js`):
- `onPair(session)`: Registers handlers for 'login' and 'set_client_id' events
- State persistence: `stromerAPI` and `bikes` maintained in function scope across handlers
- Two-phase authentication: credentials collected first, then client_id, then API call
- Same pattern used for both pairing and repair flows

**Critical SDK v3 Pattern**:
Custom views in SDK v3 are declared with just an `id` - NO `template` or `url` properties:
```json
{
  "id": "client_id_input",
  "navigation": { "next": "list_devices" }
}
```
Homey automatically maps `id: "client_id_input"` to `/drivers/stromer-bike/pair/client_id_input.html`

**Rationale**: Two-step credential collection enables secure authentication while supporting Stromer's requirement for both user credentials AND API client_id. Using built-in templates for standard inputs reduces development overhead and ensures consistent UI/UX.

### Data Polling Strategy
The app implements **adaptive polling** with two modes:

- **Standard polling**: Configurable interval (default: 10 minutes) for inactive bikes
- **Active polling**: Faster interval (default: 30 seconds) when bike is unlocked, moving, or theft alarm is active

Polling logic:
- Triggers increase polling frequency based on bike state
- Automatically reverts to standard polling when bike becomes inactive
- Implements exponential backoff on API failures (max 5 retries)

**Rationale**: Adaptive polling balances real-time monitoring needs during active use with API rate limits and battery conservation during idle periods.

### Capabilities and Data Model
Each bike device exposes 24 capabilities covering:

**Standard Homey capabilities**:
- `measure_battery`: Battery state of charge
- `alarm_theft`: Theft alarm status
- `onoff`: Light control (mapped to bike lights)
- `locked`: Lock control

**Custom Stromer capabilities** (prefixed with `stromer_`):
- Temperature sensors (motor, battery)
- Distance metrics (trip, daily, monthly, yearly, lifetime)
- Speed metrics (current, trip average, period averages)
- Location (latitude, longitude)
- Energy consumption
- Assistance level
- Battery health

All capabilities are configured for Homey Insights tracking with appropriate chart types (spline for continuous data, stepLine for cumulative counters).

**Rationale**: Using standard capabilities where possible ensures compatibility with existing Homey automations, while custom capabilities provide Stromer-specific features. Insights integration enables long-term trend analysis.

### Flow Card System
The app provides comprehensive automation through Homey Flow cards:

**Triggers** (When events):
- Battery/health threshold crossing
- Bike unlock events
- Theft alarm activation
- Distance/speed threshold crossing

**Conditions** (If checks):
- Battery level comparisons
- Lock state checks
- Light state checks
- Temperature range validation
- Theft alarm state

**Actions** (Then commands):
- Light control (off/on/dim/bright)
- Lock/unlock commands
- Trip distance reset
- Status notifications

**Rationale**: Flow cards expose all monitoring and control capabilities to Homey's automation engine, enabling complex scenarios like "notify when battery is low AND bike is unlocked" or "turn on lights when it gets dark AND bike is unlocked."

### Error Handling and Resilience
The architecture implements multiple resilience patterns:

- **Token refresh**: Automatic refresh before expiry using refresh token
- **Retry logic**: Exponential backoff on API failures with configurable max retries
- **Device availability**: Sets device unavailable on persistent failures, prompts re-authentication when refresh tokens expire
- **Graceful degradation**: Continues operation with partial data if some API endpoints fail

**Rationale**: E-bike connectivity can be intermittent (bike turned off, out of range, API issues). Resilience patterns ensure the app recovers gracefully without requiring manual intervention.

## External Dependencies

### Stromer API
- **Base URL**: `https://api3.stromer-portal.ch`
- **Authentication**: Username/password authentication to obtain OAuth2 tokens
- **API Version**: v4 (endpoint: `/mobile/v4/login/`)
- **Rate Limiting**: Unknown, mitigated through adaptive polling
- **Key Endpoints**:
  - Authentication: `/mobile/v4/login/` (returns access + refresh tokens)
  - Token refresh: `/mobile/v4/o/token/` (refresh expired tokens)
  - Bike enumeration: Retrieves list of bikes for authenticated user
  - Bike telemetry: Real-time data (battery, location, speed, temperature)
  - Bike control: Light and lock control commands

**Note**: API credentials (client_id) must be obtained through MITM interception of official Stromer mobile app (see README for instructions).

### NPM Packages
- **node-fetch** (^2.7.0): HTTP client for API requests

### Runtime Platform
- **Homey Pro 2023+**: Required for SDK v3 support
- **Node.js**: Runtime provided by Homey platform (version managed by Homey)

### File Structure
The application follows Homey's prescribed structure:
- `/app.js`: Main application class (minimal - delegates to driver)
- `/lib/StromerAPI.js`: Direct Stromer API client implementation
- `/drivers/stromer-bike/`: Device driver and device class
  - `driver.js`: Pairing/repair flow handlers, device enumeration
  - `device.js`: Device lifecycle, polling, capability management
  - `pair/client_id_input.html`: Custom view for client_id input
  - `repair/client_id_input.html`: Custom view for repair flow
- `/.homeycompose/`: Modular app configuration (capabilities, flow cards, app metadata)
- `/.homeybuild/`: Build output directory (generated by Homey CLI)

**Rationale**: This structure is mandated by Homey SDK v3 and enables the Homey build system to compose the final `app.json` from modular components.

## Recent Changes (November 10, 2025)

### Major Architecture Changes
1. **Removed homey-oauth2app framework**: Incompatible with Stromer's username/password authentication pattern
2. **Implemented custom authentication**: Direct username/password → OAuth2 token exchange via StromerAPI.js
3. **Fixed security vulnerability**: Removed plaintext password storage, only persist tokens and client_id
4. **Rewrote pairing flow**: Two-step flow using built-in login_credentials template + custom client_id_input view
5. **Fixed SDK v3 custom view configuration**: Removed `template: "custom"` declaration (auto-discovery by ID is the canonical pattern)

### Files Added
- `lib/StromerAPI.js`: Direct Stromer API client
- `drivers/stromer-bike/pair/client_id_input.html`: Custom client_id input view
- `drivers/stromer-bike/repair/client_id_input.html`: Custom client_id repair view

### Files Removed
- `lib/StromerOAuth2Client.js`: Removed (homey-oauth2app dependency)
- `lib/StromerOAuth2Token.js`: Removed (homey-oauth2app dependency)
- `drivers/stromer-bike/pair/login_credentials.html`: Removed (replaced with built-in template)
- `drivers/stromer-bike/repair/login_credentials.html`: Removed (replaced with built-in template)

### Validation Status
✓ All 20 custom capabilities configured
✓ All 17 Flow cards validated
✓ JavaScript syntax validated
✓ Project structure validated
✓ Ready for deployment to physical Homey device
