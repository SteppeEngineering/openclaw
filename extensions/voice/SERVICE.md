# Voice Channel Systemd Service Configuration

**Goal:** Configure OpenClaw Gateway to run as a systemd service with voice channel enabled, auto-starting on boot.

---

## Overview

The voice channel runs as part of the OpenClaw Gateway process. We'll configure a systemd user service that:

1. **Starts automatically** on boot (after login or with linger enabled)
2. **Restarts on failure** for reliability
3. **Logs to journal** for debugging
4. **Sets environment** (API keys, paths)
5. **Manages graceful shutdown**

---

## Service File

### Location
```
~/.config/systemd/user/openclaw-gateway.service
```

### Full Service Definition

Create the file:
```bash
mkdir -p ~/.config/systemd/user/
nano ~/.config/systemd/user/openclaw-gateway.service
```

**Contents:**
```ini
[Unit]
Description=OpenClaw Gateway with Voice Channel
Documentation=https://github.com/openclaw/openclaw
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
ExecStart=/usr/bin/node dist/entry.js gateway run

# Environment
Environment="NODE_ENV=production"
Environment="DEEPGRAM_API_KEY=your-deepgram-key-here"
Environment="CHATTERBOX_ENDPOINT=http://100.114.0.61:4123"
Environment="OPENCLAW_CONFIG=/mnt/ssd/cyclops-workspace/.openclaw/config.json"
Environment="OPENCLAW_STATE=/mnt/ssd/cyclops-workspace/.openclaw/state"

# Restart policy
Restart=on-failure
RestartSec=10s
StartLimitBurst=5
StartLimitIntervalSec=60s

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-gateway

# Resource limits (adjust for Pi 5)
MemoryMax=2G
CPUQuota=200%

# Shutdown timeout (allow graceful cleanup)
TimeoutStopSec=30s

[Install]
WantedBy=default.target
```

---

## Environment Configuration

### Option 1: Service File Environment Variables
Directly in the service file (as shown above):
```ini
Environment="DEEPGRAM_API_KEY=your-key-here"
```

**⚠️ Security Note:** Visible in `systemctl cat openclaw-gateway`. Not recommended for sensitive keys.

---

### Option 2: Environment File (Recommended)
Create a separate environment file for secrets:

```bash
nano ~/.config/openclaw/gateway.env
```

**Contents:**
```bash
# Deepgram STT API Key
DEEPGRAM_API_KEY=your-deepgram-key-here

# Chatterbox TTS Server
CHATTERBOX_ENDPOINT=http://100.114.0.61:4123

# OpenClaw paths
OPENCLAW_CONFIG=/mnt/ssd/cyclops-workspace/.openclaw/config.json
OPENCLAW_STATE=/mnt/ssd/cyclops-workspace/.openclaw/state

# Node.js environment
NODE_ENV=production
```

**Update service file:**
```ini
[Service]
EnvironmentFile=%h/.config/openclaw/gateway.env
```

**Set permissions:**
```bash
chmod 600 ~/.config/openclaw/gateway.env
```

---

### Option 3: Systemd Credentials (Most Secure)
Store sensitive keys in systemd credentials:

```bash
# Store API key
echo -n "your-deepgram-key-here" | systemd-creds encrypt - - > ~/.config/openclaw/deepgram-key.cred

# Update service file
[Service]
LoadCredential=deepgram-key:${HOME}/.config/openclaw/deepgram-key.cred
ExecStartPre=/bin/bash -c 'export DEEPGRAM_API_KEY=$(systemd-creds cat deepgram-key)'
```

---

## Service Management

### Install and Enable Service

```bash
# Reload systemd user daemon
systemctl --user daemon-reload

# Enable service (start on boot)
systemctl --user enable openclaw-gateway

# Start service now
systemctl --user start openclaw-gateway

# Check status
systemctl --user status openclaw-gateway
```

### Expected Output
```
● openclaw-gateway.service - OpenClaw Gateway with Voice Channel
     Loaded: loaded (~/.config/systemd/user/openclaw-gateway.service; enabled)
     Active: active (running) since Sun 2026-04-19 10:00:00 PDT; 5s ago
       Docs: https://github.com/openclaw/openclaw
   Main PID: 12345 (node)
      Tasks: 15 (limit: 9256)
     Memory: 150.2M (max: 2.0G)
        CPU: 2.345s
     CGroup: /user.slice/user-1000.slice/user@1000.service/app.slice/openclaw-gateway.service
             └─12345 /usr/bin/node dist/entry.js gateway run

Apr 19 10:00:00 cyclops systemd[1234]: Started OpenClaw Gateway with Voice Channel.
Apr 19 10:00:01 cyclops openclaw-gateway[12345]: OpenClaw Gateway starting...
Apr 19 10:00:02 cyclops openclaw-gateway[12345]: ✓ Voice channel plugin loaded
Apr 19 10:00:03 cyclops openclaw-gateway[12345]: ✓ Voice hardware initialized (Pi 5)
Apr 19 10:00:04 cyclops openclaw-gateway[12345]: ✓ Voice session created: voice:main
Apr 19 10:00:05 cyclops openclaw-gateway[12345]: Gateway listening on http://localhost:8080
```

