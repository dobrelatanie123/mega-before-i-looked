import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// runs/ is read-only fixtures: the digest routes get their own temp dir.
let runsDir: string;
let app: ReturnType<typeof createApp>;

const valid = [
  '{"at":"2026-11-01T01:00:00+01:00","job":"backup-db","status":"retry","owner":"ops","error":"timeout"}',
  '{"at":"2026-11-01T01:05:00+01:00","job":"backup-db","status":"retry","owner":"ops"}',
  '{"at":"2026-11-01T01:10:00+01:00","job":"backup-db","status":"retry","owner":"ops"}',
  '{"at":"2026-11-01T01:15:00+01:00","job":"backup-db","status":"ok","owner":"ops"}',
  '{"at":"2026-11-01T02:00:00+01:00","job":"sync-labs","status":"fail","owner":null,"error":"401 from upstream"}',
];
const bad = '{"at":';

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  // One bad line, in the middle of the file, so file order and badLines are both exercised.
  writeFileSync(
    join(runsDir, '2026-11-01.jsonl'),
    [valid[0], valid[1], bad, valid[2], valid[3], valid[4]].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, '2026-11-02.jsonl'), '');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

/** Job names in the order the page's table lists them (first cell of each body row). */
function pageJobs(html: string): string[] {
  return [...html.matchAll(/<tr><td>([^<]+)<\/td>/g)].map((m) => m[1] ?? '');
}

describe('digest page', () => {
  it('lists each job of a night with lines, and counts the bad line', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup-db');
    expect(html).toContain('sync-labs');
    expect(html).toContain('1 line could not be read');
  });

  it('marks the cells that need attention', async () => {
    const html = await (await app.request('/digest/2026-11-01')).text();
    // backup-db retried 3 times: the retries cell is marked.
    expect(html).toContain('<td class="warn">3</td>');
    // sync-labs ended on a fail: the last status cell is marked.
    expect(html).toContain('<td class="warn">fail</td>');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-11-03');
    expect(res.status).toBe(404);
  });
});

describe('digest JSON', () => {
  it('returns a ran night with its rows sorted by job and the bad line count', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ kind: 'ran', night: '2026-11-01', badLines: 1 });
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['backup-db', 'sync-labs']);
  });

  it('returns an empty night as kind "empty"', async () => {
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: 'empty', night: '2026-11-02' });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-11-03');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });
});

describe('digest page and JSON agree', () => {
  it('list the same jobs in the same order for 2026-11-01', async () => {
    const html = await (await app.request('/digest/2026-11-01')).text();
    const body = await (await app.request('/api/digest/2026-11-01')).json();
    const jsonJobs = body.rows.map((r: { job: string }) => r.job);
    expect(pageJobs(html)).toEqual(jsonJobs);
  });
});
