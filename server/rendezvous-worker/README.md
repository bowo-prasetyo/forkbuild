# ForkBuild Rendezvous Worker

A reference implementation of the rendezvous wire protocol
`peer/WebSocketRendezvousTransport.js` (in the main ForkBuild repo)
already documents, deployable on Cloudflare Workers + one Durable
Object. See `worker.js`'s own header comment for the full design
rationale — this file is just the "how do I actually get it running"
walkthrough.

Once deployed, you'll have a `wss://…` URL to add to
`peer/RendezvousConfig.js`'s `DEFAULT_RENDEZVOUS_URLS` back in the
main app, which is what actually turns on **Be Discoverable** / **Find
Someone** in ForkBuild's Peers panel.

## What it enforces

The server stores, for each identity, one short-lived entry saying where
it can be reached. It doesn't need accounts: an identity's id is a
`did:key`, which contains its public key, so the server checks every
change against the id itself.

- **Only an identity can change its own entry.** A PUBLISH must be signed
  by the identity it names, and a REMOVE must carry that identity's
  signature over withdrawing that one publication. The app signs both
  automatically while the identity is signed in and unlocked; a locked
  identity is told to unlock first.
- **No replays.** A publication older than the stored one is refused, so
  nobody can roll an identity back to an old endpoint, and a withdrawn
  publication cannot be published again.
- **Limits** (the `LIMITS` object in `worker.js`):

  | Limit | Value |
  | --- | --- |
  | Message size | 32 KB; a larger frame closes the connection |
  | Publication lifetime | at most 15 minutes (the app asks for 10) |
  | Client clock ahead of the server | at most 5 minutes |
  | Requests per connection | bursts of 120, then 2 per second |
  | Connections per IP address | 16 |
  | Identities stored at once | 100,000; set the `MAX_ENTRIES` variable to change it |

What it cannot do is prove that whoever publishes an identity answers at
the published endpoint. Peers still authenticate each other when they
connect, so a misbehaving server can hide an identity but not
impersonate one.

For a public deployment, also consider Cloudflare's own rate limiting
rules in front of the worker, and run more than one server:
`peer/RendezvousConfig.js` accepts several URLs, and the app publishes to
and looks up on all of them.

## Before you start: use the CLI, not the dashboard

