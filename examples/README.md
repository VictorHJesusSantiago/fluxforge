# Examples

Two complete, loadable `{ name, definition }` documents — exactly the body `POST /api/workflows`
expects.

## `webhook-echo.json`

The simplest complete round-trip: a real HTTP endpoint, a processing step, a response. No
external credentials needed, so it runs immediately.

```bash
npm run dev:server   # in one terminal

curl -s -X POST http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' \
  -d @examples/webhook-echo.json | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).id))"

curl -s -X POST http://localhost:3000/hooks/echo -d '{}' -H 'Content-Type: application/json'
# -> {"ok":true}
```

`respond-to-webhook`'s `body` is a static param, not a template of the incoming request — there
is no per-item expression templating in this version (`docs/SPEC.md`'s "Explicitly out of scope",
and the same limitation `http-request`'s own doc comment states). This example proves the
trigger → process → respond wiring, not a templating engine that doesn't exist yet.

## `scheduled-slack-digest.json`

A `trigger.cron` (fires daily at 09:00 UTC) → `integration.rss-read` → `integration.slack-webhook`
chain — the shape a real "check a feed, post to Slack" automation takes. **Both the feed URL and
the Slack webhook URL in this file are placeholders** — replace `feed.url` with a real RSS/Atom
feed and `announce.webhookUrl` with a real Slack Incoming Webhook URL before it does anything
useful; as saved, it will genuinely run on schedule and genuinely attempt both HTTP calls, and
will simply fail at `feed` with a fetch error against `example.com`, which is the honest,
observable result of not having filled in real endpoints yet — not a special "demo mode."

```bash
curl -s -X POST http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' \
  -d @examples/scheduled-slack-digest.json
```

Load either one into the editor by pasting the returned `id` into the URL as `?workflow=<id>`.
