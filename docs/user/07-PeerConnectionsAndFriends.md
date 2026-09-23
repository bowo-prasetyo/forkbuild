# 07 — Peer Connections & Friends

ForkBuild connects you directly to other people's browsers — there's no
central server holding a friends list. Open **Peers** in the top bar to
manage who you're connected, known, and friends with.

## The four lists

| List | What's in it |
|---|---|
| **My Peers** | Live connections right now. Ephemeral — disappears the moment a connection closes. |
| **Known Peers** | Identities you've chosen to **Remember**. Persists across reloads; a private, one-sided note, never shared with the other side. |
| **Friends** | Mutual, signed relationships. Persists across reloads. |
| **Blocked** | Identities you've blocked. Persists across reloads. |

These are independent: a peer can be Known without being a Friend, a Friend
without being Known, and so on.

## Finding and connecting to someone

There are no usernames to search — every peer is addressed by their
cryptographic identity, so connecting always starts with exchanging identity
information through some channel you already trust (chat, email, in person):

- **Invite Someone** — generates an invitation you copy and send to someone.
  It appears in My Peers as "Connecting…"; once they reply, paste their
  reply back in to complete the connection.
- **Connect to Peer** — the receiving side: paste an invitation someone sent
  you, and get a reply to send back.
- **Find Someone** — search by identity ID among candidates you or others
  have published.
- **Be Discoverable** — publishes your own identity to a rendezvous network
  so someone who already knows your identity ID can find and connect to you
  without a direct invitation. One publication answers one connection
  attempt — republish to be found again. The button reads **Stop Being
  Discoverable** while your publication is still waiting for someone to
  answer it; it flips back to **Be Discoverable** on its own once someone
  connects, or once the offer closes or its invitation expires. That state
  is kept app-wide, so leaving the Peers page and coming back doesn't
  reset it. Opening this panel also shows
  **Your Identity** — your full ID, with a **Copy** button — which is what
  you actually need to send someone for **Find Someone** to work. It's
  deliberately different from the shortened `…last14chars` shown elsewhere
  in this app (on peer cards, Known Peers, Friends) — that shortened form
  is only for telling entries apart at a glance and will never match a
  real search.

Whichever path you use, a peer's card shows its progress through the same
steps: **Rendezvous discovered → WebRTC connecting → Peer connected →
Authenticating identity → Authenticated** (or **Failed**). An authenticated
peer's card shows its identity, public key, and a reminder that the
*connection* itself is session-only — "gone when this connection closes" —
even though a Known Peer or Friend record survives it. Each card's
"connected …" timer counts from when that connection was actually made,
not from when you opened the page, so it keeps counting correctly if you
navigate away and come back.

## Remembering, friending, blocking

- **Remember** an authenticated peer to keep a private, local alias for them
  — no consent from them required. **Forget** removes it, locally only.
- **Send Friend Request** on an authenticated peer's card to ask for a
  mutual relationship; they see **Accept** / **Reject** on their end, and you
  can **Cancel** a request you're still waiting on. **Unfriend** ends it.
  Friends get a **Chat** link — see
  [Chat & Conversations](08-ChatAndConversations.md).
- **Block** stops everything from that identity — presence, profile, chat,
  even friend requests — without notifying them. Blocking a friend doesn't
  remove the friendship, it just silences it; **Unblock** restores hearing
  from them again, but never restores anything blocking silenced in the
  meantime.

## TURN: relaying peer connections that can't find a direct path

Every peer connection starts by trying to negotiate a direct path between
two browsers, with ForkBuild's own default public STUN servers helping
each side discover its own reachable address. That's enough for most
connections — but some networks (a symmetric NAT, a restrictive corporate
firewall) never expose a path STUN alone can find. For those, open **TURN
Server** from **Network Settings** in the top bar
(`/settings/turn-server`) and configure your own TURN relay: a server
that actually forwards the connection's data when a direct path can't be
established.

```
TURN Server

Your own TURN relay, used for peer connections that can't establish a
direct or STUN-negotiated path. This setting affects connection setup
only; it does not change peer identity, authentication, or any existing
connection.

[ One turn:/turns: URL per line, e.g. turn:relay.example:3478 ]

Username [______________]
Credential [______________]

[Save]   [Clear]
```

Enter one or more `turn:`/`turns:` URLs (one per line), a **Username**,
and a **Credential** — the same shared credential pair is sent for every
URL you list, never a separate one per server — and click **Save**. Once
set, the current relay shows as "Current TURN relay (*N* url(s)):
`<your URLs>` — username: `<your username>`" — the credential itself is
never shown back to you once saved, only that one is configured. Click
**Clear** to remove it entirely.

**There is deliberately no "Use Deployment Default" button here.**
Unlike Arweave Gateway or Nostr Relays, ForkBuild ships no deployment-wide
TURN server of its own — leaving this unconfigured simply means peer
connections rely on STUN and direct connectivity alone, exactly as they
always have. A TURN relay is entirely optional, and something you'd
supply yourself (many WebRTC hosting providers offer one) only if
connections to certain peers keep failing to connect directly. Like every
other Network Settings page, a change here only takes effect on the next
app load.

## Reconnecting

A Known Peer or Friend who isn't currently in My Peers shows a **Reconnect**
button — this always performs a full, fresh handshake rather than reusing
old connection details. If a reconnect attempt authenticates as a
*different* identity than expected, ForkBuild rejects it and closes the
connection with an explicit error, rather than silently trusting whoever
answered.

ForkBuild also tries this for you, automatically, for every identity in
Known Peers: as soon as the app starts, and again any time you Remember,
Forget, or otherwise change a Known Peer relationship, it quietly checks
whether each one is currently **Be Discoverable** and, if so, connects
without you having to click Reconnect yourself. A Known Peer who isn't
discoverable right now, or who can't be reached, is simply left alone —
there's no retry loop chasing them, no notification about the attempt, and
one identity failing never affects another. Manual **Reconnect** still works
exactly as before, for the moment you want it to happen right now rather
than waiting for the next automatic pass.

## What's next?

Once you've made a friend, chat with them in
**[Chat & Conversations](08-ChatAndConversations.md)**.
