# Stromer Bike App for Homey

## Overview

This Homey app integrates Stromer e-bikes with the Homey smart home platform. It allows users to monitor their Stromer bikes, including battery status, trip statistics, and location, and control features like lights and locks through Homey's automation. The app supports multi-bike setups, provides 20 custom capabilities, 17 Flow cards for extensive automation, and integrates with Homey Insights for data logging. The core purpose is to provide seamless and secure integration of Stromer e-bikes into a smart home environment, enhancing user control and automation possibilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application is built on **Homey SDK v3**, utilizing a custom authentication implementation due to Stromer's specific username/password-based OAuth2 token acquisition, which deviates from standard OAuth2 redirect flows.

### Authentication
The app employs **app-level centralized authentication**, where users provide Stromer credentials once in the App Settings. These credentials are used to obtain OAuth2 tokens, which are then persisted and shared across all bike devices. Passwords are automatically cleared after successful authentication, enhancing security. A `StromerAuthService` singleton manages token refresh with a mutex for thread-safety, ensuring continuous and secure API access.

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

## External Dependencies

### Stromer API
- **Base URL**: `https://api3.stromer-portal.ch`
- **Authentication**: Username/password for OAuth2 tokens (v4 API endpoint: `/mobile/v4/login/`).
- **Key Endpoints**: Authentication, token refresh, bike enumeration, telemetry (battery, location, speed, temperature), and bike control (lights, lock).
- **Note**: `client_id` for API credentials must be obtained via MITM interception of the official Stromer mobile app.

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