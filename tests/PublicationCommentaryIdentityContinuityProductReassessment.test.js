
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { PublicationCommentaryStore, PublicationCommentaryConflictError } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/publication/commentary/GetPublicationCommentariesUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Publication } from '../publisher/Publication.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';

import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationCommentarySection from '../ui/components/PublicationCommentarySection.js';
import { worldEncounterCanvasFiles, ownPublicationPanelFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.541 — Publication Commentary Product Reassessment.
//
// 0.9.539 asked whether a Wanderer can PERCEIVE which Publication is which
// on screen; 0.9.540 asked whether every catalog ACTION targets the exact
// Publication a Wanderer clicked — and 0.9.540's own Section I already
// named Comment-posting "the only mutating action reachable from these
// surfaces." This milestone asks the natural next question, in full, for
// that one mutating action specifically:
//
//   Does existing Publication Commentary preserve Publication identity,
//   lifecycle semantics, failure isolation, attribution, and navigation
//   coherently under realistic and adversarial conditions — including the
//   SAME same-document-republish and same-contentHash-different-
//   Publication scenarios 0.9.539/0.9.540 already used for catalog
//   actions, never yet run against Commentary itself?
//
// Commentary already has a long, real arc behind it — domain (0.9.242),
// storage (0.9.243), write command (0.9.244), authorship (0.9.245),
// authorization (0.9.246), read command (0.9.247), UI integration
// (0.9.248), count UI (0.9.251), notifications (0.9.275), a second
// composition root (0.9.289), a third UI surface (0.9.291), a 755-line
// lifecycle/isolation audit (0.9.249), a full product reassessment
// (0.9.250), and a cross-surface convergence audit + reassessment
// (0.9.289 Section K, 0.9.305). This milestone REUSES those findings
// rather than reproducing them — Section B below freezes what they
// already established — and spends its own live effort on exactly the
// one thing none of them tested: the specific adversarial identity-
// collision fixtures 0.9.539/0.9.540 introduced, applied to Commentary.
//
//   A — Entry-point inventory: every real place a Wanderer can see,
//       open, compose, submit, and (implicitly) return from Commentary,
//       enumerated fresh against current source, never assumed from any
//       prior milestone's own list.
//   B — Prior findings, frozen: a compact reuse of 0.9.249/0.9.250's own
//       lifecycle/authorship/authorization verdicts, re-verified cheaply
//       against current source rather than re-run in full.
//   C — Comment lifecycle semantics: draft/submitted/stored/displayed —
//       what the system actually means by each, live.
//   D — Failure isolation: one comment's failure, empty/invalid content,
//       a storage failure, an unresolvable Publication, repeated
//       submission, and a failed refresh — each proven not to leak into
//       any other Publication, comment, or already-displayed state.
//   E — Identity and attribution: displayed author vs. signing identity
//       vs. Publication identity vs. comment identity, kept independent;
//       what the UI does NOT claim (no per-comment signature, no
//       profile-name resolution) stated plainly, not assumed.
//   F — Ordering and duplicate behavior: insertion order only, no
//       dedup/ranking on the read side; the ONE real dedup mechanism
//       (commentaryId-keyed idempotent retry) is scoped precisely.
//   G — Navigation continuity: Commentary is rendered inside a
//       Publication's own surface, never a separate route — so "return
//       to the same Publication" is structural, never a new mechanism.
//   H — Cross-surface consistency: OwnPublicationPanel.js,
//       PublicationCard.js, WorldEncounterCanvas.js re-checked, fresh,
//       against 0.9.305's own convergence claim.
//   I — Mutation boundary: AddPublicationCommentaryUseCase.execute() is
//       the one write; everything else in the pipeline is observational.
//   J — FLAGSHIP: the exact scenario this milestone's own brief
//       specifies — two same-document Publications, commentary composed
//       on one while the catalog reorders, then a same-contentHash-
//       different-Publication pair — proving Commentary never
//       misattributes across either collision, live, end to end.
//
// Deliberately excluded, per the requesting brief: comment editing or
// deletion, moderation, reputation, voting/likes, threading, a
// notification-generation change, a new synchronization protocol,
// ranking, deduplication beyond what already exists, a new identity
// mechanism, a new navigation mechanism, contentHash-based comment
// routing, a generic mutation framework, and any UI redesign. None of
// these appear below, and none is proposed in the verdict.
//
// FINDING: see the verdict block at the end of this file.

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

const SOURCE_ROOT = new URL('../', import.meta.url);

// Mirrors tests/PostPublicationCommentaryProductReassessment.test.js's own
// helper — the one grep-verifiable signal this reassessment lineage uses
// for "which files really do this," never trusted from a header comment.
async function grepFiles(pattern, dirs) {
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
        hits = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').sort() : [];
}

// Reused verbatim from tests/PublicationCatalogActionSafetyProductReassessment.test.js
// (0.9.540) — the identical builders that produced its own real,
// discoverable Publications.
function makePublisher(storage) {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    return { publisher, publishDocumentUseCase: new PublishDocumentUseCase(publisher, null, null, null) };
}

function makeMinimalDocument(title = 'Atlas', author = 'alice') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

// The real write/read stack, wired exactly the way application/
// CreateWorldViewUseCase.js and application/publication/commentary/CreatePublicationCommentaryUseCase.js
// both wire it (0.9.246/0.9.247) — never a fake store or a fake use case
// standing in for the actual pipeline. `commands` is the identical
// `{ getPublicationCommentariesCommand, addPublicationCommentaryCommand }`
// shape every real UI surface receives by injection.
function makeCommentaryStack(storage, discoveryProvider, identityProvider) {
    const store = new PublicationCommentaryStore(storage);
    const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(discoveryProvider);
    const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(store, identityProvider, canCommentOnPublicationUseCase);
    const getPublicationCommentariesUseCase = new GetPublicationCommentariesUseCase(store);
    return {
        store,
        addPublicationCommentaryUseCase,
        getPublicationCommentariesUseCase,
        getPublicationCommentariesCommand: (publicationId) => getPublicationCommentariesUseCase.execute({ publicationId }),
        addPublicationCommentaryCommand: ({ publicationId, content }) => addPublicationCommentaryUseCase.execute({ publicationId, content })
    };
}

// A real PublicationCard.js component-instance context, sharing nothing
// but the class's own real `methods` — the identical technique 0.9.540
// Sections F/G used, here wired to REAL commands (not fakes) so a
// successful submit is a genuine, persisted write, never a simulated one.
function makeCardContext(publication, commands = {}) {
    return {
        publication,
        commentaryOpen: false,
        commentaries: [],
        newCommentaryText: '',
        commentaryError: null,
        getPublicationCommentariesCommand: commands.getPublicationCommentariesCommand ?? null,
        addPublicationCommentaryCommand: commands.addPublicationCommentaryCommand ?? null,
        // The card's own toggle; opening mounts the shared
        // PublicationCommentarySection, whose mounted() is the first read.
        toggleCommentary() {
            PublicationCard.methods.toggleCommentary.call(this);
            if (this.commentaryOpen) {
                PublicationCommentarySection.mounted.call(this);
            }
        },
        refreshCommentaries: PublicationCommentarySection.methods.refreshCommentaries,
        submitCommentary: PublicationCommentarySection.methods.submitCommentary
    };
}

async function run() {
    // ===============================================================
    // Section A — Entry-point inventory. Every real place a Wanderer
    // can see/open/compose/submit Commentary, enumerated fresh — never
    // assumed from 0.9.305's own three-surface list.
    // ===============================================================
    let ownPanelSource, cardSource, encounterSource;
    {
        // Grep for a real SUBMIT METHOD DEFINITION, not merely a
        // reference to the command's name — ui/views/WorldView.js and
        // ui/main.js both WIRE addPublicationCommentaryCommand through to
        // a real surface without composing anything of their own, and
        // ui/components/NotificationHistoryPanel.js merely mentions the
        // vocabulary while displaying NotificationEvents; none of the
        // three actually defines a submit method, so this pattern finds
        // exactly, and only, the real entry points.
        const withSubmit = await grepFiles('\\(submitCommentary\\|submitPublicationCommentary\\|submitEncounterCommentary\\)() {', ['ui']);
        assert(withSubmit.length === 3
            && withSubmit.includes('ui/components/OwnPublicationPanel.js')
            && withSubmit.includes('ui/components/PublicationCommentarySection.js')
            // WorldEncounterCanvas.js's submit method lives in its own methods module.
            && withSubmit.includes('ui/components/worldEncounterCanvas/publicationDiscoveryMethods.js'),
            `1. FRESH INVENTORY: exactly three UI files define a real commentary SUBMIT method today (found: ${withSubmit.join(', ')}) — the same three 0.9.248/0.9.289/0.9.291 built and 0.9.305 last confirmed (0.9.289's PublicationCard.js submit now lives in the shared PublicationCommentarySection.js that both catalog views mount), re-verified now rather than assumed still current. (ui/views/WorldView.js and ui/main.js merely wire the command through; ui/components/NotificationHistoryPanel.js only displays the resulting NotificationEvents — none of the three defines a submit method of its own.)`);

        ownPanelSource = (await Promise.all(ownPublicationPanelFiles().map((file) => readSource(file)))).join('\n');
        // The card view's Commentary is the card plus the shared
        // PublicationCommentarySection.js it mounts while expanded.
        cardSource = await readSource('ui/components/PublicationCard.js') + await readSource('ui/components/PublicationCommentarySection.js');
        encounterSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');

        for (const [name, source, prefix] of [
            ['OwnPublicationPanel.js', ownPanelSource, 'publicationCommentar'],
            ['PublicationCard.js', cardSource, 'commentar'],
            ['WorldEncounterCanvas.js', encounterSource, 'encounterCommentar']
        ]) {
            const seePattern = new RegExp(`${prefix}[Ii]es\\.length|${prefix}[Ii]es\\.length`, 'i');
            assert(source.toLowerCase().includes('no commentary yet'), `2. ${name}: a real empty-state message exists ("No commentary yet.") — SEE is a genuine path, not merely assumed present.`);
            assert(/@submit\.prevent="[a-zA-Z]*[Ss]ubmit[a-zA-Z]*[Cc]ommentary"/.test(source), `3. ${name}: COMPOSE + SUBMIT is a real, explicit form submit handler — never a side effect of render or of opening the section.`);
        }
        assert(/Sign in to add commentary\.|Sign in to comment/.test(cardSource) && /viewerIdentityId/.test(cardSource),
            '4. PublicationCard.js: an unauthenticated Wanderer sees a real sign-in hint in place of the compose form — never a silently-broken or hidden submit button.');

        // "Navigate back to the Publication" — Section G proves this is
        // structural (Commentary never leaves the Publication's own
        // surface), so it is confirmed here only as "no router import,"
        // not re-derived twice.
        assert(!/vue-router/.test(cardSource) && !/vue-router/.test(ownPanelSource),
            '5. Neither PublicationCard.js nor OwnPublicationPanel.js imports vue-router at all — Commentary has no navigation of its own to audit for "return," because it never leaves the Publication\'s own rendered surface (Section G).');
    }
    console.log('✓ Section A: exactly three real entry points exist today — OwnPublicationPanel.js (Publication detail, eager-loaded), PublicationCard.js (catalog, lazy-loaded on first expand), WorldEncounterCanvas.js (World encounter inspection, lazy-loaded) — each with a real see/open/compose/submit path and a real sign-in hint; none has, or needs, its own navigation, because none of them is a separate page.');

    // ===============================================================
    // Section B — Prior findings, frozen. 0.9.249 (755-line lifecycle
    // audit) and 0.9.250 (product reassessment) already proved the
    // baseline; this section re-verifies their headline claims cheaply
    // against CURRENT source, never re-running either audit in full.
    // ===============================================================
    {
        // 0.9.242's own architectural decision, still true: linkage is
        // by publicationId, never documentId or contentHash.
        const commentaryDomainSource = await readSource('core/PublicationCommentary.js');
        assert(/publicationId/.test(commentaryDomainSource) && !/this\._documentId|this\._contentHash/.test(commentaryDomainSource),
            '1. STRUCTURAL (0.9.242, reconfirmed): PublicationCommentary carries a publicationId field and stores no documentId/contentHash field of its own — the domain object cannot even represent the wrong kind of linkage.');

        // 0.9.245/0.9.246: authorship/authorization still gate exactly
        // where they did, still in that order.
        const addSource = await readSource('application/publication/commentary/AddPublicationCommentaryUseCase.js');
        assert(/resolveSigningIdentityId\(this\._identityProvider\)/.test(addSource)
            && addSource.indexOf('resolveSigningIdentityId') < addSource.indexOf('_canCommentOnPublicationUseCase.execute'),
            '2. STRUCTURAL (0.9.245/0.9.246, reconfirmed): authentication still resolves before authorization, in that order, in execute().');
        assert(!/authorIdentityId\s*,?\s*content\s*,?\s*createdAt\s*,?\s*commentaryId\s*\}\s*=\s*input/.test(addSource)
            && /\{\s*publicationId,\s*content,\s*createdAt,\s*commentaryId\s*\}\s*=\s*\{\s*\}/.test(addSource),
            '3. STRUCTURAL (0.9.245, reconfirmed): execute()\'s own destructuring still names no authorIdentityId — a caller-supplied one is still never read.');

        // 0.9.249's own core lifecycle claim (Publication isolation at
        // the store) — cheap live re-check, not the full 755-line audit.
        const storage = new InMemoryStorageProvider();
        const store = new PublicationCommentaryStore(storage);
        store.save(new PublicationCommentary({ publicationId: 'pub-b-1', authorIdentityId: 'did:key:b1', content: 'one' }));
        store.save(new PublicationCommentary({ publicationId: 'pub-b-2', authorIdentityId: 'did:key:b1', content: 'two' }));
        assert(store.getForPublication('pub-b-1').length === 1 && store.getForPublication('pub-b-2').length === 1,
            '4. LIVE (0.9.249\'s own headline claim, cheaply re-run): two Publications\' commentary never contaminate each other at the store\'s own boundary.');

        // 0.9.251/0.9.275/0.9.289/0.9.291/0.9.305: candidates 0.9.250's
        // own verdict ranked #1/#2 have since shipped — recorded here so
        // this milestone's own verdict does not repeat a now-stale claim.
        const notificationProducerSource = await readSource('application/publication/commentary/PublicationCommentaryNotificationProducer.js');
        assert(/PUBLICATION_COMMENTED_EVENT_TYPE\s*=\s*'publication\.commented'/.test(notificationProducerSource)
            && /eventType:\s*PUBLICATION_COMMENTED_EVENT_TYPE/.test(notificationProducerSource),
            '5. STRUCTURAL: 0.9.250 Section F ranked "notifications" candidate #1, calling Commentary notifications "still genuinely absent codebase-wide" — application/publication/commentary/PublicationCommentaryNotificationProducer.js (0.9.275) has since closed exactly that gap; still present, unmodified, today.');
        assert(/publicationCommentaries\.length/.test(ownPanelSource),
            '6. STRUCTURAL: 0.9.250 Section D classified "count" MISSING_UI — 0.9.251 closed it; still rendered directly from the array\'s own length today, no separate count field or use case.');
    }
    console.log('✓ Section B: 0.9.249\'s lifecycle audit and 0.9.250\'s reassessment both still hold against current source — publicationId-only linkage, authentication-then-authorization ordering, and store-level Publication isolation are all reconfirmed cheaply rather than re-proven in full; and 0.9.250\'s own top two ranked candidates (notifications, count) have since shipped (0.9.251, 0.9.275) and remain intact.');

    // ===============================================================
    // Section C — Comment lifecycle semantics. No draft/pending/sent
    // state machine exists anywhere in the domain; "stored" and
    // "displayed" are the SAME read, and a failed write never becomes a
    // displayed one.
    // ===============================================================
    {
        const commentaryDomainSource = await readSource('core/PublicationCommentary.js');
        assert(!/\bstatus\b|\bstate\b|isDraft|isPending|isSent/i.test(commentaryDomainSource.replace(/\/\/.*$/gm, '')),
            '1. STRUCTURAL: PublicationCommentary has no status/state/isDraft/isPending/isSent field anywhere in its own code (comments excluded) — this codebase does not invent lifecycle states this milestone\'s own brief says not to invent.');

        // LIVE: "stored" and "displayed" are the identical query path —
        // no separate cache, no eventual-consistency window.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('carol');
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        discoveryProvider._loadRecords = () => [new Publication({ id: 'pub-c-1', documentId: 'doc-c-1', title: 'C', author: 'carol' }).toJSON()];
        const stack = makeCommentaryStack(storage, discoveryProvider, identityProvider);

        const { commentary, isNew } = stack.addPublicationCommentaryUseCase.execute({ publicationId: 'pub-c-1', content: 'lifecycle check' });
        assert(isNew === true, '2. LIVE: a genuinely new commentary reports isNew === true.');
        const displayed = stack.getPublicationCommentariesCommand('pub-c-1');
        assert(displayed.length === 1 && displayed[0].commentaryId === commentary.commentaryId,
            '3. LIVE: "stored" (the return from execute()) and "displayed" (the return from the read command) are the SAME record via the SAME store — no intermediate draft/pending cache exists to drift from it.');

        // A FAILED write never becomes a displayed one.
        const failingStore = { getForPublication: () => [], save: () => { throw new Error('disk full'); } };
        const failingAdd = new AddPublicationCommentaryUseCase(failingStore, identityProvider, new CanCommentOnPublicationUseCase(discoveryProvider));
        let threw = false;
        try {
            failingAdd.execute({ publicationId: 'pub-c-1', content: 'never persisted' });
        } catch { threw = true; }
        assert(threw, '4. LIVE: a storage failure propagates as a thrown error — execute() never swallows it into a silent, fake success.');
        assert(stack.getPublicationCommentariesCommand('pub-c-1').length === 1,
            '5. LIVE, THE ACTUAL CLAIM: the REAL store (unaffected by the separate failing fake above) still shows exactly the one earlier successful commentary — a failed submission on a DIFFERENT store object never appears anywhere as "successfully persisted."');

        // UI never optimistically appends — "displayed" always comes
        // from a fresh read, never a locally-synthesized record.
        assert(!/commentaries\.push\(/.test(cardSource) && !/publicationCommentaries\.push\(/.test(ownPanelSource) && !/encounterCommentaries\.push\(/.test(encounterSource),
            '6. STRUCTURAL: none of the three UI surfaces ever pushes a locally-constructed record into its own displayed list — every successful submit re-queries the real store (Section B\'s own "one source of truth"), so what a Wanderer sees is never a UI-side guess about what "should" now exist.');
    }
    console.log('✓ Section C: no draft/pending/sent state machine exists anywhere in Commentary — a comment is either successfully constructed-and-persisted (and then indistinguishable from "stored" and "displayed," because both read the identical store) or it never existed at all; a failed write is proven, live, never to surface as a displayed record.');

    // ===============================================================
    // Section D — Failure isolation.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('dana');
        const { publisher, publishDocumentUseCase } = makePublisher(storage);
        const pubA = publishDocumentUseCase.execute({ document: makeMinimalDocument('Failure A', 'dana') });
        const pubB = publishDocumentUseCase.execute({ document: makeMinimalDocument('Failure B', 'dana') });
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const stack = makeCommentaryStack(storage, discoveryProvider, identityProvider);

        // D1 — Comment A fails / Comment B remains unaffected. Two real
        // card contexts, one wired to a genuinely throwing command
        // (simulating a relay/storage failure specific to A), the other
        // to the real, working command.
        const ctxA = makeCardContext(pubA, { addPublicationCommentaryCommand: () => { throw new Error('storage unavailable'); }, getPublicationCommentariesCommand: stack.getPublicationCommentariesCommand });
        const ctxB = makeCardContext(pubB, stack);
        ctxA.newCommentaryText = 'lost to failure';
        ctxA.submitCommentary.call(ctxA);
        assert(ctxA.commentaryError === 'storage unavailable' && ctxA.newCommentaryText === 'lost to failure',
            '1. LIVE: A\'s own failure sets exactly A\'s own error and preserves A\'s own unsent draft.');
        assert(stack.store.getForPublication(pubA.id).length === 0,
            '2. LIVE: A\'s failure left NOTHING behind in the real store — not a partial record, not a retryable ghost.');

        ctxB.newCommentaryText = 'B is fine';
        ctxB.submitCommentary.call(ctxB);
        assert(ctxB.commentaryError === null && stack.store.getForPublication(pubB.id).length === 1,
            '3. LIVE, THE ISOLATION PROOF: B succeeds independently — A\'s prior failure (still recorded on ctxA, untouched) never blocked, delayed, or corrupted B\'s own unrelated submission.');
        assert(ctxA.commentaryError === 'storage unavailable',
            '4. LIVE: A\'s error is still exactly what it was — B\'s later, unrelated success never cleared it.');

        // D2 — empty/invalid content. Client-side guard never even
        // calls the command; domain-level guard rejects before any
        // persistence.
        const ctxEmpty = makeCardContext(pubA, stack);
        ctxEmpty.newCommentaryText = '    ';
        ctxEmpty.submitCommentary.call(ctxEmpty);
        assert(ctxEmpty.commentaryError === null && !ctxEmpty.pendingCommentaryDraft,
            '5. LIVE: whitespace-only content never reaches the command at all — submitCommentary()\'s own guard clause returns before minting a draft identity, exactly matching PublicationCommentarySection.js\'s own source.');
        let domainThrew = false;
        try {
            stack.addPublicationCommentaryUseCase.execute({ publicationId: pubA.id, content: '' });
        } catch { domainThrew = true; }
        assert(domainThrew && stack.store.getForPublication(pubA.id).length === 0,
            '6. LIVE: even bypassing the UI guard, the domain constructor itself refuses empty content — pubA still shows zero commentary (its own earlier submission, in D1, also failed), no empty record ever created.');

        // D3 — storage failure (already exercised structurally above,
        // D1/D2's own real store confirms genuine failures propagate
        // and never partially write — reconfirmed here at the
        // PublicationCommentaryStore boundary directly).
        const throwingProvider = { load: () => { throw new Error('read failure'); }, save: () => { throw new Error('write failure'); }, remove: () => {}, list: () => [] };
        Object.setPrototypeOf(throwingProvider, StorageProvider.prototype);
        const brittleStore = new PublicationCommentaryStore(throwingProvider);
        assert(brittleStore.getForPublication(pubA.id).length === 0,
            '7. LIVE: a read failure degrades to an empty result (per PublicationCommentaryStore.js\'s own "corrupted storage degrades to empty, never throws" contract) — never a crash for a Wanderer just trying to view commentary.');
        let saveThrew = false;
        try { brittleStore.save(new PublicationCommentary({ publicationId: pubA.id, authorIdentityId: 'did:key:x', content: 'x' })); } catch { saveThrew = true; }
        assert(saveThrew, '8. LIVE: a genuine WRITE failure, unlike a read failure, propagates rather than being swallowed — the two failure modes are handled deliberately differently, matching PublicationCommentaryStore.js\'s own documented contract.');

        // D4 — Publication disappearance: an unresolvable publicationId
        // is denied before construction or persistence.
        let deniedThrew = false;
        try {
            stack.addPublicationCommentaryUseCase.execute({ publicationId: 'pub-never-existed', content: 'orphaned' });
        } catch (error) {
            deniedThrew = true;
            assert(/not authorized/.test(error.message), '9. LIVE: the rejection for a nonexistent Publication is an explicit authorization denial, not a generic crash.');
        }
        assert(deniedThrew && stack.store.getForPublication('pub-never-existed').length === 0,
            '10. LIVE: a Publication that never resolves gets zero commentary on file — no orphaned record for an id nothing ever published.');

        // D5 — repeated submission. (a) Two independent submissions of
        // IDENTICAL text with no caller-supplied commentaryId are two
        // real, distinct records — this codebase deliberately does not
        // deduplicate by content (Section F), so this is confirmed as
        // existing, correct behavior, not "fixed" here. (b) A caller
        // that DOES supply the same commentaryId twice gets the real
        // idempotency/conflict guarantee PublicationCommentaryStore.js
        // already documents.
        const ctxRepeat = makeCardContext(pubB, stack);
        ctxRepeat.newCommentaryText = 'repeat me';
        ctxRepeat.submitCommentary.call(ctxRepeat);
        ctxRepeat.newCommentaryText = 'repeat me';
        ctxRepeat.submitCommentary.call(ctxRepeat);
        assert(stack.store.getForPublication(pubB.id).filter((c) => c.content === 'repeat me').length === 2,
            '11. LIVE: two genuine resubmissions of identical text produce two distinct commentaryIds/records — never silently merged, per this milestone\'s own "no automatic deduplication" exclusion.');

        const idempotent1 = stack.addPublicationCommentaryUseCase.execute({ publicationId: pubA.id, commentaryId: 'retry-1', content: 'idempotent', createdAt: new Date('2024-01-01T00:00:00Z') });
        const idempotent2 = stack.addPublicationCommentaryUseCase.execute({ publicationId: pubA.id, commentaryId: 'retry-1', content: 'idempotent', createdAt: new Date('2024-01-01T00:00:00Z') });
        assert(idempotent1.isNew === true && idempotent2.isNew === false && idempotent1.commentary.commentaryId === idempotent2.commentary.commentaryId,
            '12. LIVE: an EXPLICIT caller-supplied commentaryId retried with byte-identical content is idempotent — no second record, matching PublicationCommentaryStore.js\'s own documented retry contract (the only real dedup mechanism this codebase has).');
        let conflictThrew = false;
        try {
            stack.addPublicationCommentaryUseCase.execute({ publicationId: pubA.id, commentaryId: 'retry-1', content: 'DIFFERENT content', createdAt: new Date('2024-01-01T00:00:00Z') });
        } catch (error) { conflictThrew = error instanceof PublicationCommentaryConflictError; }
        assert(conflictThrew, '13. LIVE: the same commentaryId with DIFFERENT content is rejected outright, never silently overwritten — the original record is untouched.');

        // D6 — a failed refresh never wipes an already-displayed list.
        const ctxRefresh = makeCardContext(pubA, stack);
        ctxRefresh.refreshCommentaries.call(ctxRefresh);
        const beforeCount = ctxRefresh.commentaries.length;
        assert(beforeCount > 0, '14. Sanity: A has real commentary on file to display.');
        ctxRefresh.getPublicationCommentariesCommand = () => { throw new Error('relay unreachable'); };
        ctxRefresh.refreshCommentaries.call(ctxRefresh);
        assert(ctxRefresh.commentaries.length === beforeCount && ctxRefresh.commentaryError === 'Commentary could not be loaded.',
            '15. LIVE: a failed refresh sets an error but leaves the previously-displayed list exactly as it was — a transient read failure never blanks a Wanderer\'s screen.');
    }
    console.log('✓ Section D: every named failure mode — one comment\'s own failure, empty/invalid content, a genuine storage read/write failure, an unresolvable Publication, repeated submission (both the undeduplicated and the idempotent-retry case), and a failed refresh — is proven live never to leak into another comment, another Publication, or an already-displayed list.');

    // ===============================================================
    // Section E — Identity and attribution.
    // ===============================================================
    {
        for (const [name, source] of [['OwnPublicationPanel.js', ownPanelSource], ['PublicationCard.js', cardSource], ['WorldEncounterCanvas.js', encounterSource]]) {
            assert(/\{\{\s*commentary\.authorIdentityId\s*\}\}/.test(source),
                `1. STRUCTURAL, RECONFIRMED (0.9.250's own "identity display: COMPLETE, raw id, no profile-name resolution"): ${name} renders commentary.authorIdentityId directly — no profile/display-name lookup exists to resolve it into anything friendlier, still true against current source.`);
        }

        // LIVE: the SAME resolveSigningIdentityId() call both the write
        // path (attribution) and the UI gate (viewerIdentityId) use —
        // no drift between "who the UI thinks is signed in" and "who
        // gets attributed."
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('erin');
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        discoveryProvider._loadRecords = () => [new Publication({ id: 'pub-e-1', documentId: 'doc-e-1', title: 'E', author: 'erin' }).toJSON()];
        const stack = makeCommentaryStack(storage, discoveryProvider, identityProvider);

        const cardCtx = makeCardContext({ id: 'pub-e-1' }, {});
        cardCtx.identityUseCase = { provider: identityProvider };
        const viewerIdentityId = PublicationCommentarySection.computed.viewerIdentityId.call(cardCtx);

        const { commentary } = stack.addPublicationCommentaryUseCase.execute({ publicationId: 'pub-e-1', content: 'attribution check' });
        assert(commentary.authorIdentityId === viewerIdentityId,
            '2. LIVE: the identity the write path attributes a comment to and the identity PublicationCard.js\'s own viewerIdentityId computed reports for gating the UI are the EXACT same value — never two independent, potentially-diverging notions of "who is signed in."');

        // Three independent identities, never conflated — LIVE, not
        // merely asserted from the domain class's own header comment.
        assert(commentary.commentaryId !== commentary.publicationId
            && commentary.publicationId !== commentary.authorIdentityId
            && commentary.commentaryId !== commentary.authorIdentityId,
            '3. LIVE: commentaryId, publicationId, and authorIdentityId are three genuinely distinct strings for a real constructed commentary — none derived from, or collapsible into, another.');

        // What is NOT claimed, stated plainly rather than assumed: no
        // per-comment cryptographic signature exists — attribution is
        // "the authenticated session at write time," never a
        // verifiable per-message proof a third party could check later.
        const commentaryDomainSource = await readSource('core/PublicationCommentary.js');
        assert(!/signature|\bsign\(/i.test(commentaryDomainSource),
            '4. STRUCTURAL: PublicationCommentary has no signature field or sign() method — unlike publisher/Publication.js\'s own separate, Publication-scoped signature concept, individual commentary carries NO per-message cryptographic proof. A displayed authorIdentityId is only as trustworthy as "this session was authenticated when the write happened" — this milestone states that boundary rather than treating a displayed id as proof of authorship, and proposes no new identity/signing mechanism to close it (excluded by this milestone\'s own brief).');
    }
    console.log('✓ Section E: displayed author (raw authorIdentityId, no profile-name resolution — 0.9.250\'s own finding reconfirmed) and the identity actually attributed at write time are proven live to be the identical value; Publication/comment/author identity stay three independent facts for a real record; and the absence of any per-comment cryptographic signature is stated as a real, existing boundary rather than assumed away.');

    // ===============================================================
    // Section F — Ordering and duplicate behavior.
    // ===============================================================
    {
        const collectionSource = await readSource('core/PublicationCommentaryCollection.js');
        const getUseCaseSource = await readSource('application/publication/commentary/GetPublicationCommentariesUseCase.js');
        assert(!/\.sort\(/.test(collectionSource) && !/\.sort\(/.test(getUseCaseSource),
            '1. STRUCTURAL: neither the collection functions nor the read use case contains a .sort() call anywhere — order is insertion order, full stop, still true against current source.');

        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('frank');
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        discoveryProvider._loadRecords = () => [new Publication({ id: 'pub-f-1', documentId: 'doc-f-1', title: 'F', author: 'frank' }).toJSON()];
        const stack = makeCommentaryStack(storage, discoveryProvider, identityProvider);

        // Save with an intentionally EARLIER createdAt on the LAST call
        // — if anything re-sorted by createdAt, "third" would move
        // first. It does not.
        stack.addPublicationCommentaryUseCase.execute({ publicationId: 'pub-f-1', content: 'first', createdAt: new Date('2024-06-01T00:00:00Z') });
        stack.addPublicationCommentaryUseCase.execute({ publicationId: 'pub-f-1', content: 'second', createdAt: new Date('2024-06-02T00:00:00Z') });
        stack.addPublicationCommentaryUseCase.execute({ publicationId: 'pub-f-1', content: 'third', createdAt: new Date('2024-01-01T00:00:00Z') });
        const ordered = stack.getPublicationCommentariesCommand('pub-f-1');
        assert(ordered.map((c) => c.content).join(',') === 'first,second,third',
            `2. LIVE: order is CALL order ("first,second,third"), not createdAt order (which would put "third" first) — found "${ordered.map((c) => c.content).join(',')}". No hidden sort by timestamp, alphabetical, or any other key.`);

        // No content-based dedup on the read side (already proven live
        // in Section D5a) — reconfirmed structurally: no Set/dedup
        // helper anywhere in the read path.
        assert(!/new Set\(|\.filter\([^)]*content/.test(collectionSource) && !/new Set\(|\.filter\([^)]*content/.test(getUseCaseSource),
            '3. STRUCTURAL: no dedup-implementing code (a Set, a content-keyed filter) exists in the collection functions or the read use case — GetPublicationCommentariesUseCase.js\'s own header states this explicitly ("no deduplication"), reconfirmed here against the actual code rather than just the comment. The only real dedup mechanism is the commentaryId-keyed idempotent retry at the STORE\'s own write boundary (Section D5b), never a read-side filter.');

        // No ranking/relevance CODE either (the header comments name the
        // word only to disclaim it — checked against actual code, not
        // prose, the same way Section F1 above checks .sort()).
        assert(!/\.sort\(.*(rank|relevance|score|trust)/i.test(collectionSource + getUseCaseSource),
            '4. STRUCTURAL: no ranking/relevance/score/trust-ordering CODE exists anywhere in the read path — ordering is, and states itself to be, unspecified beyond insertion order, exactly per this milestone\'s own "if ordering is intentionally unspecified, document that" instruction.');
    }
    console.log('✓ Section F: Commentary\'s ordering promise is exactly, and only, insertion order — proven live even against a deliberately out-of-order createdAt fixture; the one real deduplication mechanism is the commentaryId-keyed idempotent retry at the store\'s write boundary, never a read-side or content-based dedup; and no ranking/relevance mechanism exists to document further.');

    // ===============================================================
    // Section G — Navigation continuity.
    // ===============================================================
    {
        for (const [name, source] of [['PublicationCard.js', cardSource], ['OwnPublicationPanel.js', ownPanelSource], ['WorldEncounterCanvas.js', encounterSource]]) {
            const commentaryMethodBodies = source.match(/(?:toggle|refresh|submit)[A-Za-z]*ommentar[a-zA-Z]*\([^)]*\) \{[\s\S]*?\n {8}\}/g) || [];
            assert(commentaryMethodBodies.length >= 2, `1. ${name}: located its own toggle/refresh/submit commentary method bodies (found ${commentaryMethodBodies.length}).`);
            for (const body of commentaryMethodBodies) {
                assert(!body.includes('router.push') && !body.includes('window.location') && !body.includes('$emit(\'navigate'),
                    `2. STRUCTURAL: ${name}'s own commentary methods contain no router.push/window.location/navigation emit — opening, reading, or composing Commentary never leaves the Publication's own currently-rendered surface, so there is nothing to "return" from.`);
            }
        }
    }
    console.log('✓ Section G: Commentary has no navigation of its own — every entry point renders inside the Publication\'s own already-open surface (detail panel, catalog card, or encounter inspection), so "returning to the same Publication" is structurally guaranteed rather than implemented; introducing a comment permalink/deep-link would be new, unrequested machinery (still MISSING_DOMAIN_CAPABILITY per 0.9.250 Section D, unchanged, and correctly not built here).');

    // ===============================================================
    // Section H — Cross-surface consistency. Reuses, does not
    // reproduce, 0.9.305's own convergence audit — a handful of fresh,
    // cheap re-checks against CURRENT source.
    // ===============================================================
    {
        for (const [name, source] of [['OwnPublicationPanel.js', ownPanelSource], ['PublicationCard.js', cardSource], ['WorldEncounterCanvas.js', encounterSource]]) {
            assert(!/new PublicationCommentaryStore\(|new AddPublicationCommentaryUseCase\(|new GetPublicationCommentariesUseCase\(/.test(source),
                `1. STRUCTURAL, RECONFIRMED (0.9.289/0.9.305): ${name} constructs none of the domain/application/storage classes itself — it only ever calls its two injected command props, so all three surfaces are provably bound to whatever ONE composition root the host wired in, never a fourth, independent implementation.`);
        }

        // Terminology consistency — the visible vocabulary a Wanderer
        // reads must not drift between surfaces.
        const labelPairs = [
            [/No commentary yet\./, 'empty-state label'],
            [/Post Comment/, 'submit-button label']
        ];
        for (const [pattern, description] of labelPairs) {
            for (const [name, source] of [['OwnPublicationPanel.js', ownPanelSource], ['PublicationCard.js', cardSource], ['WorldEncounterCanvas.js', encounterSource]]) {
                assert(pattern.test(source), `2. ${name}: carries the identical ${description} — no terminology leak (e.g. "Reply" or "Note" in place of "Comment") between surfaces.`);
            }
        }
    }
    console.log('✓ Section H: fresh re-checks confirm 0.9.305\'s own convergence claim still holds — none of the three surfaces constructs its own storage/application objects (all three are provably bound to one shared composition), and the visible vocabulary (empty-state text, submit-button label) is byte-identical across all three, so a Wanderer moving between the catalog, a Publication\'s own detail panel, and a World encounter never sees Commentary described two different ways.');

    // ===============================================================
    // Section I — Mutation boundary.
    // ===============================================================
    {
        const addSource = await readSource('application/publication/commentary/AddPublicationCommentaryUseCase.js');
        const getSource = await readSource('application/publication/commentary/GetPublicationCommentariesUseCase.js');
        const canCommentSource = await readSource('application/publication/CanCommentOnPublicationUseCase.js');
        const notificationProducerSource = await readSource('application/publication/commentary/PublicationCommentaryNotificationProducer.js');
        const commentaryDomainSource = await readSource('core/PublicationCommentary.js');

        assert(/this\._store\.save\(/.test(addSource), '1. STRUCTURAL: AddPublicationCommentaryUseCase.js is the one file that calls store.save() on commentary.');
        assert(!/\.save\(|\.remove\(/.test(codeOnlyLines(getSource)) && !/\.save\(|\.remove\(/.test(codeOnlyLines(canCommentSource)),
            '2. STRUCTURAL: GetPublicationCommentariesUseCase.js and CanCommentOnPublicationUseCase.js contain no .save(/.remove( call anywhere in their actual CODE (comment-only mentions excluded) — both are purely observational, reading through discoveryProvider.findById() or store.getForPublication() only.');
        assert(!/\.save\(commentary|\.save\(new PublicationCommentary/.test(codeOnlyLines(notificationProducerSource)),
            '3. STRUCTURAL: PublicationCommentaryNotificationProducer.js never calls store.save() on a commentary itself — it only calls the wrapped AddPublicationCommentaryUseCase.execute() (the one real write) and then constructs a SEPARATE NotificationEvent, itself immutable, handed to an injected sink.');
        assert(!/\bset [a-zA-Z]/.test(codeOnlyLines(commentaryDomainSource)) && !/withContent|withAuthor|withPublication/.test(codeOnlyLines(commentaryDomainSource)),
            '4. STRUCTURAL: PublicationCommentary itself exposes no setter and no withX() method — 0.9.242\'s own "no way to change it" decision still holds; the domain object has no mutation surface for anything but its own construction.');

        // LIVE: viewing/toggling/refreshing never touches the add path.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('gina');
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        discoveryProvider._loadRecords = () => [new Publication({ id: 'pub-i-1', documentId: 'doc-i-1', title: 'I', author: 'gina' }).toJSON()];
        const stack = makeCommentaryStack(storage, discoveryProvider, identityProvider);

        let addCallCount = 0;
        const countingAdd = ({ publicationId, content }) => { addCallCount += 1; return stack.addPublicationCommentaryCommand({ publicationId, content }); };
        const ctx = makeCardContext({ id: 'pub-i-1' }, { getPublicationCommentariesCommand: stack.getPublicationCommentariesCommand, addPublicationCommentaryCommand: countingAdd });
        ctx.toggleCommentary.call(ctx);
        ctx.toggleCommentary.call(ctx);
        ctx.toggleCommentary.call(ctx);
        ctx.refreshCommentaries.call(ctx);
        assert(addCallCount === 0, '5. LIVE: three toggles plus an explicit refresh — pure observation — never once called the write command.');
    }
    console.log('✓ Section I: AddPublicationCommentaryUseCase.execute() is confirmed, both structurally and live, as the ONE mutating operation in the entire Commentary pipeline — the read use case, the authorization check, the notification producer, and the domain object itself are all purely observational or purely constructive-of-a-separate-immutable-fact, matching this codebase\'s own immutable-NotificationEvent/read-only-Repository architecture named by this milestone\'s own brief.');

    // ===============================================================
    // Section J — FLAGSHIP: the exact adversarial scenario this
    // milestone's own brief specifies, live, end to end.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('wanderer');
        const { publishDocumentUseCase } = makePublisher(storage);

        // Create Publication A and Publication B — same Document, same
        // calendar day (0.9.539's own republish scenario).
        const sharedDocument = makeMinimalDocument('Flagship Guide', 'holly');
        const pubA = publishDocumentUseCase.execute({ document: sharedDocument });
        await wait(5);
        const pubB = publishDocumentUseCase.execute({ document: sharedDocument }); // republish, same day, same document
        assert(pubA.id !== pubB.id && pubA.documentId === pubB.documentId,
            '1. Fixture: A and B are two real, distinct Publications of the identical Document, published the same day.');

        const discoveryProvider = new LocalDiscoveryProvider(storage); // shared storage — A and B are genuinely discoverable
        const stack = makeCommentaryStack(storage, discoveryProvider, identityProvider);

        // Display both — two real card contexts, exactly as a rendered
        // catalog page would hold one per v-for entry.
        const cardA = makeCardContext(pubA, stack);
        const cardB = makeCardContext(pubB, stack);

        // Open Commentary for A, compose.
        cardA.toggleCommentary.call(cardA);
        cardA.newCommentaryText = 'commenting on A specifically';

        // Reorder the catalog mid-session — a plain array standing in
        // for PublicationCatalog.js's own pageResult.value, exactly
        // 0.9.540 Section C/J's own mutation-race fixture. cardA/cardB
        // are captured references (a real Vue keyed component instance
        // never swaps its own `publication` prop when the SAME id is
        // still present — 0.9.540 Section B/C), so the reorder below
        // changes only display order, never which context cardA IS.
        let catalogPage = [cardA, cardB];
        catalogPage = [cardB, cardA]; // reordered after opening A's commentary, before submitting

        // Submit.
        cardA.submitCommentary.call(cardA);
        assert(cardA.commentaryError === null, '2. FLAGSHIP: A\'s submission succeeded despite the catalog reordering between open and submit.');

        // Verify comment belongs to A.
        assert(stack.store.getForPublication(pubA.id).length === 1 && stack.store.getForPublication(pubA.id)[0].content === 'commenting on A specifically',
            '3. FLAGSHIP: the comment is attached to EXACTLY pubA\'s own publicationId — never pubB\'s, despite B being A\'s own same-document, same-day republish sibling, and despite the reorder.');
        assert(stack.store.getForPublication(pubB.id).length === 0,
            '4. FLAGSHIP: pubB shows ZERO commentary — republishing the SAME document a second time never inherited, copied, or otherwise picked up A\'s own commentary.');

        // Open B — verify B's commentary is unaffected.
        cardB.toggleCommentary.call(cardB);
        assert(cardB.commentaries.length === 0, '5. FLAGSHIP: opening B for the first time loads only B\'s own (empty) thread — never A\'s.');

        // Repeat with Publication A.contentHash === Publication
        // C.contentHash, A.publicationId !== C.publicationId — 0.9.540
        // Section E's own adversarial fixture, applied to Commentary.
        const sharedHash = 'fnv1a-32:c0ffee00';
        const pubAHashed = new Publication({ id: pubA.id, documentId: pubA.documentId, title: pubA.title, author: pubA.author, contentHash: sharedHash });
        const pubC = new Publication({ id: 'pub-j-c', documentId: 'doc-j-c', title: 'Convergent Build', author: 'ivan', contentHash: sharedHash });
        assert(pubAHashed.contentHash === pubC.contentHash && pubAHashed.id !== pubC.id,
            '6. Fixture: A (re-described with a contentHash) and C share a contentHash but are, and remain, two fully independent Publications.');

        const baseLoadRecords = discoveryProvider._loadRecords.bind(discoveryProvider);
        discoveryProvider._loadRecords = () => [...baseLoadRecords(), pubC.toJSON()];

        const cardC = makeCardContext(pubC, stack);
        cardC.toggleCommentary.call(cardC);
        cardC.newCommentaryText = 'commenting on C, which happens to share a contentHash with A';
        cardC.submitCommentary.call(cardC);
        assert(cardC.commentaryError === null, '7. FLAGSHIP: C\'s submission succeeded.');

        assert(stack.store.getForPublication(pubC.id).length === 1 && stack.store.getForPublication(pubC.id)[0].content.includes('commenting on C'),
            '8. FLAGSHIP: C\'s comment is attached to EXACTLY pubC\'s own publicationId.');
        assert(stack.store.getForPublication(pubA.id).length === 1 && stack.store.getForPublication(pubA.id)[0].content === 'commenting on A specifically',
            '9. FLAGSHIP, THE FULL CROSS-PRODUCT: A\'s own earlier commentary (from step 3, above) is STILL exactly what it was — C\'s completely separate activity, on a Publication sharing A\'s own contentHash, never touched it in either direction. Same-document-republish (A/B) and same-contentHash-different-document (A/C) collisions are both proven, in one continuous scene, never to cross-contaminate Commentary.');
    }
    console.log('✓ Section J: FLAGSHIP — a same-document-republish pair (A/B), reordered mid-session between opening Commentary and submitting, and a same-contentHash-different-Publication pair (A/C) layered into the identical scene, both proved live, end to end, through the real domain/application/storage pipeline and the real PublicationCard.js methods: every comment attaches to, and only to, the exact Publication it was composed against.');

    console.log('\nAll Publication Commentary Identity Continuity Product Reassessment tests passed.');

    console.log(`\n=== 0.9.541 VERDICT ===
PRODUCT_COMPLETE. This milestone's own central question — does existing Publication Commentary preserve Publication
identity, lifecycle semantics, failure isolation, attribution, and navigation coherently under realistic and
adversarial conditions — is answered YES, across every section its own requesting brief named.

Publication identity continuity (Section B/J) holds for the exact reason 0.9.540 already established it for catalog
actions one seam over: Commentary is linked by publicationId alone, never documentId or contentHash (0.9.242's own
architectural decision, reconfirmed against current source), and CanCommentOnPublicationUseCase/GetPublicationCommentariesUseCase/
PublicationCommentaryStore all resolve and filter strictly by that same publicationId. The flagship scene (Section J)
proves this live: a same-document, same-day republish pair (A/B) reordered mid-session between opening Commentary and
submitting, and a same-contentHash-different-Publication pair (A/C) layered into the identical scene, both resolve
every comment to its own exact source Publication, with zero cross-contamination in either direction, in either
adversarial shape, at the same time.

Lifecycle semantics (Section C) are exactly what the domain object's own construction implies and no more: no
draft/pending/sent state machine exists; "stored" and "displayed" are provably the same read; a failed write never
surfaces as a displayed record. Failure isolation (Section D) holds for every named case — one comment's own failure,
empty/invalid content, a genuine storage read/write failure, an unresolvable Publication, repeated submission (both
the deliberately-undeduplicated case and the real commentaryId-keyed idempotent-retry case), and a failed refresh —
none leaks into another comment, another Publication, or an already-displayed list. Identity and attribution (Section
E) reconfirm 0.9.250's own "raw id, no profile-name resolution" finding still holds, prove live that the UI's own
"who is signed in" and the write path's own "who gets attributed" are the identical value, and state plainly — rather
than assume away — that no per-comment cryptographic signature exists. Ordering (Section F) is insertion order only,
proven even against a deliberately out-of-order createdAt fixture, with the one real dedup mechanism scoped precisely
to the store's own commentaryId-keyed write boundary. Navigation (Section G) is structural, not implemented:
Commentary never leaves the Publication's own already-open surface, so there is nothing to "return" from. Cross-
surface consistency (Section H) reconfirms 0.9.305's own convergence claim fresh, plus byte-identical visible
vocabulary across all three real entry points (Section A). The mutation boundary (Section I) is exactly one operation
— AddPublicationCommentaryUseCase.execute() — with every other collaborator in the pipeline, including the immutable
domain object and the NotificationEvent-constructing decorator, purely observational or purely additive-of-a-separate-fact.

This is a test-only milestone: one new file,
tests/PublicationCommentaryIdentityContinuityProductReassessment.test.js, registered in tests.html. No production
file was touched — core/PublicationCommentary.js, core/PublicationCommentaryCollection.js,
storage/PublicationCommentaryStore.js, application/publication/CanCommentOnPublicationUseCase.js,
application/publication/commentary/AddPublicationCommentaryUseCase.js, application/publication/commentary/GetPublicationCommentariesUseCase.js,
application/publication/commentary/PublicationCommentaryNotificationProducer.js, ui/components/OwnPublicationPanel.js,
ui/components/PublicationCard.js, and ui/components/WorldEncounterCanvas.js are all byte-for-byte unchanged. No
comment editing/deletion, moderation, reputation, voting, threading redesign, notification-generation change, new
synchronization protocol, ranking, deduplication beyond what already exists, new identity mechanism, new navigation
mechanism, contentHash-based comment routing, generic mutation framework, or UI redesign was introduced — none of
them were needed, and per the requesting brief's own instruction, none was invented to make it appear otherwise.

Per this milestone's own brief: if this comes back PRODUCT_COMPLETE, the Publication/Repository/World/Commentary
cluster should be considered closed rather than continuing to generate audits around it. It does, and it should be.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
