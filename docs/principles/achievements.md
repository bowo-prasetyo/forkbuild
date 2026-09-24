# Principles: Achievements, rankings and reconciliation

Each rule links to its full text in [the history](../Principles.md#history).

### An Achievement Describes An Attributable Fact, Not A Person's Worth (0.8.102)

An achievement event states that a specific durable record crossed a
named threshold (a first publication, a tenth, a second chain). It never
says a person, wallet or identity is good, trusted or worth more, and
there are no points, levels or scores. Achievements are computed from
existing facts by explicit identity.

[Full text](history/0.8.md#an-achievement-describes-an-attributable-fact-not-a-persons-worth-08102)

### A Badge Presents An Achievement; It Does Not Redefine It (0.8.103)

A badge is an achievement event with a title, description and icon, its
kind and title copied exactly. It adds no new achievement kinds, and it
never scores or ranks.

[Full text](history/0.8.md#a-badge-presents-an-achievement-it-does-not-redefine-it-08103)

### A Reference Is A Fact One Publication States About Another; It Is Never Inferred, And Never A Verdict (0.8.104)

A publication reference exists only when a person explicitly records
one, never because two publications resemble each other (same hash,
text, time or author). It is compared by identity only, stored durably
because it is an attributable fact, and never called a "fork".

[Full text](history/0.8.md#a-reference-is-a-fact-one-publication-states-about-another-it-is-never-inferred-and-never-a-verdict-08104)

### A Reference Graph Is Grouped From Durable Facts, And Stays As Uninterpreted As They Are (0.8.105)

The reference graph groups reference records by publication and is
recomputed on demand. An incoming count is just a count, never
popularity or importance, and two identical references stay two edges.

[Full text](history/0.8.md#a-reference-graph-is-grouped-from-durable-facts-and-stays-as-uninterpreted-as-they-are-08105)

### A Reference-Derived Achievement Is Attributed To A Publication, Never To The Archive As A Whole (0.8.106)

Reference achievements (first reference made or received, 10 or 100
referencing publications, first cross-chain reference) are scoped to one
publication identity and fire once per identity. Each names the fact
that completed it, history is read chronologically, and cross-chain
means two different `blockchain` fields.

[Full text](history/0.8.md#a-reference-derived-achievement-is-attributed-to-a-publication-never-to-the-archive-as-a-whole-08106)

### A Publication Profile Names What A Publication Earned, Never Who Earned It (0.8.107)

A publication profile is the existing achievement events for one
publication identity, unchanged and in order. Publication identity is
not human identity, matching is by `sameAs()` and never content hash,
and an empty profile is a valid answer.

[Full text](history/0.8.md#a-publication-profile-names-what-a-publication-earned-never-who-earned-it-08107)

### A Ranking Is A Policy Output, Not A Discovered Property (0.8.112)

"Publisher A is #1" means first under ForkBuild's current ranking
policy, never objectively best. The policy is data, a rank is disposable
and never stored, no chain or achievement carries a hidden multiplier,
only publishers who explicitly associated publications are ranked, and
ordering is deterministic everywhere.

[Full text](history/0.8.md#a-ranking-is-a-policy-output-not-a-discovered-property-08112)

### A Leaderboard Is A Presentation Of A Ranking, Never A Second Ranking System (0.8.113)

The leaderboard shows the ranking's own ranks in its own order, with no
comparator or sort of its own. A rank is always shown with its policy,
is as disposable as the ranking, and names a publisher identity, never a
person.

[Full text](history/0.8.md#a-leaderboard-is-a-presentation-of-a-ranking-never-a-second-ranking-system-08113)

### Evidence Is Portable; Achievements Are Derivable; Rankings Are Policy; Leaderboards Are Presentation (0.8.114)

Only evidence is exported: the four record collections the achievement
pipeline reads. The receiving replica recomputes achievements and
rankings itself, since a conclusion it cannot recompute is only a claim.
Provenance belongs to each archive, not to facts crossing between them.

[Full text](history/0.8.md#evidence-is-portable-achievements-are-derivable-rankings-are-policy-leaderboards-are-presentation-08114)

### Evidence May Be Merged; Conclusions Must Be Recomputed (0.8.115)

Merging another replica's evidence into an existing archive adds facts,
deduplicated by exact identity and validated the same way as an import.
Conclusions are always recomputed afterwards, never merged.

[Full text](history/0.8.md#evidence-may-be-merged-conclusions-must-be-recomputed-08115)

### An Evidence Fingerprint Identifies A Replica's Facts; It Never Authenticates Or Concludes Anything About Them (0.8.116)

The evidence fingerprint hashes exactly the four evidence collections
and means only that they are byte-identical. Provenance is excluded, it
is an order-independent multiset hash that never deduplicates, chains
are kept structurally apart, and each collection has its own hash.

[Full text](history/0.8.md#an-evidence-fingerprint-identifies-a-replicas-facts-it-never-authenticates-or-concludes-anything-about-them-08116)

### An Evidence Difference Names Missing Facts; It Is Never The Authority On Whether Two Replicas Agree (0.8.117)

A fingerprint says that evidence differs; the difference says which
facts each side lacks. It is a multiset difference, describes absence
rather than truth, and gives no instructions.

[Full text](history/0.8.md#an-evidence-difference-names-missing-facts-it-is-never-the-authority-on-whether-two-replicas-agree-08117)

### A Synchronization Exchange Transports Evidence; A Fingerprint-Only Request Can Never Transport A Minimal Diff (0.8.118)

An evidence request carries almost nothing (never the requester's
evidence or a diff), so the response carries evidence rather than a
minimal delta. Each exchange is one-directional, "nothing to exchange"
is a normal result, and the messages are portable with no networking of
their own.

[Full text](history/0.8.md#a-synchronization-exchange-transports-evidence-a-fingerprint-only-request-can-never-transport-a-minimal-diff-08118)

### A Leaderboard Snapshot's Identity Is Its Evidence Fingerprint Plus Its Policy Version — Never A Timestamp, Never A Hash Of Itself (0.8.119)

Two leaderboard snapshots describe the same computation exactly when
their evidence fingerprints and policy versions match. Timestamps and a
hash of the snapshot itself are deliberately excluded, the policy is
kept by reference, and snapshots are computed fresh, never stored.

[Full text](history/0.8.md#a-leaderboard-snapshots-identity-is-its-evidence-fingerprint-plus-its-policy-version--never-a-timestamp-never-a-hash-of-itself-08119)

### A Valid Signature Proves Who Signed; It Never Proves The Claim Is True Relative To A Replica's Own Evidence (0.8.121)

A signed leaderboard claim authenticates who asserted it, not the
evidence or the truth of the assertion. Signature validity and agreement
with this replica's own recomputation are checked separately. Signers
are cryptographic identities, and a signature never makes a ranking
correct.

[Full text](history/0.8.md#a-valid-signature-proves-who-signed-it-never-proves-the-claim-is-true-relative-to-a-replicas-own-evidence-08121)

### A Stored Claim Is A Historical Signed Statement; Its Current Verification Result Is A Derived Observation (0.8.130)

A stored claim records what was signed and when it arrived; whether it
still agrees with current evidence is recomputed on each read, never
stored with it. Changing evidence never alters stored claims, only one
function reads the claim collection, and claims are never achievement
evidence.

[Full text](history/0.8.md#a-stored-claim-is-a-historical-signed-statement-its-current-verification-result-is-a-derived-observation-08130)

### Recording A Decision Does Not Execute, Validate, Or Interpret It (0.8.150)

A stored reconciliation decision means only that a caller recorded this
disposition for an existing candidate, never that it was right or that
reconciliation happened. Validation is structural only, the history is
not a state machine, and decisions are never achievement evidence.

[Full text](history/0.8.md#recording-a-decision-does-not-execute-validate-or-interpret-it-08150)

### Exchange Transports Historical Decisions; It Does Not Make New Ones (0.8.151)

Decision exchange moves recorded decisions and makes none. Decisions are
unsigned, so import takes no verifier; it deduplicates exact entries and
validates structure only, without consulting the archive.

[Full text](history/0.8.md#exchange-transports-historical-decisions-it-does-not-make-new-ones-08151)

### A Historical Decision Is Read By Its Own Embedded Fact, Never Recomputed Against Current State (0.8.153)

Which candidate a decision concerns is read from the candidate embedded
in the record, never by selecting candidates again. Decision identity
and candidate identity are separate relations, and repeated decisions
are kept.

[Full text](history/0.8.md#a-historical-decision-is-read-by-its-own-embedded-fact-never-recomputed-against-current-state-08153)

### A Candidate's Decision History Is A Narration, Not A State Machine (0.8.154)

Grouping one candidate's decisions in time order narrates them; a later
decision never supersedes or corrects an earlier one. The candidate
identity comes from the existing projection.

[Full text](history/0.8.md#a-candidates-decision-history-is-a-narration-not-a-state-machine-08154)
