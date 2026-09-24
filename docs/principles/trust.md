# Principles: Trust, signatures and authorization

Each rule links to its full text in [the history](../Principles.md#history).

### Signatures vs. Authorization (0.2.17)

Signatures establish *who acted*; authorization establishes *whether
they were allowed to act*. A valid signature alone is not enough for a
delegated operation: an actor who does not own the resource must present
a valid delegation signed by the authority that does.

[Full text](history/0.1-0.2.md#signatures-vs-authorization-0217)

### Replication and Conflict Handling (0.2.18)

Replication never overwrites immutable history. Replicas exchange
immutable revisions and reconcile them by causal ordering.

[Full text](history/0.1-0.2.md#replication-and-conflict-handling-0218)

### Trust Is Separate From Cryptographic Validity (0.2.19)

A valid signature proves that a private key authorized an object. It
does not prove that the key is trusted, that the object is current, or
that it was the only object signed at that causal position.

[Full text](history/0.1-0.2.md#trust-is-separate-from-cryptographic-validity-0219)

### Arrival Order Is Never Trust (0.2.19)

The order in which things arrive over the network describes the
transport. It is never evidence of authority, freshness or causality.

[Full text](history/0.1-0.2.md#arrival-order-is-never-trust-0219)

### Identity Is Not Trust (0.2.19)

A `did:key` identifies a public key; trust policy
(`identity/TrustPolicy.js`) decides whether that key is trusted.
Verifying who signed something is a prerequisite for trust, never a
substitute for deciding whether to trust the signer.

[Full text](history/0.1-0.2.md#identity-is-not-trust-0219)

### A Discovery Provider Must Never Say Only "Not Found" (0.2.19)

Not found, stale index, unavailable, invalid, unauthorized and
conflicted are different situations with different remedies. Every check
in the trust pipeline produces a `TrustObservation` with a named
`TrustStatus`, and `getLastDiagnostics()` always reports what was
checked and what happened, without changing what `discover()` returns.

[Full text](history/0.1-0.2.md#a-discovery-provider-must-never-say-only-not-found-0219)

### A Valid Signature Proves Authorship, Not Exclusivity (0.2.19)

An authority can sign two different objects at the same causal position
and both verify. That is equivocation (`core/IndexEquivocation.js`), not
forgery. It is detected and reported, never resolved silently by keeping
one side; whether to tolerate it is an explicit `TrustPolicy` decision.

[Full text](history/0.1-0.2.md#a-valid-signature-proves-authorship-not-exclusivity-0219)
