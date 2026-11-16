import { describe, expect, it } from 'vitest';
import { checkFiles } from '../../scripts/check-repository-safety.mjs';

const file = (path: string, text = '') => ({ path, text });
// Built from pieces so this test file itself is not flagged by the scanner.
const FAKE_TOKEN = ['123456789', 'AAH' + 'x'.repeat(32)].join(':');

describe('check-repository-safety', () => {
  it('passes a clean repository', () => {
    expect(checkFiles([file('src/a.ts', 'const a = 1;'), file('.env.example', 'BOT_TOKEN=')])).toEqual([]);
  });

  it('flags a Telegram bot token in any tracked file', () => {
    const problems = checkFiles([file('docs/x.md', `token ${FAKE_TOKEN}`)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('docs/x.md');
    expect(problems[0]).not.toContain(FAKE_TOKEN); // never echo the secret
  });

  it('flags tracked .env files but not .env.example', () => {
    expect(checkFiles([file('.env', 'A=1')])[0]).toContain('.env');
    expect(checkFiles([file('prod.env', 'A=1')])).toHaveLength(1);
    expect(checkFiles([file('.env.example', 'A=')])).toEqual([]);
  });

  it('flags database files and data directories', () => {
    expect(checkFiles([file('data/wishlist.sqlite'), file('backup.db')])).toHaveLength(2);
  });

  it('flags personal home paths', () => {
    expect(checkFiles([file('README.md', 'see /home/alice/project')])).toHaveLength(1);
    expect(checkFiles([file('README.md', 'see /Users/bob/project')])).toHaveLength(1);
    expect(checkFiles([file('a.html', '<code>/home/alice/project</code>')])).toHaveLength(1);
    expect(checkFiles([file('a.md', 'GET /api/home/x and src/home/y/z')])).toEqual([]);
  });

  it('flags private key blocks', () => {
    expect(checkFiles([file('k.txt', '-----BEGIN OPENSSH PRIVATE KEY-----')])).toHaveLength(1);
  });

  it('does not scan the scanner and its own tests', () => {
    expect(checkFiles([file('scripts/check-repository-safety.mjs', '/home/x/'), file('tests/scripts/safety.test.ts', '/home/x/')])).toEqual([]);
  });
});
