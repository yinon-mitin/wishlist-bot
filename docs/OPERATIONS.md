# Operations

[Back to the README](../README.md)

## Everyday

```sh
make ps        # container status
make logs      # follow the log
make restart   # restart without rebuilding
make down      # stop
```

The container restarts by itself after a reboot (`restart: unless-stopped`) and has a health check on `/healthz`.

## Update

```sh
git pull
make up
```

`make up` rebuilds the image and recreates the container; the database lives in `./data` and is migrated automatically on start.

## Backups

- **Nightly.** At `BACKUP_HOUR` (in `TIMEZONE`) the app writes a consistent snapshot to `data/backups/wishlist-YYYYMMDD-HHMMSS.sqlite`, keeps the newest `BACKUP_KEEP`, and sends the file to you in Telegram.
- **On demand.** Send `/backup` to the bot (only the owner gets an answer).
- **What is inside.** The whole database: gifts, **reservations and contributions**, and rates. Photos are not in the file; they are in `data/images/`. If you want to be surprised, do not open the files before the reveal.
- **Full copy.** To copy everything, stop the app and copy the `data/` directory.

### Restore

```sh
make down
cp data/backups/wishlist-YYYYMMDD-HHMMSS.sqlite data/wishlist.sqlite
rm -f data/wishlist.sqlite-wal data/wishlist.sqlite-shm
make up
```

If you only have the file from Telegram, put it into `data/` as `wishlist.sqlite`. Photos referenced by the database but missing from `data/images/` show as a coloured placeholder until you upload them again.

## Rotate the bot token

1. In BotFather send `/revoke` and pick the bot; copy the new token.
2. Put it into `.env` as `BOT_TOKEN`.
3. `make restart`.

Guests' sessions are signed with the token, so they reopen the app once to get a fresh signature.

## The birthday and the next round

- On or after the birthday open **Reveal** in the owner bar. Tick **Received** for the gifts you got and press **Wrap up the round**. Givers of received gifts get a thank-you message; the next round starts for the following birthday.
- Changing `BIRTHDAY` in `.env` affects rounds created afterwards. The round that is already open keeps its date.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Nobody can open the app | `tailscale funnel status`, then `curl -fs https://<your address>/healthz` from outside the tailnet. |
| The bot does not answer | `make logs`: look for `bot @name polling`. A second process using the same token (another machine, a leftover container) steals updates. |
| Backups do not arrive | The log shows `could not be sent to the owner`: open the bot and press **Start** once so it may message you. The file is still in `data/backups/`. |
| Rates look old | The refresh runs every 12 hours and keeps the last good rates if the provider is unreachable. |
| Disk usage grows | Photos for deleted gifts are removed automatically; old backups beyond `BACKUP_KEEP` are pruned. |
