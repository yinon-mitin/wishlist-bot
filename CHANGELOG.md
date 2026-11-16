# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Project scaffold: TypeScript, Vitest, typed environment configuration (`loadConfig`) with validation of the birthday, public URL and currencies.
- SQLite schema (rounds, items, claims, rates, settings) with versioned migrations, WAL and foreign keys.
- Telegram initData verification (HMAC, freshness) and auth middleware that marks the owner by OWNER_ID.
- HTTP app skeleton (health check, authenticated /api, SPA static serving), Docker image, Compose file (loopback-published port, data volume), Makefile and CI workflow.
- Money helpers: tolerant price parsing, minor-unit conversion through USD with half-up rounding, localized formatting.
- Birthday rounds: time-zone-aware next-birthday and day-count helpers (02-29 handled), one open round at all times.
- Cached currency rates from open.er-api.com (RUB and ILS included) with DB-backed cache, failure fallback and GET /api/rates.
- Owner item management API (create, update, delete) with strict validation; deleting a reserved gift notifies the people who reserved it.
- Atomic, idempotent whole-gift reservations: one winner among competing guests, only the author can release, the owner cannot reserve.
- Guest API (list, details, reserve, release, /api/me) built on a single dto assembler; the owner's responses never contain reservation data, enforced by cross-route tests.
- SSRF-safe URL fetching (resolved-address checks, redirect re-validation, size and time limits) and owner-only link preview from OpenGraph, JSON-LD and price meta tags.
- Image upload and import by URL: format sniffing, EXIF stripped, WebP at most 1200px, content-hash names, public immutable serving, unused files garbage-collected.
- Telegram bot: localized /start and /help with a button that opens the mini-app, menu button setup, and a notifier that never throws on blocked users.
- GET /api/home with the days left until the open round's birthday (time-zone aware, never negative).
- Gift priority (must, want, nice) and free-form notes; lists sort by priority then newest.
- Hidden drafts (create as draft, publish with one call; guests get a 404 identical to a missing item) and a scheduler for periodic tasks, used to refresh currency rates every 12 hours.
- Deep links to a single gift (t.me startapp=item_N, both link forms) and share-URL helpers shared by server and client.
- Nightly backup: consistent SQLite snapshot sent to the owner in Telegram, old copies pruned (BACKUP_KEEP), owner-only /backup command (silent for others).
- Round close: owner-only reveal of who reserved what (only on or after the birthday), mark received gifts, free the rest, open next year's round, thank the givers in their language.
- Group gift funding: owner enables per gift, guests contribute amounts in the gift's currency (never above the price, atomic), withdraw, see progress and contributors; the owner stays blind; reveal and thanks cover contributors.
- Visual direction A (native Telegram): theme-driven design tokens and the decision record.
- Web foundation: Telegram SDK wrapper, API client, hash router with start_param deep links, en/ru i18n with plural forms and key-parity tests, gzip bundle budget (90 KB) enforced by `build:web`.
- Guest screens (native Telegram style): home with most-wanted gifts, list with an availability filter, gift page with price conversion, currency picker, atomic reserve/cancel with conflict handling.
