// Static security gate: no raw-HTML or eval sinks, a strict CSP, narrow capabilities, no web storage, no dev hooks in the build.
import {mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {describe, expect, test} from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8'); // vitest runs from the repo root
const files = (dir: string): string[] =>
  readdirSync(dir, {recursive: true, encoding: 'utf8'})
    .map((f) => join(dir, f))
    .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
/** `file:line: text` for every line under `dir` matching `pattern` (the same scan as `rg pattern dir`). */
const grep = (pattern: RegExp, list: string[]) =>
  list.flatMap((f) =>
    read(f)
      .split('\n')
      .flatMap((line, i) =>
        pattern.test(line) ? [`${f}:${i + 1}: ${line.trim().slice(0, 160)}`] : [],
      ),
  );
const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.startsWith(join('src', 'test'));

describe('security', () => {
  test('src/ has no raw-HTML or eval sinks (test files included)', () => {
    expect(grep(/dangerouslySetInnerHTML|innerHTML|eval\(|new Function/, files('src'))).toEqual([]);
  });

  test('no localStorage or sessionStorage outside tests', () => {
    expect(
      grep(
        /localStorage|sessionStorage/,
        files('src').filter((f) => !isTest(f)),
      ),
    ).toEqual([]);
  });

  test("the CSP keeps script-src 'self' and never allows unsafe-eval", () => {
    const csp: string = JSON.parse(read('src-tauri/tauri.conf.json')).app.security.csp;
    const directives = new Map(
      csp
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((d) => d[0])
        .map(([name, ...values]) => [name, values]),
    );
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(csp).not.toContain('unsafe-eval');
    expect(directives.get('object-src')).toEqual(["'none'"]);
  });

  test('capabilities have no core:default and no fs scope beyond the two file commands', () => {
    const dir = 'src-tauri/capabilities';
    const ids = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => {
        const permissions: Array<string | {identifier: string}> = JSON.parse(
          read(join(dir, f)),
        ).permissions;
        return permissions.map((p) => (typeof p === 'string' ? p : p.identifier));
      });
    expect(ids).not.toContain('core:default');
    // fs:allow-read-file / fs:allow-write-file grant the commands only; paths come from dialog picks (persisted scope).
    expect(ids.filter((id) => id.startsWith('fs:')).sort()).toEqual([
      'fs:allow-read-file',
      'fs:allow-write-file',
    ]);
  });

  test('the built bundle carries no dev-only test hook', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ifixpdf-build-'));
    try {
      // A separate process: esbuild refuses to run inside the jsdom environment. Same config and minifier as `pnpm build`;
      // NODE_ENV must be reset: vitest sets it to 'test', which makes vite build with import.meta.env.DEV = true.
      execFileSync(
        'pnpm',
        ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
        {stdio: 'pipe', env: {...process.env, NODE_ENV: 'production'}},
      );
      const built = files(outDir);
      expect(built.length).toBeGreaterThan(0);
      expect(grep(/__thumbRenders/, built)).toEqual([]);
    } finally {
      rmSync(outDir, {recursive: true, force: true});
    }
  }, 120000);
});
