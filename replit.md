# Stromer Bike App for Homey

## Overview

This is a Homey app (Node.js, SDK v3) that integrates Stromer e-bikes with the Homey smart home platform. The app enables users to monitor their Stromer bikes, track battery status, trip statistics, location, and control bike features (lights, locks) through Homey's automation platform.

Key features:
- OAuth2 authentication with Stromer API (supports both v3 and v4 API versions)
- Multi-bike support with device enumeration
- Comprehensive bike telemetry (battery, temperature, speed, distance, location)
- Remote control capabilities (lights, lock)
- Adaptive polling based on bike activity state
- Flow card integration for powerful automation
- Homey Insights integration for all data points

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Platform Framework
The application is built on **Homey SDK v3** using the **homey-oauth2app** framework, which provides the foundation for OAuth2-based authentication and device management. This framework handles:
- OAuth2 token lifecycle management
- Session persistence
- Device discovery and pairing
- API client abstraction

**Rationale**: The homey-oauth2app framework eliminates boilerplate OAuth2 implementation and provides standardized patterns for Homey app development, ensuring compatibility and maintainability.

### Authentication Architecture
The app implements a dual-version OAuth2 flow to support both Stromer API v3 (legacy) and v4 (current):

- **v4 Flow**: Uses `/mobile/v4/login/` and `/mobile/v4/o/token/` endpoints without client_secret
- **v3 Flow**: Uses `/users/login/` and `/o/token/` endpoints with client_secret

Custom OAuth2 components:
- `StromerOAuth2Client`: Extends OAuth2Client to handle dual-version authentication, token refresh, and API requests
- `StromerOAuth2Token`: Extends OAuth2Token to persist additional metadata (client_id, client_secret, api_version)

**Rationale**: Supporting both API versions ensures compatibility with all Stromer account types. The custom token class maintains version-specific credentials needed for refresh operations.

### Device Pairing Flow
The pairing process follows a custom multi-step approach:
1. User enters credentials (username/password) through login view
2. App authenticates and retrieves OAuth2 tokens
3. App enumerates all bikes associated with the account
4. User selects which bike(s) to add as Homey devices
5. Each bike is registered as a separate device instance

**Rationale**: This approach supports multi-bike accounts while maintaining individual device state and settings per bike.

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
Each bike device exposes 24+ capabilities covering:

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

- **Token refresh**: Proactive refresh before expiry + reactive refresh on 401 errors
- **Retry logic**: Exponential backoff on API failures with configurable max retries
- **Device availability**: Sets device unavailable on persistent failures, prompts re-authentication when refresh tokens expire
- **Graceful degradation**: Continues operation with partial data if some API endpoints fail

**Rationale**: E-bike connectivity can be intermittent (bike turned off, out of range, API issues). Resilience patterns ensure the app recovers gracefully without requiring manual intervention.

## External Dependencies

### Stromer API
- **Base URL**: `https://api3.stromer-portal.ch`
- **Authentication**: OAuth2 (authorization code flow with refresh tokens)
- **API Versions**: Supports both v3 and v4 endpoints
- **Rate Limiting**: Unknown, mitigated through adaptive polling
- **Key Endpoints**:
  - Authentication: `/mobile/v4/o/token/`, `/o/token/`
  - Bike enumeration: Retrieves list of bikes for authenticated user
  - Bike telemetry: Real-time data (battery, location, speed, temperature)
  - Bike control: Light and lock control commands

**Note**: API credentials must be obtained through MITM interception of official Stromer mobile app (see README for instructions).

### NPM Packages
- **homey-oauth2app** (^3.7.2): Homey SDK framework for OAuth2 apps
- **node-fetch** (^2.7.0): HTTP client for API requests

### Runtime Platform
- **Homey Pro 2023+**: Required for SDK v3 support
- **Node.js**: Runtime provided by Homey platform (version managed by Homey)

### File Structure
The application follows Homey's prescribed structure:
- `/app.js`: Main application class
- `/lib/`: OAuth2 client and token implementations
- `/drivers/stromer-bike/`: Device driver and device class
- `/.homeycompose/`: Modular app configuration (capabilities, flow cards, app metadata)
- `/.homeybuild/`: Build output directory (generated by Homey CLI)

**Rationale**: This structure is mandated by Homey SDK v3 and enables the Homey build system to compose the final `app.json` from modular components.