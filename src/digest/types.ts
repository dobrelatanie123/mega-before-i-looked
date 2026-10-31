// The contract for the night's digest. Types only; the reader implements ReadNight.

/** Status of one run, as written in the log. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of runs/<night>.jsonl. */
export type RunLine = {
  /** ISO time with the log's offset, kept as written (e.g. "2026-10-29T01:30:00+01:00"). */
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One job's night, folded from all its lines. */
export type DigestRow = {
  job: string;
  /** Owner on the job's latest line. null stays null; the view shows "—". */
  owner: string | null;
  /** Lines for this job, any status. */
  runs: number;
  /** Lines for this job with status "retry". */
  retries: number;
  /** Status on the job's latest line. */
  lastStatus: RunStatus;
  /** Most recent `error` on any of the job's lines, even if a later run was ok. null if none. */
  lastError: string | null;
  /** `at` of the job's first and latest line, as written in the log (never converted to UTC). */
  firstAt: string;
  lastAt: string;
};

/**
 * A night that has a file. Lines are taken in file order.
 *
 * - "empty": the file has no non-blank lines. The page says "nothing ran".
 * - "ran": at least one non-blank line. `rows` is sorted by job (plain string order) and can be
 *   empty if every line was bad. `badLines` counts non-blank lines that are not valid JSON or do
 *   not match RunLine. Blank lines are skipped, not counted.
 */
export type NightDigest =
  | { kind: 'empty'; night: string }
  | { kind: 'ran'; night: string; rows: DigestRow[]; badLines: number };

/**
 * Reads runs/<night>.jsonl from `runsDir`. Synchronous, never throws on bad lines.
 * Returns null when there is no file for that night, or `night` is not YYYY-MM-DD (route: 404).
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
