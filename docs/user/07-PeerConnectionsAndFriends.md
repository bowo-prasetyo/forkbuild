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
  attempt — republish to be found again.

Whichever path you use, a peer's card shows its progress through the same
steps: **Rendezvous discovered → WebRTC connecting → Peer connected →
Authenticating identity → Authenticated** (or **Failed**). An authenticated
peer's card shows its identity, public key, and a reminder that the
*connection* itself is session-only — "gone when this connection closes" —
even though a Known Peer or Friend record survives it.

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

## Reconnecting

A Known Peer or Friend who isn't currently in My Peers shows a **Reconnect**
button — this always performs a full, fresh handshake rather than reusing
old connection details. If a reconnect attempt authenticates as a
*different* identity than expected, ForkBuild rejects it and closes the
connection with an explicit error, rather than silently trusting whoever
answered.

## What's next?

Once you've made a friend, chat with them in
**[Chat & Conversations](08-ChatAndConversations.md)**.
