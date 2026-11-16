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
