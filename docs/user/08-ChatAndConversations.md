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
