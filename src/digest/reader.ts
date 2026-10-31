import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** Parses one non-blank line. Returns null when it is not JSON or does not match RunLine. */
function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const at: unknown = Reflect.get(value, 'at');
  const job: unknown = Reflect.get(value, 'job');
  const status: unknown = Reflect.get(value, 'status');
  const owner: unknown = Reflect.get(value, 'owner');
  const hasError = Object.hasOwn(value, 'error');
  const error: unknown = Reflect.get(value, 'error');

  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (hasError && typeof error !== 'string') return null;

  const line: RunLine = { at, job, status, owner };
  if (typeof error === 'string') line.error = error;
  return line;
}

/** Reads the file, or null when there is none for that night. Other I/O errors still throw. */
function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    const code = err instanceof Error ? Reflect.get(err, 'code') : undefined;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { kind: 'empty', night };

  let badLines = 0;
  const byJob = new Map<string, DigestRow>();

  // "Latest" means file order: a later line wins, whatever its `at` says. The log is appended
  // as jobs finish, and `at` strings with different offsets don't sort as text anyway.
  for (const raw of lines) {
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const retry = line.status === 'retry' ? 1 : 0;
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: retry,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.owner = line.owner;
    row.runs += 1;
    row.retries += retry;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const digest: NightDigest = { kind: 'ran', night, rows, badLines };
  return digest;
};
