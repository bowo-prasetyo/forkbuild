# Principles: Vehicles, inventory, animals and residents

Each rule links to its full text in [the history](../Principles.md#history).

### An Animal Has Three Possible Homes, Never Two At Once (0.9.700–0.9.703)

An animal is deterministic (recomputed from `(seed, x, z)` and the time,
never stored; a caught one is excluded locally), runtime (caught into the
inventory or released, kept on this device across reloads, sent to peers
only by an explicit inventory transfer; only released animals are saved)
or authored (an
`AnimalDecoration` in a World, added by an undoable command, published
and forked with the World, never catchable). It is never in two of these
at once.

[Full text](history/0.9.md#an-animal-has-three-possible-homes-never-two-at-once-0970009703)

### A Transferred Entry Leaves Its Owner Before The Offer Does (0.9.702)

An inventory transfer escrows first: the entry leaves the sender's
inventory before OFFER is sent, and returns only on DECLINE or if the
recipient disconnects. While an offer is open the entry cannot be used
or offered again. There is no final acknowledgement, so a disconnect
right after acceptance can leave a copy on both sides; this is a known
limitation.

[Full text](history/0.9.md#a-transferred-entry-leaves-its-owner-before-the-offer-does-09702)

### A Wild Animal Wanders On A Path Sampled From Time, Never Simulated (2026-09-29)

A wild animal's position is a pure function of the seed, its placement and
the time: it pauses, turns and walks between waypoints hashed from its
cell, never leaving that cell or its species' wander radius. Every system
asks at the same session clock, so it is caught and collided with where it
is drawn. Motion never reacts to an avatar, so replicas always agree.

[Full text](history/0.9.md#a-wild-animal-wanders-on-a-path-sampled-from-time-never-simulated-2026-09-29)

### Peers Agree On One World Clock, And Nobody Can Pull It Far (2026-10-21)

Everything sampled from time is only the same for everyone if everyone's
clock says the same thing, and device clocks drift by seconds. Connected
peers tell each other what their own, uncorrected clocks say, and each
moves its World time to the median of its own and theirs: no server, no
leader, and no feedback, since only uncorrected clocks are ever sent. A
clock more than 15 minutes off is ignored rather than followed, and one
wrong clock among three or more moves nothing. A change is eased in, time
running a little fast or slow, so animals never jump.

### A Wild Animal Keeps Away From What Is Built (2026-10-21)

A wild animal never grazes inside a build or walks through a wall, and
never wades across a river. Its path stays a pure function of the seed
and the time: a walk that would cross a river goes by way of where it was
placed, and an animal whose reachable ground touches a brick it could not
walk under is simply not there, left out everywhere a caught one is, for
as long as the build stands. Like a resident's paths, this depends on the
Worlds a replica has loaded, so right after an edit two replicas can
briefly disagree.

### A Resident Walks A Path Sampled From Time And The World, And Is Never A Person (2026-09-29)

A World Resident is World content that stores only its home. Where it is
is a pure function of its id, home, the time and the World's geometry: it
strolls between waypoints home can see, around walls, trees and water, and
never reacts to anyone, so replicas agree. It may turn to face and wave at
the viewer's own avatar, which changes only that viewer's screen. It is
never a person: no identity, presence or People listing, and no quests.

[Full text](history/0.9.md#a-resident-walks-a-path-sampled-from-time-and-the-world-and-is-never-a-person-2026-09-29)

### A Resident Tells You What's Around, Never What To Do (2026-09-29)

Asked, a resident says one or two things about its surroundings (vehicles,
animals, landmarks, placed structures, people, other builds, its place) with a rounded
distance and direction from where it stands. It points at what exists and
never sets a goal or a quest. The viewer may choose Focus on a mentioned
thing that stays put: a camera-only look, never moving the avatar. What it says comes from the viewer's own
replica and stays on the viewer's screen, so two viewers may hear different
things; it never mentions a vehicle they stored or ride, one someone else is
riding, or an animal they caught.

[Full text](history/0.9.md#a-resident-tells-you-whats-around-never-what-to-do-2026-09-29)

### A Resident May Wonder What's Missing, Never Ask For It (2026-10-11)

Every third conversation, and whenever it has nothing else to say, a
resident may wonder aloud about something the ground nearby has never had
(core/world/ResidentWish.js): a bridge over a river, a dock on still water, a
lookout on high ground, or a well, pavilion, stall or cottage on open
ground, with where that spot is. It is still a statement of what is (and
isn't) there, never a request: no question, no "you should", no reward,
nothing tracked, remembered or checked, and nobody is told whether it was
built. It comes from the terrain and the builds nearby only, so the same
ground gives the same thought to everyone, and a spot already built on gives
none. The viewer may choose **Build a … there**, which opens the Editor on a
plot for that spot (core/world/BuildPlot.js) started from the matching Village
structure, exactly as Build here would; choosing it, or not, changes nothing
for the resident. This is how the world gives reasons to build
(docs/Pillars.md) without becoming a quest game.

### Others See What You Ride, Never Where You Parked (2026-09-29)

Which vehicle an avatar rides is sent, signed, on its own channel
(`forkbuild:avatar-vehicle`), only where presence is, and never stored.
Others draw and hear it under the rider and can't get on their copy of it
meanwhile. Where a vehicle stands unridden stays each replica's own: after
the rider gets off, it reappears wherever each replica last had it.

[Full text](history/0.9.md#others-see-what-you-ride-never-where-you-parked-2026-09-29)
