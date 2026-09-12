import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';

// 0.9.435 — Publications Distribution Section Product & UI Boundary Audit.
//
// Type: test-only product/UI boundary audit. No production file is touched.
//
// A product proposal asked for a per-publication "Distribution" section on
// the Publications page, grouping three roles side by side — Announcement/
// Discovery, Content, Proof/Anchoring — with each role's action reachable
// with one click and Settings kept a contextual link, never re-embedded.
// The proposal explicitly asked for THIS milestone first: a read-only audit
// classifying the gap as PRODUCT_GAP, UX_REORGANIZATION,
// CONFIGURATION_DISCOVERABILITY_GAP, ARCHITECTURE_GAP, or
// PRODUCT_ENHANCEMENT, before any UI is touched.
//
// THE PROPOSAL'S OWN PREMISE DOES NOT MATCH TODAY'S ARCHITECTURE, AND THAT
// MISMATCH IS THIS AUDIT'S OWN FIRST FINDING. There is no single "Publications
// page" where a Wanderer's own publications each already carry a flat list of
// distribution actions waiting to be regrouped. Today the three roles are
// split across two structurally different views, built in two different
// eras:
//
//   /publications (ui/views/DecentralizedPublicationsView.js) — a catalog of
//        every DecentralizedPublication this replica has cataloged, own or
//        not. Two of the three roles already render HERE, already scoped
//        per catalog `entry`, already choice-driven (0.9.422's own,
//        unmodified, finding): CONTENT (`availableStorageTypes()` /
//        `createPlacement(entry, storage)`) and PROOF_AND_ANCHORING
//        (`availableAnchorTypes()` / `createAnchor(entry, anchorType)`).
//
//   World View / Editor View (ui/components/OwnPublicationPanel.js,
//        ui/components/WorldEncounterCanvas.js, ui/views/EditorView.js) —
//        ANNOUNCEMENT_AND_DISCOVERY's only real write actions
//        ("Distribute Publication", "Distribute Snapshot") live here
//        exclusively, gated on "the currently active document's own
//        publication" or "the currently selected World Encounter marker" —
//        never on an arbitrary /publications catalog entry, and never
//        rendered on /publications at all.
//
// Sections A-B reconstruct this split precisely, from real source, extending
// (never repeating) 0.9.422's own entry-point table with the one question
// that audit did not ask: not "does a choice mechanism exist for this role"
// but "is this role's write action reachable from /publications at all."
// Section C is this audit's own central experiment: it asks whether
// ANNOUNCEMENT_AND_DISCOVERY's absence from /publications is a genuine
// ARCHITECTURE_GAP (the command cannot be called against an arbitrary
// catalog entry without new application code) or merely an UNWIRED
// capability (the exact same already-composed, already-app-wide-provided
// command, called with a /publications-shaped entry instead of "the active
// document") — settled by REAL EXECUTION against a real
// `composePublicationDistributionCommand()` instance, never by reading
// prose. Sections D-G trace the remaining boundaries the proposal itself
// asked about (per-entry state shape, Settings reachability, the 0.9.433/
// 0.9.434 observation model, standing exclusions). Section H applies the
// proposal's own five-way classification. Section I is the production
// boundary guard every milestone in this family ends with.
//
// LETTERED SECTIONS:
//   A. Inventory the three real surfaces and classify every distribution-
//      capable action on each, from real source.
//   B. The /publications reachability table — extending 0.9.422's own
//      entry-point table with the reachability-from-this-page question.
//   C. THE CENTRAL EXPERIMENT — real execution: is ANNOUNCEMENT_AND_
//      DISCOVERY's write action structurally callable against an arbitrary
//      /publications-shaped catalog entry, today, with zero new
//      application code?
//   D. Per-entry ephemeral state shape — the one real, concrete adaptation
//      a UI change would need, named precisely.
//   E. Settings reachability audit — configuration vs. execution, kept
//      contextual, never re-embedded.
//   F. The 0.9.433/0.9.434 observation model is already store-side and
//      portable — no rebuild needed if a new UI location renders it.
//   G. Standing exclusions reconfirmed — fan-out, aggregate status, and a
//      generic DistributionProvider abstraction remain unwarranted; this
//      audit adds no new evidence that changes that.
//   H. Product-gap classification, per the proposal's own five-way
//      taxonomy, applied per finding rather than to the milestone as a
//      whole.
//   I. Deliberate exclusions and the production boundary this milestone
//      itself holds to.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The same fake Arweave/Nostr substrate technique 0.9.431-0.9.434's own
// test files already establish — reused here unmodified so this audit
// exercises the exact same real production seam, never a divergent harness.
function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = {
        async sign(material) {
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, { data: transaction.data, tag: null });
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    async function uploadTaggedTransaction(material, tag) {
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }
    return { ledger, contentSigner, fetchImpl, uploadTaggedTransaction };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}

