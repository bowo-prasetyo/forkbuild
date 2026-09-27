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
  have published, then **Connect**. Your reply travels back through the
  rendezvous server, so the connection completes on its own; you only copy a
  reply by hand when that isn't possible (your identity is locked, or the
  candidate came from a pasted invitation).
- **Be Discoverable** — publishes your own identity to a rendezvous network
  so someone who already knows your identity ID can find and connect to you
  without a direct invitation. One publication answers one connection
  attempt — republish to be found again. The button reads **Stop Being
  Discoverable** while your publication is still waiting for someone to
  answer it; it flips back to **Be Discoverable** on its own once someone
  connects, or once the offer closes or its invitation expires. Your
  identity must be unlocked to publish: the rendezvous server only accepts
  a publication signed by the identity it names, so nobody else can
  publish or withdraw one for you. The default rendezvous server only
  answers the hosted ForkBuild site; if you run ForkBuild from your own
  address (including `localhost`), use invitations or add your own server
  under **Rendezvous Servers** in **Network Settings**. That state
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

## The public lobby: meeting people you don't know yet

Find Someone needs someone's full identity ID. The **Public Lobby** is for
meeting people whose ID you don't have. There is one lobby for everyone, on
the **Peers** page under **Public Lobby**, and one for each World, under
**Lobby** in World View.

- **Join Lobby** lists you there under a display name you choose, next to
  the end of your identity ID. Anyone can pick any name; the identity is
  what a connection actually checks. The name is remembered for next time.
- While you're in a lobby, this device stays discoverable: anyone in it can
  click **Connect** on you, and when someone does, it gets ready for the
  next person straight away.
- **Connect** on someone in the list connects to them the same way Find
  Someone does, with nothing to copy. Their card shows **Connecting…**, then
  **Connected** once the handshake proves who they are. Seeing someone in the
  lobby never connects to them on its own.
- **Block** hides someone from your lobby lists and blocks them as it does
  everywhere else on this page.
- **Leave Lobby** takes you out at once. Joining lasts for this visit only:
  closing the app leaves every lobby, and you're never put back in one
  when you open it again.

**What someone who connects to you from a lobby gets.** A lobby connection
is an ordinary connected peer, even before you Remember or befriend them.
They learn your IP address, see your avatar and presence as your visibility
settings allow, and your devices **exchange Snapshot and Place Naming
announcements and publication metadata**, exactly as with any connected
peer (see [Privacy](../Privacy.md)). Chat and voice still need a friendship.
Worlds you've shared with peers are offered to them too, but their device
fetches one only if they click **Retrieve** (see
[Sharing with connected peers](04-PublishingAndForking.md#sharing-with-connected-peers)).
Worlds shared by your Friends and Known Peers are fetched for you
automatically; a lobby stranger's never are.

**Relays only when needed.** Every connection tries a direct path first and
uses the rendezvous server's TURN relay only when no direct path works.
While you wait in a lobby, your device never asks for relay credentials; the
person connecting to you asks for one only if they need it. That keeps the
relay's monthly allowance for connections that actually happen.

The lobby needs a rendezvous server (see **Rendezvous Servers** in **Network
Settings**) and an unlocked identity.

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
firewall) never expose a path STUN alone can find. If your rendezvous
server offers a TURN relay, ForkBuild asks it for short-lived relay
credentials when you start a connection (never just for opening the app)
and uses them automatically. The server hands out a limited number of
relay credentials each month; once they run out, connections are still
tried, just without a relay, until the next month. To use a relay of your own, open **TURN
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

You don't need to fill this in to get a relay: when a connection starts,
ForkBuild already asks your rendezvous servers (see Rendezvous Servers)
for a short-lived TURN relay and uses it when they offer one. Add a relay
here only if you run or pay for one yourself; it is used alongside
theirs, never instead of it.

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

**There is deliberately no "Reset to Defaults" button here.** The
default relay comes from the rendezvous servers, as described above, so
this page has nothing built in to reset to: shipping a TURN server here
would mean publishing its credential in the app for anyone to read and
spend. Leaving the page empty still gets you the rendezvous servers'
relay, when they offer one; with no relay from either, connections rely
on STUN and direct connectivity alone. Your own relay is optional, and
something you'd supply yourself (many WebRTC hosting providers offer one)
only if connections to certain peers keep failing even so. Like every
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
Known Peers: as soon as the app starts, any time you Remember, Forget, or
otherwise change a Known Peer relationship, and each time you click **Be
Discoverable** yourself, it quietly checks whether each one is currently
**Be Discoverable** and, if so, connects without you having to click
Reconnect yourself. So two friends who both click **Be Discoverable**
connect: the second click finds the first. A Known Peer who isn't
discoverable right now, or who can't be reached, is simply left alone —
there's no retry loop chasing them, no notification about the attempt, and
one identity failing never affects another. Use **Reconnect** when you
want it to happen right now rather than waiting for the next automatic
pass.

## What's next?

Once you've made a friend, chat with them in
**[Chat & Conversations](08-ChatAndConversations.md)**.
