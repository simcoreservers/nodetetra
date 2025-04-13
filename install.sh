#!/bin/bash

# NuTetra Installation Script for Raspberry Pi 5
# This script will install and configure all necessary components for the NuTetra hydroponics controller

# Text formatting
BOLD=$(tput bold)
NORMAL=$(tput sgr0)
GREEN=$(tput setaf 2)
RED=$(tput setaf 1)
YELLOW=$(tput setaf 3)
BLUE=$(tput setaf 4)

# Function to print formatted section headers
print_section() {
    echo ""
    echo "${BOLD}${BLUE}==== $1 ====${NORMAL}"
    echo ""
}

# Function to print error messages
print_error() {
    echo "${BOLD}${RED}ERROR: $1${NORMAL}"
}

# Function to print success messages
print_success() {
    echo "${BOLD}${GREEN}SUCCESS: $1${NORMAL}"
}

# Function to print info messages
print_info() {
    echo "${YELLOW}INFO: $1${NORMAL}"
}

# Function to check if a command succeeded
check_success() {
    if [ $? -eq 0 ]; then
        print_success "$1"
        return 0
    else
        print_error "$2"
        return 1
    fi
}

# Function to confirm an action
confirm() {
    read -p "${BOLD}${YELLOW}$1 (y/n)${NORMAL} " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

# Welcome message
clear
echo "${BOLD}${GREEN}"
echo "==============================================="
echo "  NuTetra Hydroponics Controller Installation  "
echo "===============================================${NORMAL}"
echo ""
echo "This script will install and configure the NuTetra hydroponics controller system on your Raspberry Pi 5."
echo ""
echo "The installation includes:"
echo "  - System updates"
echo "  - Required software packages"
echo "  - WiringPi for GPIO control"
echo "  - I2C configuration"
echo "  - NuTetra application setup"
echo "  - Autostart configuration"
echo ""

if ! confirm "Do you want to proceed with installation?"; then
    echo "Installation cancelled."
    exit 0
fi

# Determine install location
INSTALL_DIR="/home/pi/nutetra"
read -p "${BOLD}Enter installation directory [${INSTALL_DIR}]: ${NORMAL}" input_dir
INSTALL_DIR=${input_dir:-$INSTALL_DIR}

# Setup auto-login kiosk mode?
SETUP_KIOSK=false
if confirm "Do you want to set up auto-login kiosk mode for the touchscreen?"; then
    SETUP_KIOSK=true
fi

# Create user if needed
USER_EXISTS=$(id -u pi > /dev/null 2>&1; echo $?)
if [ $USER_EXISTS -ne 0 ]; then
    print_section "Creating Pi User"
    print_info "User 'pi' not found. Creating user..."
    useradd -m -s /bin/bash pi
    echo "pi:raspberry" | chpasswd
    usermod -aG sudo pi
    check_success "User 'pi' created successfully" "Failed to create user 'pi'"
fi

# Update system
print_section "Updating System"
print_info "Updating package lists..."
apt-get update
check_success "Package lists updated" "Failed to update package lists"

print_info "Upgrading packages..."
apt-get upgrade -y
check_success "Packages upgraded" "Failed to upgrade packages"

# Install dependencies
print_section "Installing Dependencies"
print_info "Installing git, build tools, and I2C tools..."
apt-get install -y git build-essential i2c-tools
check_success "Basic dependencies installed" "Failed to install basic dependencies"

# Install Node.js
print_section "Installing Node.js"
print_info "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    check_success "Node.js installed" "Failed to install Node.js"
else
    NODE_VERSION=$(node -v)
    print_info "Node.js is already installed (version: $NODE_VERSION)"
fi

# Enable I2C
print_section "Configuring I2C"
print_info "Enabling I2C interface..."
if grep -q "^dtparam=i2c_arm=on" /boot/config.txt; then
    print_info "I2C is already enabled"
else
    echo "dtparam=i2c_arm=on" >> /boot/config.txt
    check_success "I2C enabled" "Failed to enable I2C"
fi

# Install WiringPi
print_section "Installing WiringPi"
print_info "Checking for existing WiringPi installation..."
if command -v gpio &> /dev/null; then
    print_info "WiringPi is already installed"
    gpio -v
else
    print_info "Installing WiringPi..."
    cd /tmp
    git clone https://github.com/WiringPi/WiringPi
    cd WiringPi
    ./build
    check_success "WiringPi installed" "Failed to install WiringPi"
    gpio -v
fi

# Clone NuTetra repository
print_section "Setting Up NuTetra"
print_info "Cloning NuTetra repository..."

# Create installation directory if it doesn't exist
mkdir -p "$INSTALL_DIR"
check_success "Created installation directory $INSTALL_DIR" "Failed to create directory $INSTALL_DIR"

# Check if it's already a git repository
if [ -d "$INSTALL_DIR/.git" ]; then
    print_info "Git repository already exists in $INSTALL_DIR"
    cd "$INSTALL_DIR"
    git pull
    check_success "Updated existing repository" "Failed to update repository"
else
    # If this is a fresh install, clone from GitHub
    if [ -z "$(ls -A "$INSTALL_DIR")" ]; then
        git clone https://github.com/your-username/nutetra.git "$INSTALL_DIR"
        check_success "Repository cloned to $INSTALL_DIR" "Failed to clone repository"
    else
        # If the directory is not empty and not a git repo, just copy files
        cd /tmp
        git clone https://github.com/your-username/nutetra.git nutetra-temp
        cp -R /tmp/nutetra-temp/* "$INSTALL_DIR/"
        rm -rf /tmp/nutetra-temp
        check_success "Files copied to $INSTALL_DIR" "Failed to copy files"
    fi
fi

# Install dependencies
print_section "Installing NuTetra Dependencies"
print_info "Installing Node.js dependencies..."
cd "$INSTALL_DIR"
npm install
check_success "Dependencies installed" "Failed to install dependencies"

# Build the application
print_section "Building NuTetra Application"
print_info "Building the application..."
cd "$INSTALL_DIR"
npm run build
check_success "Application built successfully" "Failed to build application"

# Create service file for autostart
print_section "Setting Up Autostart"
print_info "Creating systemd service..."
cat > /etc/systemd/system/nutetra.service << EOF
[Unit]
Description=NuTetra Hydroponic Controller Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

check_success "Service file created" "Failed to create service file"

# Enable and start the service
print_info "Enabling and starting service..."
systemctl daemon-reload
systemctl enable nutetra.service
systemctl start nutetra.service
check_success "Service enabled and started" "Failed to enable/start service"

# Set up kiosk mode if requested
if [ "$SETUP_KIOSK" = true ]; then
    print_section "Setting Up Kiosk Mode"
    print_info "Configuring auto-login kiosk mode..."
    
    # Create autostart directory if it doesn't exist
    mkdir -p /home/pi/.config/lxsession/LXDE-pi/
    check_success "Created autostart directory" "Failed to create autostart directory"
    
    # Create autostart file
    cat > /home/pi/.config/lxsession/LXDE-pi/autostart << EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
@xset s off
@xset -dpms
@xset s noblank
@chromium-browser --kiosk --app=http://localhost:3000
EOF
    
    # Ensure proper permissions
    chown -R pi:pi /home/pi/.config/
    
    check_success "Kiosk mode configured" "Failed to configure kiosk mode"
    
    # Enable autologin
    print_info "Enabling autologin..."
    mkdir -p /etc/systemd/system/getty@tty1.service.d/
    cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I \$TERM
EOF
    
    check_success "Autologin enabled" "Failed to enable autologin"
    
    # Add .xinitrc to start LXDE
    cat > /home/pi/.xinitrc << EOF
#!/bin/sh
exec startlxde-pi
EOF
    
    chmod +x /home/pi/.xinitrc
    chown pi:pi /home/pi/.xinitrc
    
    # Make .bash_profile start X on login
    if ! grep -q "startx" /home/pi/.bash_profile 2>/dev/null; then
        echo "[[ -z \$DISPLAY && \$XDG_VTNR -eq 1 ]] && startx" >> /home/pi/.bash_profile
        chown pi:pi /home/pi/.bash_profile
    fi
    
    check_success "X autostart configured" "Failed to configure X autostart"
fi

# Final section with verification
print_section "Verifying Installation"

# Check if node is installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_success "Node.js is installed (version: $NODE_VERSION)"
else
    print_error "Node.js is not installed"
fi

# Check if I2C is enabled
if grep -q "^dtparam=i2c_arm=on" /boot/config.txt; then
    print_success "I2C is enabled"
else
    print_error "I2C is not enabled in /boot/config.txt"
fi

# Check if gpio command is available
if command -v gpio &> /dev/null; then
    GPIO_VERSION=$(gpio -v | head -n 1)
    print_success "WiringPi is installed ($GPIO_VERSION)"
else
    print_error "WiringPi is not installed"
fi

# Check if service is enabled
if systemctl is-enabled nutetra.service &> /dev/null; then
    print_success "NuTetra service is enabled"
else
    print_error "NuTetra service is not enabled"
fi

# Check if service is running
if systemctl is-active nutetra.service &> /dev/null; then
    print_success "NuTetra service is running"
else
    print_error "NuTetra service is not running"
fi

# Installation complete
print_section "Installation Complete"
echo "${BOLD}${GREEN}NuTetra has been successfully installed on your Raspberry Pi 5!${NORMAL}"
echo ""
echo "You can access the dashboard at: ${BOLD}http://localhost:3000${NORMAL}"
echo ""
echo "To check the status of the service: ${BOLD}systemctl status nutetra.service${NORMAL}"
echo "To view logs: ${BOLD}journalctl -u nutetra.service${NORMAL}"
echo ""
echo "If you've set up kiosk mode, it will activate on the next reboot."
echo ""

if confirm "Would you like to reboot now to complete the setup?"; then
    print_info "Rebooting system..."
    reboot
fi

exit 0 