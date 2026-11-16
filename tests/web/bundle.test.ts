import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gzipJsBytes, checkBundle } from '../../scripts/check-bundle-size.mjs';

const dirWith = (bytes: number) => {
  const d = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(d, 'assets'));
  writeFileSync(join(d, 'assets', 'app.js'), randomBytes(bytes).toString('base64'));
  writeFileSync(join(d, 'assets', 'style.css'), 'x'.repeat(100000)); // CSS is not counted
  return d;
};

describe('bundle size budget', () => {
  it('counts the gzip size of all JS files and ignores other assets', () => {
    expect(gzipJsBytes(dirWith(1000))).toBeGreaterThan(500);
    expect(gzipJsBytes(dirWith(1000))).toBeLessThan(3000);
  });
  it('passes under the limit and fails over it', () => {
    expect(checkBundle(dirWith(1000), 90).ok).toBe(true);
    expect(checkBundle(dirWith(150_000), 90).ok).toBe(false);
  });
});
