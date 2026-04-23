/**
 * Audio Recording and Playback for Raspberry Pi 5
 * 
 * Uses ALSA tools (arecord/aplay) for maximum compatibility.
 * Supports linear PCM recording and playback in various formats.
 * Includes volume control via amixer.
 */

import { spawn, ChildProcess } from 'child_process';
import { createWriteStream, createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { RecordingState } from './types';

/**
 * Audio format configuration
 */
export interface AudioFormat {
  /** Sample rate in Hz */
  sampleRate: number;
  /** Bit depth (16, 24, or 32) */
  bitDepth: 16 | 24 | 32;
  /** Number of channels (1=mono, 2=stereo) */
  channels: 1 | 2;
  /** Audio format name */
  format: 'linear16' | 'wav' | 'opus';
}

/**
 * ALSA Audio Device
 * 
 * Records and plays audio using arecord and aplay commands.
 */
export class ALSAAudioDevice {
  private inputDevice: string;
  private outputDevice: string;
  private format: AudioFormat;
  
  private recordingState: RecordingState = RecordingState.IDLE;
  private recordingProcess: ChildProcess | null = null;
  private recordingBuffer: Buffer[] = [];
  private recordingTempFile: string | null = null;
  
  constructor(inputDevice: string, outputDevice: string, format: AudioFormat) {
    this.inputDevice = inputDevice;
    this.outputDevice = outputDevice;
    this.format = format;
  }
  
  /**
   * Start recording audio
   */
  async startRecording(): Promise<void> {
    if (this.recordingState === RecordingState.RECORDING) {
      throw new Error('Already recording');
    }
    
    // Create temp file for recording
    this.recordingTempFile = join(tmpdir(), `shopclaw-rec-${Date.now()}.wav`);
    this.recordingBuffer = [];
    
    // Build arecord command
    const args = [
      '-D', this.inputDevice,              // Device
      '-f', this.getALSAFormat(),          // Format
      '-r', `${this.format.sampleRate}`,   // Sample rate
      '-c', `${this.format.channels}`,     // Channels
      '-t', 'wav',                         // File type
      this.recordingTempFile               // Output file
    ];
    
    this.recordingProcess = spawn('arecord', args);
    
    this.recordingProcess.on('error', (err) => {
      console.error('[Audio] Recording error:', err);
      this.recordingState = RecordingState.ERROR;
    });
    
    this.recordingProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[Audio] arecord exited with code ${code}`);
        this.recordingState = RecordingState.ERROR;
      }
    });
    
    this.recordingState = RecordingState.RECORDING;
  }
  
  /**
   * Stop recording and return audio buffer
   */
  async stopRecording(): Promise<Buffer> {
    if (this.recordingState !== RecordingState.RECORDING) {
      throw new Error('Not currently recording');
    }
    
    this.recordingState = RecordingState.PROCESSING;
    
    // Stop the recording process (SIGINT for clean shutdown)
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGINT');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        this.recordingProcess?.on('close', () => resolve());
        // Timeout fallback
        setTimeout(resolve, 1000);
      });
      
      this.recordingProcess = null;
    }
    
    // Read the recorded file
    let buffer: Buffer;
    
    if (this.recordingTempFile) {
      try {
        buffer = await this.readFileToBuffer(this.recordingTempFile);
        
        // Clean up temp file
        await unlink(this.recordingTempFile);
      } catch (err) {
        console.error('[Audio] Failed to read recording:', err);
        throw new Error(`Failed to read recording: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        this.recordingTempFile = null;
      }
    } else {
      throw new Error('No recording file available');
    }
    
    this.recordingState = RecordingState.IDLE;
    
    return buffer;
  }
  
  /**
   * Play audio buffer
   */
  async playAudio(audioData: Buffer, format: string = 'wav'): Promise<void> {
    // Write audio data to temp file
    const tempFile = join(tmpdir(), `shopclaw-play-${Date.now()}.${format}`);
    
    try {
      await this.writeBufferToFile(audioData, tempFile);
      
      // Determine format for aplay
      let playFormat = format;
      
      // If format is opus, convert to WAV first using ffmpeg
      if (format === 'opus') {
        const wavFile = tempFile.replace('.opus', '.wav');
        await this.convertToWAV(tempFile, wavFile);
        await unlink(tempFile);
        playFormat = 'wav';
        return this.playFile(wavFile);
      } else {
        return this.playFile(tempFile);
      }
    } finally {
      // Cleanup happens in playFile
    }
  }
  
  /**
   * Play audio from file
   */
  private async playFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-D', this.outputDevice,
        filePath
      ];
      
      const proc = spawn('aplay', args);
      
      proc.on('error', (err) => {
        reject(new Error(`Playback failed: ${err.message}`));
      });
      
      proc.on('close', async (code) => {
        // Clean up temp file
        try {
          await unlink(filePath);
        } catch {
          // Ignore cleanup errors
        }
        
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`aplay exited with code ${code}`));
        }
      });
    });
  }
  
  /**
   * Convert audio file to WAV using ffmpeg
   */
  private async convertToWAV(inputFile: string, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-y',           // Overwrite output
        '-i', inputFile,
        '-ar', `${this.format.sampleRate}`,
        '-ac', `${this.format.channels}`,
        outputFile
      ];
      
      const proc = spawn('ffmpeg', args);
      
      proc.on('error', (err) => {
        reject(new Error(`FFmpeg conversion failed: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    });
  }
  
  /**
   * Get ALSA format string from bit depth
   */
  private getALSAFormat(): string {
    switch (this.format.bitDepth) {
      case 16:
        return 'S16_LE'; // Signed 16-bit little-endian
      case 24:
        return 'S24_LE';
      case 32:
        return 'S32_LE';
      default:
        return 'S16_LE';
    }
  }
  
  /**
   * Get current recording state
   */
  getRecordingState(): RecordingState {
    return this.recordingState;
  }
  
  /**
   * Read file to buffer
   */
  private readFileToBuffer(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath);
      
      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Write buffer to file
   */
  private writeBufferToFile(buffer: Buffer, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      
      stream.write(buffer, (err) => {
        if (err) {
          reject(err);
        } else {
          stream.end();
        }
      });
      
      stream.on('finish', () => {
        resolve();
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Get current playback volume (0-100)
   */
  async getVolume(): Promise<number> {
    return new Promise((resolve, reject) => {
      // Use amixer to get PCM volume
      const proc = spawn('amixer', ['get', 'PCM']);
      
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          // Parse output: "  Mono: Playback 63 [98%] [-0.50dB]"
          const match = output.match(/\[(\d+)%\]/);
          if (match) {
            resolve(parseInt(match[1], 10));
          } else {
            reject(new Error('Failed to parse volume from amixer output'));
          }
        } else {
          reject(new Error(`amixer exited with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`Failed to get volume: ${err.message}`));
      });
    });
  }
  
  /**
   * Set playback volume (0-100)
   */
  async setVolume(level: number): Promise<void> {
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));
    
    return new Promise((resolve, reject) => {
      // Use amixer to set PCM volume
      const proc = spawn('amixer', ['set', 'PCM', `${clampedLevel}%`]);
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`amixer exited with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`Failed to set volume: ${err.message}`));
      });
    });
  }
  
  /**
   * Adjust volume by delta (-100 to +100)
   */
  async adjustVolume(delta: number): Promise<number> {
    const currentVolume = await this.getVolume();
    const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
    await this.setVolume(newVolume);
    return newVolume;
  }
  
  /**
   * Mute/unmute audio
   */
  async setMute(muted: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const action = muted ? 'mute' : 'unmute';
      const proc = spawn('amixer', ['set', 'PCM', action]);
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`amixer ${action} exited with code ${code}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`Failed to ${action}: ${err.message}`));
      });
    });
  }
  
  /**
   * Clean up audio resources
   */
  async close(): Promise<void> {
    // Stop any active recording
    if (this.recordingState === RecordingState.RECORDING) {
      try {
        await this.stopRecording();
      } catch {
        // Ignore errors during cleanup
      }
    }
    
    // Clean up temp files
    if (this.recordingTempFile) {
      try {
        await unlink(this.recordingTempFile);
      } catch {
        // Ignore cleanup errors
      }
      this.recordingTempFile = null;
    }
  }
}

