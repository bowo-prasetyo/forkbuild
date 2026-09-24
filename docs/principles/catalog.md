# Principles: Repository catalog and previews

Each rule links to its full text in [the history](../Principles.md#history).

### Repository Search Is Not World Search (0.2.31)

`SearchWorldUseCase` answers "where is this publication in the world?"
(text, optional radius, resolved position). `SearchPublicationsUseCase`
answers "which publications match?" (pagination, deterministic order,
optional description matching, no positions). They stay separate use
cases because their callers want different things.

[Full text](history/0.1-0.2.md#repository-search-is-not-world-search-0231)

### A Catalog Query Is Answered By The Application Layer, Not Assumed Efficient By The UI (0.2.31)

The UI passes a `PublicationQuery` to `SearchPublicationsUseCase` and
gets back a `PublicationPage`; it never computes offsets or assumes the
provider can fetch arbitrary rows cheaply. Today's answer is a local
scan, sort and slice, but the contract leaves room for cursor-based
decentralized providers without changing callers.

[Full text](history/0.1-0.2.md#a-catalog-query-is-answered-by-the-application-layer-not-assumed-efficient-by-the-ui-0231)

### Ordering Must Be Deterministic Across Replicas (0.2.31)

Two replicas holding the same publications must sort them identically,
or "page 5" means nothing. Every sort order in `core/PublicationSort.js`
falls back to `publicationId` when the primary key ties, and every
string comparison is ordinal, never `localeCompare`, whose result
depends on the runtime's locale.

[Full text](history/0.1-0.2.md#ordering-must-be-deterministic-across-replicas-0231)

### Grouping Is Presentation, Never A Storage Concept (0.2.31)

`groupPublications()` buckets an already sorted and paginated page for
display (by author, date or license). Nothing it produces is stored,
replicated or expected to agree between two people using different
grouping modes.

[Full text](history/0.1-0.2.md#grouping-is-presentation-never-a-storage-concept-0231)

### A Preview Is Either Signed Or It Isn't (0.2.31, resolved 0.2.32)

Adding a preview to the signed publication would change
`getSigningDescriptor()` and break verification for every publication
already signed. 0.2.32 settled it: a preview is never part of the signed
publication. Previews are derived client state (see below).

[Full text](history/0.1-0.2.md#a-preview-is-either-signed-or-it-isnt-0231-resolved-0232)

### Description Search Is Opt-In, Not Silent, Because It Has A Real Cost (0.2.31)

Matching descriptions means loading each publication's full Document,
which is cheap for one page but expensive across a whole catalog. So it
is an explicit "Include descriptions" choice in the catalog toolbar,
never a silent cost on every search.

[Full text](history/0.1-0.2.md#description-search-is-opt-in-not-silent-because-it-has-a-real-cost-0231)

### Explicit Pagination Is A Decentralized Honesty Feature, Not Just A Layout Choice (0.2.31)

Infinite scroll was deliberately not built. Explicit page numbers leave
room to say whether a page is part of the complete repository or only of
what this replica knows. Revisit that only once discovery can offer
stronger completeness guarantees.

[Full text](history/0.1-0.2.md#explicit-pagination-is-a-decentralized-honesty-feature-not-just-a-layout-choice-0231)

### Previews Are Derived Client State (0.2.32)

A preview is a locally generated picture of the real Document a
publication points to, never authoritative publication data or a
publisher's claim. It can be cached, discarded, regenerated or missing
without affecting a publication's validity, identity, authorization,
replication or discoverability.

[Full text](history/0.1-0.2.md#previews-are-derived-client-state-0232)

### A Preview's Camera Framing Is Deterministic; Its Pixels Are Not (0.2.32)

`core/PreviewCameraFraming.js` guarantees that the same document bounds
always give the same camera position, target and field of view: pure
geometry with no randomness or clock. Two people see the same shot of
the same content, even though rendered pixels may differ between
machines.

[Full text](history/0.1-0.2.md#a-previews-camera-framing-is-deterministic-its-pixels-are-not-0232)

### A Preview Failure Is Not A Publication Failure (0.2.32)

Rendering can fail for reasons unrelated to the publication (a corrupted
local snapshot, no WebGL, an unusual document).
`PreviewService.request()` never throws or rejects; a failure resolves
to `null`, the same as "not generated yet", and the card keeps its
deterministic placeholder.

[Full text](history/0.1-0.2.md#a-preview-failure-is-not-a-publication-failure-0232)

### Preview Generation Is Bounded By What's Actually Visible (0.2.32)

Opening the Repository never renders every publication. A card requests
a preview only when it is visible or about to be
(`IntersectionObserver`), and a page or query change that removes a card
cancels its queued or in-flight generation.

[Full text](history/0.1-0.2.md#preview-generation-is-bounded-by-whats-actually-visible-0232)
