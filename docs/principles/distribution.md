# Principles: Distribution, settings and wallets

Each rule links to its full text in [the history](../Principles.md#history).

### Local First, Network Second, For Every Distributed Write (0.9.620, 0.9.628, 0.9.631)

A write that can leave the device (a Commentary, a Snapshot announcement
after a successful pin) is committed locally before any network step,
and a network failure never undoes it. The network is an extra delivery
path, not the source of truth. A best-effort step that fails reports
why, sanitized, next to the result that did succeed, and never turns the
success into a failure.

[Full text](history/0.9.md#local-first-network-second-for-every-distributed-write-09620-09628-09631)

### Choose One Substrate; Fan Out Only Within It (2026-09-20)

A Publication, Snapshot, Place Naming claim or Commentary is announced
on Nostr or on Arweave, never both from one action. Within a substrate
the strategy follows the endpoints: Nostr relays don't share events, so
publishing and querying go to every configured relay; Arweave and IPFS
gateways serve the same content-addressed bytes, so reads fail over in
order and writes use one endpoint. One relay set serves every Nostr
feature.

[Full text](history/0.9.md#choose-one-substrate-fan-out-only-within-it-2026-09-20)

### A Saved Preference Seeds A Choice; It Never Makes One (2026-09-21)

A saved Content, Announcement/Discovery or Proof/Anchoring preference
sets the first value of a matching picker, only if it is among the
options offered, and powers the "Use Preferred Provider" button. It
never overrides the user's pick or starts a network action. An unusable
saved value reads as no preference or an explicit `PROVIDER_NOT_FOUND`,
never as a silent substitute.

[Full text](history/0.9.md#a-saved-preference-seeds-a-choice-it-never-makes-one-2026-09-21)

### One Signer, One Request At A Time (2026-09-21)

A combined action whose steps may ask the same wallet extension to sign
runs those steps one after another, never concurrently. Every call
waiting on a human approval gets the wallet's own bounded timeout (120
seconds), and no shorter outer timeout may cut it off first.

[Full text](history/0.9.md#one-signer-one-request-at-a-time-2026-09-21)
