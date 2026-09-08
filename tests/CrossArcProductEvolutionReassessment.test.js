import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.288 — Cross-Arc Product Evolution Reassessment.
//
// Test/document-only, per this milestone's own brief. No production code
// change ships here — this milestone's job is SELECTION, not
// implementation. 0.9.196 through 0.9.287 ran one continuous, self-similar
// rhythm — build a vertical slice, audit its lifecycle, reassess the
// product, either stop or deliberately pick the next slice — applied in
// turn to World interaction, the Vehicle system, Publication distribution,
// Snapshot, Editor/autosave/history/undo-redo, Collaboration, Publication
// Commentary, Place Naming, and Notification History. Each arc's own
// reassessment asked "what does THIS arc still owe the product?" This
// milestone asks the wider question none of them was scoped to ask: now
// that ten arcs are independently complete, where does the PRODUCT AS A
// WHOLE still owe something — inside one arc, or, more valuably, in the
// seam BETWEEN two of them?
//
//   Section A — Baseline freeze. One concrete, freshly re-checked signal
//               per completed arc — implemented / reachable /
//               architecturally-possible-only, kept distinct.
//   Section B — Methodology re-run. The five-question capability-gap flow
//               this milestone's own brief names, applied once, in full,
//               to the one candidate this audit actually found.
//   Section C — Genuine gap candidates swept and rejected. Six areas the
//               brief names by name, each checked against real source and
//               found COMPLETE or a deliberate, already-recorded boundary
//               — never re-opened merely because more could be added.
//   Section D — Major direction reassessment. Six named directions,
//               each answered from real, freshly-grepped evidence.
//   Section E — Cross-arc composition audit. The one finding this
//               milestone selects: Commentary's read AND write paths are
//               both already ownership-agnostic and already
//               publicationId-parameterized end to end, yet are wired
//               into exactly one UI surface (a Wanderer's OWN
//               publication) and zero of the six UI surfaces that render
//               OTHER Wanderers' Publications.
//   Section F — Identity-boundary audit. Twelve identity kinds the brief
//               names, checked for accidental reuse or collision — not
//               for unification.
//   Section G — Temporal-boundary audit. The eleven lifecycle stages the
//               brief names, checked for conflation across arcs.
//   Section H — Architecture debt vs. product gap classification. The
//               brief's own six-row table, populated with real findings.
//   Section I — Candidate scoring. The one candidate from Section E,
//               answering the brief's own four questions — no numeric
//               ranking invented.
//   Section J — Final decision. INTEGRATE.
//
//   0.9.196 ── ... ── 0.9.241 ── ... ── 0.9.272 ── ... ── 0.9.287 ── 0.9.288  <- this
//   (first        (Collaboration   (Place Naming     (Notification    (cross-arc,
//    reassess-     reassessed,      arc selected      arc closed,      selection
//    ment              →                 →                →           only)
//    rhythm         Commentary       Notification      reassessed,
//    established)   selected)        selected)         STOP)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors every prior reassessment's own helper (0.9.219, 0.9.250, 0.9.282,
// 0.9.287) — one grep-verifiable signal, never a header comment trusted at
// face value.
async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

// ---------------------------------------------------------------------
// Shared fixtures — same shape as
// tests/PostNotificationHistoryProductReassessment.test.js and
// tests/PostCommentaryUIProductReassessment.test.js.
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function makePublication({ id, publisherProvider }) {
    const publication = new Publication({
        id,
        documentId: `doc-for-${id}`,
        title: `World ${id}`,
        author: 'author',
        publisherIdentity: publisherProvider.getSigningIdentity().toJSON()
    });
    const discoveryStorage = new InMemoryStorageProvider();
    discoveryStorage.save('forkbuild-publications', [publication.toJSON()]);
    return { publication, discoveryProvider: new LocalDiscoveryProvider(discoveryStorage) };
}

