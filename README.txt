Stromer E-Bike Integration for Homey

Connect your Stromer e-bike to Homey and bring your bike into your smart home!

=== WHAT THIS APP DOES ===

Monitor and control your Stromer e-bike directly from Homey:
• Battery level and health monitoring
• Real-time GPS location tracking
• Motor and battery temperature
• Trip statistics and total distance
• Theft alarm notifications
• Remote light control
• Lock/unlock your bike
• Full integration with Homey Flow for automation
• Support for multiple bikes

=== SETUP INSTRUCTIONS ===

Before you can use this app, you need to obtain your Stromer API credentials. This requires a one-time technical setup:

1. Get Your Client ID (Advanced Users Only):
   You need to intercept the Stromer mobile app's API traffic using a tool like Charles Proxy or mitmproxy:
   - Install a MITM proxy tool (Charles Proxy, mitmproxy, or similar)
   - Configure your phone to use the proxy
   - Install the proxy's SSL certificate on your phone
   - Open the Stromer mobile app and login
   - Look for API requests to api3.stromer-portal.ch
   - Find the "client_id" parameter in the OAuth requests
   - Save this client_id for the next step

   Note: This is a technical process. If you're not comfortable with MITM proxying, ask for help in the Homey Community forum (see Support below).

2. Configure the App:
   - Install this app from the Homey App Store
   - Go to Homey Settings → Apps → Stromer
   - Enter your Stromer account email
   - Enter your Stromer account password
   - Enter the client_id you obtained in step 1
   - Save the settings

3. Pair Your Bike(s):
   - Go to Homey Devices → Add Device
   - Select "Stromer"
   - Select "Stromer Bike"
   - Choose your bike from the list
   - Done! Your bike is now connected

=== FEATURES ===

Monitor:
• Battery percentage and health
• Current location (GPS coordinates)
• Motor temperature
• Battery temperature
• Trip distance and average speed
• Total distance with custom baselines
• Daily, weekly, monthly, and yearly distance tracking
• Energy consumption
• Power cycle count
• Assistance level
• Theft alarm status
• Lock status
• Light status

Control:
• Turn lights on/off remotely
• Lock and unlock your bike
• Reset trip statistics

Automate with Homey Flow:
• Trigger flows when battery drops below a threshold
• Get notified when theft alarm activates
• Automate actions when bike is unlocked
• Create conditions based on battery level, temperature, lock status
• Send custom notifications
• And much more!

View Data:
• All metrics available in Homey Insights for historical tracking
• Configurable polling intervals per bike
• Faster polling when bike is active (unlocked/moving)

=== MULTI-BIKE SUPPORT ===

You can add multiple Stromer bikes to Homey. Each bike maintains its own:
• Distance baselines and statistics
• Polling intervals
• Settings and configuration

Simply pair each bike separately from the device pairing screen.

=== DISTANCE TRACKING ===

The app tracks your distance with custom baselines:
1. Go to your bike's device settings in Homey
2. Enter your current lifetime distance from the Stromer mobile app
3. The app will calculate and track:
   - User Total Distance (grows with every km)
   - Daily distance (resets at midnight)
   - Weekly distance (resets every Monday)
   - Monthly distance (resets on the 1st)
   - Yearly distance (resets January 1st)

Period distances reset automatically - no manual intervention needed!

=== REQUIREMENTS ===

• Homey Pro 2023 or later (SDK v3 compatible)
• Stromer e-bike with active Stromer account
• Stromer API client_id (see Setup Instructions)
• Internet connection for API access

=== PRIVACY & SECURITY ===

• Your Stromer credentials are stored securely in Homey's encrypted settings
• Passwords are automatically cleared after authentication
• Only access tokens are retained for API communication
• All communication uses secure HTTPS
• No data is sent to third parties

=== TROUBLESHOOTING ===

Device shows "unavailable":
• Check your internet connection
• Verify your Stromer credentials in app settings
• Make sure your bike is powered on and has cellular connectivity
• Try removing and re-pairing the device

Distance values look wrong:
• Configure your distance baselines in device settings
• Enter your current lifetime distance from the Stromer mobile app
• Make sure to enter the bike odometer value at the time you set the baseline

Theft alarm not triggering:
• Verify the alarm is enabled on your bike
• Check that the polling interval isn't too long (default 10 minutes)
• The app polls faster when the bike is active

=== SUPPORT ===

Need help? Visit:
• Homey Community Forum: https://community.homey.app/t/app-pro-stromer-speed-pedelec/145791
• GitHub Issues: https://github.com/wdool/stromer_homey/issues
• Developer: Wout van den Dool (woutdool@gmail.com)

=== VERSION ===

Version 1.0.0 - Initial Release

Enjoy your Stromer e-bike in Homey! 🚴‍♂️⚡
