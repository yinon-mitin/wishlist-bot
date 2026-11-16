// Fails when a tracked file looks like it leaks a secret or personal data.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKEN = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/;
const HOME_PATH = /(?<![\w.-])\/(?:home|Users)\/[A-Za-z0-9._-]+\//;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
// The scanner and its tests necessarily contain the patterns they look for.
const EXEMPT = [/^scripts\/check-repository-safety\.mjs$/, /^tests\/scripts\//];

const isEnvFile = (path) => /(^|\/)(\.env|[^/]*\.env)$/.test(path);
const isDataFile = (path) => /(^|\/)data\//.test(path) || /\.(sqlite|sqlite3|db)(-wal|-shm)?$/.test(path);

/** `files`: [{ path, text }]. Returns a list of problems; secrets are never echoed back. */
export function checkFiles(files) {
  const problems = [];
  for (const { path, text } of files) {
    if (EXEMPT.some((re) => re.test(path))) continue;
    if (isEnvFile(path)) problems.push(`${path}: environment file is tracked (only .env.example may be)`);
    if (isDataFile(path)) problems.push(`${path}: database or data file is tracked`);
    if (TOKEN.test(text)) problems.push(`${path}: looks like a Telegram bot token`);
    if (PRIVATE_KEY.test(text)) problems.push(`${path}: contains a private key`);
    if (HOME_PATH.test(text)) problems.push(`${path}: contains a personal home directory path`);
  }
  return problems;
}

const BINARY = /\.(png|jpe?g|webp|gif|ico|woff2?|pdf|zip|gz)$/i;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = paths.map((path) => {
    if (BINARY.test(path)) return { path, text: '' };
    try {
      return { path, text: readFileSync(path, 'utf8') };
    } catch {
      return { path, text: '' };
    }
  });
  const problems = checkFiles(files);
  for (const p of problems) console.error(p);
  console.log(problems.length ? `safety: ${problems.length} problem(s)` : 'safety: ok');
  process.exit(problems.length ? 1 : 0);
}
