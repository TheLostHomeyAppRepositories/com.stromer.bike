# Stromer Bike App for Homey

## Overview

This Homey app integrates Stromer e-bikes with the Homey smart home platform. It allows users to monitor their Stromer bikes, including battery status, trip statistics, and location, and control features like lights and locks through Homey's automation. The app supports multi-bike setups, provides 20 custom capabilities, 17 Flow cards for extensive automation, and integrates with Homey Insights for data logging. The core purpose is to provide seamless and secure integration of Stromer e-bikes into a smart home environment, enhancing user control and automation possibilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application is built on **Homey SDK v3**, utilizing a custom authentication implementation due to Stromer's specific username/password-based OAuth2 token acquisition, which deviates from standard OAuth2 redirect flows.

### Authentication
The app employs **app-level centralized authentication**, where users provide Stromer credentials once in the App Settings. The authentication flow implements OAuth2 authorization code grant with Django CSRF protection, mirroring the Home Assistant Stromer integration:

1. **GET login page** → Extract CSRF token and session cookie from Set-Cookie headers
2. **POST credentials** with form-encoded data, csrfmiddlewaretoken, Referer header, and full cookie jar
3. **Follow redirect** to OAuth authorization endpoint with preserved session cookies
4. **Extract authorization code** from redirect Location header
5. **Exchange code for access token** using form-encoded data

**API Version Differences:**
- **v4** (client_id only): Uses `redirect_url=stromerauth://auth` for authorization, `redirect_uri=stromer://auth` for token exchange
- **v3** (client_id + client_secret): Uses `redirect_uri=stromerauth://auth` for both steps

All OAuth requests use `application/x-www-form-urlencoded` (not JSON). Session and CSRF cookies are maintained throughout the flow using a cookie jar. Passwords are automatically cleared after successful authentication, and a `StromerAuthService` singleton manages token refresh with thread-safety.

### Device Pairing
Pairing is streamlined: users configure credentials in App Settings, and then during device pairing, they simply select their bikes from a list enumerated by the `StromerAuthService`. This eliminates redundant credential entry for multiple bikes.

### Data Polling
The app uses an **adaptive polling strategy**:
- **Standard polling**: A configurable interval (default 10 minutes) for inactive bikes.
- **Active polling**: A faster interval (default 30 seconds) when the bike is unlocked, moving, or has an active theft alarm.
This approach balances real-time data needs with API rate limits and battery conservation.

### Capabilities and Data Model
Each bike device exposes 24 capabilities, including standard Homey capabilities (`measure_battery`, `alarm_theft`, `onoff`, `locked`) and 20 custom Stromer-specific capabilities (e.g., motor/battery temperature, various distance metrics, speed, location, energy consumption, assistance level, battery health). All capabilities are configured for Homey Insights tracking.

### Flow Card System
The app offers comprehensive automation via Homey Flow cards, including:
- **Triggers**: For events like battery thresholds, bike unlock, theft alarm, and distance/speed changes.
- **Conditions**: For checking battery levels, lock/light states, temperature ranges, and theft alarm status.
- **Actions**: For controlling lights, locking/unlocking, resetting trip data, and sending notifications.

### Error Handling and Resilience
The architecture includes:
- Automatic token refresh.
- Exponential backoff and retry logic for API failures.
- Setting devices as unavailable on persistent failures.
- Graceful degradation to ensure continued operation even with partial data.

## Recent Changes

### November 19, 2025: Baseline Calculation System and Major UI Overhaul
**Version 1.0.0** - Production-ready release with smart baseline calculation system

**Major Features:**
1. **Baseline Calculation System**: Implemented manual baseline inputs with automatic period resets
   - Users enter their current lifetime distance from Stromer app once
   - App calculates User Total Distance that grows with every km: `user_total_baseline + (current_odometer - odometer_at_baseline)`
   - Period distances auto-reset automatically:
     - **Year**: Resets January 1st
     - **Month**: Resets 1st of each month
     - **Week**: Resets every Monday
     - **Day**: Resets at midnight
   - Calculations: `period_distance = current_total_distance - period_baseline`

2. **Settings Page Enhancements**:
   - Added Distance Baselines section with 6 input fields
   - Lifetime Total Distance baseline (e.g., 46,396 km from Stromer app)
   - Bike Odometer at Baseline (current reading to anchor calculations)
   - Year/Month/Week/Day baselines (auto-managed by app)
   - Version number displayed (1.0.0)

