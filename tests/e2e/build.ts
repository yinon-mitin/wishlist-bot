import { execSync } from 'node:child_process';

/** The browser tests run against the real production bundle. */
export default function globalSetup() {
  execSync('npm run build:web', { stdio: 'inherit' });
}
