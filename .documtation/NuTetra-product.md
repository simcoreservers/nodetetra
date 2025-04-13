NuTetra is a hydroponic automation controller similar to the Growee controller, we will be using the Raspberry Pi 5 with a "Raspberry Pi Touch Display 2" for the display as a system kiosk that the user can operate the system from. The system should prioritize accuracy, reliability, and ease of use, with a sleek, professional aesthetic similar to AC Infinity. I want an all-in-one solution that is production ready. Code must be well organized, and sections clearly labeled for easy editing.

This will be running on Raspberry Pi OS. This project will be a production ready application.

Full instructions for installation are necessary.

Core Features:
1. Real-Time Monitoring: 
   - Continuously measure and display pH, EC, and water temperature.  
   - Display real-time data on a dashboard with clear visual indicators.  

2. Automated Dosing Control:  
   - Manage multiple dosing pumps (e.g., pH Up, pH Down, nutrients).  
   - Calibrate pumps with precise flow rate adjustments.  
   - Automatically adjust pH and nutrient levels based on user-defined target ranges in the active Plant Profile.  
   - Include a manual control option for individual pump activation. 

3. Customizable plant profiles: 
   - NuTetra comes with some default plant profiles, user can create their own plant profile, specify the ph, ec, and nutrient ratio values for each profile. Plant Profiles can optionally use a weekly growth cycle that allows the user to customize new ph, ec, and nutrient values for each weeek. 

3. Scheduling and Alerts:  
   - Create and manage dosing schedules (time-based or continuous adjustments).  
   - Send real-time alerts and notifications (via email, or SMS) when pH, EC, or temperature is out of range.  

4. User Interface (UI):  
   - Allow users to:
     - View live data and dosing history.  
     - Adjust target pH and EC ranges.  
     - Manually activate pumps.  

5. Data Logging and History:  
   - Store and display historical data (pH, EC, temperature) with time-stamped logs.  
   - Include export options (CSV, JSON).  

Technical Specifications:
- Firmware:   
  - Control relay-based dosing pumps with accurate timing and calibration options.  

Color Palette:  
- Matte black and dark gray as primary colors, creating a bold and sophisticated look.  
- Subtle blue or white LED accents for a futuristic, high-tech feel.  
- Use of low-glow, soft lighting for display screens, avoiding harsh or overly bright colors.  

UI/UX Design: 
- Minimalist and data-centric interface: Prioritize functionality with clear, legible fonts and easy-to-read metrics.  
- Simple icons and clean lines: Use geometric icons and consistent line weights.  
- Graphical elements should be subtle, with no excessive gradients or unnecessary embellishments.  
- Intuitive navigation: Prioritize clarity with straightforward, tab-based menus and easily accessible controls.  
- Dark mode theme: Dominantly black or dark gray backgrounds with contrasting white or blue text and icons.
- AC Infinity Aesthetic

Overall Vibe:
- Premium, high-tech, and professional, blending industrial minimalism with futuristic elegance.  
- No-frills practicality with a focus on performance and reliability, avoiding flashy or gimmicky design choices.

Output Requirements:
- Include full code  
- Provide a detailed installation guide for deploying the program on a microcontroller and setting up the app.  
- Ensure the UI is clean, intuitive, and user-friendly.

Controller description: The NuTetra Controller is an advanced automation device designed to simplify and optimize hydroponic, aquaponic, and soil-based growing systems. Its primary purpose is to precisely manage and regulate key environmental factors such as pH, nutrient levels, and water quality, ensuring plants receive the ideal conditions for healthy and vigorous growth.
By integrating with automated dosing pumps, the Nutetra Controller continuously monitors and adjusts nutrient concentration and pH balance in real time. This ensures a consistent and balanced growing environment, reducing the need for manual intervention and minimizing the risk of human error.
Growers can access live data, receive alerts, and make adjustment. The Nutetra Controller is designed to increase efficiency, enhance crop yields, and streamline the growing process, making it an essential tool for both hobbyist and commercial growers.

Here’s a detailed description of the Nutetra Controller’s menu system:

Nutetra Controller Menu System Overview

The Nutetra Controller features an intuitive, user-friendly menu system designed for easy navigation and precise control. The interface directly on Raspberry Pi Touch Display 2. 

Main Menu Sections

1. Dashboard / Home Screen
   - Displays a real-time overview of the current system status.  
   - Key metrics shown:
     - pH level
     - EC (electrical conductivity / nutrient concentration)
     - Temperature (if applicable)
     - Pump activity and dosing history  
   - Quick access buttons for manual pump activation or calibration.  

2. Dosing Settings
   - Configure and fine-tune the nutrient dosing parameters:
     - Target pH range: Set the desired pH level and acceptable fluctuation range.
     - Nutrient concentration: Define the EC range.
     - Pump calibration: Fine-tune the flow rate of each pump to ensure accurate dosing.  
   - Dosing schedule: Set automatic dosing intervals or trigger dosing based on sensor readings.  

3. Pump Control & Calibration
   - Individual controls for each dosing pump:
     - Manual override: Start or stop specific pumps manually.  
     - Flow rate calibration: Precisely calibrate each pump by measuring and entering the actual liquid output.  
   - Option to rename pumps for better identification (e.g., "pH Down," "Cal-Mag," etc.).  

