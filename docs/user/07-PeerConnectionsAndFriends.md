# 07 — Peer Connections & Friends

<!-- languages -->
**English** · [Deutsch](de/07-PeerConnectionsAndFriends.md) · [Español](es/07-PeerConnectionsAndFriends.md) · [Français](fr/07-PeerConnectionsAndFriends.md) · [Bahasa Indonesia](id/07-PeerConnectionsAndFriends.md) · [日本語](ja/07-PeerConnectionsAndFriends.md) · [한국어](ko/07-PeerConnectionsAndFriends.md) · [Português (Brasil)](pt-BR/07-PeerConnectionsAndFriends.md)
<!-- /languages -->

ForkBuild connects you directly to other people's browsers — there's no
central server holding a friends list. Open **Peers** in the top bar to
manage who you're connected, known, and friends with.

## The page at a glance

```
Peers                                   Your ID …N6KbN  [Copy full ID]

Needs your attention      connections waiting for you, friend requests
People  [All|Friends|Following|Online]   one row per person
Connect with someone new  [Invite|Paste an invitation|Find by ID|Public lobby]
▸ Blocked (N)             only when you've blocked someone
```

- **Needs your attention** appears only when something is waiting: a
  connection in progress (with its step, e.g. "step 2 of 5: WebRTC
  connecting"), a connection waiting for you to paste the other side's
  reply, a failed one to dismiss, or someone asking to be your friend
  (**Accept** / **Decline**).
- **People** has one row per person, however many things you know about
  them. Tags say what they are to you — **Friend**, **Remembered**,
  **Following**, **Blocked**, **Request sent**, **Wants to be friends** —
  and a green dot
  means online. Online people come first, then friends, then everyone else.
  Each row has its main action (**Chat** for a friend, **Reconnect** when
  they're offline, **Add Friend** for someone you're connected to), and
  the **⋯** menu holds the rest: **Rename** (or **Name & Remember**),
  **Remember** / **Forget**, **Unfriend**, **Follow** / **Unfollow**,
  **Connection Details**, **Disconnect**, and **Block** / **Unblock**.
  The **Following** filter shows the people here you follow.
- **Blocked** is folded at the bottom and only shows when you've blocked
  someone.

Behind the list are five independent records — live connections, Known
Peers (people you chose to **Remember**, a private note never shared with
them), Friends (mutual and signed), Following (see
[Following people](#following-people)) and Blocked. A person can be a Friend
without being Remembered, and so on; the row just shows whichever apply.
Someone you follow but have never connected to isn't listed here; the
**Following** page lists everyone you follow.

## Finding and connecting to someone

There are no usernames to search — every peer is addressed by their
cryptographic identity, so connecting always starts with exchanging identity
information through some channel you already trust (chat, email, in person).
**Connect with someone new** shows one way at a time:

- **Invite** — **Create Invitation**, then copy it and send it to someone.
  The connection waits under **Needs your attention**; once they reply,
  paste their reply there and click **Finish Connecting**.
- **Paste an invitation** — the receiving side: paste an invitation someone
  sent you, click **Connect**, and send back the reply you're given.
- **Find by ID** — search by someone's full identity ID among candidates you
  or others have published, then **Connect**. Your reply travels back through
  the rendezvous server, so the connection completes on its own; you only
  copy a reply by hand when that isn't possible (your identity is locked, or
  the candidate came from a saved invitation). **Save an invitation for
  later**, folded underneath, adds an invitation to these search results
  without connecting.
- **Be Discoverable** (in the same tab, under **Let others find you**) —
  publishes your own identity to a rendezvous network so someone who already
  knows your identity ID can find and connect to you without a direct
  invitation. One publication answers one connection attempt — turn it on
  again to be found again. The button reads **Stop Being Discoverable** while
  your publication is still waiting for someone to answer it; it flips back
  to **Be Discoverable** on its own once someone connects, or once the offer
  closes or its invitation expires. Your identity must be unlocked to
  publish: the rendezvous server only accepts a publication signed by the
  identity it names, so nobody else can publish or withdraw one for you. The
  default rendezvous server only answers the hosted ForkBuild site; if you
  run ForkBuild from your own address (including `localhost`), use
  invitations or add your own server under **Rendezvous Servers** in
  **Network Settings**. That state is kept app-wide, so leaving the Peers
  page and coming back doesn't reset it.
- **Public lobby** — meet people whose ID you don't have; see below.

**Your ID** at the top of the page, with **Copy full ID**, is what someone
needs for **Find by ID**. The shortened `…last14chars` shown on rows is only
for telling people apart at a glance and will never match a real search.

Whichever path you use, a connection goes through the same steps:
**Rendezvous discovered → WebRTC connecting → Peer connected →
Authenticating identity → Authenticated** (or **Failed**). **Connection
Details** in a connected person's **⋯** menu shows their identity, public
key, and a reminder that the *connection* itself is session-only, even
though a Known Peer or Friend record survives it. The "online for …" and
"started … ago" timers count from when that connection was actually made,
so they keep counting correctly if you navigate away and come back.

## The public lobby: meeting people you don't know yet

Find by ID needs someone's full identity ID. The **Public Lobby** is for
meeting people whose ID you don't have. There is one lobby for everyone, on
the **Peers** page under **Connect with someone new → Public lobby**, and
one for each World, under **Lobby** in World View.

- **Join Lobby** lists you there under a display name you choose, next to
  the end of your identity ID. Anyone can pick any name; the identity is
  what a connection actually checks. The name is remembered for next time.
- While you're in a lobby, this device stays discoverable: anyone in it can
  click **Connect** on you, and when someone does, it gets ready for the
  next person straight away.
- **Connect** on someone in the list connects to them the same way Find
  by ID does, with nothing to copy. Their card shows **Connecting…**, then
  **Connected** once the handshake proves who they are. Seeing someone in the
  lobby never connects to them on its own. Joining does connect you to your
  Known Peers who are discoverable, wherever they are (see
  [Reconnecting](#reconnecting)).
- **Block** hides someone from your lobby lists and blocks them as it does
  everywhere else on this page.
- **Leave Lobby** takes you out at once. Joining lasts for this visit only:
  closing the app leaves every lobby (your listing can take up to 10
  minutes to disappear from other people's lists), and you're never put
  back in one when you open it again.

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

- **Remember** someone (in their **⋯** menu) to keep a private, local note
  about them — no consent from them required. **Rename** gives them a name
  only you see; for someone you haven't remembered, **Name & Remember** does
  both. **Forget** removes the note, locally only.
- **Add Friend** on a connected person's row asks for a mutual relationship;
  they see it under **Needs your attention** with **Accept** / **Decline**,
  and you can **Cancel Friend Request** from the **⋯** menu while you wait.
  **Unfriend** ends it; it needs them connected, because they have to
  receive it. Friends get a **Chat** button — see
  [Chat & Conversations](08-ChatAndConversations.md).
- **Block** stops everything from that identity — presence, profile, chat,
  even friend requests — without notifying them. Blocking a friend doesn't
  remove the friendship, it just silences it; **Unblock** (in the **⋯** menu,
  or the **Blocked** list) restores hearing from them again, but never
  restores anything blocking silenced in the meantime.

## Following people

**Follow** keeps you up to date with someone's creations, like following an
account on a social network, without either of you asking the other for
anything.

- **Where to follow.** **Follow** appears on publication cards in the
  Repository, next to **Signed by …** on an author's page, in a person's
  **⋯** menu on this page, and as **Follow Their Work** on an avatar in
  World View. You follow an *identity*, never a typed author name: several
  people can publish under the same name, so an author's page shows one
  **Follow** per identity that signed work under that name.
- **The Following page** (**Following** in the top bar) lists the people you
  follow, each with **Unfollow**, and below them the newest work of theirs
  that has reached this device, newest first. Click a name to see only that
  person's work.
- **Notifications.** When a new creation by someone you follow reaches this
  device, the 🔔 panel gets a **Publication followed author published**
  entry, once per creation, with **Explore** to open it.
- **Their shared Worlds are fetched for you.** Worlds that someone you follow
  shares with connected peers are retrieved automatically, as they already
  are for Friends and Remembered peers.
- **Their announcements are kept longer.** This device keeps a record of the
  announcements it has seen, up to a limit per discovery tag. When a tag is
  full, the records seen least recently are dropped first, but building
  placements and place names signed by people you follow are kept ahead of
  the rest.

**Following is private and one-sided.** The list is kept on this device, for
the identity you're signed in as. It's never sent anywhere, the people you
follow are never told, and there are no follower counts: without a server,
nobody could count them honestly. Following gives the other person nothing
either: no chat, no view of your avatar, no way to reach you. That's still
what friendship is for.

**What following doesn't do.** Following picks out the work of the people you
follow from what reaches this device; it doesn't go and fetch their work by
itself. Creations still arrive the usual ways: World discovery in World View,
Worlds shared by connected peers, and links you open. Only work whose
signature checks out counts, so nobody can get onto your Following page by
typing someone else's name or identity on their work. Work by someone you've
**Blocked** stays hidden even if you follow them.

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

A Known Peer or Friend who isn't online shows a **Reconnect** button, even a
friend you never remembered. It opens the same invitation exchange as
**Invite** / **Paste an invitation**, right on their row, and always performs
a full, fresh handshake rather than reusing old connection details. If a reconnect attempt authenticates as a
*different* identity than expected, ForkBuild rejects it and closes the
connection with an explicit error, rather than silently trusting whoever
answered.

ForkBuild also tries this for you, automatically, for every identity in
Known Peers: as soon as the app starts, any time you Remember, Forget, or
otherwise change a Known Peer relationship, each time you click **Be
Discoverable** yourself, and each time you click **Join Lobby**, it quietly
checks whether each one is currently discoverable and, if so, connects
without you having to click Reconnect yourself. So two friends who both
click **Be Discoverable**, or both join a lobby (the same one or not),
connect: the second click finds the first. Keeping a lobby joined never
repeats the check on its own. A Known Peer who isn't
discoverable right now, or who can't be reached, is simply left alone —
there's no retry loop chasing them, no notification about the attempt, and
one identity failing never affects another. Use **Reconnect** when you
want it to happen right now rather than waiting for the next automatic
pass.

## What's next?

Once you've made a friend, chat with them in
**[Chat & Conversations](08-ChatAndConversations.md)**.