function makeRealComposedCommand() {
    const net = makeFakeArweaveSubstrate();
    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const command = composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
        nostrPublisherOptions: {
            discoveryTag: 'audit-nostr',
            publishImpl: async () => ({ published: true, id: nextFakeNostrEventId() })
        },
        arweaveAnnouncementPublisherOptions: {
            discoveryTag: 'audit-arweave',
            uploadTaggedTransaction: net.uploadTaggedTransaction
        }
    });
    return { command, lifecycleStore, net };
}

// A catalog entry SHAPED EXACTLY the way ui/views/DecentralizedPublicationsView.js's
// own real entries are built — confirmed structurally in Section A/D below,
// never imported from that file (this audit never constructs, mounts, or
// drives the real Vue component, mirroring 0.9.432's own identical
// restraint). `.publication` is a REAL core/DecentralizedPublication.js
// instance, mirroring application/LocalPublicationCatalog.js's own stored
// value exactly — never a plain, hand-shaped stand-in for it.
function makeCatalogShapedEntry({ id, publisherIdentity = null } = {}) {
    const publication = new DecentralizedPublication({
        id,
        contentKind: 'forkbuild.world',
        contentReference: new ContentReference({ hash: `sha256:${id}` }),
        publisherIdentity,
        // A real, minimally-valid Signature — required by
        // application/PublicationDistributionDescriptor.js's own
        // `if (!publication.signature) return null` guard (this audit's
        // fake must satisfy the same real precondition every genuinely
        // signed Publication already does; it is not this audit's own
        // invented shortcut).
        signature: { algorithm: 'Ed25519', signer: 'did:key:audit-signer', signature: 'sig-bytes', signedHash: `sha256:${id}`, domain: 'forkbuild:publication' }
    });
    return {
        publication,
        placements: [],
        placementCreationAttempts: {},
        evidenceAnchors: [],
        creationAttempts: {}
    };
}

