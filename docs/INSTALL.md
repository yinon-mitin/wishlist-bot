# Install guide

[Back to the README](../README.md)

This guide takes you from nothing to a working wishlist on your own machine. Plan for about twenty minutes.

## Requirements

- A computer that is on most of the time (a Mac mini, a home server, a small VPS) with Docker and Compose v2, Git and Make.
- A Telegram account.
- A public HTTPS address for the app. This guide uses [Tailscale Funnel](https://tailscale.com/kb/1223/funnel); any reverse proxy with a valid certificate works as well.

## 1. Create the bot

1. In Telegram open [@BotFather](https://t.me/BotFather) and send `/newbot`. Choose a name and a username ending in `bot`.
2. Copy the **bot token** it gives you. Treat it like a password: anyone with it controls the bot.
3. Find your numeric Telegram ID, for example by sending `/start` to a bot such as [@userinfobot](https://t.me/userinfobot). That number is `OWNER_ID`.

## 2. Configure

```sh
git clone https://github.com/yinon-mitin/wishlist-bot.git
cd wishlist-bot
make init
```

`make init` creates `.env` from the template and an empty `data/` directory. Edit `.env`:

| Variable | Required | Meaning |
| --- | --- | --- |
| `BOT_TOKEN` | yes | Token from BotFather. |
| `OWNER_ID` | yes | Your numeric Telegram ID. You get the admin controls; nobody else does. |
| `PUBLIC_URL` | yes | The public HTTPS address of the app, without a trailing slash. `http://localhost:8080` is accepted for local trials. |
| `BIRTHDAY` | yes | Your birthday as `MM-DD`, for example `03-14`. `02-29` is handled. |
| `TIMEZONE` | no | IANA time zone for the countdown and the backup hour, for example `Asia/Jerusalem`. Default `UTC`. |
| `CURRENCIES` | no | Currencies guests can view prices in, comma separated, two-decimal ISO codes. Default `RUB,ILS,USD,EUR`. |
| `DEFAULT_CURRENCY` | no | The currency shown first. Must be in `CURRENCIES`. Defaults to the first one. |
| `BOT_USERNAME` | no | The bot's username without `@`. Needed for share links. |
| `APP_SHORT_NAME` | no | The mini-app short name from BotFather (step 4). Makes share links open the app directly. |
| `PORT` | no | Port on the host, bound to `127.0.0.1` only. Default `8080`. |
| `DATA_DIR` | no | Where the database, photos and backups live. In Docker it is the `./data` volume. |
| `BACKUP_KEEP` | no | How many nightly backups to keep. Default `7`. |
| `BACKUP_HOUR` | no | Hour of the nightly backup (0-23, in `TIMEZONE`). Default `3`. |
| `INITDATA_MAX_AGE_SEC` | no | How long a Telegram session signature stays valid. Default `86400`. |

The app refuses to start with a clear message if a required value is missing or invalid.

## 3. Give it a public address

The compose file publishes the app on `127.0.0.1:8080` only. Expose it with Tailscale Funnel on the same machine:

```sh
tailscale funnel --bg 8080
tailscale funnel status
```

The status shows your address, something like `https://machine.tailnet-name.ts.net`. Put it in `PUBLIC_URL`. If Funnel is refused, enable HTTPS certificates and Funnel for the machine in the Tailscale admin console first.

> [!TIP]
> Check the address from a phone that is **not** on your tailnet, on mobile data, and also from the countries where your guests live. Some networks block Tailscale or its domains; a guest in such a network needs a VPN, or you can use another public HTTPS address.

## 4. Start it

```sh
make test
make up
docker compose ps
curl -fs http://localhost:8080/healthz
```

The last command prints `{"ok":true}`. Then connect the mini-app in BotFather:

1. Send `/newapp`, pick your bot, give the app a title and description, and set the **Web App URL** to your `PUBLIC_URL`.
2. Choose a short name, for example `wishlist`. Your direct link is `https://t.me/<bot>/<short name>`.
3. Put the bot username and the short name into `.env` as `BOT_USERNAME` and `APP_SHORT_NAME`, then run `make restart`.

The bot also sets its own menu button to open `PUBLIC_URL`, so guests can open the app from the chat even without step 4.

## 5. First run

1. Open your bot, press **Start** and then **Wishlist** (the menu button).
2. As the owner you see **Add a gift** and **Reveal**. Paste a shop link, press **Fetch from link**, check the fields, save.
3. Open the app from another Telegram account and reserve the gift. Then open it as yourself: you will see the gift, but no name and no status.
4. Send `/backup` to the bot. A file with the database arrives in the chat (and **contains the reservations**; see the [security policy](../SECURITY.md)).
5. Share `https://t.me/<bot>/<short name>` with your friends.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| The app refuses to start | `docker compose logs` shows which `.env` value is wrong. |
| The app opens but says "Something went wrong" | `PUBLIC_URL` does not point to this machine, or the bot token in `.env` is not the token of the bot that opens the app. |
| `/healthz` works locally but not from the internet | Funnel is not running (`tailscale funnel status`) or is not allowed for this machine. |
| Prices show no conversion | Rates have not been fetched yet (the first fetch happens at start) or the machine cannot reach `open.er-api.com`. |
| Link fetch finds nothing | Some shops block automated requests or render the product on the client; fill the fields by hand. |
| A guest sees "unauthorized" | Their Telegram session data is older than `INITDATA_MAX_AGE_SEC`; reopening the app fixes it. |
