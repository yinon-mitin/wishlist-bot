// Fails the build when the gzipped JavaScript of the web bundle exceeds the budget (KB).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const jsFiles = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });

export const gzipJsBytes = (dir) => jsFiles(dir).reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);

export function checkBundle(dir, budgetKb) {
  const bytes = gzipJsBytes(dir);
  return { ok: bytes <= budgetKb * 1024, bytes, budgetKb };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'dist/web';
  const budget = Number(process.argv[3] ?? 90);
  const r = checkBundle(dir, budget);
  console.log(`web JS (gzip): ${(r.bytes / 1024).toFixed(1)} KB, budget ${budget} KB`);
  process.exit(r.ok ? 0 : 1);
}
