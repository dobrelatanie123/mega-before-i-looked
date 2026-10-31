import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');
  if (digest === null || digest.kind !== 'ran') throw new Error('expected a night that ran');
  const row = (job: string) => digest.rows.find((r) => r.job === job);

  it('has 5 jobs and 1 bad line', () => {
    expect(digest.rows).toHaveLength(5);
    expect(digest.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(digest.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds retries and keeps the last error after a later ok', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a failed job and a null owner', () => {
    expect(row('notes/backup')?.lastStatus).toBe('fail');
    expect(row('notes/backup')?.lastError).toBe('quota exceeded');
    expect(row('digest/render')?.owner).toBeNull();
    expect(row('digest/render')?.lastError).toBeNull();
  });

  it('keeps the log time offsets as written', () => {
    expect(row('lane/sync')?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row('lane/sync')?.lastAt).toBe('2026-10-29T05:00:04+01:00');
    expect(row('rig/rotate-logs')?.firstAt).toBe('2026-10-28T23:00:02+01:00');
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);

  it('returns null when there is no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null when night is not YYYY-MM-DD', () => {
    expect(readNight(dir, '../etc')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('returns empty for an empty file', () => {
    write('2026-02-01', '');
    expect(readNight(dir, '2026-02-01')).toEqual({ kind: 'empty', night: '2026-02-01' });
  });

  it('returns empty for a file of blank lines', () => {
    write('2026-02-02', '\n  \n\t\n');
    expect(readNight(dir, '2026-02-02')).toEqual({ kind: 'empty', night: '2026-02-02' });
  });

  it('returns ran with no rows when every line is bad', () => {
    write(
      '2026-02-03',
      [
        'not json',
        '{"at":"2026-02-03T01:00:00+01:00","job":"a","status":"done","owner":"rook"}',
        '{"job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-02-03T01:00:00+01:00","status":"ok","owner":"rook"}',
        '{"at":"2026-02-03T01:00:00+01:00","job":"a","status":"ok","owner":7}',
        '{"at":"2026-02-03T01:00:00+01:00","job":"a","status":"fail","owner":"rook","error":42}',
        '[1,2]',
        '',
      ].join('\n'),
    );
    expect(readNight(dir, '2026-02-03')).toEqual({ kind: 'ran', night: '2026-02-03', rows: [], badLines: 7 });
  });

  it('takes the latest line in file order, not by time', () => {
    write(
      '2026-02-04',
      [
        '{"at":"2026-02-04T03:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
        '',
        '{"at":"2026-02-04T02:00:00+01:00","job":"a","status":"ok","owner":null}',
      ].join('\n'),
    );
    const digest = readNight(dir, '2026-02-04');
    expect(digest).toEqual({
      kind: 'ran',
      night: '2026-02-04',
      badLines: 0,
      rows: [
        {
          job: 'a',
          owner: null,
          runs: 2,
          retries: 0,
          lastStatus: 'ok',
          lastError: 'boom',
          firstAt: '2026-02-04T03:00:00+01:00',
          lastAt: '2026-02-04T02:00:00+01:00',
        },
      ],
    });
  });
});
