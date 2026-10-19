# 06 — Avatars & Presence

<!-- languages -->
**English** · [Deutsch](de/06-AvatarsAndPresence.md) · [Español](es/06-AvatarsAndPresence.md) · [Français](fr/06-AvatarsAndPresence.md) · [Bahasa Indonesia](id/06-AvatarsAndPresence.md) · [日本語](ja/06-AvatarsAndPresence.md) · [한국어](ko/06-AvatarsAndPresence.md) · [Português (Brasil)](pt-BR/06-AvatarsAndPresence.md)
<!-- /languages -->

Your **avatar** is how other people see you in World View — its appearance,
its position, and how it moves. This guide covers customizing it, controlling
who can see it, and interacting with everyone else's.

## Customizing your avatar

Open **More → My Avatar** (or click your name in the top bar):

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

Both offer the same four levels, and both start out on **Public**:

- **Public** — anyone connected can see it.
- **Friends** — mutual friends, plus any identities you list explicitly
  (paste identity IDs, one per line). This is a plain allow-list, not a
  request/approval flow — see
  [Peer Connections & Friends](07-PeerConnectionsAndFriends.md) for what
  "friend" means.
- **Local** — only other ForkBuild tabs open in this same browser; never
  sent to any peer, not even a friend.
- **Hidden** — never advertised, to anyone. This is how you go invisible.

Each section has its own **Save** button — saving one never saves the
other. "Saved." appears after a save and disappears as soon as you change
that section again, so it always describes what you're looking at.

Being someone's friend does **not** by itself reveal your avatar — these two
settings decide what's actually shared, independently of each other. And
they only affect *future* updates: someone who already received your
position or appearance keeps what they have; there's no remote "forget me."

