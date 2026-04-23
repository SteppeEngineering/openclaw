/**
 * Voice Acknowledgment Service
 * 
 * Plays contextual acknowledgment audio during the processing phase.
 * Creates natural feedback between transcription and agent response.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import type { VoiceConfig } from '../voice-config';

/**
 * Acknowledgment audio metadata
 */
export interface AckAudio {
  /** Acknowledgment name (without .wav extension) */
  name: string;
  /** Full file path */
  path: string;
  /** Keywords that trigger this ack */
  keywords: string[];
}

/**
 * Acknowledgment catalog
 */
const ACK_CATALOG: Array<Omit<AckAudio, 'path'>> = [
  {
    name: 'let-me-see',
    keywords: ['what', 'show', 'look', 'see', 'display', 'view'],
  },
  {
    name: 'checking',
    keywords: ['check', 'verify', 'confirm', 'validate'],
  },
  {
    name: 'searching',
    keywords: ['find', 'search', 'locate', 'where'],
  },
  {
    name: 'pulling-up',
    keywords: ['get', 'fetch', 'retrieve', 'pull', 'grab'],
  },
  {
    name: 'analyzing',
    keywords: ['analyze', 'examine', 'study', 'review', 'investigate'],
  },
  {
    name: 'investigating',
    keywords: ['how', 'why', 'explain', 'tell me'],
  },
  {
    name: 'diagnostics',
    keywords: ['diagnose', 'debug', 'troubleshoot', 'fix', 'repair'],
  },
  {
    name: 'executing',
    keywords: ['run', 'execute', 'do', 'perform', 'start'],
  },
  {
    name: 'thinking',
    keywords: ['think', 'consider', 'evaluate', 'calculate'],
  },
  {
    name: 'on-it',
    keywords: ['help', 'assist', 'support', 'please'],
  },
  {
    name: 'understood',
    keywords: ['set', 'configure', 'change', 'update', 'adjust'],
  },
  {
    name: 'moment',
    keywords: ['wait', 'hold', 'give me'],
  },
  {
    name: 'issue',
    keywords: ['problem', 'issue', 'error', 'wrong', 'broken'],
  },
];

/**
 * Loaded acknowledgment audio cache
 */
let ackCache: AckAudio[] | null = null;

/**
 * Load all acknowledgment audio files
 * 
 * @param config - Voice configuration
 * @returns Array of loaded acknowledgment audio metadata
 */
export async function loadAcknowledgments(config: VoiceConfig): Promise<AckAudio[]> {
  if (ackCache) {
    return ackCache;
  }

  const ackDir = config.behavior.ackDirectory;
  
  try {
    // Verify directory exists
    const stat = await fs.stat(ackDir);
    if (!stat.isDirectory()) {
      throw new Error(`Acknowledgment path is not a directory: ${ackDir}`);
    }
    
    // Build catalog with full paths
    ackCache = ACK_CATALOG.map(ack => ({
      ...ack,
      path: join(ackDir, `${ack.name}.wav`),
    }));
    
    // Verify files exist
    const missingFiles: string[] = [];
    for (const ack of ackCache) {
      try {
        await fs.access(ack.path);
      } catch {
        missingFiles.push(ack.name);
      }
    }
    
    if (missingFiles.length > 0) {
      console.warn(`[Ack] Missing acknowledgment files: ${missingFiles.join(', ')}`);
    }
    
    console.log(`[Ack] Loaded ${ackCache.length} acknowledgment files from ${ackDir}`);
    
    return ackCache;
    
  } catch (error) {
    console.error('[Ack] Failed to load acknowledgments:', error);
    // Return empty cache to prevent repeated failures
    ackCache = [];
    return ackCache;
  }
}

/**
 * Select appropriate acknowledgment based on transcript
 * 
 * @param transcript - User's transcribed speech
 * @param acks - Loaded acknowledgments
 * @returns Selected acknowledgment, or null if no match/fallback
 */
export function selectAcknowledgment(
  transcript: string,
  acks: AckAudio[]
): AckAudio | null {
  if (!acks || acks.length === 0) {
    return null;
  }

  const lowerTranscript = transcript.toLowerCase();
  
  // Find best match based on keyword presence
  const matches = acks.filter(ack =>
    ack.keywords.some(keyword => lowerTranscript.includes(keyword))
  );
  
  if (matches.length === 0) {
    // No keyword match - use fallback
    const fallback = acks.find(a => a.name === 'thinking');
    return fallback || null;
  }
  
  // If multiple matches, prefer earlier keyword matches
  // (keywords at start of sentence are stronger indicators)
  let bestMatch = matches[0];
  let earliestPosition = Infinity;
  
  for (const match of matches) {
    for (const keyword of match.keywords) {
      const pos = lowerTranscript.indexOf(keyword);
      if (pos !== -1 && pos < earliestPosition) {
        earliestPosition = pos;
        bestMatch = match;
      }
    }
  }
  
  return bestMatch;
}

/**
 * Play acknowledgment audio file
 * 
 * @param ackPath - Path to acknowledgment WAV file
 * @returns Promise that resolves when playback completes
 */
export async function playAcknowledgment(ackPath: string): Promise<void> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    // Verify file exists
    await fs.access(ackPath);
    
    console.log(`[Ack] Playing acknowledgment: ${ackPath}`);
    
    // Play using aplay (ALSA)
    // -q = quiet mode (no terminal output)
    // Using default output device
    await execAsync(`aplay -q "${ackPath}"`);
    
    console.log('[Ack] Playback complete');
    
  } catch (error) {
    console.error('[Ack] Playback failed:', error);
    throw new Error(`Failed to play acknowledgment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Play contextual acknowledgment based on transcript
 * 
 * This is the main entry point used by voice handlers.
 * 
 * @param transcript - User's transcribed speech
 * @param config - Voice configuration
 * @returns Promise that resolves when playback completes (or skips if no ack)
 */
export async function playContextualAck(
  transcript: string,
  config: VoiceConfig
): Promise<void> {
  try {
    // Load acknowledgments if not cached
    const acks = await loadAcknowledgments(config);
    
    if (acks.length === 0) {
      console.log('[Ack] No acknowledgments available, skipping');
      return;
    }
    
    // Select appropriate ack
    const selectedAck = selectAcknowledgment(transcript, acks);
    
    if (!selectedAck) {
      console.log('[Ack] No matching acknowledgment, skipping');
      return;
    }
    
    console.log(`[Ack] Selected: ${selectedAck.name}`);
    
    // Play the acknowledgment
    await playAcknowledgment(selectedAck.path);
    
  } catch (error) {
    // Don't throw - acknowledgment failure should not break voice flow
    console.error('[Ack] Failed to play contextual acknowledgment:', error);
  }
}

/**
 * Clear acknowledgment cache (for testing or config reload)
 */
export function clearAckCache(): void {
  ackCache = null;
}
