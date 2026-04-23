#!/bin/bash
#
# Voice Channel Health Check
#
# Verifies that all voice channel dependencies and hardware are working.
# Run this before deploying to production or after hardware changes.
#
# Usage:
#   ./scripts/voice-health-check.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - Critical failures
#   2 - Warnings (may work but not optimal)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

WARNINGS=0
ERRORS=0

echo -e "${BLUE}=== OpenClaw Voice Channel Health Check ===${NC}"
echo

# Function to check command availability
check_command() {
  local cmd=$1
  local description=$2
  local required=$3
  
  if command -v "$cmd" &> /dev/null; then
    echo -e "${GREEN}✓${NC} $description ($cmd)"
    return 0
  else
    if [ "$required" = "required" ]; then
      echo -e "${RED}✗${NC} $description ($cmd) - MISSING"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "${YELLOW}⚠${NC} $description ($cmd) - missing (optional)"
      WARNINGS=$((WARNINGS + 1))
    fi
    return 1
  fi
}

# Function to check file existence
check_file() {
  local file=$1
  local description=$2
  
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $description"
    return 0
  else
    echo -e "${YELLOW}⚠${NC} $description - NOT FOUND"
    WARNINGS=$((WARNINGS + 1))
    return 1
  fi
}

# Function to check directory/device
check_path() {
  local path=$1
  local description=$2
  
  if [ -e "$path" ]; then
    echo -e "${GREEN}✓${NC} $description"
    return 0
  else
    echo -e "${RED}✗${NC} $description - NOT FOUND"
    ERRORS=$((ERRORS + 1))
    return 1
  fi
}

# 1. System Information
echo -e "${BLUE}[1/8] System Information${NC}"
echo "  Hostname: $(hostname)"
echo "  Kernel: $(uname -r)"
echo "  Architecture: $(uname -m)"

if grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
  PI_MODEL=$(grep "Model" /proc/cpuinfo | head -n1 | cut -d: -f2 | xargs)
  echo -e "  ${GREEN}Raspberry Pi Detected: $PI_MODEL${NC}"
else
  echo -e "  ${YELLOW}⚠ Not a Raspberry Pi (hardware features disabled)${NC}"
  WARNINGS=$((WARNINGS + 1))
fi
echo

# 2. Required System Commands
echo -e "${BLUE}[2/8] System Commands${NC}"
check_command "node" "Node.js runtime" "required"
check_command "npm" "NPM package manager" "required"
check_command "openclaw" "OpenClaw CLI" "required"
check_command "i2cdetect" "I2C tools (i2c-tools)" "required"
check_command "arecord" "ALSA recording (alsa-utils)" "required"
check_command "aplay" "ALSA playback (alsa-utils)" "required"
check_command "amixer" "ALSA mixer (alsa-utils)" "required"
check_command "ffmpeg" "Audio conversion (ffmpeg)" "required"
check_command "gpioget" "GPIO tools (gpiod)" "optional"
check_command "python3" "Python 3 (for PyAudio fallback)" "optional"
echo

# 3. Hardware Devices
echo -e "${BLUE}[3/8] Hardware Devices${NC}"

# Check I2C bus
if [ -e "/dev/i2c-1" ]; then
  echo -e "${GREEN}✓${NC} I2C bus available (/dev/i2c-1)"
  
  # Try to detect OLED display
  if command -v i2cdetect &> /dev/null; then
    if i2cdetect -y 1 2>/dev/null | grep -q "3c"; then
      echo -e "${GREEN}✓${NC} OLED display detected at 0x3C"
    else
      echo -e "${YELLOW}⚠${NC} OLED display not detected (expected at 0x3C)"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
else
  echo -e "${RED}✗${NC} I2C bus not available (/dev/i2c-1)"
  echo "     Enable I2C: sudo raspi-config → Interface Options → I2C"
  ERRORS=$((ERRORS + 1))
fi

# Check GPIO
if [ -e "/dev/gpiochip4" ]; then
  echo -e "${GREEN}✓${NC} GPIO chip available (gpiochip4)"
elif [ -e "/dev/gpiochip0" ]; then
  echo -e "${GREEN}✓${NC} GPIO chip available (gpiochip0)"
else
  echo -e "${YELLOW}⚠${NC} GPIO chip not found"
  WARNINGS=$((WARNINGS + 1))
fi

# Check audio devices
if arecord -l 2>/dev/null | grep -q "card"; then
  AUDIO_INPUT=$(arecord -l | grep "card" | head -n1)
  echo -e "${GREEN}✓${NC} Audio input: $AUDIO_INPUT"
else
  echo -e "${RED}✗${NC} No audio input devices found"
  ERRORS=$((ERRORS + 1))
fi

if aplay -l 2>/dev/null | grep -q "card"; then
  AUDIO_OUTPUT=$(aplay -l | grep "card" | head -n1)
  echo -e "${GREEN}✓${NC} Audio output: $AUDIO_OUTPUT"
