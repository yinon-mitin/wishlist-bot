import { join } from 'node:path';
import { loadConfig } from '../config';
import { openDb } from '../db/db';
import { migrate } from '../db/migrate';
import { safeFetch } from '../services/ssrf';
import { fetchWishlist, importWishlist } from './ohmywishes';

/**
 * npm run import:ohmywishes -- <username> [--publish] [--dry-run]
 * Copies a public ohmywishes.com wishlist into the database in DATA_DIR. Gifts arrive as hidden drafts
 * unless --publish is given; running it again skips what is already there.
 */
async function main() {
  const args = process.argv.slice(2);
  const username = args.find((a) => !a.startsWith('--'));
  if (!username) {
    console.error('Usage: npm run import:ohmywishes -- <username> [--publish] [--dry-run]');
    process.exit(2);
  }
  const config = loadConfig(process.env);
  const entries = await fetchWishlist(username);
  const categories = new Set(entries.map((e) => e.category));
  console.log(`Found ${entries.length} gifts in ${categories.size} categories for ${username}.`);
  if (args.includes('--dry-run')) return;

  const db = openDb(join(config.dataDir, 'wishlist.sqlite'));
  migrate(db);
  const res = await importWishlist(
    { db, dataDir: config.dataDir, currencies: config.currencies, now: new Date(), fetcher: safeFetch, publish: args.includes('--publish') },
    entries,
  );
  console.log(`Created ${res.created}, skipped ${res.skipped} already there, ${res.imagesFailed} without a photo.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
