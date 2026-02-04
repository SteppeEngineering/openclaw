import type { OpenClawConfig } from "../config/config.js";

export const DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR = 20_000;
export const DEFAULT_PI_COMPACTION_KEEP_RECENT_TOKENS = 80_000;

type PiSettingsManagerLike = {
  getCompactionReserveTokens: () => number;
  getCompactionKeepRecentTokens: () => number;
  applyOverrides: (overrides: { compaction: Record<string, number> }) => void;
};

export function ensurePiCompactionReserveTokens(params: {
  settingsManager: PiSettingsManagerLike;
  minReserveTokens?: number;
}): { didOverride: boolean; reserveTokens: number } {
  const minReserveTokens = params.minReserveTokens ?? DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR;
  const current = params.settingsManager.getCompactionReserveTokens();

  if (current >= minReserveTokens) {
    return { didOverride: false, reserveTokens: current };
  }

  params.settingsManager.applyOverrides({
    compaction: { reserveTokens: minReserveTokens },
  });

  return { didOverride: true, reserveTokens: minReserveTokens };
}

export function ensurePiCompactionKeepRecentTokens(params: {
  settingsManager: PiSettingsManagerLike;
  keepRecentTokens?: number;
}): { didOverride: boolean; keepRecentTokens: number } {
  const desired = params.keepRecentTokens ?? DEFAULT_PI_COMPACTION_KEEP_RECENT_TOKENS;
  const current = params.settingsManager.getCompactionKeepRecentTokens();

  if (current >= desired) {
    return { didOverride: false, keepRecentTokens: current };
  }

  params.settingsManager.applyOverrides({
    compaction: { keepRecentTokens: desired },
  });

  return { didOverride: true, keepRecentTokens: desired };
}

export function resolveCompactionReserveTokensFloor(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.compaction?.reserveTokensFloor;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR;
}

export function resolveCompactionKeepRecentTokens(cfg?: OpenClawConfig): number {
  const raw = (cfg?.agents?.defaults?.compaction as Record<string, unknown>)?.keepRecentTokens;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_PI_COMPACTION_KEEP_RECENT_TOKENS;
}
