# Principles: Vehicles, inventory and animals

Each rule links to its full text in [the history](../Principles.md#history).

### An Animal Has Three Possible Homes, Never Two At Once (0.9.700–0.9.703)

An animal is deterministic (recomputed from `(seed, x, z)`, never
stored; a caught one is excluded locally), runtime (caught into the
inventory or released, kept on this device across reloads, sent to peers
only by an explicit inventory transfer) or authored (an
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