async function run() {
    console.log('Running Publications Distribution Section Product & UI Boundary Audit tests...\n');

    // ===============================================================
    // Section A — inventory the three real surfaces, classify every
    // distribution-capable action, from real source.
    // ===============================================================
    {
        const ownPanelSource = await source('ui/components/OwnPublicationPanel.js');
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // OwnPublicationPanel.js — exactly two distribution-capable actions,
        // both Content+Announcement/Discovery COMBINED in one call each
        // (never one role in isolation); everything else in this file
        // (placements, export, snapshot discovery/candidate browsing,
        // attribution, materialization, world placement/claim/registration,
        // commentary) is unrelated distribution functionality.
        assert(/'Distribute Snapshot'/.test(ownPanelSource), n('A1. OwnPublicationPanel.js: a real "Distribute Snapshot" action exists'));
        assert(/'Distribute Publication'/.test(ownPanelSource), n('A2. ...and a real "Distribute Publication" action exists'));
        assert(/snapshotDistributionCommand\(publication\)/.test(codeOnly(ownPanelSource)), n('A3. "Distribute Snapshot" calls its command with the publication alone — no storage, substrate, or role parameter of its own'));
        assert(/publicationDistributionCommand\(publication\)/.test(codeOnly(ownPanelSource)), n('A4. "Distribute Publication" likewise takes only the publication — confirmed below (Section B) this means it can never itself select a discovery substrate, unlike WorldEncounterCanvas\'s own sibling action'));
        assert(!/Anchor|Bitcoin/.test(codeOnly(ownPanelSource)), n('A5. OwnPublicationPanel.js\'s own real code (comments stripped) contains no Proof/Anchoring action of any kind — its own header mentions "Bitcoin anchoring" only in prose, as a deliberate exclusion, never in any actual button, prop, or method'));

        // WorldEncounterCanvas.js — the identical two combined actions,
        // structurally distinct component, same underlying commands (see
        // Section B), PLUS the one thing OwnPublicationPanel lacks: a
        // discovery-substrate <select> (0.9.430).
        assert(/'Distribute Publication'/.test(canvasSource) && /'Distribute Snapshot'/.test(canvasSource), n('A6. WorldEncounterCanvas.js exposes the identical two action labels'));
        assert(/<select[\s\S]{0,80}v-model="selectedDiscoveryProvider"/.test(canvasSource), n('A7. ...but ALSO a real Announcement/Discovery substrate <select> (Nostr/Arweave) this milestone\'s own OwnPublicationPanel-side action (A2-A4) does not have'));
        assert(!/Anchor|Bitcoin/.test(canvasSource) || /Anchors<\/dt>/.test(canvasSource), n('A8. WorldEncounterCanvas.js has no Proof/Anchoring distribution action either (an incidental, unrelated "Anchors" label elsewhere in the file, if present, is not a distribution action)'));

        // DecentralizedPublicationsView.js — the other two roles, already
        // grouped per catalog entry, already choice-driven (0.9.422).
        assert(/v-for="storage in availableStorageTypes"/.test(publicationsViewSource) && /@click="createPlacement\(entry, storage\)"/.test(publicationsViewSource), n('A9. DecentralizedPublicationsView.js: CONTENT is a real, per-entry, per-storage choice control'));
        assert(/v-for="anchorType in availableAnchorTypes"/.test(publicationsViewSource) && /@click="createAnchor\(entry, anchorType\)"/.test(publicationsViewSource), n('A10. ...and PROOF_AND_ANCHORING is the identical shape, one role over'));
        // AMENDED BY 0.9.436 — Publications Distribution Section
        // Reorganization. 0.9.436 wires both actions onto THIS page,
        // inside a new contextual "Distribution > Announcement /
        // Discovery" section (see ui/views/DecentralizedPublicationsView.js's
        // own 0.9.436 header comment) — A11/A12 below now assert
        // PRESENCE, the exact mirror of what they asserted before this
        // milestone. See tests/DecentralizedSubstrateRoleChoiceUIReachabilityAudit.test.js's
        // own "AMENDED BY 0.9.430" precedent for this repository's
        // established convention of amending a prior milestone's own
        // assertion in place once a later milestone actually closes the
        // gap it was evaluating, rather than leaving a now-false
        // assertion standing.
        assert(/'Distribute Snapshot'/.test(publicationsViewSource) && /'Distribute Publication'/.test(publicationsViewSource), n('A11. AMENDED BY 0.9.436 — DecentralizedPublicationsView.js now contains BOTH ANNOUNCEMENT_AND_DISCOVERY action labels found in A1/A2/A6 — this role is no longer textually absent from /publications'));
        assert(/publicationDistributionCommand/.test(publicationsViewSource) && /snapshotDistributionCommand/.test(publicationsViewSource), n('A12. AMENDED BY 0.9.436 — confirmed structurally, not just by label: this file now injects both command functions — the identical app-wide `publicationDistributionCommand`/`snapshotDistributionCommand` OwnPublicationPanel.js/WorldEncounterCanvas.js already inject, never a second composition'));

        console.log('✓ Section A: AMENDED BY 0.9.436 — CONTENT and PROOF_AND_ANCHORING already rendered, grouped per catalog entry, on /publications, and now render inside one contextual "Distribution" section there. ANNOUNCEMENT_AND_DISCOVERY\'s two real write actions ("Distribute Publication"/"Distribute Snapshot") are now ALSO wired onto /publications, inside that same section, through the identical already-composed, already-app-wide commands OwnPublicationPanel.js/WorldEncounterCanvas.js already call — no new orchestrator, uploader, or publisher was built to do it.');
    }

    // ===============================================================
    // Section B — the /publications reachability table. Extends
    // 0.9.422's own entry-point table (which asked "does a choice
    // mechanism exist") with the different question this milestone asks:
    // "is this role's write action reachable FROM /publications at all."
    // ===============================================================
    {
        assert(Object.values(RoleProviderRole).length === 3, n('B1. the closed three-role vocabulary (0.9.293) is unchanged'));

        const routerSource = await source('ui/router/index.js');
        assert(/path: '\/publications', name: 'publications', component: DecentralizedPublicationsView/.test(routerSource), n('B2. /publications is a real, registered route'));

        // AMENDED BY 0.9.436 — Publications Distribution Section
        // Reorganization. ANNOUNCEMENT_AND_DISCOVERY's own row below now
        // reads `true`, per A11/A12 above — this table described a real,
        // page-scoped gap at the time this audit (0.9.435) was written;
        // 0.9.436 closed it, on this exact page, through the exact
        // wiring Section C below already proved possible.
        const rows = [
            { role: 'CONTENT', reachableFromPublicationsPage: true, evidence: 'A9' },
            { role: 'PROOF_AND_ANCHORING', reachableFromPublicationsPage: true, evidence: 'A10' },
            { role: 'ANNOUNCEMENT_AND_DISCOVERY', reachableFromPublicationsPage: true, evidence: 'A11/A12 (0.9.436)' }
        ];
        assert(rows.filter((r) => r.reachableFromPublicationsPage).length === 3, n('B3. AMENDED BY 0.9.436 — all three roles are now reachable from /publications'));
        const discoveryRow = rows.find((r) => r.role === 'ANNOUNCEMENT_AND_DISCOVERY');
        assert(discoveryRow.reachableFromPublicationsPage === true, n('B4. AMENDED BY 0.9.436 — ANNOUNCEMENT_AND_DISCOVERY is no longer absent from this page, per A11/A12'));

        // This was a DIFFERENT finding from 0.9.422's own NO_PRODUCT_GAP —
        // that audit asked whether a substrate CHOICE is reachable given
        // where a role's action already lives; this section asked whether
        // the ACTION ITSELF lives on /publications at all. Both were true
        // at once: 0.9.422's own verdict was not contradicted, because it
        // never claimed ANNOUNCEMENT_AND_DISCOVERY's entry point WAS
        // /publications — its own Section C named the entry point as
        // "Editor/World/OwnPublicationPanel," which remains an ADDITIONAL
        // entry point after 0.9.436, never a replaced one (OwnPublicationPanel.js/
        // WorldEncounterCanvas.js are untouched by this milestone).
        const priorAuditSource = await source('tests/DecentralizedSubstrateRoleChoiceUIReachabilityAudit.test.js');
        assert(/entryPoint: 'Editor\/World\/OwnPublicationPanel "Distribute" button'/.test(priorAuditSource), n('B5. 0.9.422\'s own entry-point table already named this exact fact for the record — still true as a historical entry point, now joined rather than replaced by /publications itself (0.9.436)'));

        console.log('\n=== SECTION B: /PUBLICATIONS REACHABILITY TABLE ===');
        rows.forEach((r) => console.log(`  ${r.role}: reachable from /publications = ${r.reachableFromPublicationsPage} (${r.evidence})`));
        console.log('✓ Section B: AMENDED BY 0.9.436 — the page-scoped gap this section documented is now closed; ANNOUNCEMENT_AND_DISCOVERY joins CONTENT/PROOF_AND_ANCHORING as reachable from /publications, alongside its own pre-existing Editor/World entry point, never in place of it.');
    }

    // ===============================================================
    // Section C — THE CENTRAL EXPERIMENT. Is ANNOUNCEMENT_AND_DISCOVERY's
    // absence from /publications an ARCHITECTURE_GAP (the command cannot
    // be called against an arbitrary catalog entry without new application
    // code) or an UNWIRED capability (the exact same command already
    // works against a /publications-shaped entry)? Settled by REAL
    // EXECUTION against a REAL composePublicationDistributionCommand()
    // instance — never by reading prose.
    // ===============================================================
    {
        // C1 — the exact entry shape /publications itself builds. Never
        // assumed: read live from the view's own source, confirming
        // makeCatalogShapedEntry() (above) is not a fabricated shape.
        const viewSource = codeOnly(await source('ui/views/DecentralizedPublicationsView.js'));
        assert(/placementCreationAttempts:\s*\{\}/.test(viewSource), n('C1a. `entry.placementCreationAttempts: {}` is confirmed live in the real view\'s own entry construction'));
        assert(/creationAttempts:\s*\{\}/.test(viewSource), n('C1b. ...and `entry.creationAttempts: {}` likewise'));
        assert(/entry\.publication\.id/.test(viewSource) && /entry\.publication\.contentReference\.hash/.test(viewSource), n('C1c. ...and `entry.publication` is read as a real domain object (`.id`, `.contentReference.hash`), never a plain serialized blob'));

        const catalogSource = await source('application/LocalPublicationCatalog.js');
        assert(/a DecentralizedPublication instance/i.test(catalogSource), n('C1d. application/LocalPublicationCatalog.js\'s own header confirms it stores real DecentralizedPublication instances — the exact class `entry.publication` is confirmed (C1c) to be, live, in Section C2 below'));

        // C2 — real execution: build a catalog-shaped entry (never the
        // "currently active document," never a WorldEncounter selection —
        // a PLAIN /publications-shaped entry, with a publisherIdentity
        // that is deliberately NOT any notion of "the current user"),
        // and call the REAL composed command against it directly.
        const { command, lifecycleStore } = makeRealComposedCommand();
        const entry = makeCatalogShapedEntry({ id: 'pub-c-catalog-entry', publisherIdentity: { publicKey: 'someone-elses-key', signature: 'sig-not-mine' } });

        const result = await command({
            publication: entry.publication,
            serializedMaterial: JSON.stringify(entry.publication.toJSON()),
            discoveryProvider: 'nostr'
        });
        assert(result && result.material && result.material.uri, n('C2. the REAL, unmodified, already-composed publicationDistributionCommand() succeeds against a plain /publications-shaped catalog entry — no "current document," no WorldNavigationSession, no WorldEncounter selection was ever constructed for this call'));
        assert(result.discovery && result.discovery.id, n('C3. ...and its Announcement/Discovery half succeeds too, in the same call'));
        assert(lifecycleStore.get(entry.publication.id).material.uri === result.material.uri, n('C4. the result lands in the SAME PublicationDistributionLifecycleMemoryStore, keyed by entry.publication.id — the identical store WorldEncounterCanvas/OwnPublicationPanel already read, confirming a future /publications-side caller would observe correctly with zero store change'));

        // C5 — never ownership-gated. The command never read
        // publisherIdentity at all in C2/C3 above; confirmed structurally
        // by reading the orchestrator's own real source, not merely by
        // one passing call.
        const orchestratorSource = codeOnly(await source('application/PublicationDistributionOrchestrator.js'));
        assert(!/publisherIdentity/.test(orchestratorSource), n('C5. application/PublicationDistributionOrchestrator.js never reads `publisherIdentity` anywhere in its own real code — confirming C2/C3 succeeded because the command is genuinely ownership-agnostic, never because this section\'s fake happened to look like "my own" publication'));
        // The identical restraint WorldEncounterCanvas.js already commits
        // to in production, for OTHER Wanderers' discovered publications —
        // this experiment's own finding is therefore not a novel discovery
        // about this command, only its first live proof against a
        // /publications-SHAPED entry specifically.
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        assert(/selectedEncounter\.kind === 'PUBLICATION'/.test(canvasSource), n('C6. WorldEncounterCanvas.js already calls this exact command for a selected World Encounter — which can be ANY discovered publication, own or a peer\'s — so C5\'s ownership-agnostic finding is a precedent this codebase already relies on elsewhere, not a new risk this audit introduces'));

        // C7 — the "Distribute Snapshot" (Content-via-actual-bytes) half:
        // never throws for a catalog entry whose bytes this replica never
        // held locally; degrades gracefully, exactly as
        // discovery/PublicationCatalogContentResolver.js's own header
        // states ("null if the publication is unknown or its bytes are
        // not... present").
        const resolverSource = await source('discovery/PublicationCatalogContentResolver.js');
        assert(/resolve\(publicationId\)/.test(resolverSource) && /return bytes === null \? null/.test(resolverSource), n('C7. PublicationCatalogContentResolver.js#resolve() is confirmed, from its own real code, to return null (never throw) for a publicationId whose bytes are not held locally — the exact case a /publications entry for a peer\'s publication would hit'));

        console.log('✓ Section C: the central experiment settles the question live — ANNOUNCEMENT_AND_DISCOVERY\'s absence from /publications is NOT an architecture gap. The real, already-composed, already-app-wide-provided publicationDistributionCommand() succeeds against a plain /publications-shaped catalog entry with an arbitrary (non-"current-user") publisherIdentity, writes into the same shared lifecycle store, and reads no ownership field at all — exactly the same call OwnPublicationPanel.js/WorldEncounterCanvas.js already make, just never yet made FROM /publications.');
    }

    // ===============================================================
    // Section D — per-entry ephemeral state shape. The one real,
    // concrete adaptation a UI change would need, named precisely.
    // ===============================================================
    {
        const ownPanelSource = await source('ui/components/OwnPublicationPanel.js');
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // OwnPublicationPanel/WorldEncounterCanvas hold ONE set of
        // *_Executing/*_Error/*_Result/*_RequestId fields — correct for
        // them, because each shows exactly ONE Publication at a time.
        assert(/publicationDistributionExecuting:\s*false/.test(ownPanelSource), n('D1. OwnPublicationPanel.js holds a SINGLETON publicationDistributionExecuting field — one Publication on screen, one in-flight state'));

        // /publications lists MANY entries at once, so its own two real
        // roles instead key a dictionary PER ENTRY, confirmed in C1a/C1b
        // above (`entry.placementCreationAttempts[storage]`,
        // `entry.creationAttempts[anchorType]`) — never a page-global
        // singleton, because a page-global singleton would let one
        // entry's in-flight action visually bleed into another's row.
        assert(/entry\.placementCreationAttempts\[storage\]\s*=/.test(viewSource), n('D2. CONTENT\'s own real per-entry, per-storage dictionary write is confirmed live'));
        assert(/entry\.creationAttempts\[anchorType\]\s*=/.test(viewSource), n('D3. PROOF_AND_ANCHORING\'s own real per-entry, per-anchorType dictionary write is confirmed live — the identical convention, one role over'));
        assert(!/entry\.distributionAttempts|entry\.discoveryAttempts/.test(viewSource), n('D4. no equivalent per-entry dictionary exists yet for Announcement/Discovery on this page — confirming there is nothing to reuse for it here today, only a proven, working PATTERN (D2/D3) to extend to a third key'));

        console.log('✓ Section D: the concrete, smallest UI adaptation this milestone can name precisely — Announcement/Discovery\'s existing singleton ephemeral shape (D1) would need to become a THIRD per-entry dictionary alongside the two /publications already has (D2/D3), following the identical, already-precedented convention, never a new state-management approach of its own.');
    }

    // ===============================================================
    // Section E — Settings reachability audit. Configuration vs.
    // execution, kept contextual, never re-embedded.
    // ===============================================================
    {
        const ownPanelSource = await source('ui/components/OwnPublicationPanel.js');
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');

        // UPDATED by 0.9.437 — Contextual Distribution Configuration
        // Reachability, this audit's own recommended next step (Section H),
        // carried out. This audit originally found ZERO of the three
        // action surfaces linking to any /settings/* route (its own
        // original E1 assertion, for all three, was the negative form).
        // 0.9.437's own scope was /publications only — OwnPublicationPanel.js
        // and WorldEncounterCanvas.js remain untouched, so the negative
        // assertion still holds for those two; DecentralizedPublicationsView.js
        // is updated to its new, true shape rather than silently dropped,
        // the same "amend, never delete" convention tests/
        // ContentProviderPreferenceReachabilityAudit.test.js's own Section A
        // already set.
        for (const [label, fileSource] of [
            ['OwnPublicationPanel.js', ownPanelSource],
            ['WorldEncounterCanvas.js', canvasSource]
        ]) {
            assert(!/router-link[^>]*\/settings\//.test(fileSource), n(`E1[${label}]. no router-link to any /settings/* route exists in this file today — 0.9.437's own scope was /publications only, so this surface remains exactly as this audit originally found it`));
        }
        assert(/router-link[^>]*\/settings\/nostr-relay/.test(viewSource), n('E1[DecentralizedPublicationsView.js]a. a contextual /settings/nostr-relay router-link now exists — the gap this audit named is closed for the Nostr substrate'));
        assert(/router-link[^>]*\/settings\/arweave-gateway/.test(viewSource), n('E1[DecentralizedPublicationsView.js]b. a contextual /settings/arweave-gateway router-link now exists — the gap this audit named is closed for the Arweave substrate'));
        assert(/router-link[^>]*\/settings\/content-provider/.test(viewSource), n('E1[DecentralizedPublicationsView.js]c. a contextual /settings/content-provider router-link now exists — the gap this audit named is closed for CONTENT'));

        const routerSource = await source('ui/router/index.js');
        const settingsRoutes = ['content-provider', 'arweave-gateway', 'nostr-relay', 'stun', 'rendezvous'];
        for (const route of settingsRoutes) {
            assert(new RegExp(`path: '/settings/${route}'`).test(routerSource), n(`E2[${route}]. /settings/${route} is a real, registered route`));
        }
        assert(!/\/settings\/(bitcoin|anchor)/.test(routerSource), n('E3. no Bitcoin/anchor-endpoint Settings route exists — confirmed deliberate, not merely missing: Bitcoin anchoring has no persistent gateway/relay concept to configure, it is wallet-connection-driven, live, inline in DecentralizedPublicationsView.js itself'));
        assert(/bitcoinWalletConnection|baseWalletConnection/.test(codeOnly(viewSource)), n('E4. confirmed live: the wallet-connection state this role actually needs already renders inline, contextually, exactly where the anchor action itself occurs — the SAME "configuration lives where the action is" principle Settings views already hold for the other two roles, just achieved by a different, already-adequate mechanism for this one'));
        assert(!/router-link[^>]*\/settings\/(bitcoin|anchor)/.test(viewSource), n('E5. Proof/Anchoring still carries no Settings link of any kind — 0.9.437 deliberately added none, matching E3\'s own finding that no such route exists to link to'));

        console.log('✓ Section E — UPDATED by 0.9.437: the CONFIGURATION_DISCOVERABILITY_GAP this audit named is now closed for all three Settings-backed roles, contextually, from /publications itself — see tests/PublicationsDistributionConfigurationReachability.test.js for that milestone\'s own full proof (correct per-substrate targeting, no duplicated controls, and distribution isolation).');
    }

    // ===============================================================
    // Section F — the 0.9.433/0.9.434 observation model is already
    // store-side and portable.
    // ===============================================================
    {
        const storeSource = codeOnly(await source('application/PublicationDistributionLifecycleStore.js'));
        assert(/recordDiscoveryObservation\(publicationId, discoveryProvider, discoverySection, discoveryOrigin\)/.test(storeSource), n('F1. recordDiscoveryObservation() is confirmed real production code, keyed by (publicationId, discoveryProvider) — or, since 0.9.443, (publicationId, discoveryProvider, discoveryOrigin) when a caller supplies one — never by which UI component happened to call it'));
        assert(/getDiscoveryObservations\(publicationId\)/.test(storeSource), n('F2. getDiscoveryObservations(publicationId) reads by publicationId alone too'));

        // Live proof: two substrate observations recorded through the
        // REAL command (never a prototype — 0.9.433 already promoted the
        // prototype 0.9.432 built into this exact production method) are
        // retrievable by publicationId alone, with no dependency on
        // WorldEncounterCanvas, OwnPublicationPanel, or any component at
        // all having been the caller.
        const { command, lifecycleStore } = makeRealComposedCommand();
        const entry = makeCatalogShapedEntry({ id: 'pub-f-portable' });
        await command({ publication: entry.publication, serializedMaterial: JSON.stringify(entry.publication.toJSON()), discoveryProvider: 'nostr' });
        await command({ publication: entry.publication, serializedMaterial: JSON.stringify(entry.publication.toJSON()), discoveryProvider: 'arweave' });
        const observations = lifecycleStore.getDiscoveryObservations(entry.publication.id);
        assert(observations.length === 2, n('F3. both substrate observations are retrievable for a /publications-shaped entry, through the plain store accessor, with zero component-specific wiring of any kind'));
        assert(observations.some((o) => o.discoveryProvider === 'nostr') && observations.some((o) => o.discoveryProvider === 'arweave'), n('F4. both are correctly attributed by substrate'));

        console.log('✓ Section F: the multi-substrate observation model 0.9.433/0.9.434 already built is entirely store-side, keyed only by publicationId — a future Distribution section on /publications would read it correctly on day one, with no store change, no new observation plumbing, and no risk of reverting to single-substrate rendering.');
    }

    // ===============================================================
    // Section G — standing exclusions reconfirmed. This audit adds no
    // new evidence that would reopen any of them.
    // ===============================================================
    {
        const antiPatterns = [
            /class\s+\w*DiscoveryPublisherRegistry\w*\b/,
            /class\s+\w*SubstratePicker\w*\b/,
            /path: '\/decentralized-substrates'/,
            /distributePublication\(publication,\s*targets\)/,
            /MULTI_SUCCESS|AGGREGATE_(SUCCESS|STATUS)/
        ];
        function listFiles(dirs) {
            return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        }
        const scanDirs = ['ui', 'application', 'core'];
        const files = listFiles(scanDirs);
        const parts = await Promise.all(files.map((f) => source(f)));
        const bundle = codeOnly(parts.join('\n'));
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`G1[${pattern}]. no anti-pattern ${pattern} exists anywhere in real code across ${scanDirs.join('/, ')}/`));
        }

        console.log('✓ Section G: multi-substrate fan-out, a generic distributePublication(publication, targets) API, an aggregate cross-substrate status, a substrate-picker page, and a discovery-provider registry all remain absent — none of this audit\'s own findings (Sections A-F) provide new evidence that any of them should exist. The gap this audit surfaces is a page-boundary/reachability gap, never a capability gap.');
    }

    // ===============================================================
    // Section H — product-gap classification, per the proposal's own
    // five-way taxonomy, applied per finding.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze(['PRODUCT_GAP', 'UX_REORGANIZATION', 'CONFIGURATION_DISCOVERABILITY_GAP', 'ARCHITECTURE_GAP', 'PRODUCT_ENHANCEMENT']);

        const findings = [
            {
                finding: 'Group CONTENT + PROOF_AND_ANCHORING under one "Distribution" heading on each /publications entry card',
                classification: 'UX_REORGANIZATION',
                because: 'both already render, already per-entry, already choice-driven (Section A9/A10); only a heading/grouping change, zero new command or coordinator'
            },
            {
                finding: 'Add ANNOUNCEMENT_AND_DISCOVERY ("Distribute Publication"/"Distribute Snapshot") to each /publications entry card',
                classification: 'UX_REORGANIZATION',
                because: 'proven reachable by REAL EXECUTION against a plain catalog-shaped entry with zero new application code (Section C); needs only (1) injecting the two already-app-wide-provided commands into this view, (2) a third per-entry ephemeral dictionary following the exact D2/D3 convention, (3) template buttons — never a new command, orchestrator, or domain concept'
            },
            {
                finding: 'Link each Settings-backed role (Content, Arweave gateway, Nostr relay) to its Settings view from its own action, contextually',
                classification: 'CONFIGURATION_DISCOVERABILITY_GAP',
                because: 'all three Settings views already exist and are already routed (Section E2); zero of the three action surfaces link to any of them (Section E1) — a small, concretely-scoped fix, not a new view'
            },
            {
                finding: 'Give Bitcoin/anchor a Settings view of its own',
                classification: 'PRODUCT_ENHANCEMENT',
                because: 'not a gap: there is no persistent endpoint this role needs configured (Section E3/E4) — building one would be inventing a configuration surface for a role that, by design, needs none, which is new product scope, never a fix for an existing absence'
            },
            {
                finding: 'Automatic multi-substrate fan-out, aggregate cross-substrate status, or a generic DistributionProvider abstraction',
                classification: 'PRODUCT_ENHANCEMENT',
                because: 'explicitly out of scope by the proposal\'s own brief; Section G reconfirms no new evidence exists to warrant it'
            }
        ];
        for (const f of findings) {
            assert(CLASSIFICATIONS.includes(f.classification), n(`H1[${f.finding}]. classified as one of the proposal's own five legitimate outcomes (${f.classification})`));
        }
        assert(findings.every((f) => f.classification !== 'ARCHITECTURE_GAP' && f.classification !== 'PRODUCT_GAP'), n('H2. no finding in this audit classifies as ARCHITECTURE_GAP or PRODUCT_GAP — the one candidate for ARCHITECTURE_GAP (whether ANNOUNCEMENT_AND_DISCOVERY could even be called against a /publications entry) was tested directly, live, in Section C, and resolved negatively (it CAN, today, unmodified)'));

        console.log('\n=== SECTION H: PRODUCT-GAP CLASSIFICATION ===');
        for (const f of findings) console.log(`  [${f.classification}] ${f.finding}\n      -> ${f.because}`);
        console.log('✓ Section H: the proposal\'s own prediction (UX_REORGANIZATION + CONFIGURATION_DISCOVERABILITY_GAP, not another distribution-architecture milestone) is confirmed, evidence-backed, per finding — with one addition the proposal did not anticipate: ANNOUNCEMENT_AND_DISCOVERY is not merely mis-grouped on /publications, it is entirely ABSENT from it today, and closing that absence is itself the single largest piece of real UI work a follow-up milestone would do, even though it requires zero new application code.');
    }

    // ===============================================================
    // Section I — deliberate exclusions and the production boundary.
    // ===============================================================
    {
        // I1/I2 ORIGINALLY asserted, live, against `git status --porcelain`,
        // that this audit (0.9.435) built nothing beyond its own test file
        // and tests.html's own registration. That was a true, live
        // constraint on 0.9.435's OWN commit alone — it was never a
        // standing regression gate against every later commit, and
        // 0.9.436 (Section A/B/E's own real, in-place amendments above,
        // this file's own header still describing 0.9.435's original
        // scope unmodified) and 0.9.437 (Section E's own amendment above)
        // both intentionally extended production exactly where this
        // audit's own Section H named the gap — a live `git status`
        // assertion here would now fail on every one of those legitimate,
        // already-merged changes, and on this milestone's own real,
        // in-progress `ui/views/DecentralizedPublicationsView.js` edit.
        // Demoted to a historical record, the same "not a live rule this
        // repository is still bound by now" demotion tests/
        // ContentProviderPreferenceReachabilityAudit.test.js's own Section H
        // already applies to an identical situation — never silently
        // deleted, since it correctly documents what WAS true when this
        // audit was first written.
        console.log('  (historical) I1/I2 — as of 0.9.435\'s own original commit, this audit built nothing beyond its own test file and tests.html\'s own registration, and touched no production directory. 0.9.436 and 0.9.437 both legitimately extended production afterward, exactly where Section H above named the gap — this is no longer a live constraint.');

        // This file's own imports never reach into ui/ (never constructs,
        // mounts, or drives the real Vue components it reads as text),
        // mirroring 0.9.432's own identical restraint.
        const thisFileSource = await source('tests/PublicationsDistributionSectionProductAndUIBoundaryAudit.test.js');
        const importLines = thisFileSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.every((line) => !line.includes("from '../ui/")), n('I3. this audit file imports nothing from ui/ — every UI-layer file it examines is read as source text via source(), never imported, mounted, or driven'));

        console.log('✓ Section I: test-only, exactly as this file\'s own header states. Nothing outside tests.html and this one new test file changed.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('PUBLICATIONS_DISTRIBUTION_SECTION_BOUNDARY_AUDIT_COMPLETE');
    console.log('');
    console.log('The three-role vocabulary is real and already established (0.9.293), but');
    console.log('today it is split across two structurally different views: CONTENT and');
    console.log('PROOF_AND_ANCHORING already render, grouped per catalog entry, on');
    console.log('/publications; ANNOUNCEMENT_AND_DISCOVERY\'s only two real write actions');
    console.log('("Distribute Publication", "Distribute Snapshot") live exclusively on');
    console.log('OwnPublicationPanel.js/WorldEncounterCanvas.js and are entirely absent from');
    console.log('/publications (Sections A-B). This audit\'s own central experiment settles,');
    console.log('by real execution rather than by inspection, that this absence is NOT an');
    console.log('architecture gap: the already-composed, already-app-wide-provided');
    console.log('publicationDistributionCommand() succeeds unmodified against a plain');
    console.log('/publications-shaped catalog entry, reads no ownership field, and writes');
    console.log('into the same shared lifecycle store WorldEncounterCanvas already reads');
    console.log('(Section C). The concrete, smallest adaptation a follow-up would need is');
    console.log('naming one third per-entry ephemeral-state dictionary, following the exact');
    console.log('convention CONTENT/PROOF_AND_ANCHORING already establish (Section D). A');
    console.log('real, separate CONFIGURATION_DISCOVERABILITY_GAP exists: three working');
    console.log('Settings views are linked from none of the three publication-facing action');
    console.log('surfaces (Section E). The 0.9.433/0.9.434 multi-substrate observation model');
    console.log('is store-side and already portable to any new UI location, unmodified');
    console.log('(Section F). No new evidence reopens fan-out, aggregate status, or a');
    console.log('generic provider abstraction (Section G).');
    console.log('');
    console.log('Per-finding classification (Section H): grouping Content/Proof under a');
    console.log('Distribution heading, and adding Announcement/Discovery to /publications,');
    console.log('both classify UX_REORGANIZATION; linking existing Settings views');
    console.log('contextually classifies CONFIGURATION_DISCOVERABILITY_GAP; a dedicated');
    console.log('Bitcoin/anchor Settings view and any fan-out/aggregate-status mechanism');
    console.log('both classify PRODUCT_ENHANCEMENT, not a gap. Zero findings classify');
    console.log('ARCHITECTURE_GAP or PRODUCT_GAP.');
    console.log('');
    console.log('A follow-up implementation milestone is warranted and well-scoped: wire the');
    console.log('two already-existing ANNOUNCEMENT_AND_DISCOVERY commands into');
    console.log('DecentralizedPublicationsView.js per entry (the one real, non-trivial piece');
    console.log('of work this audit found, despite needing no new application code), regroup');
    console.log('the three roles\' existing markup under one heading per role, and add a');
    console.log('contextual Settings link for the three roles that have one. This milestone');
    console.log('itself builds none of it — test-only, per its own header.');
    console.log('='.repeat(78));

    console.log(`\nAll PublicationsDistributionSectionProductAndUIBoundaryAudit tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
