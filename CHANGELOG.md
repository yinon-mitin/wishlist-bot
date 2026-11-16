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
