// Local git hooks: lint on commit, typecheck and tests on push.
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8'); // vitest runs from the repo root

describe('git hooks', () => {
  test('husky is pinned and installed by prepare', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.prepare).toBe('husky');
    expect(pkg.devDependencies.husky).toBe('9.1.7');
  });

  test('pre-commit runs lint', () => {
    expect(read('.husky/pre-commit').trim()).toBe('pnpm lint');
  });

  test('pre-push runs typecheck and tests', () => {
    expect(read('.husky/pre-push').trim()).toBe('pnpm typecheck && pnpm test');
  });
});