You can also toggle **Show My Avatar** and **Show Other Avatars** directly in
World View, as simple client-side display switches. Until you have an avatar
of your own, World View's Avatar section shows only **Show Other Avatars** and
a note on how to create one; the controls that need your avatar appear once
you have it.

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
- **Follow Avatar** — locks your camera to their movement
- **Greet / Wave / Point** — sends a one-off gesture to that avatar
- **Follow Their Work** — follows the identity behind the avatar, so their
  new builds show on the **Following** page (see
  [Following people](07-PeerConnectionsAndFriends.md#following-people)).
  It only appears when the avatar's presence is signed, because a signature
  is what proves whose avatar it is.

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
Mode**, which is on when World View opens (**Control My Avatar (WASD,
Shift, Space)** under **Avatar settings**). The keys are ignored while a
text field has focus — click the 3D view first.

You don't need a name to walk. Until you choose one, you walk as a
**guest**: an avatar in the default look that only you can see, which
nobody else is told about. A guest can talk to residents, but can't add or
remove them or decorate a World with an animal, because those are changes
signed with a name. Choose a name (when you publish, with **Walk here with
me**, or with **Choose a name** in the top bar) and your avatar becomes
yours where it stands, in the look saved on **My Avatar**, and others can
see it. **Switch name → Go on without a name** turns it back into a guest.

| Key | Action |
|---|---|
| **W / A / S / D** | Move / turn |
| **Shift** | Run (faster movement) |
| **Space** | Jump; in deep water, swim up |
| **C** (held, in deep water) | Dive |
| **Alt + W / S** | Hands-free continuous walk forward/backward — keeps moving after you let go of the keys |
| **Alt + Shift + W / S** | Same, but running instead of walking |

On a phone or tablet an on-screen joystick and buttons stand in for these
keys: push the joystick to walk and all the way to its rim to run, and tap
**Jump**. See [Touch screens](ControlsReference.md#walking-world-view).

Walking respects collision against nearby loaded buildings, trees, and
wildlife — you can't walk through structures streamed in around you, through
the trees generated as part of the terrain, or through a deer or rabbit
grazing nearby (see [World View](03-WorldView.md#flying-around)).
Wildlife only ever blocks your path like a tree does, wherever an animal
has wandered to — it may turn its head to watch you, but it never moves out
of your way or takes damage, and a vehicle drives
straight through it; only walking on foot is stopped. An animal you've
caught no longer blocks anything. Your avatar can walk across placed structures,
climb vertical surfaces, and navigate uneven terrain. The camera follows
your avatar naturally as you move.

Doors and arches are ways in. A door swings open, away from you, as you
walk up to it, and shuts behind you; it opens for residents and the people
you see too, and nobody else sees the doors you open. You walk through an
arch's opening, and its sides and top are as solid as they look. A small
arch is too low to walk through, and a door or arch tilted onto its side
blocks you like any other brick.

**Follow Avatar** keeps the camera locked to your avatar as it moves, instead
of orbiting freely. You can also follow other players' avatars to see where
they're going.

### Swimming and diving

Water up to half your avatar's height is waded through, more slowly the
deeper it gets. Deeper than that, your avatar swims: it floats with its head
above the surface, and moving works as on land, only slower. Hold **C** to
dive and **Space** to swim back up; let go of both and it drifts slowly up
to the surface. In first person you see the world above the water while you
float, and the world under it once you dive.

Under water your avatar holds its breath. An **Air** bar at the top of the
view shows how much is left: two and a half minutes from a full breath.
When it runs out, your avatar is pushed up to the surface and stays there
for a few seconds to catch its breath before it can dive again. Swim to the
shore and it stands up and walks out.

Other people see you swimming and diving too: how your avatar moves in the
water follows from where it is, so nothing extra is sent.

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
it. On a keyboard there's no on-screen indicator that it's active — the
only sign is that your avatar keeps walking on its own.

On a phone or tablet, the touch pad's **Cruise** button does the same:
tap it once to walk forward hands-free, again to run, and a third time to
stop. It reads **Cruise: Walk** or **Cruise: Run** while active. Pushing
the joystick forward or back also stops it, just as tapping **W** or **S**
does; pushing it sideways only turns you, so you can steer while cruising.

### Vehicles

Some worlds place a bicycle, penny-farthing, hay wagon, or hot-air balloon
your avatar can ride instead of walking. Walk close enough to one and a prompt appears
telling you which key mounts it:

| Key | Action |
|---|---|
| **E** (near a vehicle) | Mount |
| **E** (while mounted) | Dismount |
| **W / S** | Accelerate / reverse |
| **A / D** | Turn — a smooth, continuous turn of the vehicle, with you on it |
| **← / →** (press) | Steer — a single 45° turn of the vehicle per press; holding the key doesn't keep turning, and a fresh press is needed for each turn |
| **Ctrl** (held) | Brake |

Once mounted, **W/S** and **Ctrl** drive the vehicle, while **A/D** and
**←/→** turn it — there's no separate "driving mode" to turn on. You
always face the way your vehicle points, and other players see you the
same way. A vehicle turns only while it's moving, so turning while
stopped does nothing; reversing moves it backwards without turning it
around. Dismounting puts your avatar back on foot at a
clear spot beside the vehicle. A vehicle's top speed, acceleration,
braking, and turning all depend on what kind of vehicle it is, and its
collision footprint is sized to match — today that's the bicycle, the
penny-farthing, the hay wagon, and the hot-air balloon, the four vehicles
worlds actually place and render. A penny-farthing is faster than a
bicycle and rarer to find, a hay wagon is faster still and rarer still,
and a hot-air balloon is the fastest and rarest of all.

A hot-air balloon sits on the ground, idle, exactly like the other three,
until you mount it and start moving — holding **W** or **S** lifts it off
the ground; letting go brings it back down. Once airborne it flies above
trees, but a tall building still blocks it exactly as it would a wagon, so
flying doesn't mean ignoring the world's own geometry. You can't get out
of a balloon in mid-air — bring it back to the ground first.

Bicycles, penny-farthings and hay wagons stop at the water's edge. A
balloon flies on over lakes and the sea, and lets you down on the water:
land it and get off, and your avatar is swimming. You can't take a wheeled vehicle out of
your inventory while you are in the water.

On land they drive up ramps and onto bricks the way you walk onto them:
anything no higher than a step, and any slope or stair. So a bridge
someone has built carries a hay wagon over a river it couldn't otherwise
cross. Drive off the edge of a deck and you drop back to the ground; get
off on a bridge and you're standing on the deck.

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

#### Riding with other people around

People who can see your avatar also see what you ride: your bicycle,
penny-farthing, hay wagon or balloon is drawn under you on their screen,
facing the way you're going, and they hear it rolling or roaring, your
getting on and off and your braking (see "Sound" in
[03 — World View](03-WorldView.md)). You see
and hear theirs the same way. It follows your presence setting: whoever
can't see you doesn't learn what you ride either.

While someone else rides a vehicle, your own copy of it disappears and you
can't get on it; the vehicle you're riding yourself always stays yours.
Where a vehicle stands when nobody rides it isn't shared, though: once
they get off, it reappears on your screen wherever you last saw it
standing, which may not be where they left it. A vehicle stored with
**Q** or deployed somewhere new is likewise only on its owner's screen
until they ride it.

### Animals

Some worlds have wildlife — deer in forests, rabbits on open grassland.
Wild animals wander slowly around where the world placed them, never
straying more than a few steps. Walk close enough to one and a prompt appears telling you to
press **F** to catch it. Catching adds it to your inventory (the same
inventory a stored vehicle lives in) and removes it from the world.

Walk anywhere else and press **F** again — with nothing catchable
nearby, this releases the most recently caught animal right where
you're standing, and it's immediately catchable again if you want it
back. A released animal stays right where you let it go, but it isn't
frozen: it grazes, looks around and turns to face a new way now and then,
and turns its head to watch you when you come near.
There's no limit today on how many animals you can carry, and
catching one never disturbs a vehicle you're also carrying, or vice
versa — they share the same backpack but never get mixed up.

#### Decorating a World with an animal

A released animal only lives in your own session. To make one a lasting
part of the World — say, a rabbit sitting on top of something you built —
stand next to an animal you released and press **G**. It becomes an
**animal decoration**: saved into the World's own content, so it's
included when that World is published or distributed and everyone who
opens it sees it, looking exactly like the animal it came from. It stays
on the spot you chose (so a rabbit on a rooftop never walks off it), but
grazes, looks around and turns in place, and everyone who opens the World
sees it doing the same thing at the same moment.

A decoration is decorative only — it can't be caught with **F**. Changed
your mind? Stand next to it and press **G** again: the decoration is
removed from the World and becomes a live, catchable animal again. When
both are nearby, **G** decorates a fresh released animal first, just as
**F** prefers catching over releasing. Only animals you released can be
decorated — wildlife the world placed by itself can't. A prompt shows when
**G** would decorate or undo something nearby. Like adding a
[landmark](03-WorldView.md#landmarks--marking-a-place-worth-remembering),
decorating needs a name and EDIT access to the World you're in.
On someone else's published World, the decoration goes into your own
copy of it — as long as its license allows remixing. If none of that
applies, **G** simply does nothing; the touch pad's **Decorate** button
tells you why instead.

### Residents

A World can have **residents**: people who live there and stroll around
their home, among your buildings.

**Adding and removing one.** Stand on open ground where you want them to
live and press **R**, or click **Add Resident Here** in the **Avatar**
section. They appear right beside you. To remove one, stand next to it and
press **R** again (a prompt shows **[R] Remove Resident**), or undo with
**Ctrl/Cmd+Z**.

- You need to be able to edit the World you're in. On someone else's
  published World, the resident goes into your own copy of it.
- A resident needs dry, open ground: not a rooftop or the water, and not
  while you're riding. When it can't be added, the Avatar section says why.
- Residents are part of the World, like a
  [landmark](03-WorldView.md#landmarks--marking-a-place-worth-remembering):
  they're saved, published and copied with it.

**How they move.** Residents stay within about six steps of home. They walk
around walls, trees and water, never through them, and stop now and then
to look around. Everyone sees each resident in the same place at the same
moment, because where they are comes from the World and the clock. Nothing
is sent between players. You bump into a resident like a tree, but it
doesn't step aside for you, so one may walk through you while you stand
still.

**They notice you.** When you come within a few steps, in front of a
resident or beside it, it turns to face you. Walk right up and it waves,
once each time you come over. Like animals, this happens only on your
screen, and only for your own avatar.

**Talking to a resident.** Stand beside one and press **T** (a prompt shows
**[T] Talk**; the Avatar section and the touch pad have a **Talk** button
too). It tells you about something nearby in a speech bubble: a bicycle or
a deer, a landmark, a build and who made it, someone who's around, the
place it lives in, or a build further off. For example: *"About 3.6 km to
the north-east, there's a build called “Hill Fort” by bob."*

- Distances are rounded. Directions are from where the resident stands,
  with north the way the compass points.
- Talk again and it mentions something else. The bubble goes after a few
  seconds, or when you walk away.
- For anything that stays put (a landmark, a build or a vehicle), a
  **Focus** button appears at the bottom of the view. It swings the camera
  over for a look, like **Focus** in Locations. Your avatar stays where it
  is, and walking brings the camera back if Follow Avatar is on.

**Ideas for the neighbourhood.** Every third time you talk, or when it has
nothing else to say, a resident may wonder aloud about something the
ground nearby has never had: a bridge over a river, a dock on the water, a
lookout on high ground, or a well, a shady pavilion, a market stall or a
cottage on open ground. For example: *"Nobody has ever built a bridge over
the river about 30 m to the east."*

- While it says so, a button such as **Build a bridge there** appears. It
  opens a new build of your own in the Editor for that spot, started from
  the ready-made Village structure, like **Build here** in World View.
  When you publish it, it stands there.
- It's only a thought, never a task: nothing is remembered, nobody checks,
  and there's no reward.
- The same ground gives everyone the same thought. A spot with a build
  nearby has nothing to wish for.
- Once something stands there, the resident says so instead, naming the
  build when it has a title, with a button to look at it. For example:
  *"Someone has built about 14 m to the east, just where I always thought a
  well would go."*

**What a resident knows** is what *your* copy of ForkBuild knows: the
builds in your catalog, the people here with you, and the vehicles and
animals nobody has taken. Someone else talking to the same resident may
hear something different, and nobody else sees what it told you. It never
mentions a vehicle you've stored or someone is riding, or an animal you've
caught. Builds are named with their title and author, as everywhere else
in the app.

Residents aren't people. They have no profile, never show up under People
or Nearby, and can't be clicked for info. They never give you quests,
tasks or rewards: they just live there, and tell you what's around when
you ask.

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
