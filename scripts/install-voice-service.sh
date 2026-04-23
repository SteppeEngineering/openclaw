#!/bin/bash
#
# Install Voice Channel as Systemd Service
#
# This script installs the OpenClaw voice channel as a systemd service
# that auto-starts on boot and restarts on failure.
#
# Usage:
#   sudo ./scripts/install-voice-service.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== OpenClaw Voice Channel Service Installation ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
  exit 1
fi

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
  echo -e "${YELLOW}Warning: Not running on Raspberry Pi. Voice hardware may not work.${NC}"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Detect user and installation paths
INSTALL_USER="${SUDO_USER:-$USER}"
INSTALL_HOME=$(eval echo "~$INSTALL_USER")
OPENCLAW_PATH="${OPENCLAW_PATH:-/usr/lib/node_modules/openclaw}"

echo -e "${GREEN}Installation settings:${NC}"
echo "  User: $INSTALL_USER"
echo "  Home: $INSTALL_HOME"
echo "  OpenClaw: $OPENCLAW_PATH"
echo

# Verify OpenClaw is installed
if [ ! -d "$OPENCLAW_PATH" ]; then
  echo -e "${RED}Error: OpenClaw not found at $OPENCLAW_PATH${NC}"
  echo "Install OpenClaw first: npm install -g openclaw"
  exit 1
fi

# Create systemd service file
SERVICE_FILE="/etc/systemd/system/openclaw-voice.service"

echo -e "${GREEN}Creating systemd service file...${NC}"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=OpenClaw Voice Channel
Documentation=https://docs.openclaw.ai
After=network.target sound.target
Wants=network.target

[Service]
Type=simple
User=$INSTALL_USER
Group=$INSTALL_USER
WorkingDirectory=$INSTALL_HOME

# Environment
Environment="NODE_ENV=production"
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

# OpenClaw command
ExecStart=/usr/bin/openclaw gateway start

# Restart policy
Restart=on-failure
RestartSec=10s
StartLimitInterval=5min
StartLimitBurst=3

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-voice

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}Service file created at $SERVICE_FILE${NC}"

# Reload systemd
echo -e "${GREEN}Reloading systemd daemon...${NC}"
systemctl daemon-reload

# Enable service (auto-start on boot)
echo -e "${GREEN}Enabling service for auto-start...${NC}"
systemctl enable openclaw-voice.service

echo
echo -e "${GREEN}=== Installation Complete ===${NC}"
echo
echo "Service commands:"
echo "  Start:   sudo systemctl start openclaw-voice"
echo "  Stop:    sudo systemctl stop openclaw-voice"
echo "  Restart: sudo systemctl restart openclaw-voice"
echo "  Status:  sudo systemctl status openclaw-voice"
echo "  Logs:    sudo journalctl -u openclaw-voice -f"
echo
echo "The service will auto-start on boot."
echo
echo -e "${YELLOW}Note: Make sure your OpenClaw config has voice.enabled = true${NC}"
echo "Config file: $INSTALL_HOME/.openclaw/config.yaml"
echo

# Ask if user wants to start the service now
read -p "Start the service now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${GREEN}Starting service...${NC}"
  systemctl start openclaw-voice.service
  sleep 2
  systemctl status openclaw-voice.service --no-pager
fi

echo
echo -e "${GREEN}Done!${NC}"
