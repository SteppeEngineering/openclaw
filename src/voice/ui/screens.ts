/**
 * Screen Layout Definitions
 * 
 * Pre-defined screen layouts for the voice interface OLED display.
 * Provides consistent visual design across all states.
 */

import type { DisplayDevice } from '../hardware/types';

/**
 * Screen layout configuration
 */
export interface ScreenLayout {
  /** Title area at top */
  title?: {
    text: string;
    size: 1 | 2 | 3;
    centered?: boolean;
  };
  
  /** Main content area */
  content?: {
    text: string;
    size: 1 | 2;
    centered?: boolean;
    maxLines?: number;
  };
  
  /** Icon in center or top */
  icon?: {
    name: string;
    position: 'center' | 'top' | 'top-right';
  };
  
  /** Progress bar */
  progress?: {
    value: number; // 0-100
    position: 'bottom' | 'middle';
  };
  
  /** Footer text/status */
  footer?: {
    text: string;
    centered?: boolean;
  };
  
  /** Animation config */
  animation?: {
    type: 'spinner' | 'waveform' | 'pulse';
    speed?: number;
  };
}

/**
 * Icon definitions (using ASCII art for simplicity)
 * Each icon is an array of strings representing rows
 */
export const ICONS = {
  microphone: [
    '  ███  ',
    '  ███  ',
    '  ███  ',
    ' █████ ',
    '   █   ',
    ' █████ ',
  ],
  
  speaker: [
    ' █     ',
    ' ██  ▶ ',
    ' ███ ▶▶',
    ' ██  ▶ ',
    ' █     ',
  ],
  
  thinking: [
    '  ○ ○  ',
    '  ○ ○  ',
    '       ',
    ' ████  ',
    '  ███  ',
  ],
  
  checkmark: [
    '      █',
    '     ██',
    ' █  ██ ',
    ' ████  ',
    '  ██   ',
  ],
  
  warning: [
    '   █   ',
    '  ███  ',
    ' █ █ █ ',
    ' █████ ',
    '  ███  ',
  ],
  
  record: [
    '  ███  ',
    ' █████ ',
    '███████',
    ' █████ ',
    '  ███  ',
  ],
} as const;

/**
 * Pre-defined screen layouts for common states
 */
export const SCREEN_LAYOUTS = {
  home: (): ScreenLayout => ({
    title: {
      text: 'SHOPCLAW',
      size: 2,
      centered: true,
    },
    content: {
      text: 'Ready',
      size: 1,
      centered: true,
    },
    footer: {
      text: 'Hold PTT to speak',
      centered: true,
    },
  }),
  
  recording: (duration?: string): ScreenLayout => ({
    icon: {
      name: 'record',
      position: 'center',
    },
    content: {
      text: duration ? `REC ${duration}` : 'RECORDING',
      size: 2,
      centered: true,
    },
    footer: {
      text: 'Release to send',
      centered: true,
    },
    animation: {
      type: 'pulse',
      speed: 500,
    },
  }),
  
  processing: (message?: string): ScreenLayout => ({
    content: {
      text: message || 'Processing...',
      size: 1,
      centered: true,
    },
    animation: {
      type: 'spinner',
      speed: 200,
    },
  }),
  
  playing: (text: string): ScreenLayout => ({
    icon: {
      name: 'speaker',
      position: 'top',
    },
    content: {
      text,
      size: 1,
      maxLines: 5,
    },
  }),
  
  error: (message: string): ScreenLayout => ({
    icon: {
      name: 'warning',
      position: 'top',
    },
    title: {
      text: 'ERROR',
      size: 1,
      centered: false,
    },
    content: {
      text: message,
      size: 1,
      maxLines: 3,
    },
  }),
  
  status: (lines: string[]): ScreenLayout => ({
    title: {
      text: 'STATUS',
      size: 1,
    },
    content: {
      text: lines.join('\n'),
      size: 1,
      maxLines: 5,
    },
  }),
} as const;

/**
 * Render a screen layout to a display device
 */
