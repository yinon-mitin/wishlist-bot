# Contributing

Wishlist is a small, self-hosted project. Keep changes focused, reviewable and free of personal data.

## Workflow

1. Create a branch from `main`.
2. Write a failing test first, watch it fail for the right reason, then make it pass (red, green, refactor). For a bug, start with a test that reproduces it.
3. Run `make test`; run `make e2e` when you touch the interface or the API.
4. Add a line to `CHANGELOG.md` under `Unreleased` (Added, Changed, Fixed or Removed) in the same change.
5. Open a pull request that explains the behaviour change and how you verified it.

## Rules

- Never commit `.env`, `data/`, databases, backups, tokens or screenshots of private chats. `make check` rejects the obvious cases.
- **Do not break the owner's blindness.** Owner responses must never carry reservation or funding data. Any change that touches gift responses, the reveal or notifications needs a test that proves the owner still sees nothing.
- User-facing text lives in `src/web/i18n/en.ts` and `ru.ts`, with the same keys and placeholders in both (a test enforces it). Server messages live in `src/server/messages.ts`.
- Money is an integer in minor units; use the helpers in `src/shared/money.ts`.
- The web bundle makes no requests to third parties; keep it under the budget enforced by `npm run build:web`.
- Documents (specs, plans, reports) are HTML; the repository's own docs (README, guides) are Markdown.

## Tests

```sh
make test   # type check, docs and safety checks, unit and API tests
make e2e    # browser journeys; set PW_CHROMIUM to use an existing Chromium
```

Tests need no Telegram credentials and no network.

## Acceptance

A change is ready when `make test` and `make e2e` pass, the diff is reviewed, and any change to the user interface has been looked at in a browser, in light and dark Telegram themes.