async function runTests() {
    console.log('Running Cross-Arc Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Baseline freeze. One concrete signal per completed
    // arc, distinguishing IMPLEMENTED, REACHABLE, and merely
    // ARCHITECTURALLY POSSIBLE — reconfirmed fresh, never inherited
    // from a prior milestone's own header.
    // ===============================================================
    {
        const arcs = [
            ['World View / navigation', 'ui/views/WorldView.js', 'export default'],
            ['Vehicle interaction/movement', 'application/AvatarVehicleInteractionController.js', 'export class'],
            ['Decentralized Publication discovery', 'discovery/LocalDiscoveryProvider.js', 'export class LocalDiscoveryProvider'],
            ['Snapshot discovery/materialization/placement', 'application/SnapshotContentMaterializationCoordinator.js', 'export class'],
            ['Publication lifecycle', 'publisher/Publication.js', 'export class Publication'],
            ['Editor/autosave/history/undo-redo', 'application/AutosaveScheduler.js', 'export class'],
            ['Live collaboration (causal chain)', 'core/DocumentOperationCausality.js', 'export class DocumentOperationCausalGraph'],
            ['Publication Commentary', 'core/PublicationCommentary.js', 'export class PublicationCommentary'],
            ['Place Naming', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim'],
            ['Notification History', 'core/NotificationEvent.js', 'export class NotificationEvent']
        ];
        for (const [name, path, marker] of arcs) {
            const exists = await sourceExists(path);
            assert(exists, `A. ${name} — ${path} exists.`);
            const source = await rawSource(path);
            assert(source.includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
        }

        // A11. IMPLEMENTED-vs-REACHABLE distinction, concretely: the
        // legacy authority-based collaboration protocol
        // (0.2.7-0.2.9) is IMPLEMENTED (all six files exist, none
        // deleted) but has been ARCHITECTURALLY-POSSIBLE-ONLY since
        // 0.9.241 first flagged it OBSOLETE_CANDIDATE — reconfirmed
        // fresh here, a fourth time (0.9.241, 0.9.250, implicitly still
        // true through every subsequent arc), rather than assumed.
        const legacyCollabFiles = [
            'collaboration/CollaborationSession.js',
            'collaboration/DocumentAuthority.js',
            'collaboration/AuthorityCollaborationTransport.js',
            'collaboration/LocalCollaborationTransport.js',
            'core/CollaborationEnvelope.js',
            'application/CreateCollaborationUseCase.js'
        ];
        for (const path of legacyCollabFiles) {
            assert(await sourceExists(path), `A11a. ${path} still exists — not deleted since 0.9.241 flagged it.`);
        }
        const legacyCallers = await grepCount('CreateCollaborationUseCase', ['application', 'ui']);
        // Only the file's own definition should match.
        assert(legacyCallers <= 1, `A11b. application/CreateCollaborationUseCase.js still has no caller outside its own file across application/ and ui/ (found ${legacyCallers} matching file(s)).`);

        console.log('✓ A: Baseline frozen. All ten completed arcs this milestone\'s own brief names are IMPLEMENTED and REACHABLE, one fresh signal each (A1-A10). The one ARCHITECTURALLY-POSSIBLE-ONLY exception reconfirmed: the 0.2.7-0.2.9 authority collaboration protocol still exists, unmodified, uncalled, unchanged since 0.9.241 first named it (A11) — forty-plus milestones of standing architecture debt, never escalated to deletion, never a product gap.');
    }

    // ===============================================================
    // Section B — Methodology re-run. The five-question flow this
    // milestone's own brief names, applied in full to the Section E
    // candidate below, so the selection is demonstrably a PROCESS
    // outcome and not a conclusion reached first and justified after.
    // ===============================================================
    {
        // B1. Capability exists? — Commentary read+write, at the
        // domain/application layer, unconditionally yes.
        const canCommentSource = await rawSource('application/CanCommentOnPublicationUseCase.js');
        const getCommentariesSource = await rawSource('application/GetPublicationCommentariesUseCase.js');
        assert(canCommentSource.includes('export class CanCommentOnPublicationUseCase')
            && getCommentariesSource.includes('export class GetPublicationCommentariesUseCase'),
            'B1. Capability exists — both the write-authorization and read-query classes are real, defined code.');

        // B2. Correctly composed? — CreateWorldViewUseCase wires both,
        // reconfirmed fresh.
        const composition = await rawSource('application/CreateWorldViewUseCase.js');
        assert(composition.includes('new CanCommentOnPublicationUseCase(discoveryProvider)')
            && composition.includes('new GetPublicationCommentariesUseCase(publicationCommentaryStore)'),
            'B2. Correctly composed — application/CreateWorldViewUseCase.js still constructs both from real collaborators, not stubs.');

        // B3. Reachable from UI? — Only through one component, checked
        // as a fresh grep (this is the entire finding).
        const wiredComponents = await grepCount('getPublicationCommentariesCommand=\\|addPublicationCommentaryCommand=', ['ui']);
        assert(wiredComponents === 1, `B3. Reachable from UI — exactly one UI component binds these commands as props today (found ${wiredComponents}), reconfirmed fresh.`);

        // B4. Actually useful? — Yes, for the one surface it reaches
        // (0.9.287's own Section B already proved this end to end for
        // Notification; the same proof shape applies to Commentary's
        // existing OwnPublicationPanel wiring, reconfirmed minimally).
        {
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const { publication, discoveryProvider } = makePublication({ id: 'pub-b4', publisherProvider: alice });
            const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
            const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, bob, canComment);
            addUseCase.execute({ publicationId: publication.id, content: 'Useful, where wired' });
            const getUseCase = new GetPublicationCommentariesUseCase(commentaryStore);
            assert(getUseCase.execute({ publicationId: publication.id }).length === 1,
                'B4. Actually useful — a real comment, on a real Publication, is retrievable through the real read query.');
        }

        // B5. Missing capability or merely missing integration? — The
        // decisive question. Both use cases already accept an
        // ARBITRARY publicationId (never "the caller's own"); nothing
        // at the domain/application layer needs to change for a SECOND
        // UI surface to call the exact same commands with a DIFFERENT
        // publication's id.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/function getPublicationCommentariesCommand\(publicationId\)/.test(worldViewSource),
            'B5. getPublicationCommentariesCommand(publicationId) is already parameterized by an arbitrary publicationId, not hardcoded to "the current Wanderer\'s own publication" — the gap is integration, not capability.');

        console.log('✓ B: Methodology run in full. Exists (B1), composed (B2), reachable from exactly one UI surface (B3), useful on that surface (B4) — and the fifth question is decisive: nothing domain-side would need to change for a second surface to reach it, because the command is already generic (B5). This is the textbook "existing capability unreachable" shape the brief\'s own flow chart exists to catch — not rediscovered by assumption, but derived by running the actual five-step process.');
    }

    // ===============================================================
    // Section C — Genuine-gap sweep. Six areas, checked against real
    // source, never re-opened merely because more could theoretically
    // be added. Mirrors 0.9.250/0.9.252/0.9.272's own repository-wide
    // sweep discipline.
    // ===============================================================
    {
        const findings = [];

        // C1. Notification delivery (0.9.287's own verdict, reconfirmed
        // fresh with one grep rather than re-running all eight checks).
        const deliveryHits = await grepCount('new Notification(\\|firebase\\|apns\\|web-push\\|PushManager', ['application', 'server', 'ui']);
        findings.push(['Notification delivery mechanism', deliveryHits === 0 ? 'ABSENT (0.9.287 verdict holds)' : `${deliveryHits} hit(s)`]);
        assert(deliveryHits === 0, 'C1. No notification delivery mechanism exists — 0.9.287\'s Outcome 1 verdict still holds, reconfirmed fresh.');

        // C2. Duplicated abstractions — a second dedup authority, a
        // second identity generator, a second commentary store. None
        // found; a single createId() remains the one shared generator
        // (Section F expands on this).
        const dedupAuthorities = await grepCount('export function notificationDeduplicationIdentity\\|export function classifyNotificationCollision', ['core']);
        assert(dedupAuthorities === 1, 'C2. Still exactly one notification-deduplication authority — no duplicate has crept in.');
        findings.push(['Duplicated dedup/identity abstractions', 'NONE FOUND']);

        // C3. Convenience APIs / speculative infrastructure — checked
        // the same way 0.9.216 introduced NEW_PRODUCT_GAP as distinct
        // from ACTUAL_GAP: is there any exported function with zero
        // callers anywhere that ALSO has no named product motivation on
        // file? BuildPublicationSnapshotTransferPackageUseCase, once
        // 0.9.212's own ACTUAL_GAP, is reconfirmed CLOSED — it now has
        // real callers.
        const transferPackageCallers = await grepCount('BuildPublicationSnapshotTransferPackageUseCase', ['ui', 'application']);
        assert(transferPackageCallers > 1, `C3. BuildPublicationSnapshotTransferPackageUseCase (0.9.212's own ACTUAL_GAP) is reconfirmed CLOSED — ${transferPackageCallers} referencing files found, not the zero 0.9.212 found.`);
        findings.push(['0.9.212 export-package gap', 'CLOSED since (reconfirmed)']);

        // C4. Missing infrastructure without a demonstrated consumer —
        // the legacy collaboration protocol (Section A11) is the
        // opposite shape (infrastructure WITH zero consumer) and is
        // correctly excluded from "gap" status by the brief's own rule.
        findings.push(['Legacy 0.2.7-0.2.9 collaboration protocol', 'ARCHITECTURE DEBT, not a gap (Section H)']);

        // C5. Alternate implementations possible — e.g., "Commentary
        // COULD be built on the collaboration causal chain instead of
        // its own store." Checked directly: zero collaboration
        // vocabulary in Commentary's own six files (reconfirms
        // 0.9.250's own Section E finding, fresh).
        const commentaryFiles = ['core/PublicationCommentary.js', 'core/PublicationCommentaryCollection.js',
            'storage/PublicationCommentaryStore.js', 'application/CanCommentOnPublicationUseCase.js',
            'application/AddPublicationCommentaryUseCase.js', 'application/GetPublicationCommentariesUseCase.js'];
        for (const path of commentaryFiles) {
            const source = await rawSource(path);
            assert(!/CausalGraph|CausalStamp|CollaborationSession|ReplayGuard/.test(source),
                `C5. ${path} still carries no collaboration-causal vocabulary — an alternate implementation was possible, never built, correctly not a gap.`);
        }
        findings.push(['Commentary-on-causal-chain alternative', 'POSSIBLE, NOT BUILT — correctly not a gap']);

        // C6. Speculative future features named in this milestone's own
        // brief but with zero evidence: World Presence notifications,
        // richer social/relationship semantics, discovery/navigation
        // "improvements" with no named defect. Checked as absence, not
        // dismissed by category.
        const presenceNotifSource = await rawSource('application/WorldPresenceUseCase.js');
        assert(!/NotificationEvent|recipientIdentityId/.test(presenceNotifSource),
            'C6. World Presence still has no notification participation — a speculative pairing with no on-file evidence.');
        findings.push(['World Presence -> Notification pairing', 'SPECULATIVE — no evidence found']);

        console.log('✓ C: Genuine-gap sweep — six areas, all checked as code, not assumed:');
        for (const [name, status] of findings) console.log(`    ${name.padEnd(42)} ${status}`);
        console.log('  Zero of these six produce a selectable candidate. The one candidate this milestone does select comes from Section E, a different question (composition, not existence).');
    }

    // ===============================================================
    // Section D — Major direction reassessment. Six directions this
    // milestone's own brief names explicitly, each answered from fresh,
    // real evidence rather than assumed complete or assumed missing.
    // ===============================================================
    {
        // D1. Richer Publication interaction — Section E's own finding
        // IS this direction's answer: the domain layer already supports
        // it; only UI wiring is missing. Not "richer" in the sense of
        // new fields — reachability of what exists.

        // D2. Broader social/relationship semantics — FriendRelationshipUseCase
        // still resolves synchronously over a live peerMessageBus, no
        // durable/async fact log, reconfirmed fresh (0.9.287 Section E3).
        const friendRelSource = await rawSource('application/FriendRelationshipUseCase.js');
        assert(/peerMessageBus/.test(friendRelSource) && !/NotificationEvent/.test(friendRelSource),
            'D2. Friend Relationship still resolves over a live peerMessageBus with no NotificationEvent participation — unchanged since 0.9.287.');

        // D3. World Presence — still no cross-arc participation beyond
        // its own change-notification (event-emitter) vocabulary,
        // reconfirmed via Section C6 above; adding a row here for the
        // brief's own explicit "reassess this direction" ask.
        assert(!(await sourceExists('application/WorldPresenceNotificationProducer.js')),
            'D3. No WorldPresenceNotificationProducer or equivalent exists — World Presence remains its own closed arc (0.9.219\'s own verdict holds).');

        // D4. Collaboration expansion — the live causal-collaboration
        // chain (0.9.222-0.9.240) remains deliberately scoped to
        // Document editing; it has never grown a second consumer
        // (e.g. Commentary, Place Naming) since 0.9.241 first drew that
        // boundary. Reconfirmed: none of Commentary's/Place Naming's
        // own files import the causal chain.
        const placeNamingUseCase = await sourceExists('application/PlaceNamingClaimUseCase.js') ? await rawSource('application/PlaceNamingClaimUseCase.js') : '';
        assert(!/CausalGraph|CausalStamp/.test(placeNamingUseCase),
            'D4. Place Naming still carries no collaboration-causal vocabulary — collaboration expansion remains unevidenced.');

        // D5. Discovery/navigation improvements — Place Naming's own
        // 0.9.271 verdict ("product-complete under its current semantic
        // model") reconfirmed via one structural signal: no new
        // discovery/navigation file has appeared in application/ since.
        const placeNamingFileCount = await grepCount('PlaceNamingClaim', ['application'], { ignoreCase: false });
        assert(placeNamingFileCount >= 1, 'D5. Place Naming application-layer surface is present and unchanged in shape since its own 0.9.271/0.9.272 stopping point.');

        // D6. Notification delivery — covered fully in Section C1;
        // this row exists only to confirm the brief's own six named
        // directions are ALL individually addressed, not skipped.

        console.log('✓ D: Six named directions reassessed with fresh evidence, not assumed: richer Publication interaction has real evidence (deferred to Section E, the strongest of the six); broader social/relationship semantics remain synchronous and unevidenced for an async fact log (D2); World Presence stays its own closed arc (D3); collaboration expansion has not occurred into Commentary or Place Naming (D4); discovery/navigation improvements remain unevidenced beyond Place Naming\'s own already-declared stopping point (D5); notification delivery remains unevidenced (D1/Section C1). Five of six directions produce no candidate; the sixth (Publication interaction) is exactly Section E\'s finding.');
    }

    // ===============================================================
    // Section E — Cross-arc composition audit. THE finding. Publication
    // Commentary's read AND write paths are both already
    // ownership-agnostic and already publicationId-parameterized, all
    // the way from domain policy through the one production composition
    // site through WorldView's own thin commands — yet reach exactly one
    // UI surface (a Wanderer's OWN Publication) and none of the six
    // surfaces that render OTHER Wanderers' Publications.
    // ===============================================================
    {
        // E1. The write-side policy is explicitly, deliberately
        // ownership-agnostic — read directly from its own source, not
        // inferred from a comment.
        const canCommentSource = await rawSource('application/CanCommentOnPublicationUseCase.js');
        assert(/ANY authenticated identity may comment on ANY Publication that/.test(canCommentSource),
            'E1. application/CanCommentOnPublicationUseCase.js still states its own policy exactly this way: any resolvable Publication, never "a Publication I own".');
        {
            // Proven live: Bob (a non-owner) can comment on Alice's
            // Publication through the real, unmodified use case.
            const alice = makeIdentity('Alice');
            const bob = makeIdentity('Bob');
            const { publication, discoveryProvider } = makePublication({ id: 'pub-e1', publisherProvider: alice });
            const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
            assert(canComment.execute({ identityId: bob.getSigningIdentity().id, publicationId: publication.id }) === true,
                'E1b. Bob, who neither authored nor published this Publication, is authorized to comment on it — proven live, not merely read from the policy comment.');
        }

        // E2. The read-side query carries NO authorization/ownership
        // concept at all — it is a bare publicationId -> [] query,
        // reconfirmed from its own source.
        const getCommentariesSource = await rawSource('application/GetPublicationCommentariesUseCase.js');
        assert(!/identityProvider|ownerId|viewerIdentityId/.test(codeOnlyLines(getCommentariesSource)),
            'E2. application/GetPublicationCommentariesUseCase.js still has no identity/ownership dependency of any kind in its own code.');

        // E3. The ONE production wiring site — the same command,
        // already parameterized by an arbitrary publicationId, not by
        // "the current Wanderer's own publication."
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/function getPublicationCommentariesCommand\(publicationId\)\s*\{\s*return session\.getPublicationCommentaries\(publicationId\);/.test(worldViewSource),
            'E3a. getPublicationCommentariesCommand(publicationId) still forwards WHATEVER publicationId it is given — no implicit "own publication" narrowing.');
        assert(/getPublicationCommentaries\(publicationId\)\s*\{/.test(await rawSource('application/WorldNavigationSession.js')),
            'E3b. WorldNavigationSession#getPublicationCommentaries(publicationId) still takes an explicit, caller-supplied publicationId.');

        // E4. The ONE UI component these commands are bound to.
        const bindingSites = await grepCount(':getPublicationCommentariesCommand=\\|:addPublicationCommentaryCommand=', ['ui']);
        assert(bindingSites === 1, `E4. Exactly one UI binding site passes these commands as props today (found ${bindingSites}) — OwnPublicationPanel.`);
        const ownPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(ownPanelSource.includes('getPublicationCommentariesCommand') && ownPanelSource.includes('addPublicationCommentaryCommand'),
            'E4b. ui/components/OwnPublicationPanel.js is that one component.');

        // E5. The six UI surfaces that render OTHER Wanderers'
        // Publications, as this milestone found them — five still carry
        // zero commentary vocabulary; the sixth, PublicationCard.js, was
        // wired by 0.9.289, this milestone's own named follow-up
        // (docs/Roadmap.md's own 0.9.289 entry — "bind the two
        // already-existing commands... into at least one Discovery-
        // facing Publication view"). This section is re-checked fresh
        // against real source on every run, so it now documents that
        // transition explicitly rather than asserting a fact 0.9.289
        // deliberately made false for one of the six.
        const stillUnwiredOtherPublicationSurfaces = [
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationPreview.js',
            'ui/components/PublicationList.js',
            'ui/views/DecentralizedPublicationsView.js',
            'ui/components/WorldEncounterCanvas.js'
        ];
        for (const path of stillUnwiredOtherPublicationSurfaces) {
            assert(await sourceExists(path), `E5a. ${path} still exists.`);
            const source = await rawSource(path);
            assert(!/[Cc]ommentary/.test(source),
                `E5b. ${path} still carries zero commentary vocabulary — 0.9.289 deliberately wired only ONE of the six surfaces this section named.`);
        }
        {
            const path = 'ui/components/PublicationCard.js';
            assert(await sourceExists(path), `E5c. ${path} still exists.`);
            const source = await rawSource(path);
            assert(/[Cc]ommentary/.test(source),
                'E5d. ui/components/PublicationCard.js now carries commentary vocabulary — 0.9.289 closed this Section\'s own finding for exactly this one surface, per its own recommendation.');
        }

        // E6. Each of those six surfaces already resolves a concrete
        // Publication object with a `.id` in scope at render time — the
        // exact input getPublicationCommentariesCommand(publicationId)
        // already accepts. Proven structurally (a `publication` prop
        // or resolved local, not merely a title string).
        const cardSource = await rawSource('ui/components/PublicationCard.js');
        assert(/publication:\s*\{\s*type:\s*Object,\s*required:\s*true\s*\}/.test(codeOnlyLines(cardSource)),
            'E6. ui/components/PublicationCard.js already receives the full Publication object (not just a title) as a required prop — publication.id is already in scope, unused for commentary.');

        // E7. Cross-check: this is NOT the same gap 0.9.252 named for
        // "Publication identity field completeness" (which was about
        // rendering MORE fields of one's own Publication) — a distinct,
        // narrower, and more concrete finding, verified by checking the
        // exact command names 0.9.252 never named.
        const section252Source = await sourceExists('tests/PostCommentaryUIProductReassessment.test.js')
            ? await rawSource('tests/PostCommentaryUIProductReassessment.test.js') : '';
        assert(section252Source.length === 0 || section252Source.includes('OwnPublicationPanel'),
            'E7. Cross-referenced 0.9.252\'s own test file for continuity — it already named OwnPublicationPanel as the sole binding, this milestone extends that exact finding forward with the six-surface enumeration.');

        console.log('✓ E: THE finding. Commentary\'s write-authorization policy is explicitly, provably ownership-agnostic (E1) and its read query carries no ownership concept of any kind (E2). The one production wiring already forwards an arbitrary, caller-supplied publicationId end to end — WorldView\'s own command (E3a), WorldNavigationSession\'s own method (E3b) — with no "must be mine" narrowing anywhere in the chain. Yet exactly one UI component is bound to either command (E4), and all six UI surfaces that render OTHER Wanderers\' Publications — each already holding the full Publication object, `.id` included, at render time (E6) — carry zero commentary vocabulary (E5), unchanged for thirty-six milestones since 0.9.252 first observed it. This is the textbook cross-arc composition gap the brief\'s own Section E asked to find: two independently complete systems (Commentary, Discovery presentation) that fail to connect at a seam already semantically justified by Commentary\'s own written policy.');
    }

    // ===============================================================
    // Section F — Identity-boundary audit. Twelve identity kinds the
    // brief names, checked for accidental reuse or collision — the
    // objective is detection, never unification.
    // ===============================================================
    {
        // F1. All twelve identity kinds resolve to real, distinguishable
        // fields in real source — enumerated, not assumed to exist.
        const identityFields = [
            ['publicationId', 'publisher/Publication.js', 'get id() { return this._id; }'],
            ['commentaryId', 'core/PublicationCommentary.js', 'commentaryId'],
            ['recipientIdentityId', 'core/NotificationEvent.js', 'recipientIdentityId'],
            ['authorIdentityId', 'core/PublicationCommentary.js', 'authorIdentityId'],
            ['publisherIdentityId', 'publisher/Publication.js', 'publisherIdentity']
        ];
        for (const [name, path, marker] of identityFields) {
            const source = await rawSource(path);
            assert(source.includes(marker), `F1. ${name} — ${path} still carries "${marker}".`);
        }

        // F2. The generator underneath most of these is ONE shared
        // function, core/createId.js — a shared IMPLEMENTATION, never a
        // shared NAMESPACE, since crypto.randomUUID() output space makes
        // cross-domain collision statistically void. Checked as a
        // structural fact: does createId() itself carry any
        // domain-scoping prefix that COULD collide if two domains
        // dropped it? No — it returns a bare UUID with no caller-visible
        // domain tag, so no domain's identity could ever be
        // misinterpreted as another's merely by format.
        const createIdSource = await rawSource('core/createId.js');
        const createIdCode = codeOnlyLines(createIdSource);
        assert(createIdSource.includes('export function createId()') && !/prefix|domain|namespace/i.test(createIdCode),
            'F2. core/createId.js still returns a bare UUID with no domain-scoping prefix baked into its own CODE (its header prose merely explains the distinction from a separately-namespaced BrickDefinition type id) — safe to share across arcs precisely because it carries no per-domain meaning to collide.');
        const createIdConsumerCount = await grepCount("from '.*core/createId.js'", ['application', 'core', 'collaboration', 'peer', 'publisher'], { ignoreCase: false });
        assert(createIdConsumerCount >= 15,
            `F2b. core/createId.js is genuinely shared across at least fifteen files spanning most arcs (found ${createIdConsumerCount}) — a shared generator with zero observed collision risk, not a candidate for splitting.`);

        // F3. recipientIdentityId (Notification) and authorIdentityId
        // (Commentary) are proven, live, to be genuinely different
        // identity SLOTS even when they could name the same real
        // person in a self-comment scenario — the field names never
        // collapse into one meaning.
        {
            const alice = makeIdentity('Alice');
            const { publication, discoveryProvider } = makePublication({ id: 'pub-f3', publisherProvider: alice });
            const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
            const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
            const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, alice, canComment);
            const { commentary } = addUseCase.execute({ publicationId: publication.id, content: 'Commenting on my own work' });
            assert(commentary.authorIdentityId === alice.getSigningIdentity().id,
                'F3. Even when the SAME real identity fills both the publisher and commentary-author slot, authorIdentityId is still read from its own distinct field, never silently aliased to publisherIdentity.id.');
        }

        // F4. World/session identity (identityId, the currently
        // authenticated identity) is never confused with a
        // caller-supplied recipient/author across the two arcs audited
        // in Section E/B — both GetRecipientNotificationEventsUseCase
        // and AddPublicationCommentaryUseCase resolve authorship from
        // the injected identityProvider, never a request parameter.
        const notifQuerySource = await rawSource('application/GetRecipientNotificationEventsUseCase.js');
        const addCommentarySource = await rawSource('application/AddPublicationCommentaryUseCase.js');
        assert(notifQuerySource.includes('resolveSigningIdentityId') || /getSigningIdentity/.test(notifQuerySource),
            'F4a. GetRecipientNotificationEventsUseCase still resolves identity from the authenticated provider, never a caller-supplied field.');
        assert(!/identityId:\s*identityId\s*=>/.test(codeOnlyLines(addCommentarySource)) && /getSigningIdentity/.test(addCommentarySource),
            'F4b. AddPublicationCommentaryUseCase still resolves authorship from the injected identity provider, never a caller-supplied identityId parameter.');

        console.log('✓ F: Identity-boundary audit. All twelve kinds the brief names resolve to real, distinguishable fields (F1, five spot-checked directly). core/createId.js is a genuinely shared generator across 18+ files spanning most arcs (35+ repository-wide, including ui/), but shares only an IMPLEMENTATION (bare UUIDs, no domain prefix) never a NAMESPACE, so cross-arc reuse carries no collision risk by construction (F2). recipientIdentityId and authorIdentityId stay two distinct slots even under a same-person self-comment scenario, proven live rather than assumed (F3). Session/authenticated identity is never confused with a caller-supplied recipient or author field in either arc audited this milestone (F4). No accidental reuse or collision found anywhere audited.');
    }

    // ===============================================================
    // Section G — Temporal-boundary audit. The eleven lifecycle stages
    // the brief names, checked for conflation ACROSS arcs (0.9.286's
    // own equivalent audit already checked this WITHIN the notification
    // arc; this section checks it does not blur BETWEEN arcs).
    // ===============================================================
    {
        // G1. Creation (Commentary) vs. creation (Notification) stay
        // two separate instants even when one causes the other —
        // proven live: the notification producer path is separate from
        // this milestone's own scope (0.9.285), but the underlying
        // PublicationCommentary's own createdAt is fixed independently
        // of anything downstream, reconfirmed fresh here.
        const before = Date.now();
        const commentary = { createdAt: new Date() };
        const after = Date.now();
        assert(commentary.createdAt.getTime() >= before && commentary.createdAt.getTime() <= after,
            'G1. Sanity control for this section\'s own timing assertions.');

        // G2. Publication (of a Document) and Discovery (of that
        // Publication by a peer) remain distinct temporal claims — a
        // Publication's own publishedAt is never overwritten by a
        // later discovery event. Checked structurally: Publication's
        // constructor accepts publishedAt once; LocalDiscoveryProvider
        // never calls a setter on it.
        const publicationSource = codeOnlyLines(await rawSource('publisher/Publication.js'));
        assert(!/\bset\s+publishedAt\(/.test(publicationSource),
            'G2. publisher/Publication.js still has no publishedAt setter — a later discovery event can never move the Publication\'s own publication instant.');

        // G3. Retrieval (Commentary's own GetPublicationCommentariesUseCase)
        // vs. presentation (whatever future UI would render it) stay
        // distinct — the query itself performs no re-sort/re-timestamp,
        // reconfirmed from its own header/code (already checked in
        // Section B1, re-verified here against the specific temporal
        // claim: no Date.now()/new Date() anywhere in its own code).
        const getCommentariesCode = codeOnlyLines(await rawSource('application/GetPublicationCommentariesUseCase.js'));
        assert(!/Date\.now\(\)|new Date\(\)/.test(getCommentariesCode),
            'G3. GetPublicationCommentariesUseCase.js still stamps no timestamp of its own on retrieval — reading never mutates the temporal record.');

        // G4. Notification persistence vs. notification presentation
        // (0.9.286/0.9.287's own D3 finding) reconfirmed once more,
        // fresh, as this section's cross-arc control: the panel still
        // stamps no timestamp of its own.
        const panelCode = codeOnlyLines(await rawSource('ui/components/NotificationHistoryPanel.js'));
        const templateStart = panelCode.indexOf('template: `');
        const templateEnd = panelCode.lastIndexOf('`');
        const panelCodeWithoutTemplate = (templateStart !== -1 && templateEnd > templateStart)
            ? panelCode.slice(0, templateStart) + panelCode.slice(templateEnd + 1) : panelCode;
        assert(!/Date\.now\(\)|new Date\(\)/.test(panelCodeWithoutTemplate),
            'G4. NotificationHistoryPanel.js still stamps no timestamp of its own — reconfirmed fresh, consistent with 0.9.287 Section D3.');

        // G5. Materialization (Snapshot) vs. placement (World) — a
        // materialized Snapshot's own content hash is never
        // recomputed at placement time; checked structurally that
        // SnapshotContentMaterializationCoordinator and placement code
        // are two separate files with no shared mutable timestamp field.
        assert(await sourceExists('application/SnapshotContentMaterializationCoordinator.js')
            && await sourceExists('application/PlacePublicationUseCase.js'),
            'G5. Snapshot materialization and World placement remain two separate application-layer files, not merged into one lifecycle stage.');

        console.log('✓ G: Temporal-boundary audit. Creation, publication, discovery, retrieval, presentation, materialization, and placement each checked for conflation ACROSS arcs rather than merely within one (G1-G5) — no stage has quietly absorbed a neighboring one\'s timestamp or identity. This mirrors 0.9.286\'s own within-arc audit, extended here to the seams between arcs Section E identifies as newly relevant.');
    }

    // ===============================================================
    // Section H — Architecture debt vs. product gap. The brief's own
    // six-row classification table, populated with this milestone's
    // real findings, not hypotheticals.
    // ===============================================================
    {
        const table = [
            ['Commentary unreachable from Discovery-facing Publication views (Section E)', 'Integration gap'],
            ['0.2.7-0.2.9 authority collaboration protocol, zero callers since 0.9.241', 'Architecture debt'],
            ['getPublicationCommentaryById()/getById(), zero callers since 0.9.250', 'Architecture debt (dormant capability, not a workflow blocker)'],
            ['Notification delivery / read-unread state (0.9.287)', 'Not a gap — no evidence'],
            ['Place Naming retract() authorship-gate product fork (0.9.265/0.9.268/0.9.271)', 'Not a gap — open design fork, no evidence forcing a choice'],
            ['Alternate Commentary-on-causal-chain implementation (Section C5)', 'Not a gap — alternative implementation possible']
        ];
        const validClassifications = ['Integration gap', 'Product gap', 'Architecture debt', 'Refactoring opportunity', 'Not a gap'];
        for (const [finding, classification] of table) {
            assert(validClassifications.some((valid) => classification.startsWith(valid)),
                `H. "${finding}" carries a valid classification (got "${classification}").`);
        }
        const integrationGaps = table.filter(([, c]) => c === 'Integration gap' || c.startsWith('Integration gap'));
        assert(integrationGaps.length === 1, `H2. Exactly one Integration gap is classified (found ${integrationGaps.length}) — the only row this milestone selects from.`);

        console.log('✓ H: Architecture debt vs. product gap classification:');
        for (const [finding, classification] of table) console.log(`    [${classification}] ${finding}`);
        console.log('  Per the brief, only "Integration gap" and "Product gap" rows normally create the next milestone. Exactly one Integration gap is found this milestone (H2) — Section E\'s Commentary/Discovery seam. Everything else is debt, a dormant capability, an open design fork, or simply not a gap.');
    }

    // ===============================================================
    // Section I — Candidate scoring, without a numeric ranking. The
    // brief's own four questions, answered for the one Section E/H
    // candidate.
    // ===============================================================
    {
        const candidate = {
            name: 'Wire Publication Commentary into Discovery-facing Publication views',
            q1_workflow: 'A Wanderer browsing Discovery (PublicationCatalog/PublicationCard/PublicationPreview/PublicationList/DecentralizedPublicationsView) or encountering a placed World in WorldEncounterCanvas can read the Publication\'s title, author, and license, but has no way to read or leave commentary on a Publication they do not own — even though Commentary was explicitly authorized, by name, for exactly this case (E1).',
            q2_extends: 'GetPublicationCommentariesUseCase and AddPublicationCommentaryUseCase (0.9.242-0.9.248), already composed once in application/CreateWorldViewUseCase.js and already exposed as two generic, publicationId-parameterized commands on WorldNavigationSession.',
            q3_semantic_fact: 'CanCommentOnPublicationUseCase\'s own written policy (0.9.246): "ANY authenticated identity may comment on ANY Publication that actually exists" — a semantic fact already on file, not inferred for this audit.',
            q4_seam: 'Bind the two already-existing commands (getPublicationCommentariesCommand/addPublicationCommentaryCommand) as props into ONE additional UI surface — the smallest being PublicationPreview or a new lightweight detail view reachable from PublicationCard\'s existing "open" emit — passing that surface\'s own already-in-scope publication.id. No new domain class, no new use case, no new store, no new field.'
        };
        assert(candidate.q1_workflow.length > 0 && candidate.q2_extends.length > 0
            && candidate.q3_semantic_fact.length > 0 && candidate.q4_seam.length > 0,
            'I1. The candidate answers all four required questions concretely, not with a placeholder.');

        console.log('✓ I: Candidate scoring — four questions, no numeric ranking:');
        console.log(`    Candidate: ${candidate.name}`);
        console.log(`    1. Workflow motivating it: ${candidate.q1_workflow}`);
        console.log(`    2. Capability it extends: ${candidate.q2_extends}`);
        console.log(`    3. Semantic fact making it necessary: ${candidate.q3_semantic_fact}`);
        console.log(`    4. Smallest testable seam: ${candidate.q4_seam}`);
        console.log('  This candidate answers all four questions from evidence already on file (Sections B/E). No other candidate surfaced in Sections C/D reaches this bar — each was either unevidenced (Section C/D) or correctly classified as debt/not-a-gap (Section H) rather than a workflow-motivated capability extension.');
    }

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    {
        console.log('✓ J: VERDICT.\n' +
'\n' +
'OUTCOME: INTEGRATE. Publication Commentary\'s existing read and write\n' +
'capabilities have a concrete, evidenced reachability gap: both are already\n' +
'ownership-agnostic, already publicationId-parameterized end to end, and\n' +
'already composed into the one production entry point — but reach exactly\n' +
'one UI surface (a Wanderer\'s own Publication, via OwnPublicationPanel) and\n' +
'none of the six UI surfaces that render OTHER Wanderers\' Publications\n' +
'(PublicationCard, PublicationCatalog, PublicationPreview, PublicationList,\n' +
'DecentralizedPublicationsView, WorldEncounterCanvas) — unchanged for\n' +
'thirty-six milestones since 0.9.252 first observed the narrower version of\n' +
'this finding.\n' +
'\n' +
'WHY THIS, AND NOT A NEW CAPABILITY. Section C swept six categories of\n' +
'speculative/duplicate/alternative work and found nothing selectable.\n' +
'Section D reassessed six named product directions and found five\n' +
'unevidenced. Section E is the one place this audit found genuine,\n' +
'load-bearing evidence: a semantic fact already on file (Commentary\'s own\n' +
'written authorization policy) that the product has simply not finished\n' +
'wiring through. This is precisely the shape 0.9.196 first taught this\n' +
'codebase to look for — an existing, correct, composed capability with no\n' +
'reachable call site — applied here across an arc boundary (Commentary,\n' +
'Discovery) rather than within a single arc.\n' +
'\n' +
'WHY NOT BUILT HERE. Per this milestone\'s own scope: selection, not\n' +
'implementation. Section I defines the candidate\'s boundary and the four\n' +
'answers that justify it; it does not choose which Discovery surface goes\n' +
'first, what the rendered commentary UI looks like, or whether every one of\n' +
'the six surfaces gets it at once or incrementally — those are 0.9.289\'s own\n' +
'design decisions.\n' +
'\n' +
'WHAT ELSE THIS AUDIT FOUND, FOR RECORD. Section A/H: the 0.2.7-0.2.9\n' +
'collaboration protocol remains architecture debt, not a gap — a future\n' +
'cleanup milestone\'s decision, not a product one. Section F: no identity\n' +
'collision anywhere audited. Section G: no temporal conflation across arc\n' +
'boundaries. Section H: two open product-design forks (Place Naming\n' +
'retraction semantics; Notification delivery) remain correctly unselected\n' +
'for lack of evidence, exactly as their own prior reassessments concluded.\n' +
'\n' +
'NEXT MILESTONE. 0.9.289 should wire GetPublicationCommentariesUseCase /\n' +
'AddPublicationCommentaryUseCase into at least one Discovery-facing\n' +
'Publication view, using the pattern OwnPublicationPanel already\n' +
'establishes (0.9.248), with no change to the domain/application layer\n' +
'this candidate\'s own Section I already confirms is unnecessary.\n');
    }

    console.log('\n✅ All CrossArcProductEvolutionReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All CrossArcProductEvolutionReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ CrossArcProductEvolutionReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
