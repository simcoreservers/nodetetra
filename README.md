# NuTetra Hydroponics Controller Dashboard

NuTetra is an advanced automation controller for hydroponic, aquaponic, and soil-based growing systems. The dashboard provides an intuitive interface for monitoring and managing pH, EC, and water temperature, as well as controlling dosing pumps.

## Features

- **Real-Time Monitoring**: View live pH, EC, and water temperature readings
- **Automated Dosing Control**: Manage multiple dosing pumps for pH and nutrients
- **Scheduling and Alerts**: Set up dosing schedules and receive notifications
- **User-Friendly Interface**: Clean, intuitive dashboard for easy system management
- **Data Logging**: Track and export historical data
- **Reliable Sensor Monitoring**: Immediate alerts for sensor malfunctions or disconnections

## Installation on Raspberry Pi 5

These instructions will help you set up the NuTetra dashboard on a Raspberry Pi 5 with the Raspberry Pi Touchscreen 2.

### Prerequisites

- Raspberry Pi 5
- Raspberry Pi Touchscreen 2
- Atlas Scientific i3 InterLink Raspberry Pi Shield
- Atlas Scientific EZO Circuits (pH, Conductivity, Temperature)
- Micro SD card (16GB or larger)
- Power supply
- Ethernet cable or WiFi connectivity

### Step 1: Install Raspberry Pi OS

1. Download the Raspberry Pi Imager from [raspberrypi.org](https://www.raspberrypi.org/software/)
2. Insert your micro SD card into your computer
3. Open the Raspberry Pi Imager
4. Select "Raspberry Pi OS (64-bit)" as the operating system
5. Select your SD card
6. Click "WRITE" and wait for the process to complete

### Step 2: Initial Raspberry Pi Setup

1. Insert the SD card into your Raspberry Pi
2. Connect the Raspberry Pi Touchscreen 2
3. Connect the Raspberry Pi to power and to your network
4. Complete the initial setup wizard
5. Update the system:
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

### Step 3: Install Required Software

1. Install Git and Node.js:
   ```bash
   sudo apt install git -y
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install nodejs -y
   ```

2. Install I2C tools for sensor communication:
   ```bash
   sudo apt install i2c-tools -y
   ```

3. Enable I2C interface:
   ```bash
   sudo raspi-config
   ```
   Navigate to "Interface Options" > "I2C" and enable it.

4. Verify Node.js installation:
   ```bash
   node -v
   npm -v
   ```

### Step 4: Clone and Set Up the NuTetra Dashboard

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/nutetra.git
   cd nutetra
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run build
   ```

4. Start the application:
   ```bash
   npm start
   ```

### Step 5: Set Up Autostart

To have the NuTetra dashboard start automatically when the Raspberry Pi boots:

1. Create a systemd service file:
   ```bash
   sudo nano /etc/systemd/system/nutetra.service
   ```

2. Add the following content:
   ```
   [Unit]
   Description=NuTetra Hydroponic Controller Dashboard
   After=network.target

   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/home/pi/nutetra
   ExecStart=/usr/bin/npm start
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start the service:
   ```bash
   sudo systemctl enable nutetra.service
   sudo systemctl start nutetra.service
   ```

### Step 6: Configure Auto-Login to Kiosk Mode

1. Edit the autostart file:
   ```bash
   mkdir -p ~/.config/lxsession/LXDE-pi
   nano ~/.config/lxsession/LXDE-pi/autostart
   ```

2. Add the following lines:
   ```
   @lxpanel --profile LXDE-pi
   @pcmanfm --desktop --profile LXDE-pi
   @xscreensaver -no-splash
   @xset s off
   @xset -dpms
   @xset s noblank
   @chromium-browser --kiosk --app=http://localhost:3000
   ```

3. Reboot to test:
   ```bash
   sudo reboot
   ```

## Hardware Setup

### Connecting Atlas Scientific Components

1. Mount the Atlas Scientific i3 InterLink Raspberry Pi Shield onto your Raspberry Pi
2. Connect the EZO pH Circuit to the shield
3. Connect the EZO Conductivity Circuit to the shield
4. Connect the RTD Temperature Circuit to the shield
5. Connect the pH probe, EC probe, and temperature probe to their respective circuits
6. Verify connections using I2C tools:
   ```bash
   sudo i2cdetect -y 1
   ```
   This should show devices at addresses 0x63 (pH), 0x64 (EC), and 0x66 (RTD)

### Connecting Dosing Pumps

1. Connect your dosing pumps to the appropriate relay pins on the shield
2. Ensure proper wiring and power supply for the pumps

## Sensor Error Handling

NuTetra is designed to operate with real sensor data only. The system will never display mock data and will always alert users when there are sensor issues.

### Types of Sensor Alerts

- **Connection Errors**: Displayed when the system cannot communicate with a sensor
- **Reading Errors**: Shown when a sensor returns values outside acceptable ranges
- **Calibration Errors**: Notifies when sensor calibration fails

### Troubleshooting Sensor Issues

When a sensor error occurs, the dashboard will display detailed troubleshooting steps based on the specific error type:

1. **For Connection Errors**:
   - Check physical connections between sensors and the InterLink shield
   - Verify power to the Raspberry Pi and sensor circuits
   - Use `sudo i2cdetect -y 1` to confirm sensors are detected on the I2C bus
   - Check that sensor I2C addresses match those in the configuration

2. **For Reading Errors**:
   - Ensure probe tips are properly submerged in solution
   - Clean sensors according to manufacturer instructions
   - Recalibrate sensors
   - Replace probes if they continue to provide abnormal readings

## Usage

The NuTetra dashboard provides the following sections:

- **Dashboard**: View real-time sensor readings and system status
- **Dosing Settings**: Configure target ranges and dosing parameters
- **Pump Control**: Manually control pumps and calibrate flow rates
- **Alerts**: Configure notification settings
- **Data Logs**: View and export historical data
- **System Settings**: Configure network and system preferences

## Development

To run the development server:

```bash
npm run dev
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please create an issue on the GitHub repository or contact support@nutetra.com
