import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { countStatuses, type StatusCounts } from './digest/counts.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightOnBoard = {
  night: string;
  /** Run lines by status for that night; null when the file cannot be read. */
  counts: StatusCounts | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightOnBoard[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({
      night,
      counts: countStatuses(config.runsDir, night),
    })),
  };
}