/**
 * Python PyAudio fallback
 * 
 * For advanced audio features not available in ALSA tools.
 * Executes Python scripts via subprocess.
 */
export class PyAudioDevice {
  private format: AudioFormat;
  private pythonScript: string;
  
  constructor(format: AudioFormat) {
    this.format = format;
    
    // Inline Python script for PyAudio recording/playback
    this.pythonScript = `
import pyaudio
import sys
import wave

def record(device_index, output_file, sample_rate, channels, chunk_size=1024):
    """Record audio from device"""
    p = pyaudio.PyAudio()
    
    stream = p.open(
        format=pyaudio.paInt16,
        channels=channels,
        rate=sample_rate,
        input=True,
        input_device_index=device_index,
        frames_per_buffer=chunk_size
    )
    
    frames = []
    
    try:
        # Record until SIGINT
        while True:
            data = stream.read(chunk_size, exception_on_overflow=False)
            frames.append(data)
    except KeyboardInterrupt:
        pass
    
    stream.stop_stream()
    stream.close()
    p.terminate()
    
    # Save to WAV file
    wf = wave.open(output_file, 'wb')
    wf.setnchannels(channels)
    wf.setsampwidth(p.get_sample_size(pyaudio.paInt16))
    wf.setframerate(sample_rate)
    wf.writeframes(b''.join(frames))
    wf.close()

def play(device_index, input_file):
    """Play audio file to device"""
    p = pyaudio.PyAudio()
    
    wf = wave.open(input_file, 'rb')
    
    stream = p.open(
        format=p.get_format_from_width(wf.getsampwidth()),
        channels=wf.getnchannels(),
        rate=wf.getframerate(),
        output=True,
        output_device_index=device_index
    )
    
    chunk_size = 1024
    data = wf.readframes(chunk_size)
    
    while data:
        stream.write(data)
        data = wf.readframes(chunk_size)
    
    stream.stop_stream()
    stream.close()
    p.terminate()

if __name__ == '__main__':
    command = sys.argv[1]
    
    if command == 'record':
        device_index = int(sys.argv[2]) if sys.argv[2] != 'default' else None
        output_file = sys.argv[3]
        sample_rate = int(sys.argv[4])
        channels = int(sys.argv[5])
        record(device_index, output_file, sample_rate, channels)
    
    elif command == 'play':
        device_index = int(sys.argv[2]) if sys.argv[2] != 'default' else None
        input_file = sys.argv[3]
        play(device_index, input_file)
`;
  }
  