Unlike a stateless worker (e.g. the p2pcf tutorial's worker, or a
plain TURN-credential proxy), this worker needs a **Durable Object**
binding to hold rendezvous state across connections — and as of early
2026, Cloudflare's dashboard has **no way to create a brand-new
Durable Object namespace at all**, on any plan (this is a confirmed,
current dashboard gap, not a free-tier restriction — see
[this Cloudflare Community thread](https://community.cloudflare.com/t/durable-objects-create-namespace-button-still-missing-on-paid-plan-2026/875596),
where even paid-plan users hit the exact same missing "Create
namespace" button). The dashboard's "Add binding → Durable Object"
form can only *select* a namespace that already exists — it can't make
the first one for you.

**So skip Option B below and go straight to Option A (Wrangler CLI)**
— it creates the namespace as part of a normal deploy, with no
dashboard step involved. Option B is kept here only in case Cloudflare
fixes this gap later.

## Option A — Wrangler CLI (recommended)

1. Install Wrangler (Cloudflare's CLI) if you don't have it:
   ```
   npm install -g wrangler
   ```
2. Log in — this opens a browser tab to authorize against the free
   account you just created:
   ```
   wrangler login
   ```
3. From this folder:
   ```
   cd server/rendezvous-worker
   wrangler deploy
   ```
   Wrangler reads `wrangler.toml`, uploads `worker.js`, creates the
   `RendezvousNode` Durable Object class, and binds it as
   `RENDEZVOUS_NODE` — all in one step, because `wrangler.toml`
   already declares all of that.
4. Wrangler prints the deployed URL, something like:
   ```
   https://forkbuild-rendezvous.<your-subdomain>.workers.dev
   ```
   (Edit `name = "forkbuild-rendezvous"` in `wrangler.toml` first if
   you want a different name in that URL — it's cosmetic only.)

## Option B — Dashboard only (currently blocked — see above)

**As of early 2026 this path dead-ends at step 3**: the dashboard can
bind to an existing Durable Object namespace but cannot create a new
one, so there is nothing to select. Left here for when Cloudflare
fixes that; use Option A until then.

1. **Workers & Pages → Create → Create Worker.** Give it any name, use
   the "Hello World" starter, deploy it (you'll overwrite the code
   next).
2. Open your new worker → **Edit code** (Quick Edit). Delete the
   starter code, paste in the full contents of `worker.js`, and
   deploy.
3. Go to your worker's **Settings → Bindings → Add → Durable Object**
   (Cloudflare's dashboard wording has shifted over time — if you see
   "Durable Object Namespace" instead, or a visual "Bindings" canvas
   rather than a plain form, it's the same thing; pick whichever one
   is offered).
   - **Variable name:** **exactly** `RENDEZVOUS_NODE` (worker.js reads
     `env.RENDEZVOUS_NODE` — a typo here means the worker responds
     with an explicit "binding not configured" error rather than
     silently misbehaving, so it'll be obvious if this doesn't match).
   - **Durable Object namespace:** create a new one (or select an
     existing empty one) and set its **Class name** to
     `RendezvousNode` — the class `worker.js` exports.
   - If the dashboard asks about a migration/new class, confirm it's
     a **new** class — this is the first time it's ever existed.
4. Save, and redeploy if prompted.
5. If step 3's binding UI isn't available on your account/plan, switch
   to Option A — the CLI path always works.

## Verify it's actually running

Visit your worker's URL (`https://…workers.dev`, no `wss://` yet) in
a regular browser tab. You should see:

```
ForkBuild rendezvous worker is running.
...
```

A WebSocket client (like `peer/WebSocketRendezvousTransport.js`) talks
to the **same URL**, just with the `wss://` scheme instead of
`https://`.

## Wire it into ForkBuild

Give me (or edit yourself) the deployed URL as a `wss://` URL, e.g.:

```js
// peer/RendezvousConfig.js
export const DEFAULT_RENDEZVOUS_URLS = [
    'wss://forkbuild-rendezvous.<your-subdomain>.workers.dev'
];
```

That's the only client-side change needed — `ui/main.js` already
wraps every URL in `DEFAULT_RENDEZVOUS_URLS` with a
`WebSocketRendezvousTransport` and a `RendezvousDiscoveryProvider`
automatically (see that file's own comments).

## Optional: restrict which sites may use it

By default, anyone who has this worker's URL can use it (the same
default `peer/RendezvousConfig.js` itself uses one layer up — "empty
means unrestricted"). To restrict it to your own ForkBuild
deployment's origin, set an environment variable:

- **Dashboard:** your worker → **Settings → Variables → Add variable**
  → `ALLOWED_ORIGINS` = `https://your-forkbuild-site.example` (comma-
  separate multiple origins).
- **Wrangler:** uncomment and edit the `[vars]` block at the bottom of
  `wrangler.toml`, then `wrangler deploy` again.

## Cost

Cloudflare Workers' free tier currently includes Durable Objects (on
the order of a few million requests/month), and WebSocket *messages*
are billed far more cheaply than plain requests — this worker also
uses Cloudflare's Hibernatable WebSockets API specifically to avoid
being charged for idle connection time. For a personal or small-group
ForkBuild deployment, this should stay within the free tier; check
Cloudflare's own current pricing page if you expect heavy traffic.

## Optional: TURN relay credentials

Some networks block direct peer connections; a TURN relay carries the
traffic instead. The app asks its rendezvous server for relay credentials
(`GET /turn-credentials`) when a peer connection starts. The worker creates
credentials that expire after an hour, answers each IP address at most 20
times an hour, and hands out at most 10,000 a month (set
`TURN_CREDENTIALS_PER_MONTH` to change that; past it, the app connects
without a relay). The long-term key stays on the worker; browsers only see
the short-lived credential. Without a provider the endpoint answers 404 and
the app connects with STUN alone.

**Cloudflare Realtime TURN (recommended).** On the same Cloudflare account:

1. In the Cloudflare dashboard, open **Realtime → TURN Server** and create a
   TURN key. Copy its **Turn Token ID** and **API Token** (the token is shown
   once).
2. From this folder, store both as secrets:
   ```
   wrangler secret put CLOUDFLARE_TURN_KEY_ID      # the Turn Token ID
   wrangler secret put CLOUDFLARE_TURN_API_TOKEN   # the API Token
   ```
3. Open `https://<your-worker>/turn-credentials`: it should return
   `iceServers` and an `expiresAt` an hour away.

Cloudflare currently includes 1,000 GB of relay traffic a month, then
charges per GB; check its current pricing, and set a budget alert
(**Manage Account → Alerts**).

**Watching the allowance.** Open `https://<your-worker>/turn-stats` in a
browser to see this month's count, e.g.
`{"month":"2026-09","issued":37,"limit":1000,"provider":"cloudflare"}`
(counts only, so it is open to anyone). The worker logs a warning when 80%
of `TURN_CREDENTIALS_PER_MONTH` is used and on every request refused past
it; `wrangler.toml` turns on log retention, so they can be searched under
**Workers & Pages → forkbuild-rendezvous → Logs**. If the count is heading
past the allowance and the relay traffic (GB) under **Realtime → TURN
Server** is well within the free allowance, raise
`TURN_CREDENTIALS_PER_MONTH` and run `wrangler deploy`.

**Metered.** Creating credentials through Metered's API needs a paid or
trial plan. Set `METERED_DOMAIN = "yourapp.metered.live"` under `[vars]` in
`wrangler.toml` and store the account's Secret Key with
`wrangler secret put METERED_SECRET_KEY`. If both providers are configured,
Cloudflare is used.

If an older version of the app ever shipped your Metered API key or TURN
credential, delete that credential in the Metered dashboard: it was public.

## Upgrading an existing deployment

Redeploy with `wrangler deploy`. Entries stored by the previous version
keep working until they expire (at most minutes). Clients older than
this version of the app still publish signed entries, but their REMOVE
is unsigned and is refused; their entries simply expire instead.

## If you ever need to change or remove it

- **Rotate/replace the deployment:** re-run `wrangler deploy` (or
  re-paste + redeploy via Quick Edit) — the Durable Object and its
  stored publications persist across a code redeploy, since neither
  changes the Durable Object's own identity.
- **Wipe all stored rendezvous state:** delete and recreate the
  Durable Object binding (Option B's binding UI, or
  `wrangler durable-objects` — see Wrangler's own docs) — not
  something you should normally need, since every publication expires
  on its own (see `worker.js`'s `SWEEP_INTERVAL_MS`).
- **Turn it off entirely:** delete the worker from the dashboard, and
  remove its URL from `DEFAULT_RENDEZVOUS_URLS` — ForkBuild degrades
  to exactly its out-of-the-box behavior (out-of-band invitations
  only), the same as before any of this was configured.
