# Principles: Decentralized publication, content and replicas

Each rule links to its full text in [the history](../Principles.md#history).

### Publication Makes Content Discoverable; It Does Not Make It Authoritative (0.7.0)

Any signed thing (an attribution, a lineage claim, a naming claim) can
be published the same way as a snapshot. A locator is not an identity;
blockchain inclusion does not make a claim true; a design fingerprint
and a publication locator are independent and never written into each
other; and a resolver verifies whatever it retrieves, never trusts it.

[Full text](history/0.3-0.7.md#publication-makes-content-discoverable-it-does-not-make-it-authoritative-070)

### Availability Is Not Validity (0.7.1)

Genuine content can be unreachable right now (not yet replicated, a
timeout, a gateway down), which says nothing against it.
`PublicationResolutionOutcome` names "invalid" and "not available"
separately. A content store decides reachability, never authenticity,
and a CID is a locator, never the content's identity.

[Full text](history/0.3-0.7.md#availability-is-not-validity-071)

### Discovery Is Not Resolution (0.7.2)

Knowing a publication exists and being able to fetch its content are
different facts. A catalog entry records that a signed envelope was
seen, never whether its content is reachable; resolution status is
always derived; the catalog indexes and never adjudicates; and
exchanging a publication moves a locator, not content.

[Full text](history/0.3-0.7.md#discovery-is-not-resolution-072)

### A Peer Connection Transports Publications; It Does Not Resolve Them (0.7.3)

The peer transport is built around the existing exchange, and the
catalog stays unaware of the network. A live announcement passes the
same checks as an imported file, receiving one is not resolving it, and
the sending peer's identity is informational, never authority.

[Full text](history/0.3-0.7.md#a-peer-connection-transports-publications-it-does-not-resolve-them-073)

### Content Delivery Is Not Content Authority (0.7.4)

A peer is never trusted because it supplied bytes. A publication's
signature proves who published a locator, not who may deliver its bytes;
only the hash makes a response trustworthy; and retrieval is allowed
only for content that was actually published.

[Full text](history/0.3-0.7.md#content-delivery-is-not-content-authority-074)

### A Resolution Coordinator Sequences; It Does Not Decide (0.7.5)

`PublicationResolutionCoordinator` sequences existing steps to answer
"can I see this, and if not, can you fetch it?" and nothing more.
Retrieval is opt-in per call, it never caches a verdict, and resolving
content to look at it is not keeping it.

[Full text](history/0.3-0.7.md#a-resolution-coordinator-sequences-it-does-not-decide-075)

### Replication Creates Availability; It Does Not Create Authority (0.7.6)

Retrieval may now ask an ordered list of peers until one answers.
Holding bytes does not make a peer a publisher, relaying a locator does
not make anyone a second publisher, and asking candidates in order is an
ordering, never a ranking. The hash check is unchanged.

[Full text](history/0.3-0.7.md#replication-creates-availability-it-does-not-create-authority-076)

### A Persistent Store Is An Untrusted Byte Source, Not A Second Trust Root (0.8.15)

Records already in storage when the process starts are untrusted, like a
peer message or imported package. `LocalPublicationAnchorStore` treats
storage that way, while the catalog's public behavior stays unchanged.

[Full text](history/0.8.md#a-persistent-store-is-an-untrusted-byte-source-not-a-second-trust-root-0815)

### Restoration Re-Earns Trust In The Claim; It Never Re-Asks The External System (0.8.15)

At startup, restoration runs once over every stored anchor through the
same validate, construct and verify-signature boundary as a peer's
anchor. It never calls the external verifier, and records that pass are
left as they were. Ordinary reads are not re-verified.

[Full text](history/0.8.md#restoration-re-earns-trust-in-the-claim-it-never-re-asks-the-external-system-0815)

### Discovery Is Not Verification, And 'No New Evidence' Is Not 'No Evidence' (0.8.16)

"Discover from Peers" never verifies anything and never imports the
external verifier. NO_NEW_EVIDENCE and UNAVAILABLE stay distinct, and
neither is worded as "no evidence exists". A discovered anchor is a
claim, not a verdict.

[Full text](history/0.8.md#discovery-is-not-verification-and-no-new-evidence-is-not-no-evidence-0816)

### Discovery Asks A Collective Question; It Never Asks Which Peer To Trust (0.8.16)

Evidence discovery asks every authenticated peer, in registry order, and
takes the union of what they offer. There is no "most reliable peer" and
no race for a single answer.

[Full text](history/0.8.md#discovery-asks-a-collective-question-it-never-asks-which-peer-to-trust-0816)

### Acquisition Provenance Is Not Evidence Rank (0.8.17)

A replica records how it learned an anchor: created it, imported it in a
package, or received it from a peer. The three kinds never compare, the
signed anchor is never touched, the first-seen record wins, and there is
no peer id. The UI names how, never who, and never scores.

[Full text](history/0.8.md#acquisition-provenance-is-not-evidence-rank-0817)

### A Placement Is A Locator, Not Evidence Of History (0.8.18)

A `PublicationSnapshotPlacement` is a separately signed claim that a
content hash can also be retrieved from a given locator, added alongside
a Publication and never changing its signed content reference.
Placements and anchors answer different questions, and neither makes
content canonical or authentic.

[Full text](history/0.8.md#a-placement-is-a-locator-not-evidence-of-history-0818)

### Peers Exchange Placement Claims, Not Resolution Results (0.8.19)

Peers send exactly `placement.toJSON()`, never "I checked, it resolves".
Receiving a placement is not resolving it, every placement in a response
is verified as strictly as an announcement, authentication only decides
who a claim is sent to, and resolution stays local.

[Full text](history/0.8.md#peers-exchange-placement-claims-not-resolution-results-0819)

### Resolving A Placement Observes Present Availability; It Does Not Rewrite The Placement Claim (0.8.20)

Inspecting a placement is local and never touches the network or the
catalog. Resolving it observes whether bytes are available now and never
rewrites the signed claim. Its six outcomes stay six, and a
storage-specific view never guesses at a locator it does not understand.

[Full text](history/0.8.md#resolving-a-placement-observes-present-availability-it-does-not-rewrite-the-placement-claim-0820)

### A Placement's Persistent Store Is An Untrusted Byte Source Too (0.8.21)

The same rule as for anchors (0.8.15): placement records already in
storage at startup are untrusted, and the placement catalog's public
behavior is unchanged.

[Full text](history/0.8.md#a-placements-persistent-store-is-an-untrusted-byte-source-too-0821)

### Restoring A Snapshot Placement Re-establishes The Signed Claim, Not Its Current Availability (0.8.21)

At startup, restoration checks stored placements once through the same
boundary as a peer's placement and never resolves them. Records that
pass are left as they were.

[Full text](history/0.8.md#restoring-a-snapshot-placement-re-establishes-the-signed-claim-not-its-current-availability-0821)

### Package Import Is Placement Ingestion, Not Placement Resolution (0.8.22)

Placements bundled in a Blueprint Package pass the same validate,
construct and verify-signature gate as a peer's placement, never a
looser one. Importing them catalogs claims and retrieves no bytes.

[Full text](history/0.8.md#package-import-is-placement-ingestion-not-placement-resolution-0822)

### Package Import Preserves Placement Claims; It Does Not Establish Retrieval Availability (0.8.22)

A package is not "about" any publication, so bundled placements are
never cross-checked against it, and the package's own provenance is
never written into them. Importing a placement says nothing about
whether it resolves.

[Full text](history/0.8.md#package-import-preserves-placement-claims-it-does-not-establish-retrieval-availability-0822)

### Multi-Placement Convergence Mirrors Multi-Evidence Convergence, Never Copies It (0.8.23)

Several placements for one publication are compared structurally, never
adjudicated, in their own function rather than the anchor one with nouns
swapped. Placements report storage and locator diversity, which anchors
do not have.

[Full text](history/0.8.md#multi-placement-convergence-mirrors-multi-evidence-convergence-never-copies-it-0823)

### Multi-Placement Convergence Is Independent Of Resolution Observation (0.8.23)

Placement convergence takes no resolution input at all, stricter than
the anchor side's optional verification map, and is recomputed only when
placements load, never when one is resolved.

[Full text](history/0.8.md#multi-placement-convergence-is-independent-of-resolution-observation-0823)

### Acquisition Provenance Is Not Placement Rank (0.8.24)

The same rule as "Acquisition Provenance Is Not Evidence Rank (0.8.17)",
applied to placements: three acquisition kinds that never compare, first
seen wins, no peer id, and the UI implies neither rank nor availability.

[Full text](history/0.8.md#acquisition-provenance-is-not-placement-rank-0824)

### Snapshot Placement Creation Is An Explicit User Action, Never A Second Publish (0.8.25)

Listing placements, listing available storage types and creating a
placement are separate questions. Creating one never resolves it, there
is no REJECTED state, and the action is "Create <Storage> Placement",
never "Publish to <Storage>".

[Full text](history/0.8.md#snapshot-placement-creation-is-an-explicit-user-action-never-a-second-publish-0825)

### A Resolution Result Describes Whether Bytes Can Be Retrieved Now; It Does Not Rewrite The Placement Claim (0.8.26)

Each resolution is recorded as an observation over time. The only
derived fact added is `everResolved`, so "unavailable now" after an
earlier success never reads as "never resolved". Observations never
leave the replica, placements never affect each other, and re-resolution
stays explicit and uncached.

[Full text](history/0.8.md#a-resolution-result-describes-whether-bytes-can-be-retrieved-now-it-does-not-rewrite-the-placement-claim-0826)

### Publication Decentralization Is Two Separate Dimensions, Never One Combined Verdict (0.8.27)

The decentralization view places evidence convergence and placement
convergence side by side and computes nothing new: no score, confidence,
trust level or preferred source. Evidence conflict does not imply
placement conflict, and agreeing placements prove no evidence claim.

[Full text](history/0.8.md#publication-decentralization-is-two-separate-dimensions-never-one-combined-verdict-0827)

### Replica Knowledge Describes What This Replica Possesses, Not What The World Has Proven (0.8.28)

With the publisher, peers and external systems all offline, a replica
can still report what it knows; the view adds only `hasPublication`.
Known is not available, reconstructing knowledge is not retrieving
content, and there is no completeness score.

[Full text](history/0.8.md#replica-knowledge-describes-what-this-replica-possesses-not-what-the-world-has-proven-0828)

### A Replica Package Transfers Durable Claims, Not The Exporting Replica's Own Acquisition History (0.8.29)

A replica package carries one publication and the signed claims about
it, never the exporter's record of how it learned them. Import reuses
the existing trust boundary rather than building a second one.

[Full text](history/0.8.md#a-replica-package-transfers-durable-claims-not-the-exporting-replicas-own-acquisition-history-0829)

### Replica Synchronization Composes Existing Discovery, It Builds No Second Trust Boundary (0.8.30)

Live replica synchronization reuses the existing anchor and placement
discovery, with no new wire protocol, provenance kind or winner. It
makes claims mutually known and never adjudicates them.

[Full text](history/0.8.md#replica-synchronization-composes-existing-discovery-it-builds-no-second-trust-boundary-0830)

### Replica Knowledge Explains What Is Known And How It Was Acquired; It Does Not Judge What Should Be Trusted (0.8.31)

The detail view shows each claim's acquisition provenance next to its
current verification or resolution, and still ranks nothing. No peer
identity is shown. Claims and provenance are durable; verification and
resolution results are ephemeral.

[Full text](history/0.8.md#replica-knowledge-explains-what-is-known-and-how-it-was-acquired-it-does-not-judge-what-should-be-trusted-0831)

### Knowledge Of Content Is Not Possession Of Content (0.8.32)

Knowing where bytes are supposed to be is not having them. Transferring
content offline and resolving a placement are independent paths to the
same bytes, the hash alone makes a transfer trustworthy, knowing the
publication never gates a transfer, and content and claims travel in
separate packages.

[Full text](history/0.8.md#knowledge-of-content-is-not-possession-of-content-0832)

### Local Content Availability Is An Observation, Not A Verdict (0.8.33)

The check reports only whether this replica's store holds bytes for a
hash right now. "No bytes" and "wrong bytes" are different results,
nothing is remembered between checks, and it adds a fact, never a score.

[Full text](history/0.8.md#local-content-availability-is-an-observation-not-a-verdict-0833)

### Snapshot Materialization Is An Explicit User Action, Distinct From Every Other Way A Replica Learns About Content (0.8.34)

"Import Snapshot" is one explicit button joining two existing
capabilities. A hash mismatch is REJECTED, not UNAVAILABLE, and knowing
the publication never gates the import.

[Full text](history/0.8.md#snapshot-materialization-is-an-explicit-user-action-distinct-from-every-other-way-a-replica-learns-about-content-0834)

### Placement Resolution Observes Present Availability; Materialization Turns It Into Possession (0.8.35)

Resolving a placement checks bytes and keeps nothing; materializing from
it keeps them. They are separate classes with separate outcome
vocabularies, the placement is chosen by the person, and knowing the
publication never gates it.

[Full text](history/0.8.md#placement-resolution-observes-present-availability-materialization-turns-it-into-possession-0835)

### A Shared Storage Boundary Does Not Merge The Sources That Feed It (0.8.36)

Every source of snapshot bytes goes through one
`StoreSnapshotContentUseCase` (verify the hash, check what is held,
write if needed), but the sources stay separate paths. Naming a source
is not ranking it, there is no automatic source selection, and storing
is idempotent across sources.

[Full text](history/0.8.md#a-shared-storage-boundary-does-not-merge-the-sources-that-feed-it-0836)

### Peer Content Transfer Is Transport; Verification And Storage Stay Centralized (0.8.37)

Peer authentication proves who you are talking to; the hash proves the
content. A peer holding bytes asserts nothing about placements or
anchors. "I don't have it" is indistinguishable from silence and no
state pretends otherwise. Asking one chosen peer is deliberately
different from automatic multi-peer retrieval.

[Full text](history/0.8.md#peer-content-transfer-is-transport-verification-and-storage-stay-centralized-0837)

### Materialization History Describes Byte Acquisition, Not Source Trust (0.8.38)

The history lists every explicit attempt that reached the storage
boundary, including rejected ones, in order, and never calls a source
trusted, best or preferred. It is separate from acquisition provenance.
Attempts that never reached storage leave no trace, and counts per
source are history, not recommendations.

[Full text](history/0.8.md#materialization-history-describes-byte-acquisition-not-source-trust-0838)

### Current Snapshot Possession Is A Local Observation, Not A Distributed Claim (0.8.39)

Whether this replica holds valid bytes for a publication is a local fact
(`{ publicationId, contentHash, possession: { state } }`), never a
publication or placement claim or a score. Knowledge, materialization
history and possession are independent, and possession is never
announced or exchanged.

[Full text](history/0.8.md#current-snapshot-possession-is-a-local-observation-not-a-distributed-claim-0839)

### Peer Possession Responses Are Observations, Not Placement Claims (0.8.40)

Asking a peer "do you have these bytes?" yields an observation of what
that peer said at that moment: unsigned, never forwarded, never merged
into placement or anchor knowledge, and never a materialization source.
Possession questions and content transfer are separate protocols.

[Full text](history/0.8.md#peer-possession-responses-are-observations-not-placement-claims-0840)

### Peer Possession Observations Describe What Peers Report; They Do Not Become Placement Claims (0.8.41)

Asking several chosen peers at once and comparing the answers never
makes the collection more authoritative than one answer. The history is
a ledger, not a cache, comparisons only count what was said, and the
three answer states stay three.

[Full text](history/0.8.md#peer-possession-observations-describe-what-peers-report-they-do-not-become-placement-claims-0841)

### A Source Selection Is A Person's Own Action, Never An Application Recommendation (0.8.42)

A `SnapshotMaterializationSourceSelection` records a choice the person
already made, with the payload it needs. The dispatcher composes
existing paths and never discovers, ranks, retries or falls back.

[Full text](history/0.8.md#a-source-selection-is-a-persons-own-action-never-an-application-recommendation-0842)

### An Observation Can Inform A Person's Choice Without Becoming An Application Decision (0.8.42)

Materializing from a peer's comparison row records its own result
separately and never changes the observation that prompted it. A failed
attempt never triggers another source, and only rows that reported
possession offer the action.

[Full text](history/0.8.md#an-observation-can-inform-a-persons-choice-without-becoming-an-application-decision-0842)

### Current Snapshot Possession Is Independent Of How The Snapshot Was Acquired (0.8.43)

The acquisition view reports current possession exactly as observed,
even when history seems to disagree (bytes stored then deleted, or a
failed attempt later replaced). Such combinations are neither flagged
nor corrected.

[Full text](history/0.8.md#current-snapshot-possession-is-independent-of-how-the-snapshot-was-acquired-0843)

### Acquisition History Explains Past Attempts; It Does Not Determine Present Possession (0.8.43)

The acquisition summary is a plain tally of recorded attempts and
outcomes per source, with no new state machine. Events outside the
storage boundary are never counted.

[Full text](history/0.8.md#acquisition-history-explains-past-attempts-it-does-not-determine-present-possession-0843)

### History Records What Happened During An Explicit Acquisition Attempt; Inspection Must Not Reinterpret Why It Happened (0.8.44)

The history detail view adds only a short outcome label to what the
history already says. It is pure and performs no checks. Making a fact
inspectable is not explaining it.

[Full text](history/0.8.md#history-records-what-happened-during-an-explicit-acquisition-attempt-inspection-must-not-reinterpret-why-it-happened-0844)

### A Peer Possession Observation Records What A Peer Reported At A Particular Time; Inspection Must Not Turn It Into A Current Claim About The Peer (0.8.45)

The observation detail view combines two existing labels and adds no
fact. UNAVAILABLE still means only "no answer before the timeout", never
"the peer does not have it", and inspecting an observation never makes
it current.

[Full text](history/0.8.md#a-peer-possession-observation-records-what-a-peer-reported-at-a-particular-time-inspection-must-not-turn-it-into-a-current-claim-about-the-peer-0845)

### A Snapshot's Independently Observed Facts Are Exposed Side By Side, Never Collapsed Into One Verdict (0.8.46)

The snapshot inspection view shows local possession, acquisition
history, placement convergence and peer possession together, with no
health, confidence or score. Any combination is valid output, each
missing dimension is an honest `null`, and no dimension reads or
corrects another.

[Full text](history/0.8.md#a-snapshots-independently-observed-facts-are-exposed-side-by-side-never-collapsed-into-one-verdict-0846)

### A Locator Is Not The Content; A Gateway Is Not A Verdict (0.8.66)

A public IPFS gateway is another retrieval mechanism and earns no new
trust. Unavailability is one shared outcome across transports, a missing
capability is never simulated, one request gives one outcome with no
hidden retries, and gateway and node stores are separate registries.

[Full text](history/0.8.md#a-locator-is-not-the-content-a-gateway-is-not-a-verdict-0866)

### A Capability Is Exposed Only Where It Exists; A Credential Is Never Owned (0.8.67)

A remote pinning service can publish, so its store exposes publishing
and nothing it lacks. ForkBuild depends on the capability, never a
brand, and receives the capability without taking custody of
credentials. A real service can refuse, so there are two distinct
failure outcomes.

[Full text](history/0.8.md#a-capability-is-exposed-only-where-it-exists-a-credential-is-never-owned-0867)

### A Configured Credential Lives Only As Long As The Capability It Grants (0.8.68)

Remote publishing settings (endpoint, credential, field names) are never
saved. A fresh capability is built for each attempt, the credential is
never shown again, the service's own result states reach the screen
unchanged, and the person chooses among the available capabilities.

[Full text](history/0.8.md#a-configured-credential-lives-only-as-long-as-the-capability-it-grants-0868)

### A Gateway Moves Bytes; It Never Judges Them (0.8.69)

Content adapters only move bytes; the hash check happens once, above
them (`ContentReference.verify()`). The CID stays a locator even while
being checked, unavailable is never evidence of a mismatch, and the
verification record is a plain, unsigned local fact.

[Full text](history/0.8.md#a-gateway-moves-bytes-it-never-judges-them-0869)
