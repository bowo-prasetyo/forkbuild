# Principles: External anchoring and chain transactions

Each rule links to its full text in [the history](../Principles.md#history).

### External Anchoring Provides Evidence; It Does Not Establish Authority (0.8.0)

A `PublicationAnchor` is signed evidence about a hash, never a verdict
on the content. `anchoredAt` is reported, not established. Signature,
proof and content authenticity are checked separately and in that order.
Several anchors for the same content are never merged or ranked, and
publishing never anchors anything by itself.

[Full text](history/0.8.md#external-anchoring-provides-evidence-it-does-not-establish-authority-080)

### A Proof Verifier Reports "Cannot Presently Verify" Separately From "Proof Is Wrong" (0.8.1)

When a proof verifier exists and is consulted, "I checked and it is
wrong" and "I could not get a definite answer" are always different
outcomes. An anchor with no verifier plugged in is never treated as
rejected.

[Full text](history/0.8.md#a-proof-verifier-reports-cannot-presently-verify-separately-from-proof-is-wrong-081)

### External Evidence Adapters Never Change What PublicationAnchor Means (0.8.1)

A real backend (`BitcoinOpReturnProofVerifier`) plugs into the existing
`{ anchorType, verify(proof, context) }` contract and changes nothing
about what an anchor is or what verifying one means.

[Full text](history/0.8.md#external-evidence-adapters-never-change-what-publicationanchor-means-081)

### Cataloging External Evidence Does Not Validate External Evidence (0.8.2)

The anchor catalog records that an anchor was seen, never whether it is
signed, proven or trustworthy. No verification outcome is stored with
it, and multiple anchors stay multiple.

[Full text](history/0.8.md#cataloging-external-evidence-does-not-validate-external-evidence-082)

### Known Evidence Is Not Verified Evidence, And Verified Evidence Is Not Authority (0.8.3)

Discovered anchors are always visible; verification is never automatic
and its results are never stored. No outcome says "trust", a verified
transaction is not automatically evidence for the publication on screen,
and no anchor is ranked or chosen as canonical.

[Full text](history/0.8.md#known-evidence-is-not-verified-evidence-and-verified-evidence-is-not-authority-083)

### Signature Verification Is Not Proof Verification (0.8.4)

Validating an envelope, verifying its signature and verifying its
external proof are three separate steps with three separate owners. A
forged signature is refused before cataloging; an unreachable external
system never is.

[Full text](history/0.8.md#signature-verification-is-not-proof-verification-084)

### Peers Exchange Anchor Claims, Not Verification Results (0.8.4)

Exactly `PublicationAnchor.toJSON()` crosses the wire. Receiving an
anchor is never verifying it, authentication decides only who a claim is
sent to, and verification stays local on each replica.

[Full text](history/0.8.md#peers-exchange-anchor-claims-not-verification-results-084)

### Synchronization Distributes Claims, Not Verification, Truth, Or Authority (0.8.5)

A late-joining replica can request missed anchors. Responses come from
the responder's catalog only, each anchor is checked as strictly as an
announcement, responses carry no metadata about how anchors were
learned, and neither handler ever calls the external verifier.

[Full text](history/0.8.md#synchronization-distributes-claims-not-verification-truth-or-authority-085)

### Evidence Set Convergence Does Not Imply Truth Convergence (0.8.5)

After discovery, replicas may hold the same set of claims. That is
convergence of catalogs, not agreement about what the claims mean;
deduplication is not agreement, and verification stays independent.

[Full text](history/0.8.md#evidence-set-convergence-does-not-imply-truth-convergence-085)

### Evidence Relationships Are Derived, Never Adjudicated (0.8.6)

Several anchors for one publication can be compared (do their content
hashes agree with each other or an expected hash?) but never resolved.
No field in the result can be summed or thresholded into a verdict.

[Full text](history/0.8.md#evidence-relationships-are-derived-never-adjudicated-086)

### Verification Observations Stay Local Even Under Comparison (0.8.6)

The comparison only ever sees one replica's own verification results,
and a verification result never changes any other part of the derived
comparison.

[Full text](history/0.8.md#verification-observations-stay-local-even-under-comparison-086)

### Package Import Is Evidence Ingestion, Not Evidence Verification (0.8.7)

Anchors bundled in a Blueprint Package pass the same validate, construct
and verify-signature gate as a peer's anchor, never a looser one.
Importing catalogs claims and proves nothing.

[Full text](history/0.8.md#package-import-is-evidence-ingestion-not-evidence-verification-087)

### Importing Evidence Preserves The Claim; It Does Not Repair The Claim (0.8.7)

A package is not "about" a publication, so bundled anchors are never
cross-checked against it, and package provenance is never written into
them. Agreement with other knowledge is the convergence view's question,
asked later.

[Full text](history/0.8.md#importing-evidence-preserves-the-claim-it-does-not-repair-the-claim-087)

### Creating an Anchor Claim Does Not Create External Evidence (0.8.8)

ForkBuild can create a signed assertion that an external system recorded
a publication, but it becomes independently established evidence only by
verification against that system.

[Full text](history/0.8.md#creating-an-anchor-claim-does-not-create-external-evidence-088)

### Broadcast Acceptance Is Not Anchor Validity (0.8.9)

A successful broadcast means only that the external system accepted the
transaction, not that it will or did confirm, nor that a claim built
from it will verify. Creating the transaction is not creating the claim,
no `anchoredAt` is invented, and publishing and verifying stay separate
classes.

[Full text](history/0.8.md#broadcast-acceptance-is-not-anchor-validity-089)

### A Publisher's Failure Is Not the Orchestration's Failure — But It Is Still No Anchor (0.8.10)

If the external publisher says "not now", the orchestration reports it
without crashing, and no anchor is created. There is no second way to
construct an anchor, duplicate external evidence is not an error, and
there is no preferred anchor type or automatic retry.

[Full text](history/0.8.md#a-publishers-failure-is-not-the-orchestrations-failure--but-it-is-still-no-anchor-0810)

### External Anchoring Is An Explicit User Action (0.8.11)

Anchoring is exposed as an explicit action. Discovering evidence,
listing available anchor types and creating an anchor are separate
questions; creating never verifies; the UI never says more than has been
established; multiple anchors are all shown; and nothing anchors as a
side effect.

[Full text](history/0.8.md#external-anchoring-is-an-explicit-user-action-0811)

### A Verification Result Describes What Can Be Established Now; It Does Not Rewrite The Historical Claim Being Verified (0.8.12)

Each verification is recorded as an observation over time, and the only
derived fact is `everValid`, so "unavailable today" after an earlier
success never reads as "never confirmed". The anchor itself gains
nothing, observations never leave the replica, and re-verification stays
explicit.

[Full text](history/0.8.md#a-verification-result-describes-what-can-be-established-now-it-does-not-rewrite-the-historical-claim-being-verified-0812)

### Evidence Comparison Is Not Adjudication (0.8.13)

On screen, a larger group of agreeing anchors is never styled, ordered
or worded as more likely correct. The relationship vocabulary has two
values, verification results sit beside the comparison and never inside
it, and there is no "Verify All".

[Full text](history/0.8.md#evidence-comparison-is-not-adjudication-0813)

### Inspection Is Observation; Verification Is An Explicit Operation (0.8.14)

Inspecting an anchor is local and inert: no verifier, no network, no
catalog change. A generic view never reinterprets a type-specific proof,
and `anchoredAt` is never presented as an authoritative timestamp.

[Full text](history/0.8.md#inspection-is-observation-verification-is-an-explicit-operation-0814)

### A Transaction Plan Is Not A Transaction (0.8.47)

`BitcoinAnchorTransactionBuilder.build()` selects caller-supplied UTXOs
and computes a fee, and stops. Its plan has no signature or raw bytes.
Fee and size are policy estimates, inputs always equal outputs plus fee,
and coin selection is deterministic rather than optimal.

[Full text](history/0.8.md#a-transaction-plan-is-not-a-transaction-0847)

### A PSBT Is A Description, Not A Signature (0.8.48)

The PSBT builder turns a plan and previous-output data into a
PSBT-shaped description, never signed bytes. `witnessUtxo` describes a
UTXO and is not signing material, and every input is validated
independently.

[Full text](history/0.8.md#a-psbt-is-a-description-not-a-signature-0848)

### Real Bytes Are Still Not A Signature (0.8.49)

The serializer produces genuine BIP174 bytes and writes no signature
fields. Its parser exists only to prove that serialization round-trips
exactly.

[Full text](history/0.8.md#real-bytes-are-still-not-a-signature-0849)

### A Wallet's Claim Is Not The Signature (0.8.50)

A wallet reporting `{ signed: true }` is an external claim. The
inspector re-derives from the returned bytes that it is the same
transaction and that recognized signing material is attached, and
refuses otherwise. "Signed" means carrying signing material, never
valid. ForkBuild never receives, generates, derives or stores a private
key or seed.

[Full text](history/0.8.md#a-wallets-claim-is-not-the-signature-0850)

### Signing Material Is Not Yet A Signature Until It Verifies (0.8.51)

The finalizer never calls a PSBT finalized because it has the right
shape. It checks each input's signature with real secp256k1
cryptography, restricted to what it can verify correctly.

[Full text](history/0.8.md#signing-material-is-not-yet-a-signature-until-it-verifies-0851)

### Broadcasting Submits; It Does Not Decide (0.8.52)

The broadcaster accepts only finalized transaction bytes, submits them
and reports what the endpoint said. It never judges validity, never
trusts a txid from the response, and reports rejections without working
around them.

[Full text](history/0.8.md#broadcasting-submits-it-does-not-decide-0852)

### One Explicit Publication Action, Composed From Existing Primitives (0.8.53)

The Bitcoin publication coordinator sequences the existing stages and
adds no Bitcoin logic. Each failure stops at the stage that produced it
and is named, and broadcast acceptance is recorded as an anchor but
never promoted to confirmation.

[Full text](history/0.8.md#one-explicit-publication-action-composed-from-existing-primitives-0853)

### Confirmation Observation Reports What Is; It Does Not Decide What It Means (0.8.54)

Observing confirmation reports what the network says about a broadcast
transaction now. It has three outcomes (no "definitely rejected"), never
takes "confirmed" at face value, returns a fresh record each time, and
keeps confirmation separate from the content proof.

[Full text](history/0.8.md#confirmation-observation-reports-what-is-it-does-not-decide-what-it-means-0854)

### Reconciliation Composes Independent Observations; It Does Not Score Them (0.8.55)

The reconciliation view shows confirmation and content proof side by
side with no valid, healthy, trusted, confidence or status field. The
two checks run independently and neither can block the other.

[Full text](history/0.8.md#reconciliation-composes-independent-observations-it-does-not-score-them-0855)

### An Observation Describes The Network At The Time It Was Made, Not The Current State Of The Transaction (0.8.56)

Confirmation observations are kept in an append-only history, even
repeated identical ones. It only accumulates (it does not detect
reorganizations), has no score or "most reliable" field, and is never
persisted or shared at this stage.

[Full text](history/0.8.md#an-observation-describes-the-network-at-the-time-it-was-made-not-the-current-state-of-the-transaction-0856)

### The UI Displays Observations; It Does Not Turn Them Into A Verdict (0.8.57)

The Bitcoin Anchor section shows confirmation and content proof as two
separate badges. "Confirmed" next to "hash mismatch" is shown exactly
so, not resolved or explained away, and the two histories stay separate.

[Full text](history/0.8.md#the-ui-displays-observations-it-does-not-turn-them-into-a-verdict-0857)

### A Connection Grants A Capability; It Does Not Grant Trust (0.8.58)

Connecting a wallet makes a signing capability available and nothing
more. A decline is distinct from an unavailable wallet, the capability
is requested and revoked explicitly, and a network mismatch is reported,
never fixed on the person's behalf.

[Full text](history/0.8.md#a-connection-grants-a-capability-it-does-not-grant-trust-0858)

### A Transaction Is Signed Only If It Is The Transaction That Was Reviewed (0.8.59)

Reviewing a transaction is not consent to sign whatever comes next.
Review and signing are bound by the transaction's exact bytes; on a
mismatch the wallet is never asked. There is no automatic network
switching.

[Full text](history/0.8.md#a-transaction-is-signed-only-if-it-is-the-transaction-that-was-reviewed-0859)

### A Funding Observation Is Not A Funding Commitment (0.8.60)

Funding observations are fresh reads of what a wallet holds, never
cached. Script type comes from the address prefix, not decoding, and an
observation is never promoted into a plan.

[Full text](history/0.8.md#a-funding-observation-is-not-a-funding-commitment-0860)

### A Transaction Plan Records What Produced It; It Does Not Refresh It (0.8.61)

A plan records the funding observation it was built from and never
claims that funding is still current. Constructing a plan is an explicit
action, the builder alone decides what is selected, and a failed attempt
ends there.

[Full text](history/0.8.md#a-transaction-plan-records-what-produced-it-it-does-not-refresh-it-0861)

### Review Is An Authorization Boundary; Signing Is An External Capability Invocation (0.8.62)

Review is where a person sees the transaction; signing is one explicit
button that invokes the wallet. A wallet's claim is still not the
signature, DECLINED covers both kinds of refusal, and the capability is
rebuilt at the moment of signing, never remembered.

[Full text](history/0.8.md#review-is-an-authorization-boundary-signing-is-an-external-capability-invocation-0862)

### Cryptographic Failure Terminates This Signing Attempt (0.8.63)

Finalizing reuses the existing secp256k1 check. INVALID_SIGNATURE and
FAILED stay distinct, a cryptographic failure ends the attempt with no
retry, and FINALIZED is ephemeral and not a security verdict.

[Full text](history/0.8.md#cryptographic-failure-terminates-this-signing-attempt-0863)

### Broadcast Is Bound To Transaction Identity, Not UI Sequence (0.8.64)

Broadcast submits the finalized artifact itself, not whatever a "ready"
flag suggests. Each new attempt retires later stages' results,
BROADCASTED is still not CONFIRMED, and a rejection ends the attempt.

[Full text](history/0.8.md#broadcast-is-bound-to-transaction-identity-not-ui-sequence-0864)

### Confirmation Is Bound To Broadcast Identity, Not Whatever Is On Screen (0.8.65)

Observing confirmation requires a txid that came from a real broadcast
outcome. Broadcasting never triggers an observation automatically, and
there is still no combined verdict.

[Full text](history/0.8.md#confirmation-is-bound-to-broadcast-identity-not-whatever-is-on-screen-0865)

### A Publication Record Is A Historical Fact; A Republish Never Erases It (0.8.71)

Each IPFS publication is its own record in an append-only history, even
for the same content. Verification observations are kept separately and
address a record by its position in that history. No comparison or
verdict is computed between entries.

[Full text](history/0.8.md#a-publication-record-is-a-historical-fact-a-republish-never-erases-it-0871)

### An Observation Remains A Dated Fact; A Later Reading Never Erases An Earlier One (0.8.72)

Content verification observations for a record are appended, never
overwritten. The latest one is only a display convenience, and nothing
verifies automatically.

[Full text](history/0.8.md#an-observation-remains-a-dated-fact-a-later-reading-never-erases-an-earlier-one-0872)

### History Preserves Occurrence Order; A Timeline Is Free To Provide Chronological Presentation (0.8.73)

A history keeps insertion order; a timeline is a separate read that may
sort a copy chronologically, never the history in place. Each entry
still names its own record, and nothing is aggregated.

[Full text](history/0.8.md#history-preserves-occurrence-order-a-timeline-is-free-to-provide-chronological-presentation-0873)

### Unify The Timeline, Not The Meanings (0.8.74)

The combined timeline orders IPFS and Bitcoin facts by time without
translating or reconciling them. A shared content hash is never evidence
of a shared publication, missing timestamps are labeled as
caller-supplied, and each entry keeps its own domain.

[Full text](history/0.8.md#unify-the-timeline-not-the-meanings-0874)

### A Capability Can Be Ephemeral Even When The Facts Produced By Using It Are Durable (0.8.75)

The publication observation archive persists facts (publications and
observations), never capabilities (wallet connections, signing
functions, keys, seeds, credentials). A reload restores what was
observed, never what was authorized. Only a storage adapter knows about
storage, and clearing the archive is always deliberate.

[Full text](history/0.8.md#a-capability-can-be-ephemeral-even-when-the-facts-produced-by-using-it-are-durable-0875)

### A Changed Observation Is Not Automatically A Reorganization (0.8.76)

Comparing two confirmed observations of one transaction reports only
PLACEMENT_CHANGED or UNCHANGED. A changed block hash is not declared a
reorganization, invalidation or loss of finality, and other pairings are
INCOMPARABLE. Both observations are kept whole, and comparison is
read-only.

[Full text](history/0.8.md#a-changed-observation-is-not-automatically-a-reorganization-0876)

### An Internal Inconsistency Is Not Automatically A Reorganization (0.8.77)

The consistency check names four specific self-contradictory shapes
between two confirmed observations (for example a falling confirmation
count) as INCONSISTENT, without claiming a cause. Each finding keeps the
full observations, and the analysis is read-only.

[Full text](history/0.8.md#an-internal-inconsistency-is-not-automatically-a-reorganization-0877)

### Correlate Evidence By Explicit Identity, Never By Resemblance (0.8.78)

A shared content hash never means a shared anchor. A Bitcoin anchor's
evidence is gathered only by its explicit `anchorId`. The result is a
collection of independent facts with no overall verdict, and a missing
collection is an honest empty one.

[Full text](history/0.8.md#correlate-evidence-by-explicit-identity-never-by-resemblance-0878)

### Derived Evidence Is Reconstructed From Durable Facts; It Is Not Stored As A Second History (0.8.79)

The archive stores observed facts, not conclusions. Comparisons,
consistency findings and evidence bundles are recomputed from those
facts after a reload, never stored, since a second copy would eventually
disagree. Restoring a fact is not observing it again.

[Full text](history/0.8.md#derived-evidence-is-reconstructed-from-durable-facts-it-is-not-stored-as-a-second-history-0879)

### A Publication Record Establishes Identity; Observations Establish What Was Subsequently Observed About It (0.8.80)

`BitcoinAnchorPublicationRecord` (`{ anchorId, contentHash, txid,
network, createdAt }`) says what the publication attempt is, and nothing
about confirmation or validity. It is created at successful
finalization, is not erased by a broadcast failure, and records are
never merged by shared hash or txid.

[Full text](history/0.8.md#a-publication-record-establishes-identity-observations-establish-what-was-subsequently-observed-about-it-0880)

### A Lifecycle Timeline Presents Recorded Facts In Temporal Order; It Does Not Infer Missing Stages Or Interpret Them (0.8.81)

The lifecycle timeline flattens existing evidence and sorts it by time,
nothing more. A missing stage is simply absent, every entry carries its
explicit `anchorId`, and nothing new is stored.

[Full text](history/0.8.md#a-lifecycle-timeline-presents-recorded-facts-in-temporal-order-it-does-not-infer-missing-stages-or-interpret-them-0881)

### An Archive Export Contains Facts, Not Capabilities Or Conclusions (0.8.82)

Export is exactly the archive's own `toJSON()`, with no wrapper, so the
same facts always export to identical bytes. Malformed imports are
rejected by name, import replaces rather than merges, and exports
contain neither derived views nor capabilities.

[Full text](history/0.8.md#an-archive-export-contains-facts-not-capabilities-or-conclusions-0882)

### Provenance Describes Where A Fact Entered This Archive; It Does Not Establish Whether The Fact Is True (0.8.83)

Each archived fact is LOCAL or IMPORTED, and neither is more
trustworthy. Provenance describes only this archive's own ingestion, is
separate from the fact's own timestamp, and is never used in analysis.

[Full text](history/0.8.md#provenance-describes-where-a-fact-entered-this-archive-it-does-not-establish-whether-the-fact-is-true-0883)

### An Archive Fingerprint Identifies Durable Contents; It Does Not Establish Their Truth Or Origin (0.8.84)

The archive fingerprint is a SHA-256 of its canonical `toJSON()`,
excluding import events but including provenance. Matching means
byte-identical content, never verified or trusted, and a fingerprint is
not a signature.

*Changed by the code-size cleanup (2026-09-24):* SHA-256 is no longer
copied into each fingerprint file; it lives once in `core/Sha256.js`.

[Full text](history/0.8.md#an-archive-fingerprint-identifies-durable-contents-it-does-not-establish-their-truth-or-origin-0884)

### A Fingerprint Comparison Establishes Equality Of Digests, Not Which Archive Is Correct (0.8.85)

Comparing the current archive's fingerprint with a supplied digest gives
MATCH, DIFFERENT, INVALID_FINGERPRINT or INVALID_ARCHIVE, and none is a
verdict. Malformed input is never coerced, and comparison happens only
when asked.

[Full text](history/0.8.md#a-fingerprint-comparison-establishes-equality-of-digests-not-which-archive-is-correct-0885)

### Inspecting An External Archive Never Touches The Current One (0.8.86)

Inspecting an external archive is a pure function of that payload and
can never affect the current archive; only an explicit import can.
Provenance is shown as recorded, and the result is an ephemeral index,
not evidence.

[Full text](history/0.8.md#inspecting-an-external-archive-never-touches-the-current-one-0886)

### Archive Differences Describe Durable State Differences Without Selecting A Correct State (0.8.87)

The difference view reports which facts and which provenance tags differ
between two archives, per collection and by explicit identity,
preserving order and duplicates. It never says which archive is right or
recommends anything.

[Full text](history/0.8.md#archive-differences-describe-durable-state-differences-without-selecting-a-correct-state-0887)

### A Replacement Review Composes Existing Information; It Does Not Authorize Replacement (0.8.88)

The replacement review combines inspection and difference to inform an
explicit import decision and never makes it. It is a review, not a
reconciliation; the external archive stays ephemeral until confirmed,
and it shows that importing changes provenance.

[Full text](history/0.8.md#a-replacement-review-composes-existing-information-it-does-not-authorize-replacement-0888)

### Blockchain Identity Is Explicit; A Shared Reference Is Never Evidence Of A Shared Publication (0.8.89)

`BlockchainPublicationIdentity` always names the blockchain.
Publications are compared by `blockchain` and `chainReference` only,
never by content hash. Chain mechanics stay chain-specific; only
identity vocabulary is shared.

[Full text](history/0.8.md#blockchain-identity-is-explicit-a-shared-reference-is-never-evidence-of-a-shared-publication-0889)

### Network Observation Does Not Establish Publication Authority (0.8.90)

The first Base capabilities are read-only: they observe chain id and
balance and can never sign or broadcast. An observed account is not a
signing capability, and a compatible-looking RPC answer never
establishes which chain it is.

[Full text](history/0.8.md#network-observation-does-not-establish-publication-authority-0890)

### A Transaction Plan Is Not A Publication (0.8.91)

Planning a Base transaction produces an unsigned plan (from, to, value,
data, nonce, gas and fees) and no publication identity. It is an
ordinary self-transfer, not a contract call; the plan freezes the fee
observations it used; and wei amounts stay decimal strings.

[Full text](history/0.8.md#a-transaction-plan-is-not-a-publication-0891)

### Review Describes The Transaction Plan; It Does Not Commit It (0.8.92)

Review presents a Base plan's exact fields, including the content
commitment, without modifying, signing or broadcasting it. It appears
after construction; signing stays explicit.

[Full text](history/0.8.md#review-describes-the-transaction-plan-it-does-not-commit-it-0892)

### Signing Authorizes The Exact Reviewed Plan; It Does Not Reconstruct Or Modify It (0.8.93)

The Base signer takes the reviewed plan and builds the wallet request
from its frozen fields only. It never fetches its own nonce or fees,
names the transaction type explicitly, stops at the signed artifact, and
treats each click as a fresh attempt.

[Full text](history/0.8.md#signing-authorizes-the-exact-reviewed-plan-it-does-not-reconstruct-or-modify-it-0893)

### A Signed Transaction Is Untrusted Until Independently, Cryptographically Verified Against The Exact Reviewed Plan (0.8.94)

The finalizer decodes the wallet's signed bytes, compares every field
with the reviewed plan, then recovers the sender cryptographically and
compares it with `plan.from`. The sender is recovered, never read, and
FINALIZED means only that narrow fact.

[Full text](history/0.8.md#a-signed-transaction-is-untrusted-until-independently-cryptographically-verified-against-the-exact-reviewed-plan-0894)

### Broadcast Publishes An Already-Finalized Transaction; It Does Not Construct, Sign, Or Re-Verify One (0.8.95)

The Base broadcaster submits a finalized transaction unchanged and
reports the result, exposing the network's returned hash. A definite
rejection is reported distinctly from unavailability and never retried.

[Full text](history/0.8.md#broadcast-publishes-an-already-finalized-transaction-it-does-not-construct-sign-or-re-verify-one-0895)

### A Durable Archive Entry Requires An Explicit Append; Chain-Specific Observation Models Stay Chain-Specific Even When Made Durable (0.8.97)

Base inclusion observations are archived only by explicit append, in
their own collection keyed by transaction id. Every state is archived as
observed, and the existing provenance, fingerprint and export machinery
is reused unchanged.

[Full text](history/0.8.md#a-durable-archive-entry-requires-an-explicit-append-chain-specific-observation-models-stay-chain-specific-even-when-made-durable-0897)

### Unify The Timeline, Not The Meanings, Holds For A Third Domain Too (0.8.98)

Base inclusion observations join the one shared timeline in their own
vocabulary, never translated into a shared status. Observations are
neither multiplied nor filtered, and there is still one timeline.

[Full text](history/0.8.md#unify-the-timeline-not-the-meanings-holds-for-a-third-domain-too-0898)

### A Publication Record Establishes Identity; It Never Manufactures, Or Is Manufactured By, An Observation — Held For A Second Chain (0.8.99)

Bitcoin and Base keep their own publication record shapes and each
project onto `BlockchainPublicationIdentity`; there is no shared base
class. A record comes from the artifact that created it, never from
later observation, and a shared raw identifier across chains never means
a shared publication.

[Full text](history/0.8.md#a-publication-record-establishes-identity-it-never-manufactures-or-is-manufactured-by-an-observation--held-for-a-second-chain-0899)
