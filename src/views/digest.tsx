import type { NightDigest } from '../digest/types.js';

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest {digest.night}</h1>
      {digest.kind === 'empty' ? (
        <p class="mute">nothing ran</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>job</th>
                <th>owner</th>
                <th>runs</th>
                <th>retries</th>
                <th>last status</th>
                <th>last error</th>
                <th>first</th>
                <th>last</th>
              </tr>
            </thead>
            <tbody>
              {digest.rows.map((r) => (
                <tr>
                  <td>{r.job}</td>
                  <td>{r.owner ?? '—'}</td>
                  <td>{r.runs}</td>
                  <td class={r.retries >= 3 ? 'warn' : undefined}>{r.retries}</td>
                  <td class={r.lastStatus === 'fail' ? 'warn' : undefined}>{r.lastStatus}</td>
                  <td>{r.lastError ?? '—'}</td>
                  <td>{r.firstAt}</td>
                  <td>{r.lastAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {digest.badLines > 0 && (
            <p class="mute">
              {digest.badLines} {digest.badLines === 1 ? 'line' : 'lines'} could not be read
            </p>
          )}
        </>
      )}
    </>
  );
}