else
  echo -e "${RED}✗${NC} No audio output devices found"
  ERRORS=$((ERRORS + 1))
fi
echo

# 4. User Permissions
echo -e "${BLUE}[4/8] User Permissions${NC}"

USER_GROUPS=$(groups)

if echo "$USER_GROUPS" | grep -q "gpio"; then
  echo -e "${GREEN}✓${NC} User in gpio group"
else
  echo -e "${YELLOW}⚠${NC} User not in gpio group (may need sudo for GPIO access)"
  echo "     Fix: sudo usermod -a -G gpio $USER (then re-login)"
  WARNINGS=$((WARNINGS + 1))
fi

if echo "$USER_GROUPS" | grep -q "i2c"; then
  echo -e "${GREEN}✓${NC} User in i2c group"
else
  echo -e "${YELLOW}⚠${NC} User not in i2c group (may need sudo for I2C access)"
  echo "     Fix: sudo usermod -a -G i2c $USER (then re-login)"
  WARNINGS=$((WARNINGS + 1))
fi

if echo "$USER_GROUPS" | grep -q "audio"; then
  echo -e "${GREEN}✓${NC} User in audio group"
else
  echo -e "${YELLOW}⚠${NC} User not in audio group"
  echo "     Fix: sudo usermod -a -G audio $USER (then re-login)"
  WARNINGS=$((WARNINGS + 1))
fi
echo

# 5. OpenClaw Configuration
echo -e "${BLUE}[5/8] OpenClaw Configuration${NC}"

CONFIG_FILE="$HOME/.openclaw/config.yaml"

if [ -f "$CONFIG_FILE" ]; then
  echo -e "${GREEN}✓${NC} Config file exists: $CONFIG_FILE"
  
  # Check if voice channel is enabled
  if grep -q "voice:" "$CONFIG_FILE" && grep -A 5 "voice:" "$CONFIG_FILE" | grep -q "enabled: true"; then
    echo -e "${GREEN}✓${NC} Voice channel enabled in config"
  else
    echo -e "${YELLOW}⚠${NC} Voice channel not enabled in config"
    echo "     Add to config: channels.voice.enabled = true"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo -e "${YELLOW}⚠${NC} Config file not found: $CONFIG_FILE"
  echo "     Run: openclaw config init"
  WARNINGS=$((WARNINGS + 1))
fi
echo

# 6. Environment Variables
echo -e "${BLUE}[6/8] Environment Variables${NC}"

if [ -n "$DEEPGRAM_API_KEY" ]; then
  echo -e "${GREEN}✓${NC} DEEPGRAM_API_KEY is set"
else
  echo -e "${YELLOW}⚠${NC} DEEPGRAM_API_KEY not set (can be in config instead)"
  WARNINGS=$((WARNINGS + 1))
fi

if [ -n "$CHATTERBOX_URL" ]; then
  echo -e "${GREEN}✓${NC} CHATTERBOX_URL is set: $CHATTERBOX_URL"
else
  echo -e "${YELLOW}⚠${NC} CHATTERBOX_URL not set (can be in config instead)"
  WARNINGS=$((WARNINGS + 1))
fi
echo

# 7. Voice Sample File
echo -e "${BLUE}[7/8] Voice Sample${NC}"
check_file "/mnt/ssd/cyclops-workspace/cy-voice-sample.wav" "Cy voice sample"
echo

# 8. Network Connectivity
echo -e "${BLUE}[8/8] Network Connectivity${NC}"

# Check Chatterbox TTS server
CHATTERBOX_HOST="${CHATTERBOX_URL:-http://100.114.0.61:4123}"
if curl -s -o /dev/null -w "%{http_code}" "$CHATTERBOX_HOST/health" 2>/dev/null | grep -q "200"; then
  echo -e "${GREEN}✓${NC} Chatterbox TTS server reachable: $CHATTERBOX_HOST"
else
  echo -e "${YELLOW}⚠${NC} Chatterbox TTS server not reachable: $CHATTERBOX_HOST"
  WARNINGS=$((WARNINGS + 1))
fi

# Check Deepgram API
if curl -s -o /dev/null -w "%{http_code}" "https://api.deepgram.com/v1/listen" \
  -H "Authorization: Token ${DEEPGRAM_API_KEY:-test}" 2>/dev/null | grep -q "400"; then
  echo -e "${GREEN}✓${NC} Deepgram API reachable"
else
  echo -e "${YELLOW}⚠${NC} Deepgram API not reachable (check internet connection)"
  WARNINGS=$((WARNINGS + 1))
fi
echo

# Summary
echo -e "${BLUE}=== Health Check Summary ===${NC}"
echo

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed!${NC}"
  echo "Voice channel is ready to use."
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
  echo "Voice channel should work but may have limited functionality."
  echo "Review warnings above for optimization suggestions."
  exit 2
else
  echo -e "${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) found${NC}"
  echo "Voice channel will NOT work until errors are resolved."
  echo "Review errors above and fix them before proceeding."
  exit 1
fi