---

## Linger (Start Before Login)

By default, user services start after user login. To enable auto-start on boot:

### Enable Linger for User
```bash
sudo loginctl enable-linger cyclops
```

**Verify:**
```bash
loginctl show-user cyclops | grep Linger
# Should show: Linger=yes
```

**What this does:**
- Starts user systemd instance on boot
- Services run even when user not logged in
- Ideal for headless Pi deployments

---

## Logging

### View Logs
```bash
# Tail logs (follow mode)
journalctl --user -u openclaw-gateway -f

# View recent logs
journalctl --user -u openclaw-gateway -n 100

# View logs since boot
journalctl --user -u openclaw-gateway -b

# View logs with timestamps
journalctl --user -u openclaw-gateway -o short-precise

# Export logs to file
journalctl --user -u openclaw-gateway > /tmp/openclaw.log
```

### Log Filtering
```bash
# Only errors
journalctl --user -u openclaw-gateway -p err

# Specific time range
journalctl --user -u openclaw-gateway --since "2026-04-19 10:00:00" --until "2026-04-19 11:00:00"

# Follow errors only
journalctl --user -u openclaw-gateway -f -p err
```

### Log Retention
Configure in `/etc/systemd/journald.conf`:
```ini
[Journal]
SystemMaxUse=500M
RuntimeMaxUse=100M
MaxRetentionSec=7day
```

Then reload:
```bash
sudo systemctl restart systemd-journald
```

---

## Service Control Commands

### Start/Stop/Restart
```bash
systemctl --user start openclaw-gateway    # Start service
systemctl --user stop openclaw-gateway     # Stop service
systemctl --user restart openclaw-gateway  # Restart service
systemctl --user reload openclaw-gateway   # Reload config (if supported)
```

### Enable/Disable
```bash
systemctl --user enable openclaw-gateway   # Auto-start on boot
systemctl --user disable openclaw-gateway  # Don't auto-start
```

### Status Checks
```bash
systemctl --user status openclaw-gateway   # Detailed status
systemctl --user is-active openclaw-gateway  # active/inactive
systemctl --user is-enabled openclaw-gateway # enabled/disabled
systemctl --user is-failed openclaw-gateway  # failed/not-failed
```

### View Service File
```bash
systemctl --user cat openclaw-gateway      # Show service file
```

---

## Restart Policies

The service is configured to restart on failure:

```ini
Restart=on-failure
RestartSec=10s
StartLimitBurst=5
StartLimitIntervalSec=60s
```

**Behavior:**
- Restarts if process exits with non-zero status
- Waits 10 seconds before restarting
- Max 5 restarts within 60 seconds
- After 5 failures in 60s, enters failed state

### Manual Override
```bash
# Force restart even if rate-limited
systemctl --user reset-failed openclaw-gateway
systemctl --user start openclaw-gateway
```

---

## Graceful Shutdown

The service allows 30 seconds for graceful shutdown:

```ini
TimeoutStopSec=30s
```

**Shutdown Sequence:**
1. systemd sends SIGTERM to process
2. Node.js process catches signal
3. OpenClaw Gateway:
   - Stops accepting new requests
   - Finishes in-flight voice interactions
   - Closes hardware connections (GPIO, I2C, audio)
   - Saves session state
4. Process exits
5. If still running after 30s, systemd sends SIGKILL

**Voice Bot Shutdown Handling:**
Implement in `voice-bot.ts`:
```typescript
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await voiceBot.stop();
  process.exit(0);
});
```

---

## Health Checks

### Check Service Health
```bash
#!/bin/bash
# health-check.sh

STATUS=$(systemctl --user is-active openclaw-gateway)
if [ "$STATUS" != "active" ]; then
  echo "❌ Service not running"
  exit 1
fi

# Check if voice channel responding
RESPONSE=$(curl -s http://localhost:8080/health || echo "")
if [ -z "$RESPONSE" ]; then
  echo "❌ Gateway not responding"
  exit 1
fi

echo "✓ Service healthy"
exit 0
```

