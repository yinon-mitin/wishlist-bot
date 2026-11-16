# Security policy

## Reporting

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/yinon-mitin/wishlist-bot/security/advisories/new), not in a public issue. Do not include bot tokens, server addresses, database files or screenshots of private chats.

## What Wishlist protects

| Threat | Protection |
| --- | --- |
| Someone calling the API without being a Telegram user | Every `/api` request needs Telegram `initData` with a valid HMAC signature and a recent `auth_date`; anything else is `401` |
| The owner learning who reserved what before the reveal | Owner responses are built without reservation fields; a test calls every route as the owner; browser tests inspect the DOM and the network; the reveal is refused before the birthday |
| Two guests reserving the same gift, or over-funding a group gift | Atomic database transactions; the rules are server-side |
| A guest reading drafts | Drafts answer `404`, identical to a missing gift |
| The server being used to reach your home network (SSRF) through link preview or photo import | Owner-only; addresses are resolved and checked before and after redirects; private, loopback, link-local and CGNAT ranges are refused; size and time limits |
| Malicious images | Content sniffing, re-encoding to WebP, metadata stripped, size limit |
| Script injection through names, titles or notes | The interface renders text, never HTML; Telegram messages are HTML-escaped |
| Secrets in Git | `.env`, `data/` and databases are ignored; `make check` scans tracked files for bot tokens, private keys and personal paths |

Design details: [Architecture](docs/ARCHITECTURE.md).

## Limits you should know

- **The owner's blindness is an application guarantee, not cryptography.** Whoever controls the server can read the SQLite file.
- **The nightly backup and `/backup` send the database to the owner's Telegram chat, and it contains the reservations.** Do not open these files before the reveal if you want to be surprised.
- The public address (Tailscale Funnel or a proxy) exposes the app to the internet. Only the signed Telegram session opens the API, but keep the system and Docker updated.
- Guests' Telegram names and ids are stored with their reservations so that the thank-you messages can be sent.

## Operator responsibilities

- Keep `.env` and backups private: the bot token gives full control of the bot.
- If a token was ever committed, deleting the file is not enough: revoke it in BotFather (`/revoke`) and rewrite history before sharing the repository.
- Keep the port bound to loopback (the compose file does) and expose it only through your HTTPS entry point.

## Supported versions

Only the latest `main` is supported.
