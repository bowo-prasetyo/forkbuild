# 08 — Chat & Conversations

Direct messaging in ForkBuild is peer-to-peer and **friends-only** — see
[Peer Connections & Friends](07-PeerConnectionsAndFriends.md) for how to
become friends with someone first.

## Starting a conversation

Chat is reached from a friend's **Chat** button on the **Peers** page, or
from the **Conversations** page in the top bar — there's no chat entry point
from World View or an avatar. Opening chat with someone who isn't currently
a friend (or who's blocked) shows an explanation instead of a compose box:
friendship, not being online, is what unlocks chat.

## The Conversations page

Lists everyone worth showing — anyone you have a remembered relationship,
friendship (including a pending request), or message history with, sorted by
most recent activity. Each row shows:

- Their display name and an **Online / Offline** badge
- Their relationship — Friend, Friend request pending, Known peer, or Not
  connected before
- An unread-message count, and "N messages waiting to send" if any are
  queued
- The time of the last activity

Only current friends get an **Open Chat** button; everyone else's row points
you back to Peers instead.

## The chat view

A single scrollable transcript with you and one friend: message bubbles
labeled "You" or their name, each with a timestamp, and a compose box below
(up to 4,000 characters). Click **Show details** for a small panel reporting
their identity, relationship, friendship, live connection state, and
message/pending counts. There's no typing indicator, editing, deletion,
reactions, attachments, or group chat — it's deliberately just messages.

## Voice calls

A **📞 Call** button sits next to the compose box whenever at least one of
that friend's currently-reachable devices supports voice — you don't need
to know which of their devices will actually pick up; calling reaches
their identity, not one specific connection.

- Click **Call** to place a call — you'll see **Calling…** until they
  answer.
- On the receiving end, an incoming call shows **Accept** / **Decline**.
- Once connected, the bar shows **On call** plus **Mute** / **Unmute**,
  and — once your microphone is actually attached — pickers for which
  **Microphone** and (if your browser supports it) **Speaker** to use.
- The end button reads **Cancel** while you're still waiting for them to
  pick up, and **Hang Up** once you're actually talking.

You're limited to one call at a time across this whole device — the Call
button is disabled for anyone else while you're on a call. If your
microphone disappears mid-call (unplugged, permission revoked), a small
banner says so; the call itself keeps running, in case it reconnects.

A call that ends before you're connected explains why, briefly:

| Message | Meaning |
|---|---|
| **Call declined.** | They clicked Decline. |
| **They're already on another call.** | They're busy elsewhere. |
| **No answer.** | Nobody picked up in time. |
| **Couldn't access your microphone.** | Your browser denied or lacks microphone access. |
| **Call failed to connect.** | A connection-level failure — worth trying again. |

An ordinary hang-up (yours or theirs) shows no message at all — the call
bar simply disappearing is the whole story.

## Sending while someone's offline

You can send a message to an offline friend — it doesn't require them to be
currently connected. It's queued locally and delivered automatically the
moment they reconnect; you don't need to resend it yourself. Each outgoing
message shows its own status under the bubble:

| Status | Meaning |
|---|---|
| **Queued — will send once they reconnect** | Waiting for them to come online |
| **Sent** | Handed off to the network — not yet confirmed arrived |
| **Delivered** | Confirmed arrived on their device |
| **Undelivered — expired** | Never delivered in time and was dropped |
| **Seen** | They've opened the conversation and read up to this message |

**Seen** is fully automatic — there's no "mark as read" button. Simply
opening or refreshing a conversation is what tells the sender you've read
it.

## Your history

Conversations are saved locally on this device and pick up right where you
left off after a reload — messages, delivery status, and all. This history
is **local to this device only**: it doesn't follow you to a different
browser or computer, and there's no server-side copy. Each conversation
keeps its most recent 500 messages; older ones drop off quietly to keep
storage in check.

Unfriending or blocking someone stops chat immediately, even if the
underlying connection is technically still active — you don't need a
separate "disconnect" step.

## What's next?

Head back to **[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)**
to find more people to build and chat with, or revisit
**[World View](03-WorldView.md)** to see where everyone's creations live.
