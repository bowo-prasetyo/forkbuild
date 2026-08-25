import { reactive, ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { PublicationResolutionOutcome } from '../../application/PublicationResolutionOutcome.js';
import { resolvePublicationView, describePublicationOutcome, describeRetrieval } from '../../application/PublicationResolutionView.js';
import { AnchorVerificationOutcome } from '../../application/AnchorVerificationOutcome.js';
import { publicationEvidenceView, describeKnownEvidenceCount } from '../../application/PublicationEvidenceView.js';
import { ExternalAnchorCreationUiState } from '../../application/ExternalAnchorCreationUiState.js';
import { ExternalAnchorCreationOutcome } from '../../application/ExternalAnchorCreationOutcome.js';
import { describeCreationAttempt, describeCreationButtonLabel } from '../../application/PublicationAnchorCreationView.js';
import { createVerificationObservation } from '../../application/PublicationAnchorVerificationObservation.js';
import { deriveAnchorVerificationLifecycle, describeAnchorVerificationLifecycleNote } from '../../application/PublicationAnchorVerificationLifecycleView.js';
import { derivePublicationEvidenceConvergence } from '../../application/PublicationEvidenceConvergence.js';
import { publicationEvidenceConvergenceView } from '../../application/PublicationEvidenceConvergenceView.js';
import { publicationAnchorDetailView } from '../../application/PublicationAnchorDetailView.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
// 0.7.6 — Multi-Peer Publication Retrieval & Replication.
//
// The "Publication Center" this milestone's own design conversation
// asked for: a single place a person can look at every application/
// DecentralizedPublication.js this replica's application/
// LocalPublicationCatalog.js has ever cataloged — its own, or one
// announced by a peer (application/PublicationPeerExchange.js, 0.7.3) —
// and see, per entry, whether its content can be seen RIGHT NOW.
//
// Every status shown below is DERIVED, at display time, by application/
// PublicationResolutionView.js#resolvePublicationView() — never stored
// on the entry, never cached across a re-check. Mirrors the restraint
// application/LocalPublicationCatalog.js's own header already states as
// a hard rule ("no resolution status field on a catalog entry... status
// is always derived, on demand") applied here to the one place that
// restraint finally has a UI to honor. Re-opening this page, or
// clicking "Re-check," always re-derives the answer from scratch; it is
// never wrong in a way a reload wouldn't also fix, and never stale in a
// way this page would hide.
//
// "Retrieve from Peers" replaces 0.7.5's own "Retrieve from Connected
// Peer" — the "multi-source retrieval... fallback... racing" that
// milestone's own docs/Roadmap.md entry named and sized as a future
// milestone (0.7.6) has arrived. This page still answers "who do I
// ask?" the identical deliberately narrow way — application/
// PublicationPeerExchange.js has never tracked which peer announced
// which publication (peer identity is informational only, by design;
// see that class's own header), so there is no natural "ask whoever
// told you about this" target to offer. What changed: instead of the
// FIRST currently AUTHENTICATED peer, this page now hands application/
// PublicationResolutionCoordinator.js#resolve() EVERY currently
// AUTHENTICATED peer, in application/PeerSessionManager.js's own
// registry order, as its `peers` candidate list — still a single,
// explicit, named policy living here, in the UI layer, never inside the
// coordinator itself (see that class's own header on why `peers` is
// always a required, caller-supplied argument). Candidates are tried in
// that order, never raced concurrently — see application/
// PeerContentRetrievalCoordinator.js's own header.
//
// 0.8.3 — Publication Center: External Evidence UX. Each entry also
// shows its own "External Evidence" section — every application/
// PublicationAnchor.js this replica has cataloged for that
// publication, discovered locally the moment the list itself loads
// (application/PublicationEvidenceCoordinator.js#discover(), a
// synchronous catalog read with no network access), never
// independently verified until a person clicks "Verify Evidence" on
// one specific anchor. Opening this page never calls application/
// ExternalAnchorVerifier.js; only that explicit click does. A
// verification result lives only in this component's own `entry.
// verifications` — ephemeral session state, never written back into
// application/LocalPublicationAnchorCatalog.js or the anchor itself —
// so re-opening this page, or asking again, always re-derives the
// answer fresh. See application/PublicationEvidenceView.js's own
// header and docs/Principles.md, "Known Evidence Is Not Verified
// Evidence, And Verified Evidence Is Not Authority (0.8.3)."
//
// 0.8.11 — Explicit External Anchoring UX. Each entry's "External
// Evidence" section now also offers a "Create <type> Anchor" control per
// application/PublicationAnchorCreationCoordinator.js#availableAnchorTypes()
// — the first UI consumer of the orchestration 0.8.8-0.8.10 built with no
// UI consumer at all (see each of those milestones' own "Deliberately
// excluded" lists). Discovery, creation, and verification stay three
// genuinely separate actions, over three separate collaborators, exactly
// as 0.8.3 already established for the first two: opening this page,
// listing known evidence, and toggling the evidence list open never
// trigger a creation OR a verification; clicking "Create <type> Anchor"
// triggers exactly one external recording attempt and NEVER an automatic
// verification of what it just created (the resulting anchor lands in
// the ordinary evidence list below, "Not yet verified," exactly like any
// other cataloged anchor); clicking "Verify Evidence" remains its own
// separate, unchanged 0.8.3 action. See application/
// PublicationAnchorCreationView.js's own header and docs/Principles.md,
// "External Anchoring Is An Explicit User Action (0.8.11)."
//
// 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics. Each
// entry now also keeps `entry.verificationHistory` — every application/
// PublicationAnchorVerificationObservation.js this replica has made for
// one anchor THIS SESSION, appended to rather than overwritten. Clicking
// "Verify Evidence"/"Verify Again" still shows the SAME badge/label it
// always has (application/PublicationEvidenceView.js, unchanged); the
// only new thing on screen is one optional extra sentence — application/
// PublicationAnchorVerificationLifecycleView.js#
// describeAnchorVerificationLifecycleNote() — that appears only when the
// most recent check came back PROOF_UNAVAILABLE after an EARLIER check,
// this session, reached VALID. It never says "invalid" or "revoked," and
// it never appears for an anchor this replica has only ever checked
// once. See docs/Principles.md, "A Verification Result Describes What
// Can Be Established Now; It Does Not Rewrite The Historical Claim Being
// Verified (0.8.12)."
//
// 0.8.13 — Multi-Evidence Comparison & Conflict UX. Each entry now also
// derives a "Content binding" overview from application/
// PublicationEvidenceConvergence.js#derivePublicationEvidenceConvergence()
// (0.8.6, unchanged) shaped for the screen by application/
// PublicationEvidenceConvergenceView.js (new): how many DISTINCT content
// hashes are claimed by this entry's known anchors, how many anchors
// claim each one, and whether those claims conflict. This answers "how
// does this evidence relate to itself?" — a question the per-anchor
// evidence list below already let a person answer by hand, one card at a
// time, but never stated directly. Shown only inside the same "Show
// Evidence" disclosure the per-anchor list already uses, and computed
// fresh every time `loadEvidence()`/`verifyAnchor()` already run —
// nothing new is stored, and nothing here ever ranks one content-hash
// group over another. See docs/Principles.md, "Evidence Comparison Is
// Not Adjudication (0.8.13)."
//
// 0.8.14 — External Evidence Inspection & Locator UX. Each anchor card
// now also offers "Inspect Evidence," alongside the existing "Verify
// Evidence"/"Verify Again" — two buttons that mean completely different
// things. Clicking "Inspect Evidence" calls ONLY application/
// PublicationAnchorDetailView.js#publicationAnchorDetailView() (a pure,
// synchronous reshaping of the anchor this replica already has in
// memory) and, separately, looks the anchor's own `anchorType` up in the
// injected `externalAnchorEvidenceViewRegistry` for an OPTIONAL,
// anchorType-specific presentation (application/
// ExternalAnchorEvidenceViewRegistry.js) — never application/
// ExternalAnchorVerifier.js, never the network, never the catalog.
// `entry.inspections` is ephemeral per-anchor UI state, exactly like
// `entry.verifications`/`entry.creationAttempts` above — never read from
// or written to anything durable. See application/
// PublicationAnchorDetailView.js's own header and docs/Principles.md,
// "Inspection Is Observation; Verification Is An Explicit Operation
// (0.8.14)."
function humanizeContentKind(contentKind) {
    if (!contentKind) return 'Unknown content';
    return contentKind
        .replace(/^forkbuild\./, '')
        .replace(/[-.]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortId(identityId) {
    return identityId ? identityId.slice(-14) : 'an unknown identity';
}

// 0.8.13 — Multi-Evidence Comparison & Conflict UX. Display-only
// truncation for a content-hash group's heading, mirroring shortId()'s
// own restraint immediately above: the FULL contentHash is still shown
// verbatim, monospace, elsewhere on each anchor's own evidence card
// (unchanged since 0.8.3) — this shortened form exists only so several
// groups can be told apart at a glance in the "Content binding" summary.
function shortHash(contentHash) {
    if (!contentHash) return 'an unknown hash';
    return contentHash.length > 18 ? `${contentHash.slice(0, 10)}…${contentHash.slice(-6)}` : contentHash;
}

const OUTCOME_BADGE_CLASSES = {
    [PublicationResolutionOutcome.RESOLVED]: 'peer-badge--authenticated',
    [PublicationResolutionOutcome.CONTENT_UNAVAILABLE]: 'peer-badge--pending'
};

// 0.8.3 — Publication Center: External Evidence UX. Reuses the three
// colors .peer-badge already defines rather than inventing seven new
// ones — VALID is the only outcome ever shown as "good" (green);
// VALID_PROOF_UNVERIFIED and PROOF_UNAVAILABLE both read as "honestly
// inconclusive" (amber), matching application/AnchorVerificationOutcome
// .js's own header on why neither is ever treated as a rejection; every
// other outcome reads as a definite rejection (red). The LABEL text —
// never this color alone — is what keeps all seven outcomes distinct;
// see application/PublicationEvidenceView.js#describeVerificationOutcome().
const EVIDENCE_BADGE_CLASSES = {
    [AnchorVerificationOutcome.VALID]: 'peer-badge--authenticated',
    [AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED]: 'peer-badge--pending',
    [AnchorVerificationOutcome.PROOF_UNAVAILABLE]: 'peer-badge--pending',
    [AnchorVerificationOutcome.INVALID_ENVELOPE]: 'peer-badge--failed',
    [AnchorVerificationOutcome.INVALID_SIGNATURE]: 'peer-badge--failed',
    [AnchorVerificationOutcome.CONTENT_MISMATCH]: 'peer-badge--failed',
    [AnchorVerificationOutcome.INVALID_PROOF]: 'peer-badge--failed'
};

// 0.8.11 — Explicit External Anchoring UX. Reuses the identical
// .peer-badge palette EVIDENCE_BADGE_CLASSES above already draws from —
// CREATED reads as "good" (green), exactly like VALID; REJECTED reads as
// a definite rejection (red), exactly like INVALID_PROOF (the external
// system was reached and said no); UNAVAILABLE reads as "honestly
// inconclusive" (amber), exactly like PROOF_UNAVAILABLE (nothing
// external was reached at all, whether because of the publisher or
// because application/PublicationAnchorCreationCoordinator.js#create()
// itself threw — see application/PublicationAnchorCreationView.js's own
// header on why those two share a state). CREATING gets the same amber
// as any other in-flight check.
const CREATION_BADGE_CLASSES = {
    [ExternalAnchorCreationUiState.CREATING]: 'peer-badge--pending',
    [ExternalAnchorCreationUiState.CREATED]: 'peer-badge--authenticated',
    [ExternalAnchorCreationUiState.REJECTED]: 'peer-badge--failed',
    [ExternalAnchorCreationUiState.UNAVAILABLE]: 'peer-badge--pending'
};

export default {
    name: 'DecentralizedPublicationsView',
    setup() {
        const catalog = inject('publicationCatalog');
        const coordinator = inject('publicationResolutionCoordinator');
        const kindPlugins = inject('publicationDisplayKindPlugins');
        const publicationPeerExchange = inject('publicationPeerExchange');
        const publicationPeerContentExchange = inject('publicationPeerContentExchange');
        const peerSessionManager = inject('peerSessionManager');
        const evidenceCoordinator = inject('publicationEvidenceCoordinator');
        const creationCoordinator = inject('publicationAnchorCreationCoordinator');
        // 0.8.14 — External Evidence Inspection & Locator UX. Optional —
        // absent here (as in a test harness that never provides it),
        // "Inspect Evidence" still shows application/
        // PublicationAnchorDetailView.js's own generic shape; only the
        // anchorType-specific section is skipped, exactly as
        // `availableAnchorTypes` above degrades to an empty list with no
        // `creationCoordinator`.
        const evidenceViewRegistry = inject('externalAnchorEvidenceViewRegistry', null);

        // 0.8.11 — Explicit External Anchoring UX. Every anchorType this
        // replica can currently ask to create evidence for, read ONCE at
        // setup (a synchronous, side-effect-free registry read — see
        // application/PublicationAnchorCreationCoordinator.js#
        // availableAnchorTypes() own header) rather than per publication;
        // which publishers exist is a property of this replica, not of
        // any one entry. Empty when no `creationCoordinator` was provided,
        // or when this replica has no publisher configured at all — in
        // either case no "Create Anchor" control is ever offered, exactly
        // as "Retrieve from Peers" already stays hidden with no
        // authenticated peer connected.
        const availableAnchorTypes = creationCoordinator ? creationCoordinator.availableAnchorTypes() : [];

        const entries = reactive([]);
        const loading = ref(true);

        // Every currently AUTHENTICATED peer, in registry order — the
        // full candidate list this page now hands to application/
        // PublicationResolutionCoordinator.js#resolve() as `peers`. See
        // this file's own header on why this replaced 0.7.5's own
        // single `retrievalPeer`.
        const retrievalPeers = computed(() => peerSessionManager.listPeers()
            .filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED));

        function findEntry(publicationId) {
            return entries.find((entry) => entry.publication.id === publicationId);
        }

        async function resolveEntry(entry) {
            entry.checking = true;
            try {
                entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins });
            } finally {
                entry.checking = false;
            }
        }

        // Rebuilds the entry LIST from the catalog (cheap, synchronous —
        // application/LocalPublicationCatalog.js#list() never touches the
        // network) without discarding a view already computed for a
        // publication still on file, then resolves whichever entries are
        // new.
        async function refreshList() {
            const known = new Map(entries.map((entry) => [entry.publication.id, entry]));
            const current = catalog.list();
            entries.splice(0, entries.length, ...current.map((publication) => known.get(publication.id) || reactive({
                publication,
                receivedAt: catalog.getReceivedAt(publication.id),
                view: null,
                checking: false,
                retrieving: false,
                evidenceAnchors: [],
                evidence: null,
                evidenceExpanded: false,
                verifications: {},
                // 0.8.13 — Multi-Evidence Comparison & Conflict UX. The
                // derived structural relationship among THIS entry's own
                // `evidenceAnchors` — application/
                // PublicationEvidenceConvergence.js's own result, and
                // application/PublicationEvidenceConvergenceView.js's own
                // shaping of it. Recomputed, never accumulated, every
                // time `loadEvidence()`/`verifyAnchor()` already run —
                // ephemeral exactly like `evidence` immediately above.
                convergence: null,
                convergenceView: null,
                // 0.8.12 — External Anchor Lifecycle & Stale Evidence
                // Semantics. Keyed by anchorId, each value the ORDERED
                // list of every application/
                // PublicationAnchorVerificationObservation.js this replica
                // has made for that anchor THIS SESSION — appended to,
                // never overwritten, unlike `verifications` above (which
                // still holds only the latest result, exactly as 0.8.3
                // left it, feeding the unchanged badge/label). Ephemeral
                // for the lifetime of this page, exactly like
                // `verifications` and `creationAttempts` — never read
                // from or written to anything durable. See application/
                // PublicationAnchorVerificationObservation.js's own
                // header.
                verificationHistory: {},
                // 0.8.14 — External Evidence Inspection & Locator UX.
                // Keyed by anchorId; ephemeral for the lifetime of this
                // page, exactly like `verifications`/`verificationHistory`
                // above — never read from or written to anything durable,
                // and never touched by loadEvidence()/verifyAnchor(). See
                // toggleInspect()'s own comment below.
                inspections: {},
                // 0.8.11 — Explicit External Anchoring UX. Keyed by
                // anchorType; ephemeral for the lifetime of this page,
                // exactly like `verifications` above — never read from or
                // written to anything durable. See application/
                // ExternalAnchorCreationUiState.js's own header.
                creationAttempts: {}
            })));
            await Promise.all(entries.filter((entry) => !entry.view && !entry.checking).map(resolveEntry));
            entries.forEach(loadEvidence);
        }

        // 0.8.3 — Publication Center: External Evidence UX. DISCOVERY
        // only: a synchronous local catalog read through application/
        // PublicationEvidenceCoordinator.js#discover(), never a call to
        // application/ExternalAnchorVerifier.js. Re-running this is
        // always cheap and safe — it re-reads whatever this replica's
        // catalog currently holds without disturbing `entry.
        // verifications`, the ephemeral per-anchor results a person may
        // already have on screen.
        function loadEvidence(entry) {
            if (!evidenceCoordinator) return;
            entry.evidenceAnchors = evidenceCoordinator.discover(entry.publication.id);
            entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
            recomputeConvergence(entry);
        }

        // 0.8.13 — Multi-Evidence Comparison & Conflict UX. Re-derives
        // `entry.convergence`/`entry.convergenceView` from THIS entry's
        // own `evidenceAnchors` — never a second discovery call, never
        // touching application/ExternalAnchorVerifier.js itself.
        // `verificationByAnchorId` carries this replica's own already-
        // completed local observations (a "checking" in-flight
        // placeholder is never passed through as an outcome) purely so
        // application/PublicationEvidenceConvergence.js's own per-anchor
        // `verification` field stays populated alongside the structural
        // comparison — see that file's own header on why supplying it
        // can never change `contentBindingConflict`/`contentHashGroups`
        // themselves, which application/
        // PublicationEvidenceConvergenceView.js's own `contentGroups`/
        // `hasConflict` reflect unchanged either way.
        function recomputeConvergence(entry) {
            const verificationByAnchorId = {};
            for (const anchorId of Object.keys(entry.verifications)) {
                const result = entry.verifications[anchorId];
                if (result && !result.checking && result.outcome) {
                    verificationByAnchorId[anchorId] = result.outcome;
                }
            }
            entry.convergence = derivePublicationEvidenceConvergence({
                publicationId: entry.publication.id,
                expectedContentHash: entry.publication.contentReference.hash,
                anchors: entry.evidenceAnchors,
                verificationByAnchorId
            });
            entry.convergenceView = publicationEvidenceConvergenceView(entry.convergence);
        }

        function toggleEvidence(entry) {
            entry.evidenceExpanded = !entry.evidenceExpanded;
        }

        // The one place this page calls application/
        // ExternalAnchorVerifier.js (through the coordinator) — always
        // for exactly ONE anchor, always because a person clicked
        // "Verify Evidence" on it. Cross-checks against THIS entry's own
        // publicationId/contentHash, so a mismatched anchor is reported
        // as CONTENT_MISMATCH rather than silently accepted as evidence
        // for the wrong publication.
        async function verifyAnchor(entry, anchorView) {
            const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
            if (!anchor || !evidenceCoordinator) return;
            entry.verifications[anchor.id] = { checking: true };
            entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
            const result = await evidenceCoordinator.verify(anchor, {
                expectedContentHash: entry.publication.contentReference.hash,
                expectedPublicationId: entry.publication.id
            });
            entry.verifications[anchor.id] = { outcome: result.outcome, reason: result.reason };
            entry.evidence = publicationEvidenceView(entry.evidenceAnchors, entry.verifications);
            recomputeConvergence(entry);
            // 0.8.12 — record this attempt as its own observation, on top
            // of whatever this replica already observed for this SAME
            // anchor earlier this session, rather than replacing it — see
            // `verificationHistory`'s own comment above.
            const history = entry.verificationHistory[anchor.id] || (entry.verificationHistory[anchor.id] = []);
            history.push(createVerificationObservation({ anchorId: anchor.id, outcome: result.outcome, reason: result.reason }));
        }

        // 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics.
        // A single, optional sentence shown ALONGSIDE the existing
        // verification badge/label (unchanged) — never a replacement for
        // it. `null` in every case except the one this milestone exists
        // to surface: this anchor was independently verified at some
        // earlier point in this session, and the most recent check came
        // back `PROOF_UNAVAILABLE`. See application/
        // PublicationAnchorVerificationLifecycleView.js's own header.
        function lifecycleNote(entry, anchorView) {
            const lifecycle = deriveAnchorVerificationLifecycle(entry.verificationHistory[anchorView.anchorId]);
            return describeAnchorVerificationLifecycleNote(lifecycle);
        }

        // 0.8.14 — External Evidence Inspection & Locator UX. The one
        // place this page calls application/PublicationAnchorDetailView.js
        // (and, separately, `evidenceViewRegistry`) — always for exactly
        // ONE anchor, always because a person clicked "Inspect Evidence."
        // Both calls are pure and synchronous: nothing here awaits
        // anything, touches evidenceCoordinator/creationCoordinator, or
        // mutates `entry.evidenceAnchors`/`entry.evidence`/
        // `entry.verifications`/`entry.verificationHistory`/
        // `entry.convergence` — see tests/
        // PublicationAnchorInspectionUX.test.js's own invariant section,
        // which asserts exactly this against the real anchor/catalog.
        // Toggling closed keeps the already-computed detail cached rather
        // than discarding it — re-opening never needs to recompute, since
        // nothing about a cataloged PublicationAnchor ever changes in
        // place (core/PublicationAnchor.js's own header).
        function toggleInspect(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId]
                || (entry.inspections[anchorView.anchorId] = { expanded: false, detail: null, typeSpecific: null });
            state.expanded = !state.expanded;
            if (state.expanded && !state.detail) {
                const anchor = entry.evidenceAnchors.find((candidate) => candidate.id === anchorView.anchorId);
                if (!anchor) return;
                state.detail = publicationAnchorDetailView(anchor);
                state.typeSpecific = (evidenceViewRegistry && evidenceViewRegistry.has(anchor.anchorType))
                    ? evidenceViewRegistry.get(anchor.anchorType).describe(anchor)
                    : null;
            }
        }

        function inspectionExpanded(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId];
            return Boolean(state && state.expanded);
        }

        function inspectionDetail(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId];
            return state ? state.detail : null;
        }

        function inspectionTypeSpecific(entry, anchorView) {
            const state = entry.inspections[anchorView.anchorId];
            return state ? state.typeSpecific : null;
        }

        function evidenceBadgeClass(anchorView) {
            if (anchorView.checking) return 'peer-badge--pending';
            if (!anchorView.verified) return 'peer-badge--unchecked';
            return EVIDENCE_BADGE_CLASSES[anchorView.verificationOutcome] || 'peer-badge--unchecked';
        }

        // 0.8.11 — Explicit External Anchoring UX. The one place this
        // page calls application/PublicationAnchorCreationCoordinator.js
        // (through the coordinator) — always for exactly ONE anchorType,
        // always because a person clicked "Create <type> Anchor" on it.
        // Never called from onMounted(), refreshList(), or loadEvidence()
        // — merely opening or refreshing this page never triggers an
        // external recording. See this file's own header and
        // docs/Principles.md, "External Anchoring Is An Explicit User
        // Action (0.8.11)."
        //
        // A thrown error (application/PublicationAnchorCreationCoordinator
        // .js#create() never catches one — see that class's own header)
        // is caught HERE, at the UI boundary, and turned into its own
        // honest display state via application/
        // PublicationAnchorCreationView.js#describeCreationAttempt()
        // rather than crashing the page.
        async function createAnchor(entry, anchorType) {
            if (!creationCoordinator) return;
            entry.creationAttempts[anchorType] = { creating: true, outcome: null, anchor: null, reason: null, error: null };
            try {
                const result = await creationCoordinator.create(entry.publication.id, anchorType);
                entry.creationAttempts[anchorType] = {
                    creating: false, outcome: result.outcome, anchor: result.anchor, reason: result.reason, error: null
                };
                // Re-discover from the catalog so a CREATED anchor
                // immediately appears in the ordinary evidence list below
                // — a purely local catalog read (application/
                // PublicationEvidenceCoordinator.js#discover()), never a
                // verification. See this file's own header, and
                // application/PublicationEvidenceCoordinator.js's own, on
                // why discovery and verification stay two separate calls.
                loadEvidence(entry);
                if (result.outcome === ExternalAnchorCreationOutcome.CREATED) {
                    entry.evidenceExpanded = true;
                }
            } catch (error) {
                entry.creationAttempts[anchorType] = { creating: false, outcome: null, anchor: null, reason: null, error: error.message };
            }
        }

        function creationView(entry, anchorType) {
            return describeCreationAttempt(entry.creationAttempts[anchorType]);
        }

        function creationBadgeClass(entry, anchorType) {
            const state = creationView(entry, anchorType).state;
            return CREATION_BADGE_CLASSES[state] || null;
        }

        function creationButtonLabel(entry, anchorType) {
            const view = creationView(entry, anchorType);
            const hasExisting = entry.evidenceAnchors.some((anchor) => anchor.anchorType === anchorType);
            return describeCreationButtonLabel(humanizeContentKind(anchorType), { creating: view.state === ExternalAnchorCreationUiState.CREATING, hasExisting });
        }

        async function recheck(entry) {
            await resolveEntry(entry);
        }

        async function retrieve(entry) {
            const peers = retrievalPeers.value;
            if (!peers.length) {
                return;
            }
            entry.retrieving = true;
            try {
                entry.view = await resolvePublicationView(entry.publication, { coordinator, kindPlugins, peers });
            } finally {
                entry.retrieving = false;
            }
        }

        function canRetrieve(entry) {
            return Boolean(entry.view && entry.view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE);
        }

        function formatWhen(iso) {
            return iso ? new Date(iso).toLocaleString() : 'unknown time';
        }

        function badgeClass(entry) {
            if (!entry.view) return 'peer-badge--pending';
            return OUTCOME_BADGE_CLASSES[entry.view.outcome] || 'peer-badge--failed';
        }

        function statusLabel(entry) {
            if (entry.checking) return 'Checking…';
            if (!entry.view) return 'Checking…';
            return describePublicationOutcome(entry.view.outcome);
        }

        // 0.7.6 — the "why is this available?" sentence this milestone's
        // own design conversation asked for. Distinguishes "the bytes
        // were already sitting in this device's own ContentStore" from
        // "the bytes just arrived from a connected peer, and were
        // accepted only after their hash matched" — application/
        // PublicationResolutionView.js#describeRetrieval()'s own return
        // value is null in the first case (no retrieval was ever
        // attempted for this view) and a specific sentence in the
        // second, so this function never has to duplicate that logic,
        // only choose between it and the plain "available locally"
        // default.
        function availabilityText(entry) {
            if (!entry.view) return null;
            if (entry.view.outcome === PublicationResolutionOutcome.RESOLVED) {
                return describeRetrieval(entry.view)
                    || "Available locally. The content matching this publication's cryptographic hash is stored on this device.";
            }
            if (entry.view.outcome === PublicationResolutionOutcome.CONTENT_UNAVAILABLE) {
                return describeRetrieval(entry.view)
                    || 'Unavailable locally. The publication is known, but its referenced content is not currently available on this device.';
            }
            return null;
        }

        let unsubscribeReceived = null;
        let unsubscribeContent = null;
        onMounted(async () => {
            loading.value = true;
            await refreshList();
            loading.value = false;
            unsubscribeReceived = publicationPeerExchange
                ? publicationPeerExchange.onPublicationReceived(() => refreshList())
                : null;
            // A newly retrieved hash may belong to more than one
            // cataloged entry (independent publishers pointing at
            // identical bytes — see application/
            // LocalPublicationCatalog.js#findByContentHash()'s own
            // header) — re-check every entry naming that hash, never
            // just the one that happened to trigger the request.
            unsubscribeContent = publicationPeerContentExchange
                ? publicationPeerContentExchange.onContentReceived(({ hash }) => {
                    for (const entry of entries) {
                        if (entry.publication.contentReference.hash === hash) {
                            resolveEntry(entry);
                        }
                    }
                })
                : null;
        });
        onBeforeUnmount(() => {
            if (unsubscribeReceived) unsubscribeReceived();
            if (unsubscribeContent) unsubscribeContent();
        });

        return {
            entries, loading, retrievalPeers, availableAnchorTypes,
            humanizeContentKind, shortId, shortHash, formatWhen, badgeClass, statusLabel, availabilityText,
            canRetrieve, retrieve, recheck,
            describeKnownEvidenceCount, toggleEvidence, verifyAnchor, evidenceBadgeClass, lifecycleNote,
            createAnchor, creationView, creationBadgeClass, creationButtonLabel,
            toggleInspect, inspectionExpanded, inspectionDetail, inspectionTypeSpecific
        };
    },
    template: `
        <section class="publications-view">
            <h1>Publications</h1>
            <p class="form-hint form-hint--neutral">
                Every signed publication this device has cataloged — its own, or one a connected peer
                announced (see <router-link to="/peers">Peers</router-link>). Status is always checked fresh,
                never remembered from last time: cataloging a publication only ever means this device has SEEN
                a validly signed locator, never that its content is sitting here right now.
            </p>
            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                No authenticated peer is connected right now — "Retrieve from Peers" below will do nothing
                until one is. Connect to a peer first from <router-link to="/peers">Peers</router-link>.
            </p>

            <p v-if="loading" class="locations-panel-empty">Checking cataloged publications…</p>
            <p v-else-if="entries.length === 0" class="locations-panel-empty">
                Nothing cataloged yet. Publish a signed attribution or naming claim, or connect to a peer who
                has one, and it will show up here.
            </p>

            <div v-else class="identity-mgmt-list">
                <div v-for="entry in entries" :key="entry.publication.id" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ humanizeContentKind(entry.publication.contentKind) }}</span>
                        <span class="peer-badge" :class="badgeClass(entry)">{{ statusLabel(entry) }}</span>
                    </div>
                    <p class="identity-mgmt-status">
                        Published by {{ shortId(entry.publication.publisherIdentity && entry.publication.publisherIdentity.id) }}
                        · received {{ formatWhen(entry.receivedAt) }}
                    </p>
                    <p v-if="entry.view && entry.view.contentSummary" class="form-hint form-hint--neutral">
                        {{ entry.view.contentSummary }}
                    </p>
                    <p v-if="availabilityText(entry)" class="form-hint form-hint--neutral">
                        {{ availabilityText(entry) }}
                    </p>
                    <p v-else-if="entry.view && entry.view.reason" class="form-hint form-hint--neutral">
                        {{ entry.view.reason }}
                    </p>
                    <p v-if="canRetrieve(entry) && retrievalPeers.length > 0" class="form-hint form-hint--neutral">
                        {{ retrievalPeers.length }} connected peer{{ retrievalPeers.length === 1 ? '' : 's' }} may have this content.
                    </p>

                    <div class="identity-mgmt-actions">
                        <button v-if="canRetrieve(entry)" class="action-btn action-btn--secondary"
                                :disabled="entry.retrieving || retrievalPeers.length === 0" @click="retrieve(entry)">
                            {{ entry.retrieving ? 'Asking peers…' : 'Retrieve from Peers' }}
                        </button>
                        <button class="action-btn action-btn--secondary" :disabled="entry.checking" @click="recheck(entry)">
                            {{ entry.checking ? 'Checking…' : 'Re-check' }}
                        </button>
                    </div>

                    <div v-if="entry.evidence" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">External Evidence</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownEvidenceCount(entry.evidence) }}</span>
                            <button v-if="entry.evidence.count > 0" class="action-btn action-btn--secondary" @click="toggleEvidence(entry)">
                                {{ entry.evidenceExpanded ? 'Hide Evidence' : 'Show Evidence' }}
                            </button>
                        </div>

                        <!-- 0.8.13 — Multi-Evidence Comparison & Conflict UX. Shown only while
                             the per-anchor evidence list below is also expanded — a "how does this
                             evidence relate to itself?" overview, never a substitute for reading the
                             individual anchor cards. Groups are shown in application/
                             PublicationEvidenceConvergence.js's own deterministic order (by
                             contentHash, never by group size) — a group with more anchors is never
                             styled, ordered, or worded as more likely correct than one with fewer. -->
                        <div v-if="entry.evidenceExpanded && entry.convergenceView && entry.convergenceView.anchorCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">Content binding</span>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.convergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ group.anchorCount }} anchor{{ group.anchorCount === 1 ? '' : 's' }}
                                    </span>
                                </div>
                            </div>
                            <p v-if="entry.convergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ entry.convergenceView.conflictDescription }}
                            </p>
                        </div>

                        <!-- 0.8.11 — Explicit External Anchoring UX. One card per anchorType this
                             replica can currently create evidence for (application/
                             PublicationAnchorCreationCoordinator.js#availableAnchorTypes()) — hidden
                             entirely when this replica has no publisher configured, exactly like
                             "Retrieve from Peers" hides with no connected peer. Creating is always a
                             single, explicit click; the result of the most recent attempt is shown
                             here and nowhere else persists it. -->
                        <div v-if="availableAnchorTypes.length > 0" class="evidence-list">
                            <div v-for="anchorType in availableAnchorTypes" :key="anchorType" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeContentKind(anchorType) }}</span>
                                    <span v-if="creationView(entry, anchorType).label" class="peer-badge" :class="creationBadgeClass(entry, anchorType)">
                                        {{ creationView(entry, anchorType).label }}
                                    </span>
                                </div>
                                <p v-if="creationView(entry, anchorType).message" class="form-hint form-hint--neutral">
                                    {{ creationView(entry, anchorType).message }}
                                </p>
                                <p v-if="creationView(entry, anchorType).reason" class="form-hint form-hint--neutral">
                                    {{ creationView(entry, anchorType).reason }}
                                </p>
                                <dl v-if="creationView(entry, anchorType).anchor" class="evidence-fields">
                                    <div class="evidence-field"><dt>Transaction</dt><dd>{{ creationView(entry, anchorType).anchor.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ creationView(entry, anchorType).anchor.contentHash }}</dd></div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="creationView(entry, anchorType).state === 'creating'"
                                            @click="createAnchor(entry, anchorType)">
                                        {{ creationButtonLabel(entry, anchorType) }}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div v-if="entry.evidenceExpanded && entry.evidence.count > 0" class="evidence-list">
                            <div v-for="anchorView in entry.evidence.anchors" :key="anchorView.anchorId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeContentKind(anchorView.anchorType) }}</span>
                                    <span class="peer-badge" :class="evidenceBadgeClass(anchorView)">{{ anchorView.verificationLabel }}</span>
                                </div>
                                <p v-if="anchorView.verificationReason" class="form-hint form-hint--neutral">
                                    {{ anchorView.verificationReason }}
                                </p>
                                <p v-if="lifecycleNote(entry, anchorView)" class="form-hint form-hint--neutral">
                                    {{ lifecycleNote(entry, anchorView) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ anchorView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Recorded</dt><dd>{{ formatWhen(anchorView.anchoredAt) }}</dd></div>
                                    <div class="evidence-field"><dt>Publication</dt><dd>{{ anchorView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    <div v-if="anchorView.anchorIdentityId" class="evidence-field">
                                        <dt>Attested by</dt><dd>{{ shortId(anchorView.anchorIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="toggleInspect(entry, anchorView)">
                                        {{ inspectionExpanded(entry, anchorView) ? 'Hide Details' : 'Inspect Evidence' }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="anchorView.checking"
                                            @click="verifyAnchor(entry, anchorView)">
                                        {{ anchorView.checking ? 'Verifying…' : (anchorView.verified ? 'Verify Again' : 'Verify Evidence') }}
                                    </button>
                                </div>

                                <!-- 0.8.14 — External Evidence Inspection & Locator UX. A purely
                                     local, synchronous read of THIS anchor's own fields — never a
                                     network request, never a call to evidenceCoordinator.verify().
                                     "Inspect Evidence" and "Verify Evidence"/"Verify Again" above
                                     stay two genuinely separate actions, exactly as this file's own
                                     header states. -->
                                <div v-if="inspectionExpanded(entry, anchorView) && inspectionDetail(entry, anchorView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">External Evidence</span>
                                    <p class="form-hint form-hint--neutral">{{ inspectionDetail(entry, anchorView).bindingDescription }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ inspectionDetail(entry, anchorView).anchoredAtLabel }}</dt>
                                            <dd>{{ formatWhen(inspectionDetail(entry, anchorView).anchoredAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>External locator</dt><dd>{{ inspectionDetail(entry, anchorView).locator }}</dd></div>
                                    </dl>

                                    <!-- Only the ONE registered anchorType-specific adapter (e.g.
                                         anchoring/BitcoinAnchorEvidenceView.js) ever produces this
                                         section — a generic anchorType with no adapter shows the
                                         fields above alone. -->
                                    <div v-if="inspectionTypeSpecific(entry, anchorView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ inspectionTypeSpecific(entry, anchorView).summary }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in inspectionTypeSpecific(entry, anchorView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="inspectionTypeSpecific(entry, anchorView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="inspectionTypeSpecific(entry, anchorView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ inspectionTypeSpecific(entry, anchorView).externalLocator.label }}
                                        </a>
                                    </div>

                                    <!-- "proof" is shown raw and unexplained at the generic level —
                                         see application/PublicationAnchorDetailView.js's own header
                                         on why this file never reaches into it. -->
                                    <details class="evidence-inspection-proof">
                                        <summary>Proof (raw, adapter-defined evidence)</summary>
                                        <pre class="evidence-inspection-proof-json">{{ JSON.stringify(inspectionDetail(entry, anchorView).proof, null, 2) }}</pre>
                                    </details>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `
};
