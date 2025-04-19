# NuTetra Auto Dosing System

This module implements automated pH and EC monitoring and control for hydroponic systems, specifically designed for the NuTetra controller running on a Raspberry Pi.

## Features

- Continuously monitors pH and EC sensor readings
- Automatically doses pH Up or pH Down to maintain target pH range
- Automatically doses nutrients to maintain target EC level
- Follows plant profile settings for target values
- Prevents over-dosing with cooldown periods
- Doses one nutrient at a time with configurable delays
- Logs all actions with detailed timestamped history
- Configurable parameters for tolerances, check intervals, and cooldown periods

## Files

- `auto_dosing.py` - Core auto dosing module with the main logic
- `auto_dosing_integration.py` - Integration script that connects the auto dosing module to the existing system
- `src/app/api/dosing/auto/route.ts` - API route for controlling auto dosing from the web interface
- `server.js` - Modified to automatically start the auto dosing system when the application starts

## Installation

1. Place the `auto_dosing.py` and `auto_dosing_integration.py` files in the root directory of your NuTetra project.

2. Update the Next.js API routes by creating a directory structure: `src/app/api/dosing/auto/` and adding the `route.ts` file inside it.

3. Install any required Python dependencies:
   ```bash
   pip install asyncio
   ```

## Usage

### Automatic Startup

The auto dosing system now starts automatically when the main application starts. The `server.js` file has been modified to spawn the auto dosing process and manage its lifecycle:

- When the application starts, the auto dosing system is launched
- If the auto dosing process crashes, it will automatically restart after a 10-second delay
- When the application shuts down, the auto dosing process is properly terminated

### Manual Startup (Alternative)

If you need to run the auto dosing system separately, you can start it manually:

```bash
# Start the auto dosing service in the background
python auto_dosing_integration.py &
```

### Systemd Service (Alternative)

For systems that don't use the Node.js server (or as an alternative approach), you can use systemd to manage the auto dosing service:

```bash
# Create a systemd service file
sudo nano /etc/systemd/system/nutetra-autodosing.service
```

Add the following content:

```
[Unit]
Description=NuTetra Auto Dosing Service
After=network.target

[Service]
ExecStart=/usr/bin/python /home/pi/nutetra/auto_dosing_integration.py
WorkingDirectory=/home/pi/nutetra
StandardOutput=inherit
StandardError=inherit
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl enable nutetra-autodosing
sudo systemctl start nutetra-autodosing
```

### Web Interface Control

The auto dosing system can be controlled through the existing web interface via API endpoints:

#### Get Status

```
GET /api/dosing/auto
```

Response:
```json
{
  "status": "success",
  "data": {
    "enabled": true,
    "running": true,
    "last_check_time": 1631234567,
    "last_dosing_time": 1631234560,
    "in_cooldown": false,
    "cooldown_remaining": 0,
    "config": {
      "check_interval": 60,
      "dosing_cooldown": 300,
      "between_dose_delay": 30,
      "ph_tolerance": 0.2,
      "ec_tolerance": 0.2
    }
  }
}
```

#### Get History

```
GET /api/dosing/auto?type=history&limit=50
```

Response:
```json
{
  "status": "success",
  "data": {
    "dosing_history": [
      {
        "timestamp": "2023-08-15T14:23:45.123Z",
        "pump": "pH Down",
        "amount": 0.5,
        "reason": "pH adjustment",
        "current_value": 6.8,
        "target_value": 6.0
      },
      {
        "timestamp": "2023-08-15T15:30:15.456Z",
        "pump": "Pump 1",
        "amount": 1.0,
        "reason": "EC adjustment",
        "current_value": 1.2,
        "target_value": 1.4,
        "product": "Grow A"
      }
    ],
    "sensor_history": [
      {
        "timestamp": "2023-08-15T14:23:40.789Z",
        "ph": 6.8,
        "ec": 1.4,
        "waterTemp": 23.5
      }
    ]
  }
}
```

#### Enable Auto Dosing

```
POST /api/dosing/auto
Content-Type: application/json

{
  "action": "enable"
}
```

Response:
```json
{
  "status": "success",
  "message": "Auto dosing enabled"
}
```

#### Disable Auto Dosing

```
POST /api/dosing/auto
Content-Type: application/json

{
  "action": "disable"
}
```

Response:
```json
{
  "status": "success",
  "message": "Auto dosing disabled"
}
```

#### Update Configuration

```
POST /api/dosing/auto
Content-Type: application/json

{
  "action": "updateConfig",
  "config": {
    "check_interval": 120,
    "dosing_cooldown": 600,
    "between_dose_delay": 60,
    "ph_tolerance": 0.3,
    "ec_tolerance": 0.3
  }
}
```

Response:
```json
{
  "status": "success",
  "message": "Auto dosing configuration updated",
  "data": {
    "enabled": true,
    "check_interval": 120,
    "dosing_cooldown": 600,
    "between_dose_delay": 60,
    "ph_tolerance": 0.3,
    "ec_tolerance": 0.3
  }
}
```

## Configuration Parameters

The auto dosing system can be configured with the following parameters:

- `enabled` - Whether auto dosing is enabled (boolean)
- `check_interval` - Time in seconds between sensor checks (integer, default 60)
- `dosing_cooldown` - Time in seconds to wait after a dosing cycle (integer, default 300)
- `between_dose_delay` - Time in seconds to wait between individual nutrient doses (integer, default 30)
- `ph_tolerance` - Acceptable deviation from target pH (float, default 0.2)
- `ec_tolerance` - Acceptable deviation from target EC (float, default 0.2)

## Logs and History

The auto dosing system logs all actions to:

- `auto_dosing.log` - Core module logs
- `auto_dosing_integration.log` - Integration logs

It also maintains an in-memory history of all dosing actions and sensor readings, which can be accessed via the API or exported to a JSON file via the `export_history_to_file()` method.

## Extending the System

The auto dosing system is designed to be modular and extensible. Key areas for future extensions:

1. Add adaptive dosing algorithms that learn from past dosing efficacy
2. Implement scheduled dosing for specific times of day
3. Add alerts for persistent out-of-range conditions
4. Add support for temperature control and other environmental factors

## Troubleshooting

### Auto Dosing Not Starting

- Check logs in `auto_dosing.log` and `auto_dosing_integration.log`
- Check the main application logs to see if there were errors when launching the auto dosing process
- Verify permissions for GPIO access
- Ensure the proper configuration is set in `data/auto_dosing_config.json`
- Check connectivity to I2C sensors

### Excessive Dosing

- Increase the `dosing_cooldown` to provide more time between dosing cycles
- Reduce the dosage amounts in your plant profile
- Increase the tolerance ranges in the configuration

### Other Issues

Most issues can be diagnosed through logs. If you need to reset the system:

1. Disable the auto dosing service if running
2. Delete the `data/auto_dosing_config.json` file to reset to defaults
3. Restart the auto dosing service 