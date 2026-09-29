# Principles: Vehicles, inventory and animals

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