  /**
   * Record audio using PyAudio
   */
  async recordAudio(deviceIndex: string | number, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-c', this.pythonScript,
        '--',
        'record',
        `${deviceIndex}`,
        outputFile,
        `${this.format.sampleRate}`,
        `${this.format.channels}`
      ];
      
      const proc = spawn('python3', args);
      
      proc.on('error', (err) => {
        reject(new Error(`PyAudio recording failed: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python process exited with code ${code}`));
        }
      });
    });
  }
  
  /**
   * Play audio using PyAudio
   */
  async playAudio(deviceIndex: string | number, inputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-c', this.pythonScript,
        '--',
        'play',
        `${deviceIndex}`,
        inputFile
      ];
      
      const proc = spawn('python3', args);
      
      proc.on('error', (err) => {
        reject(new Error(`PyAudio playback failed: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python process exited with code ${code}`));
        }
      });
    });
  }
}

/**
 * Factory: Create audio device based on available tools
 */
export async function createAudioDevice(
  inputDevice: string,
  outputDevice: string,
  format: AudioFormat
): Promise<ALSAAudioDevice> {
  // Check if arecord/aplay are available
  const hasALSA = await checkCommand('arecord') && await checkCommand('aplay');
  
  if (hasALSA) {
    console.log('[Audio] Using ALSA tools (arecord/aplay)');
    return new ALSAAudioDevice(inputDevice, outputDevice, format);
  } else {
    throw new Error('ALSA tools not found. Install alsa-utils package.');
  }
  
  // Note: PyAudio fallback available but not currently used by default
}

/**
 * Check if a command is available
 */
async function checkCommand(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('which', [command]);
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}