### Cron Health Monitor (Optional)
```bash
# Add to crontab
*/5 * * * * /home/cyclops/health-check.sh >> /tmp/health.log 2>&1
```

---

## Troubleshooting

### Service Won't Start
```bash
# Check service status
systemctl --user status openclaw-gateway

# View recent logs
journalctl --user -u openclaw-gateway -n 50

# Check for typos in service file
systemctl --user cat openclaw-gateway

# Verify executable exists
ls -lh /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw/dist/entry.js

# Test manual start
cd /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
node dist/entry.js gateway run
```

### Service Crashes on Start
```bash
# Check environment variables
systemctl --user show-environment

# Check file permissions
ls -ld /mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
ls -l /mnt/ssd/cyclops-workspace/.openclaw/config.json

# Verify Node.js version
node --version  # Should be v22.22.0 or compatible

# Check resource limits
systemctl --user show openclaw-gateway | grep -E '(Memory|CPU)'
```

### Service Won't Stop
```bash
# Check what's blocking
systemctl --user status openclaw-gateway

# Force kill
systemctl --user kill openclaw-gateway

# If still stuck
pkill -u cyclops -f "node.*openclaw"
```

### Service Restarts Too Frequently
```bash
# Check restart count
systemctl --user show openclaw-gateway | grep NRestarts

# View failure logs
journalctl --user -u openclaw-gateway -p err -n 100

# Increase rate limit
# Edit service file, increase StartLimitBurst and StartLimitIntervalSec
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway
```

---

## Performance Tuning

### Adjust Resource Limits
Edit service file:
```ini
[Service]
# Increase memory limit (for heavy workloads)
MemoryMax=4G

# Increase CPU quota (for multi-core processing)
CPUQuota=400%

# Set nice priority (lower = higher priority)
Nice=-10

# Set I/O priority
IOSchedulingClass=best-effort
IOSchedulingPriority=2
```

### Optimize for Voice Latency
```ini
[Service]
# Higher priority for real-time audio
Nice=-15
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=50
```

**⚠️ Warning:** High priority can impact system stability. Test thoroughly.

---

## Multi-Instance Setup (Advanced)

If running multiple gateways (e.g., dev + prod):

### Template Service
Create `openclaw-gateway@.service`:
```ini
[Unit]
Description=OpenClaw Gateway (%i)

[Service]
WorkingDirectory=/mnt/ssd/cyclops-workspace/projects/shopclaw/openclaw
EnvironmentFile=%h/.config/openclaw/gateway-%i.env
ExecStart=/usr/bin/node dist/entry.js gateway run --config /mnt/ssd/cyclops-workspace/.openclaw/%i-config.json
```

### Usage
```bash
# Start production instance
systemctl --user start openclaw-gateway@prod

# Start development instance
systemctl --user start openclaw-gateway@dev
```

---

## Integration with Other Services

### Dependency on Network
If voice channel requires network (for Deepgram/Chatterbox):
```ini
[Unit]
After=network-online.target
Wants=network-online.target
```

### Dependency on Tailscale
If using Tailscale for networking:
```ini
[Unit]
After=tailscaled.service
Requires=tailscaled.service
```

### Dependency on Docker (if using)
```ini
[Unit]
After=docker.service
Wants=docker.service
```

---

## Verification Checklist

- [ ] Service file created at `~/.config/systemd/user/openclaw-gateway.service`
- [ ] Environment variables set (DEEPGRAM_API_KEY, etc.)
- [ ] `systemctl --user daemon-reload` executed
- [ ] Service enabled: `systemctl --user enable openclaw-gateway`
- [ ] Service started: `systemctl --user start openclaw-gateway`
- [ ] Service status: `systemctl --user status openclaw-gateway` shows "active (running)"
- [ ] Linger enabled: `loginctl enable-linger cyclops`
- [ ] Logs accessible: `journalctl --user -u openclaw-gateway -f`
- [ ] Service survives reboot (test: `sudo reboot`)
- [ ] Voice channel functional after auto-start

---

## Quick Reference

```bash
# Start/stop
systemctl --user start openclaw-gateway
systemctl --user stop openclaw-gateway
systemctl --user restart openclaw-gateway

# Enable/disable auto-start
systemctl --user enable openclaw-gateway
systemctl --user disable openclaw-gateway

# View status
systemctl --user status openclaw-gateway

# View logs
journalctl --user -u openclaw-gateway -f

# Reload after config change
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway

# Enable linger (auto-start on boot)
sudo loginctl enable-linger cyclops
```

---

**Service Configuration Version:** 1.0  
**Last Updated:** 2026-04-19  
**Platform:** Raspberry Pi 5  
**User:** cyclops