4. Alerts & Notifications
   - Configure real-time alerts for critical conditions:
     - pH out of range  
     - Nutrient levels too high or too low  
     - Water temperature fluctuations (if applicable)  
   - Notification settings:
     - Email, SMS, or app-based alerts.  

5. Data Logging & History
   - Access detailed logs of environmental conditions and dosing activity.  
   - Review historical data to identify trends or issues.  
   - Export data for further analysis (CSV or other formats).  

6. System Settings
   - Wi-Fi/network configuration: Connect the controller to a local network or cloud service.  
   - Firmware updates: Update the controller software to access new features or improvements.  
   - Date & time settings: Ensure accurate time stamps for dosing and data logs.  
   - Factory reset or backup/restore settings.  


Navigation & User Experience    
- Customization: Users can customize menu names, pump labels, and notification preferences for a personalized experience. 

NuTetra Controller: Step-by-Step Guide for Setup and Operation

Step 1: Initial Setup

1. Unbox and Connect Hardware**
   - Place the NuTetra Controller in a stable, dry location near your reservoir.  
   - Connect the pH and EC sensors securely to the appropriate ports.  
   - Attach the dosing pumps to the controller and place the pump intake tubes in their respective nutrient or pH solution containers.  
   - Place the output tubes into the reservoir.  
   - Plug the Nutetra Controller into a power source.  

2. Power On and Network Configuration
   - Power on the controller.  
   - On your mobile device, connect to the Nutetra WiFi network, your browser will open to the NuTetra setup page.
   - Select your Wi-Fi network and enter the password.  
   - Wait for the controller to connect..  
   - After the controller is connected, you will be able to access the Nutetra controller at nutetra.local. 

Step 2: Sensor Calibration

1. pH Sensor Calibration
   - Navigate to Menu → Calibration → pH Sensor.
   - Rinse the pH probe with distilled water.  
   - Place the probe in pH 7.0 buffer solution and wait for the reading to stabilize.  
   - Press Calibrate.  
   - Rinse the probe again, then place it in pH 4.0 buffer solution.  
   - Once stable, press Calibrate again.  
   - The pH sensor is now calibrated.  

2. EC Sensor Calibration
   - Go to Menu → Calibration → EC Sensor.  
   - Rinse the EC probe with distilled water.  
   - Place the probe in a calibration solution (e.g., 1.413 mS/cm).  
   - Wait for the reading to stabilize.  
   - Press Calibrate to save the calibration.  

Step 3: Pump Calibration

1. Navigate to Pumps → Calibration in the menu.  
2. Select a pump (e.g., Pump 1).  
3. Place the pump's output tube in a measuring container (e.g., graduated cylinder).  
4. Start the pump manually and allow it to run for a set time (e.g., 30 seconds).  
5. Measure the actual liquid output (e.g., 45 mL).  
6. Enter the measured amount into the calibration field.  
7. Repeat this process for each pump.  
8. Save the calibration settings.

Step 4: Dosing Configuration

1. Set pH Parameters
   - Go to Menu → Dosing → pH Settings.
   - Define your target pH range (e.g., 5.8 – 6.2 for hydroponics).  
   - Assign the appropriate pump to dispense pH Up or pH Down.  
   - Set the dosing precision (e.g., smaller increments for more sensitive crops).  
   - Enable or disable automatic pH adjustments.  

2. Set Nutrient Parameters
   - Go to Menu → Dosing → Nutrient Settings.  
   - Set the target EC range (e.g., 1.2 – 1.5 EC for vegetative growth).  
   - Assign the appropriate pumps for nutrient A, nutrient B, etc. 
   - Define the maximum daily dosage limit to prevent overfeeding.  

3. Create a Dosing Schedule
   - Go to Menu → Dosing Schedule.  
   - Select the desired interval:
     - Continuous adjustment (based on sensor readings).  
     - Timed dosing (e.g., every 2 hours).  
   - Enable notifications for out-of-range conditions.  

---

Step 5: Monitoring and Adjusting

1. Dashboard Overview
   - On the home screen, monitor real-time data:
     - pH levels  
     - EC/PPM  
     - Pump activity and recent dosing events  
   - View historical data.  

2. Manual Pump Control
   - Go to Menu → Pumps → Manual Control.
   - Select a pump to run or stop it manually.  
   - Useful for testing or troubleshooting.  

3. Alerts and Notifications
   - In Settings → Alerts, configure thresholds for:
     - pH fluctuations  
     - EC levels  
     - Temperature (if applicable)  
   - Set up optional email or SMS notifications.  

Step 6: Maintenance and Troubleshooting

1. Regular Sensor Cleaning
   - Rinse pH and EC probes with distilled water weekly.  
   - Store pH probes in proper storage solution when not in use.  

2. Pump Maintenance
   - Check for clogs in the tubing regularly.  
   - Flush pumps with clean water if switching nutrient types.  

---

Hardware used :
  - Raspberry Pi 5
  - Raspberry Pi Touchscreen 2
  - Atlas Scientific i3 InterLink Raspberry Pi Shield
  - Atlas Scientific EZO Conductivity Cricut
  - Atlas Scientific EZO pH Circuit
  - Atlas Scientific RTD Temperature Circuit 