3. **Capability Changes**:
   - **Added**: `stromer_week_distance` capability
   - **Removed**: Year/Month/Day average speed capabilities (API doesn't provide these)
   - **Removed**: Duplicate distance capabilities (`stromer_total_distance`, `stromer_lifetime_total_km`)
   - **Kept**: Trip Average Speed (from bike status API)

4. **Auto-Reset Logic**:
   - Checks on every poll if period changed
   - Stores period start dates in app settings
   - Automatically updates baselines to current odometer when period changes
   - Logs all auto-reset events for debugging

5. **Trip Reset Timeout Fix**:
   - Increased timeout to 30 seconds with AbortController
   - Added proper error messages for timeout vs other failures
   - User sees: "Trip reset request timed out. The bike may be offline or the API is slow. Please try again."

**Technical Implementation:**
- `checkAndResetBaselines(totalDistance)`: Detects period changes and updates baselines
- `getWeekNumber(date)`: ISO week calculation for week boundary detection
- Baselines stored in Homey app settings (persistent across restarts)
- All calculations use `Math.max(0, ...)` to prevent negative distances

**Why Baselines Instead of API Statistics:**
The Stromer API doesn't provide separate year/month/week/day statistics endpoints. The `/status` endpoint only returns current trip and total metrics. The baseline approach allows users to track historical statistics by:
1. Recording their current values from the Stromer mobile app
2. Letting the app calculate differences automatically
3. Auto-resetting periods without manual intervention

**Impact**: Users must delete and re-pair devices to see new Week Distance capability.

### November 18, 2025: Critical Bug Fixes and Location Capability Update
**CRITICAL FIX**: Fixed "Device unavailable" error and combined location display

**Issues Fixed:**
1. **Missing getBikeDetails() Method**: Added implementation in StromerAPI.js to fetch bike details from `/rapi/mobile/v{VERSION}/bike/{bikeId}/` endpoint. This was causing "getBikeDetails is not a function" TypeError and making devices unavailable.

2. **Combined Location Capability**: Changed from separate `stromer_latitude` and `stromer_longitude` number capabilities to a single `stromer_location` string capability displaying "52.123456, 4.567890" format. This matches user preference for combined location display.

3. **Immediate Data Loading**: Verified that data loads immediately on device init via `await this.updateBikeData()` in `onInit()` before polling starts. Previous unavailability was due to missing getBikeDetails() method, not polling delays.

**Impact**: Users with existing paired devices must delete and re-pair their bikes to see the new combined location field (Homey SDK limitation - cannot add/change capabilities on existing devices).

### November 16, 2025: Authentication Flow Rewrite
**CRITICAL FIX**: Completely rewrote authentication to match Home Assistant's working implementation after debugging 403 CSRF errors.

**Root Cause**: Original implementation used direct JSON POST without CSRF tokens or session cookies, causing Django CSRF verification failures.

**Solution**: Implemented proper OAuth2 authorization code flow with:
- CSRF token extraction from cookies using robust parsing (`headers.raw?.()['set-cookie'] ?? []`)
- Session cookie preservation throughout entire auth flow
- Form-encoded data (`application/x-www-form-urlencoded`) instead of JSON
- Referer header for Django CSRF compliance
- Correct redirect parameter names: v4 uses `redirect_url` for auth + `redirect_uri` for token; v3 uses `redirect_uri` for both
- Password masking in debug logs (shows only last 3 characters)

**Reference**: Implementation mirrors [CoMPaTech/stromer](https://github.com/CoMPaTech/stromer) Home Assistant integration line-by-line.

## External Dependencies

### Stromer API
- **Base URL**: `https://api3.stromer-portal.ch`
- **Authentication**: OAuth2 authorization code grant with Django CSRF protection
- **v4 endpoints**: `/mobile/v4/login/`, `/mobile/v4/o/authorize/`, `/mobile/v4/o/token/`
- **v3 endpoints**: `/users/login/`, `/o/authorize/`, `/o/token/`
- **Data endpoints**: `/rapi/mobile/v4.1/` (v4) or `/rapi/mobile/v2/` (v3)
- **Note**: `client_id` must be obtained via MITM interception of official Stromer mobile app; `client_secret` only needed for v3

### NPM Packages
- **node-fetch**: Used for HTTP API requests.

### Runtime Platform
- **Homey Pro 2023+**: Required for SDK v3 compatibility.
- **Node.js**: Runtime provided by the Homey platform.

### File Structure
The project adheres to the Homey SDK v3 structure:
- `/app.js`: Main application with `StromerAuthService` singleton.
- `/lib/StromerAPI.js`: Low-level Stromer API client.
- `/drivers/stromer-bike/`: Contains `driver.js` (pairing flow) and `device.js` (device lifecycle, polling, capabilities).
- `/.homeycompose/`: Modular app configuration (`app.json`, `capabilities/`, `flow/`).
- `settings/index.html`: Custom HTML page for app settings (email, password, client_id).