export async function renderLayout(
  device: DisplayDevice,
  layout: ScreenLayout,
  animationFrame: number = 0
): Promise<void> {
  const dims = device.getDimensions();
  const { width, height } = dims;
  
  device.clear();
  
  let yOffset = 2; // Start with padding
  
  // Render title if present
  if (layout.title) {
    const titleY = yOffset;
    if (layout.title.centered) {
      const titleWidth = layout.title.text.length * 6 * layout.title.size;
      const titleX = Math.floor((width - titleWidth) / 2);
      device.writeText(layout.title.text, titleX, titleY, layout.title.size);
    } else {
      device.writeText(layout.title.text, 2, titleY, layout.title.size);
    }
    yOffset += 10 * layout.title.size + 4;
  }
  
  // Render icon if present
  if (layout.icon) {
    const icon = ICONS[layout.icon.name as keyof typeof ICONS];
    if (icon) {
      let iconX: number;
      let iconY: number;
      
      switch (layout.icon.position) {
        case 'center':
          iconX = Math.floor(width / 2 - 20);
          iconY = Math.floor(height / 2 - icon.length * 2);
          break;
        case 'top':
          iconX = 2;
          iconY = yOffset;
          yOffset += icon.length * 3 + 2;
          break;
        case 'top-right':
          iconX = width - 30;
          iconY = 2;
          break;
        default:
          iconX = 2;
          iconY = yOffset;
      }
      
      renderIcon(device, icon, iconX, iconY);
      
      // Adjust content offset if icon is centered
      if (layout.icon.position === 'center') {
        yOffset = iconY + icon.length * 3 + 4;
      }
    }
  }
  
  // Render animation if present
  if (layout.animation) {
    switch (layout.animation.type) {
      case 'spinner':
        renderSpinner(device, animationFrame, width / 2, yOffset + 10);
        yOffset += 20;
        break;
      case 'pulse':
        renderPulse(device, animationFrame, width / 2, height / 2);
        break;
      case 'waveform':
        renderWaveform(device, animationFrame, width / 2, height - 20);
        break;
    }
  }
  
  // Render content if present
  if (layout.content) {
    const maxLines = layout.content.maxLines || 10;
    const lineHeight = 10 * layout.content.size;
    const lines = wrapText(layout.content.text, width - 4, layout.content.size);
    
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const line = lines[i];
      const lineY = yOffset + i * lineHeight;
      
      if (lineY + lineHeight > height - 12) break; // Don't overflow into footer
      
      if (layout.content.centered) {
        const lineWidth = line.length * 6 * layout.content.size;
        const lineX = Math.floor((width - lineWidth) / 2);
        device.writeText(line, lineX, lineY, layout.content.size);
      } else {
        device.writeText(line, 2, lineY, layout.content.size);
      }
    }
  }
  
  // Render progress bar if present
  if (layout.progress) {
    const barHeight = 4;
    const barY = layout.progress.position === 'bottom' 
      ? height - barHeight - 2
      : Math.floor(height / 2);
    
    renderProgressBar(device, layout.progress.value, 2, barY, width - 4, barHeight);
  }
  
  // Render footer if present
  if (layout.footer) {
    const footerY = height - 10;
    if (layout.footer.centered) {
      const footerWidth = layout.footer.text.length * 6;
      const footerX = Math.floor((width - footerWidth) / 2);
      device.writeText(layout.footer.text, footerX, footerY, 1);
    } else {
      device.writeText(layout.footer.text, 2, footerY, 1);
    }
  }
  
  await device.update();
}

/**
 * Render an ASCII art icon
 */
function renderIcon(device: DisplayDevice, icon: string[], x: number, y: number): void {
  for (let row = 0; row < icon.length; row++) {
    const line = icon[row];
    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (char !== ' ') {
        // Draw a 2x2 block for each non-space character
        device.setPixel(x + col * 2, y + row * 2);
        device.setPixel(x + col * 2 + 1, y + row * 2);
        device.setPixel(x + col * 2, y + row * 2 + 1);
        device.setPixel(x + col * 2 + 1, y + row * 2 + 1);
      }
    }
  }
}

/**
 * Render spinning animation
 */
function renderSpinner(device: DisplayDevice, frame: number, x: number, y: number): void {
  const frames = ['|', '/', '-', '\\'];
  const char = frames[frame % frames.length];
  device.writeText(char, x - 3, y, 2);
}

/**
 * Render pulsing dot animation
 */
function renderPulse(device: DisplayDevice, frame: number, x: number, y: number): void {
  const sizes = [1, 2, 3, 4, 3, 2];
  const size = sizes[frame % sizes.length];
  
  for (let dx = -size; dx <= size; dx++) {
    for (let dy = -size; dy <= size; dy++) {
      if (dx * dx + dy * dy <= size * size) {
        device.setPixel(x + dx, y + dy);
      }
    }
  }
}

/**
 * Render waveform animation
 */
function renderWaveform(device: DisplayDevice, frame: number, x: number, y: number): void {
  const bars = 10;
  const barWidth = 3;
  const maxHeight = 20;
  
  for (let i = 0; i < bars; i++) {
    // Create wave effect
    const height = Math.abs(Math.sin((frame + i * 2) / 10)) * maxHeight;
    const barX = x - (bars * barWidth) / 2 + i * barWidth;
    const barY = y - Math.floor(height / 2);
    
    device.drawRect(barX, barY, barWidth - 1, Math.floor(height), true);
  }
}

/**
 * Render progress bar
 */
function renderProgressBar(
  device: DisplayDevice,
  value: number,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  // Draw outline
  device.drawRect(x, y, width, height, false);
  
  // Draw fill
  const fillWidth = Math.floor((width - 2) * (value / 100));
  if (fillWidth > 0) {
    device.drawRect(x + 1, y + 1, fillWidth, height - 2, true);
  }
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, maxWidth: number, scale: number): string[] {
  const maxChars = Math.floor(maxWidth / (6 * scale));
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // If single word is too long, split it
      if (word.length > maxChars) {
        let remaining = word;
        while (remaining.length > 0) {
          lines.push(remaining.substring(0, maxChars));
          remaining = remaining.substring(maxChars);
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}
