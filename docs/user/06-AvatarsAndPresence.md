# 06 — Avatars & Presence

Your **avatar** is how other people see you in World View — its appearance,
its position, and how it moves. This guide covers customizing it, controlling
who can see it, and interacting with everyone else's.

## Customizing your avatar

Open **My Avatar** in the top bar:

1. Pick a **Template** — a body type (e.g. "Humanoid 01") — from the
   dropdown. A flat preview updates live as you choose.
2. For each part the template declares (the built-in templates offer
   **skin, hair, shirt, pants**), pick an option from its dropdown, and a
   color where the template allows one.
3. Toggle any **accessories** the template offers, from a checklist. (Any
   part that allows several choices at once shows as a checklist like
   this; the page shows exactly the parts the chosen template declares.)
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

Each section has its own **Save** button — saving one never saves the
other. "Saved." appears after a save and disappears as soon as you change
that section again, so it always describes what you're looking at.

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

Whether a nearby avatar appears at all depends on where your **camera** is
currently looking, not which way your own avatar is walking — the two can
point in different directions, most often right after you free-orbit the
camera around. Someone standing squarely in your walking path can be
completely invisible while your camera looks elsewhere; turn or orbit the
camera back toward them and they reappear.

## Walking your avatar

Flying the camera ([World View](03-WorldView.md#flying-around)) is one way
to move, but you can also walk your avatar directly with **Avatar Control
Mode**:

| Key | Action |
|---|---|
| **W / A / S / D** | Move / turn |
| **Shift** | Run (faster movement) |
| **Space** | Jump |
| **Alt + W / S** | Hands-free continuous walk forward/backward — keeps moving after you let go of the keys |
| **Alt + Shift + W / S** | Same, but running instead of walking |

Walking respects collision against nearby loaded buildings, trees, and
wildlife — you can't walk through structures streamed in around you, through
the trees generated as part of the terrain, or through a deer or rabbit
grazing nearby (see [World View](03-WorldView.md#flying-around)).
Wildlife only ever blocks your path like a tree does — it doesn't move,
react, or take damage, and a vehicle drives straight through it; only
walking on foot is stopped. Your avatar can walk across placed structures,
climb vertical surfaces, and navigate uneven terrain. The camera follows
your avatar naturally as you move.

**Follow Avatar** keeps the camera locked to your avatar as it moves, instead
of orbiting freely. You can also follow other players' avatars to see where
they're going.

### Camera Perspective

Next to Follow Avatar sits **Camera**, a row of four buttons — **Free**,
**First Person**, **Third Person**, and **Bird's-Eye** — for locking your
camera to a fixed offset from your own avatar instead of flying it
yourself. Like Follow Avatar, they need a local avatar (My Avatar) to
enable.

- **Free** is the ordinary orbit camera — World View's default, and what
  every other camera control in this guide assumes.
- **First Person** puts the camera at your avatar's own eye height,
  looking the direction it's facing.
- **Third Person** sits behind and above your avatar, looking slightly
  down — the classic "see your own character" framing.
- **Bird's-Eye** looks straight down from high overhead, following your
  avatar's position but deliberately ignoring its facing, so the view
  never spins as you turn.

Clicking the already-active button clears back to **Free**. A Camera
Perspective is purely local — it's never shared with a collaborator and
never affects what they see.

The two modes behave differently as you turn: with a Perspective locked
on (First Person or Third Person), the camera re-frames itself to your
avatar's current heading on every move, so your view turns exactly as you
do. With **Free** selected, the camera is deliberately orientation-blind
— turning in place, walking, or mounting a vehicle never moves or rotates
it on its own, only your own drag/pan/zoom does. If you free-orbit to
look one way and then walk off in another, the camera keeps looking
wherever you last pointed it, rather than following you.

### Hands-free continuous movement

Holding **Alt** while you tap **W** or **S** starts your avatar
walking (or, with **Shift** also held, running) in that direction
continuously — it keeps going even after you release every key, exactly
like a cruise control. Tapping **W** or **S** again *without* Alt
held cancels it and returns to ordinary key-held movement; tapping the
opposite direction the same way also cancels it, rather than reversing
it. There's no on-screen indicator that it's active — the only sign is
that your avatar keeps walking on its own.

### Vehicles

Some worlds place a bicycle, motorcycle, car, or drone your avatar can
ride instead of walking. Walk close enough to one and a prompt appears
telling you which key mounts it:

| Key | Action |
|---|---|
| **E** (near a vehicle) | Mount |
| **E** (while mounted) | Dismount |
| **W / S** | Accelerate / reverse |
| **A / D** | Turn your avatar's own facing — the same continuous turn as on foot, not vehicle steering |
| **← / →** (press) | Steer — a single 45° turn of the vehicle's attempted travel direction per press; holding the key doesn't keep turning, and a fresh press is needed for each turn |
| **Ctrl** (held) | Brake |

Once mounted, **W/S** and **Ctrl** drive the vehicle, while **←/→**
steer it — there's no separate "driving mode" to turn on. **A/D** still
turn your avatar's own body, exactly as they do on foot, and are
independent of steering. Dismounting puts your avatar back on foot at a
clear spot beside the vehicle. A vehicle's top speed, acceleration,
braking, and turning all depend on what kind of vehicle it is, and its
collision footprint is sized to match — today that's the bicycle, the
motorcycle, the car, and the drone, the four vehicles worlds actually
place and render. A motorcycle is faster than a bicycle and rarer to
find, a car is faster still than a motorcycle and rarer still, and a
drone is the fastest and rarest of all.

A drone sits on the ground, idle, exactly like the other three, until
you mount it and start moving — holding **W** or **S** lifts it off the
ground; letting go brings it back down. Once airborne it flies above
trees, but a tall building still blocks it exactly as it would a car, so
flying doesn't mean ignoring the world's own geometry. You can't
dismount a drone in mid-air — bring it back to the ground first.

#### Carrying a vehicle

Found a vehicle far from where you need it later? While mounted, press
**Q** to store it in your inventory — it disappears from the world and
you're dismounted in the same motion. Walk anywhere else, press **Q**
again while unmounted, and the selected stored vehicle spawns right
where you're standing, already mounted. There's no limit today on how
many vehicles you can carry at once, and a stored vehicle never
reappears back where you found it.

By default, **Q** deploys whichever vehicle you stored most recently.
If you're carrying more than one, press **[** or **]** to cycle the
selection backward or forward through everything you're carrying — the
prompt shows which one is selected and its position (e.g. "Deploy
Bicycle (1/3)") so you can find an older one without deploying and
re-storing your way past it. Cycling only changes what **Q** will bring
out next; it never spawns or removes anything by itself.

### Animals

Some worlds have wildlife — deer in forests, rabbits on open grassland.
Wild animals stay where the world placed them. Walk close enough to one and a prompt appears telling you to
press **F** to catch it. Catching adds it to your inventory (the same
inventory a stored vehicle lives in) and removes it from the world.

Walk anywhere else and press **F** again — with nothing catchable
nearby, this releases the most recently caught animal right where
you're standing, and it's immediately catchable again if you want it
back. There's no limit today on how many animals you can carry, and
catching one never disturbs a vehicle you're also carrying, or vice
versa — they share the same backpack but never get mixed up.

#### Decorating a World with an animal

A released animal only lives in your own session. To make one a lasting
part of the World — say, a rabbit sitting on top of something you built —
stand next to an animal you released and press **G**. It becomes an
**animal decoration**: saved into the World's own content, so it's
included when that World is published or distributed and everyone who
opens it sees it, looking exactly like the animal it came from.

A decoration is decorative only — it can't be caught with **F**. Changed
your mind? Stand next to it and press **G** again: the decoration is
removed from the World and becomes a live, catchable animal again. When
both are nearby, **G** decorates a fresh released animal first, just as
**F** prefers catching over releasing. Only animals you released can be
decorated — wildlife the world placed by itself can't — and there's no
on-screen prompt for **G**. Like adding a
[landmark](03-WorldView.md#landmarks--marking-a-place-worth-remembering),
decorating needs you signed in with EDIT access to the World you're in.
On someone else's published World, the decoration goes into your own
copy of it — as long as its license allows forking. If none of that
applies, **G** simply does nothing.

#### What survives a reload

Your inventory — every vehicle and animal you're carrying — is saved on
this device, and so are the vehicles you've placed or ridden somewhere and
the animals you've released, right where you left them. Reloading the
page or coming back later picks up exactly where you were.

### Spatial awareness and activity

When other people are present, you'll see contextual indicators showing what
they're doing:

- "**Bob — exploring nearby**" appears near their avatar as they fly or walk
  around.
- "**Alice — inspecting a brick**" indicates someone's looking closely at
  something, without changing it.

These activity indicators are derived from spatial presence data and help you
understand what others are looking at without needing explicit communication.

Activity indicators only describe what someone is doing; they never
change anything — see
[Seeing other collaborators](03-WorldView.md#seeing-other-collaborators).

## What's next?

Find people to connect with in
**[Peer Connections & Friends](07-PeerConnectionsAndFriends.md)**, then chat
with your friends in
**[Chat & Conversations](08-ChatAndConversations.md)**.
