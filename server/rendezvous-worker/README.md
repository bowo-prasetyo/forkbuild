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

## Before you start: why this isn't a plain "paste in Quick Edit" deploy

Unlike a stateless worker (e.g. the p2pcf tutorial's worker, or a
plain TURN-credential proxy), this worker needs a **Durable Object**
binding to hold rendezvous state across connections. Cloudflare's
browser-based "Quick Edit" editor can upload the *code*, but wiring up
a brand-new Durable Object class generally needs an explicit
migration — something the CLI (`wrangler`) does for you automatically
on first deploy, and which the dashboard *may* also support today
under **Settings → Bindings → Add → Durable Object Namespace** (this
has been added to the dashboard, but exact steps can shift between
Cloudflare UI updates). **The CLI path below is the reliable one** —
use it unless you're already comfortable poking around the dashboard's
current Bindings UI.

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

## Option B — Dashboard only (no CLI)

1. **Workers & Pages → Create → Create Worker.** Give it any name, use
   the "Hello World" starter, deploy it (you'll overwrite the code
   next).
2. Open your new worker → **Edit code** (Quick Edit). Delete the
   starter code, paste in the full contents of `worker.js`, and
   deploy.
3. Go to your worker's **Settings → Bindings → Add binding → Durable
   Object Namespace**.
   - Binding name: **exactly** `RENDEZVOUS_NODE` (worker.js reads
     `env.RENDEZVOUS_NODE` — a typo here means the worker responds
     with an explicit "binding not configured" error rather than
     silently misbehaving, so it'll be obvious if this doesn't match).
   - Class name: `RendezvousNode` (the class `worker.js` exports).
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
