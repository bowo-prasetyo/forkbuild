# 06 — Avatars & Presence

Your **avatar** is how other people see you in World View — its appearance,
its position, and how it moves. This guide covers customizing it, controlling
who can see it, and interacting with everyone else's.

## Customizing your avatar

Open **My Avatar** in the top bar:

1. Pick a **Template** — a body type (e.g. "Humanoid 01") — from the
   dropdown. A flat preview updates live as you choose.
2. For each part the template defines (typically **skin, hair, shirt,
   pants**), pick an option, and a color where the template allows one.
3. Toggle any **accessories** the template offers, from a checklist.
4. Set your **Display name** (up to 60 characters) — this is the name shown
   with your avatar and in Peers/Conversations.
5. Click **Save**.

Switching templates resets appearance to that template's own defaults —
choices don't carry over between templates. There's no 3D preview here; you
see your actual avatar the first time you (or someone else) look at it in
World View.

## Who can see you: two independent settings

The My Avatar page has two separate visibility controls. It's easy to
conflate them, so keep them distinct:

| Setting | Controls |
|---|---|
| **Presence Visibility** | Who receives your *live position* — whether and where you show up moving around World View |
| **Profile Visibility** | Who receives your *appearance* — template, colors, accessories, display name |

Both offer the same four levels:

- **Public** — anyone connected can see it.
- **Friends** — mutual friends, plus any identities you list explicitly
  (paste identity IDs, one per line). This is a plain allow-list, not a
  request/approval flow — see
  [Peer Connections & Friends](07-PeerConnectionsAndFriends.md) for what
  "friend" means.
- **Local** — only within this session's own connection scope.
- **Hidden** — never advertised, to anyone. This is how you go invisible.

Being someone's friend does **not** by itself reveal your avatar — these two
settings decide what's actually shared, independently of each other. And
they only affect *future* updates: someone who already received your
position or appearance keeps what they have; there's no remote "forget me."

You can also toggle **Show My Avatar** and **Show Other Avatars** directly in
World View, as simple client-side display switches.

## Seeing other people in World View

Anyone whose presence you're eligible to receive (per their own Presence
Visibility) appears automatically as you move around — no friend request
required to see a public avatar. Click an avatar (or an entry in the
**Nearby Avatars** panel — a simple list of everyone close by, with distance
and current animation) to open its **Avatar Info Panel**:

- Display name and avatar template
- A status line — **Present / Stale / Absent**, and a trust label
  (**Trusted / Unsigned / Conflicting**) describing how well-verified this
  avatar's data is
- Position, distance (in World Units), and current animation (Walking, Idle,
  …)
- **Follow** — locks your camera to their movement
- **Greet / Wave / Point** — sends a one-off gesture to that avatar

A remote avatar is otherwise view-only — there's no way to move, edit, or
delete someone else's avatar, only to look, follow, and gesture.

## Walking your avatar

World View's camera fly-around ([The Editor](02-TheEditor.md#camera-controls)
and [World View](03-WorldView.md#flying-around)) is one way to move, but you
can also walk your avatar directly with **Avatar Control Mode**:

| Key | Action |
|---|---|
| **W / A / S / D** | Move / turn |
| **Shift** | Run (faster movement) |
| **Space** | Jump |
| **Caps Lock + W / S** | Hands-free continuous walk forward/backward — keeps moving after you let go of the keys |
| **Caps Lock + Shift + W / S** | Same, but running instead of walking |

Walking respects collision against nearby loaded buildings and trees — you
can't walk through structures streamed in around you, or through the trees
generated as part of the terrain. Your avatar can walk across placed
structures, climb vertical surfaces, and navigate uneven terrain. The camera
follows your avatar naturally as you move.

**Follow Avatar** keeps the camera locked to your avatar as it moves, instead
of orbiting freely. You can also follow other players' avatars to see where
they're going.

### Hands-free continuous movement

Holding **Caps Lock** while you tap **W** or **S** starts your avatar
walking (or, with **Shift** also held, running) in that direction
continuously — it keeps going even after you release every key, exactly
like a cruise control. Tapping **W** or **S** again *without* Caps Lock
held cancels it and returns to ordinary key-held movement; tapping the
opposite direction the same way also cancels it, rather than reversing
it. There's no on-screen indicator that it's active — the only sign is
that your avatar keeps walking on its own.

### Spatial awareness and activity

When other people are present, you'll see contextual indicators showing what
they're doing:

- "**Bob — exploring nearby**" appears near their avatar as they fly or walk
  around.
- "**Alice — inspecting a brick**" indicates someone's looking closely at
  something, without changing it.

These activity indicators are derived from spatial presence data and help you
understand what others are looking at without needing explicit communication.

> **Presence describes activity; it never changes anything on its own.**
> The activity indicator shows what someone is *doing*, but World View itself
> is read-only — only an actual mutation, always in the Editor now (except
> Region/Landmark naming), changes the shared environment. See
> [World View](03-WorldView.md#world-view-is-read-only--building-happens-in-the-editor).

## What's next?

Find people to connect with in
**[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)**, then chat
with your friends in
**[Chat & Conversations](08-ChatAndConversations.md)**.
