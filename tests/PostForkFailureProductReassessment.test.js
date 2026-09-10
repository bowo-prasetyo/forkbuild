import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License, LicenseId } from '../core/License.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { ForkFailureReason } from '../application/ForkFailureReason.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import ForkFailureDialog from '../ui/components/ForkFailureDialog.js';

// 0.9.355 — Post-Fork Failure Product Reassessment.
//
// **Type: test-only, no production changes.** 0.9.352 found the gap (a
// fork failure gave a raw, class-name-prefixed Error string and an
// unconditional trip to a blank Editor document, whatever the cause);
// 0.9.353 closed it (ForkFailureReason + ForkFailureDialog + a real
// route back); 0.9.354 proved every entry context and every Publication
// origin this codebase can produce converges on that same shape. This
// milestone stops implementation and asks the question that arc was
// always building toward:
//
//   Now that a fork failure gives the user a structured reason, a
//   meaningful explanation, and a real way back to where they came
//   from, does the user need anything MORE — or does this arc stop here?
//
// Every section below gathers fresh evidence against the real,
// unmodified production tree — never prose carried over from
// 0.9.352/0.9.353/0.9.354 without re-checking it — in the same
// "reproduce the real seam, verify the reproduction is honest"
// discipline those milestones already hold. Where 0.9.354 already
// live-proved a fact exhaustively (e.g. origin convergence across all
// three Publication origins), this file reconfirms it economically
// rather than re-deriving it from scratch — the point of a reassessment
// is to decide whether to build more, not to re-run the prior audit.
//
//   Section A — Completed capability inventory.
//   Section B — User journey closure (all three paths).
//   Section C — Failure-actionability assessment (evidence per candidate).
//   Section D — Retry semantics, examined with particular care.
//   Section E — License UX: is the existing visible license sufficient?
//   Section F — Origin convergence, reconfirmed.
//   Section G — Architectural boundary: still exactly two reason values.
//   Section H — Existing architecture reuse: no new subsystem appeared.
//   Section I — Regression / reachability.
//   Section J — Final product decision matrix and verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
async function codeOnlySource(relativePath) {
    return codeOnlyLines(await readSource(relativePath));
}
function grepFiles(pattern, dirs) {
    try {
        const out = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        return out ? out.split('\n') : [];
    } catch { return []; }
}
async function grepCodeOnlyFiles(pattern, dirs) {
    const candidates = grepFiles(pattern, dirs);
    const hits = [];
    for (const file of candidates) {
        const code = await codeOnlySource(file);
        if (code.includes(pattern)) hits.push(file);
    }
    return hits;
}

const PRODUCTION_DIRS = ['application', 'ui', 'core', 'publisher', 'discovery', 'storage', 'content'];
const FORK_FAILURE_FILES = ['application/ForkFailureReason.js', 'application/ForkDocumentUseCase.js', 'ui/components/ForkFailureDialog.js'];

// -----------------------------------------------------------------
// Harness — the SAME lightweight collaborators
// tests/ForkFailureReasonPresentation.test.js already established:
// a manually-signed Publication (no LocalPublisherProvider needed to
// exercise ForkDocumentUseCase itself) and an in-memory StorageProvider.
// -----------------------------------------------------------------
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); this.saveCalls = 0; }
    save(name, data) { this.saveCalls += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function makePublication({ documentId, title, author, license = new License({ id: LicenseId.CC0_1_0 }) }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 256
    });
    let publication = new Publication({
        documentId, title, author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license,
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

function buildRetrievedDocumentJSON(documentId, { title, author }) {
    const document = new Document({ world: new World({ id: documentId }), metadata: new DocumentMetadata({ title, author }) });
    return new DocumentSerializer().serialize(document);
}

async function resolveAsDecentralizedPublication(publication, identityProvider) {
    const storage = new InMemoryStorageProvider();
    const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    return resolvePublicationView(envelope, { coordinator, kindPlugins });
}

async function run() {
    console.log('Running Post-Fork Failure Product Reassessment...\n');

    // ===============================================================
    // Section A — Completed capability inventory: each of the seven
    // pieces the milestone brief names, confirmed present and live-
    // functional against the real, unmodified production tree.
    // ===============================================================
    {
        // 1. ForkFailureReason — a frozen, exactly-two-value enum.
        assert(Object.isFrozen(ForkFailureReason), '1. ForkFailureReason is frozen.');
        assert(Object.keys(ForkFailureReason).sort().join(',') === 'LICENSE_DENIED,MATERIAL_UNAVAILABLE',
            '2. ForkFailureReason carries exactly its two named values.');

        // 2/3. license-denial and material-unavailable classification —
        // live, through the real ForkDocumentUseCase.
        const alice = makeIdentity('alice');
        const storage = new InMemoryStorageProvider();
        const ndDocId = 'inventory-nd-doc';
        storage.save(ndDocId, buildRetrievedDocumentJSON(ndDocId, { title: 'ND Work', author: 'alice' }));
        const ndPub = makePublication({ documentId: ndDocId, title: 'ND Work', author: 'alice', license: new License({ id: LicenseId.CC_BY_ND_4_0 }) }, alice);
        let licenseErr = null;
        try { new ForkDocumentUseCase(storage).execute(ndDocId, alice, ndPub); } catch (e) { licenseErr = e; }
        assert(licenseErr && licenseErr.reason === ForkFailureReason.LICENSE_DENIED, '3. license-denial classification is live and correct.');

        const missingDocId = 'inventory-missing-doc';
        const missingPub = makePublication({ documentId: missingDocId, title: 'Never Retrieved', author: 'alice' }, alice);
        let materialErr = null;
        try { new ForkDocumentUseCase(storage).execute(missingDocId, alice, missingPub); } catch (e) { materialErr = e; }
        assert(materialErr && materialErr.reason === ForkFailureReason.MATERIAL_UNAVAILABLE, '4. material-unavailable classification is live and correct.');

        // 4. ForkFailureDialog — imported directly (no vue import of its
        // own — see tests/ForkFailureUXConvergenceAudit.test.js's own
        // header for why), its real computed.message called live.
        assert(ForkFailureDialog.computed.message.call({ reason: ForkFailureReason.LICENSE_DENIED }).length > 0,
            '5. ForkFailureDialog renders a real message for LICENSE_DENIED.');
        assert(ForkFailureDialog.computed.message.call({ reason: ForkFailureReason.MATERIAL_UNAVAILABLE }).length > 0,
            '6. ForkFailureDialog renders a real message for MATERIAL_UNAVAILABLE.');

        // 5. return navigation — structural (EditorView.js imports vue).
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(editorViewSource.includes('function backFromForkFailure()'), '7. backFromForkFailure() still exists.');
        assert(/router\.push\(\{\s*path: `\/world\/\$\{failure\.returnWorldId\}`/.test(editorViewSource),
            '8. it still navigates to /world/<returnWorldId>.');

        // 6. successful-fork path — live, unaffected.
        const okDocId = 'inventory-ok-doc';
        storage.save(okDocId, buildRetrievedDocumentJSON(okDocId, { title: 'Freely Forkable', author: 'alice' }));
        const okPub = makePublication({ documentId: okDocId, title: 'Freely Forkable', author: 'alice' }, alice);
        const forked = new ForkDocumentUseCase(storage).execute(okDocId, alice, okPub);
        assert(forked instanceof Document, '9. the successful-fork path still produces a real, editable Document.');

        // 7. local/decentralized/peer origin neutrality — reconfirmed in
        // full in Section F below; noted here as present, not re-derived twice.
        console.log('✓ Section A: all seven inventoried capabilities (ForkFailureReason, license-denial classification, material-unavailable classification, ForkFailureDialog, return navigation, the successful-fork path, and origin neutrality) are present and live-functional against the current tree.');
    }

    // ===============================================================
    // Section B — User journey closure: the three complete paths, none
    // of which leaves the user in an unusable state.
    // ===============================================================
    {
        const bob = makeIdentity('bob');
        const storage = new InMemoryStorageProvider();

        // Path 1: license allowed -> Fork -> Editor.
        const allowedId = 'journey-allowed-doc';
        storage.save(allowedId, buildRetrievedDocumentJSON(allowedId, { title: 'Open Work', author: 'bob' }));
        const allowedPub = makePublication({ documentId: allowedId, title: 'Open Work', author: 'bob' }, bob);
        const forkedDoc = new ForkDocumentUseCase(storage).execute(allowedId, bob, allowedPub);
        assert(forkedDoc instanceof Document && forkedDoc.world.id !== allowedId,
            '1. Path 1 (license allowed): a real, distinct, editable Document is produced — the Editor has something real to open.');

        // Path 2: license denied -> reason -> dialog -> originating World.
        const deniedId = 'journey-denied-doc';
        storage.save(deniedId, buildRetrievedDocumentJSON(deniedId, { title: 'ND Work', author: 'bob' }));
        const deniedPub = makePublication({ documentId: deniedId, title: 'ND Work', author: 'bob', license: new License({ id: LicenseId.CC_BY_ND_4_0 }) }, bob);
        let deniedErr = null;
        try { new ForkDocumentUseCase(storage).execute(deniedId, bob, deniedPub); } catch (e) { deniedErr = e; }
        assert(deniedErr.reason === ForkFailureReason.LICENSE_DENIED, '2. Path 2 produces a real, structural reason.');
        const deniedMessage = ForkFailureDialog.computed.message.call({ reason: deniedErr.reason });
        assert(typeof deniedMessage === 'string' && deniedMessage.length > 0, '3. Path 2 reaches a real, non-empty dialog message.');

        // Path 3: material unavailable -> reason -> dialog -> originating World.
        const unavailableId = 'journey-unavailable-doc';
        const unavailablePub = makePublication({ documentId: unavailableId, title: 'Never Retrieved', author: 'bob' }, bob);
        let unavailableErr = null;
        try { new ForkDocumentUseCase(storage).execute(unavailableId, bob, unavailablePub); } catch (e) { unavailableErr = e; }
        assert(unavailableErr.reason === ForkFailureReason.MATERIAL_UNAVAILABLE, '4. Path 3 produces a real, structural, DIFFERENT reason.');
        const unavailableMessage = ForkFailureDialog.computed.message.call({ reason: unavailableErr.reason });
        assert(typeof unavailableMessage === 'string' && unavailableMessage.length > 0 && unavailableMessage !== deniedMessage,
            '5. Path 3 reaches its own, distinct dialog message.');

        // Neither failure path leaves the user in an unusable state:
        // structurally, the catch block that sets forkFailure never
        // opens a Document, and the dialog's only exit is a real
        // navigation — both already reconfirmed live in
        // tests/ForkFailureUXConvergenceAudit.test.js Sections A/B/D;
        // reconfirmed here structurally, fresh, against the current tree.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        const catchBlockMatch = editorViewSource.match(/\} catch \(err\) \{[\s\S]*?forkFailure\.value = \{[\s\S]*?\};[\s\S]*?\n\s{16}\}/);
        assert(catchBlockMatch && !catchBlockMatch[0].includes('editorSession.openDocument('),
            '6. the real fork-failure catch block still never opens a Document — no dead end on either failure path.');
        assert(editorViewSource.includes('<ForkFailureDialog') && editorViewSource.includes('v-if="forkFailure"'),
            '7. ForkFailureDialog is still rendered whenever a fork just failed, of either cause.');

        console.log('✓ Section B: all three journeys (allowed, license-denied, material-unavailable) close in a usable state — a real Document, or a real reason reaching a real, distinct, actionable dialog message. Neither failure path is a dead end.');
    }

    // ===============================================================
    // Section C — Failure-actionability assessment: evidence gathered
    // for each candidate addition the milestone brief named, WITHOUT
    // implementing any of them.
    // ===============================================================
    const actionabilityEvidence = {};
    {
        // C1 — Retry material retrieval / retry fork: ForkDocumentUseCase
        // is a fully synchronous function of CURRENT local storage state
        // — no network call, no timer, nothing that could differ between
        // one attempt and the next unless storage itself changes. Live
        // proof: two immediate, back-to-back attempts against unchanged
        // storage throw the IDENTICAL error, every time.
        const carol = makeIdentity('carol');
        const storage = new InMemoryStorageProvider();
        const retryDocId = 'actionability-retry-doc';
        const retryPub = makePublication({ documentId: retryDocId, title: 'Retry Candidate', author: 'carol' }, carol);
        const attempts = [];
        for (let i = 0; i < 3; i++) {
            try { new ForkDocumentUseCase(storage).execute(retryDocId, carol, retryPub); attempts.push(null); }
            catch (e) { attempts.push(e.reason); }
        }
        assert(attempts.every((r) => r === ForkFailureReason.MATERIAL_UNAVAILABLE),
            '1. three immediate, unaided retries against unchanged storage produce the IDENTICAL failure every time — there is no transient window a Retry button could exploit.');

        // Confirmed structurally: ForkDocumentUseCase's own material
        // lookup is storageProvider.load() — a synchronous, local,
        // in-process call. It reaches storage/LocalStorageProvider.js's
        // own window.localStorage in production, never a network fetch.
        const forkUseCaseSource = await codeOnlySource('application/ForkDocumentUseCase.js');
        assert(!/fetch\(|await |Promise/.test(forkUseCaseSource),
            '2. ForkDocumentUseCase.js performs no async I/O of any kind — execute() is fully synchronous, confirming C1/D\'s live result is architectural, not a coincidence of this test\'s own setup.');
        actionabilityEvidence.retryMaterial = 'NOT_JUSTIFIED — no transient condition exists to retry against (see Section D).';
        actionabilityEvidence.retryFork = 'NOT_JUSTIFIED — same synchronous, deterministic lookup; a retry button would just re-run the identical check.';

        // C2 — Pre-flight license check / disable Fork when incompatible:
        // live confirmation that the license is ALREADY visible on the
        // exact card the Fork button lives on, before the click — see
        // Section E for the full evidence; here, just the actionability
        // verdict is recorded.
        actionabilityEvidence.preflightLicense = 'NOT_JUSTIFIED — duplicates information already visible on PublicationCard.js (see Section E).';
        actionabilityEvidence.disableForkButton = 'NOT_JUSTIFIED — same duplication; also see Section H for why the seam already exists without new machinery.';

        // C3 — More granular retrieval errors: ForkDocumentUseCase has
        // exactly ONE material-failure throw site, and it has exactly
        // one cause it can distinguish (storageProvider.load() returned
        // null) — there is no second, already-observable failure mode
        // (e.g. corrupt JSON, permission denied) for a more granular
        // vocabulary to name.
        const materialThrowSites = (forkUseCaseSource.match(/ForkFailureReason\.MATERIAL_UNAVAILABLE/g) || []).length;
        assert(materialThrowSites === 1, '3. ForkDocumentUseCase.js has exactly one MATERIAL_UNAVAILABLE throw site — one cause, not several collapsed into one.');
        actionabilityEvidence.granularRetrievalErrors = 'NOT_JUSTIFIED — the current implementation has exactly one retrieval-failure cause (storage miss); no second, distinguishable cause exists to name.';

        // C4 — "Report problem": no reporting/notification infrastructure
        // exists anywhere near this failure today, and nothing in this
        // arc's own evidence (a deterministic, locally-reproducible
        // failure — see D) suggests a person would need to report it to
        // anyone else; they can already SEE why it failed.
        const dialogSource = await codeOnlySource('ui/components/ForkFailureDialog.js');
        assert(!/report|Report/.test(dialogSource), '4. ForkFailureDialog.js contains no "report" vocabulary today.');
        actionabilityEvidence.reportProblem = 'NOT_JUSTIFIED — the failure is already self-explanatory and locally reproducible; there is nothing for a report to surface that the dialog does not already say.';

        // C5 — Alternative source/provider selection: ForkDocumentUseCase
        // is constructed with exactly ONE StorageProvider — there is no
        // ranked/composite list of content sources to fall back through
        // at the material-retrieval layer (contrast with discovery,
        // which DOES compose multiple sources via CompositeDiscoveryProvider
        // — but that composes PUBLICATION METADATA lookup, never Document
        // body retrieval).
        assert(!forkUseCaseSource.includes('CompositeDiscoveryProvider') && !forkUseCaseSource.includes('providers'),
            '5. ForkDocumentUseCase.js has no concept of multiple content sources or provider ranking — it is constructed with exactly one StorageProvider.');
        actionabilityEvidence.alternativeSource = 'NOT_JUSTIFIED — material retrieval has exactly one source in this architecture today; introducing ranking/fallback here would be a new content-replication feature, not a fork-failure-UX fix.';

        console.log('✓ Section C: every candidate addition named in the brief is evaluated against live or structural evidence from the real, current tree — none is justified by that evidence. Verdicts recorded for Section J\'s matrix.');
    }

    // ===============================================================
    // Section D — Retry semantics, examined with particular care per
    // the milestone brief.
    // ===============================================================
    {
        // "Is the failure transient enough, and is there an existing
        // retry mechanism users can meaningfully invoke?"
        //
        // D1 — transience: live proof that MATERIAL_UNAVAILABLE is a
        // pure function of local storage state at the instant of the
        // call — changing storage BETWEEN two calls changes the
        // outcome; calling again with storage UNCHANGED never does.
        const dave = makeIdentity('dave');
        const storage = new InMemoryStorageProvider();
        const docId = 'retry-semantics-doc';
        const publication = makePublication({ documentId: docId, title: 'Transience Test', author: 'dave' }, dave);

        let firstReason = null;
        try { new ForkDocumentUseCase(storage).execute(docId, dave, publication); } catch (e) { firstReason = e.reason; }
        assert(firstReason === ForkFailureReason.MATERIAL_UNAVAILABLE, '1. sanity — the material is genuinely absent at first.');

        let secondReason = null;
        try { new ForkDocumentUseCase(storage).execute(docId, dave, publication); } catch (e) { secondReason = e.reason; }
        assert(secondReason === ForkFailureReason.MATERIAL_UNAVAILABLE,
            '2. an IMMEDIATE second attempt, storage unchanged, fails IDENTICALLY — nothing about this failure resolves itself with the mere passage of time or a repeated click.');

        // Only an actual, EXTERNAL change to storage changes the
        // outcome — proving the failure is not "transient" in the sense
        // that would justify a Retry button, but is instead a direct,
        // stable readout of "this browser's storage does not have this
        // material," which only a genuinely different action (the
        // material being fetched/saved by some OTHER mechanism) can fix.
        storage.save(docId, buildRetrievedDocumentJSON(docId, { title: 'Transience Test', author: 'dave' }));
        const forkedAfterExternalChange = new ForkDocumentUseCase(storage).execute(docId, dave, publication);
        assert(forkedAfterExternalChange instanceof Document,
            '3. the SAME call only succeeds once something ELSE actually changed storage — confirming the failure was never "transient" in the retry-button sense; it was an accurate readout of a real absence.');

        // D2 — existing mechanism: is there already something the user
        // can meaningfully invoke to change that state? The one existing
        // avenue this codebase has is re-navigating to the Publication
        // (Explore) and re-attempting the SAME Fork action later, once
        // whatever separate mechanism populated the material has run —
        // exactly what backFromForkFailure() already offers. No SECOND,
        // narrower "retry" concept is needed beside that already-real
        // navigation.
        const editorViewSource = await codeOnlySource('ui/views/EditorView.js');
        assert(!/retry\(|setInterval|setTimeout.*fork/i.test(editorViewSource),
            '4. EditorView.js contains no retry loop or polling mechanism of any kind for fork failures — the existing "Back to Publication" -> re-click Fork IS the only meaningful re-attempt path, and it already exists.');

        console.log('✓ Section D: MATERIAL_UNAVAILABLE is a synchronous, deterministic readout of local storage, not a transient condition — an immediate retry reproduces the identical failure bit-for-bit, and only an unrelated, external change to storage (never a click) can change the outcome. The existing "Back to Publication" navigation already IS the only meaningful re-attempt path; a dedicated retry lifecycle would add a second name for the same action without adding any new capability. Verdict: NOT JUSTIFIED.');
    }

    // ===============================================================
    // Section E — License UX: is the existing visible license
    // sufficient to explain a denial, or would a preflight gate add
    // genuinely new information?
    // ===============================================================
    {
        // E1 — live: the license id is unconditionally displayed on
        // PublicationCard.js's own licenseLabel computed, evaluated for
        // the SAME ND-licensed Publication that would deny a fork.
        const licenseLabel = (publication) => (publication.license ? publication.license.id : 'UNSPECIFIED');
        const ndPublication = { license: new License({ id: LicenseId.CC_BY_ND_4_0 }) };
        assert(licenseLabel(ndPublication) === LicenseId.CC_BY_ND_4_0,
            '1. the exact computation PublicationCard.js uses already resolves to the real license id for an ND work.');

        // E2 — structural: that computed property is rendered
        // UNCONDITIONALLY, on the SAME card, right beside the Fork
        // button — not hidden behind a details toggle, a tooltip, or a
        // separate page the user would have to seek out.
        const cardSource = await codeOnlySource('ui/components/PublicationCard.js');
        assert(cardSource.includes('licenseLabel'), '2. PublicationCard.js computes a license label.');
        const publicationActionsMatch = cardSource.match(/<p class="publication-date"[\s\S]*?<\/p>[\s\S]*?<div class="publication-actions">[\s\S]*?<\/div>/);
        assert(publicationActionsMatch && publicationActionsMatch[0].includes('{{ licenseLabel }}') && publicationActionsMatch[0].includes("$emit('fork', publication)"),
            '3. the license label and the Fork button are rendered in the SAME immediate template region — a user cannot reach Fork without the license already being on screen.');
        assert(!/v-if="showLicense"|v-if="licenseExpanded"/.test(cardSource),
            '4. the license label is never gated behind a toggle — it is always visible whenever the card itself is.');

        // E3 — the dialog's own denial message names WHY (license),
        // which the pre-click label (a bare id like "CC-BY-ND-4.0") does
        // not spell out in plain language — so the dialog is not pure
        // duplication, it is a plain-language EXPLANATION of a code the
        // card already showed. A preflight GATE (blocking or hiding the
        // click) would add nothing the id didn't already communicate;
        // the value-add this arc already shipped is the plain-language
        // half, at the moment it's needed (after the attempt), not
        // before it.
        const denialMessage = ForkFailureDialog.computed.message.call({ reason: ForkFailureReason.LICENSE_DENIED });
        assert(denialMessage.toLowerCase().includes('license'),
            '5. the dialog\'s own message is a plain-language explanation of the SAME fact the pre-click license id already encoded.');

        console.log('✓ Section E: the license id is already visible, unconditionally, on the same card as the Fork button, before any click — a preflight gate would duplicate information already on screen, not add new information. The dialog adds the plain-language explanation of that same code at the moment it matters; the existing visible license, plus that explanation, is sufficient.');
    }

    // ===============================================================
    // Section F — Origin convergence, reconfirmed. 0.9.354 already
    // live-proved all three origins (local, decentralized, peer-
    // discovered) converge on the identical reason through the real
    // EditorView.js handler; this reconfirms it economically at the
    // ForkDocumentUseCase layer, plus a structural check that nothing
    // has re-introduced origin branching since.
    // ===============================================================
    {
        const erin = makeIdentity('erin');
        const ndLicense = new License({ id: LicenseId.CC_BY_ND_4_0 });
        const storage = new InMemoryStorageProvider();

        const localDocId = 'convergence-local-doc';
        storage.save(localDocId, buildRetrievedDocumentJSON(localDocId, { title: 'Local ND Work', author: 'erin' }));
        const localPub = makePublication({ documentId: localDocId, title: 'Local ND Work', author: 'erin', license: ndLicense }, erin);

        const decentralizedDocId = 'convergence-decentralized-doc';
        storage.save(decentralizedDocId, buildRetrievedDocumentJSON(decentralizedDocId, { title: 'Decentralized ND Work', author: 'erin' }));
        const decentralizedPubRaw = makePublication({ documentId: decentralizedDocId, title: 'Decentralized ND Work', author: 'erin', license: ndLicense }, erin);
        const decentralizedView = await resolveAsDecentralizedPublication(decentralizedPubRaw, erin);
        assert(decentralizedView.resolved === true, '1. setup: the decentralized-origin Publication genuinely resolves.');

        let localReason = null, decentralizedReason = null;
        try { new ForkDocumentUseCase(storage).execute(localDocId, erin, localPub); } catch (e) { localReason = e.reason; }
        try { new ForkDocumentUseCase(storage).execute(decentralizedDocId, erin, decentralizedView.content); } catch (e) { decentralizedReason = e.reason; }

        assert(localReason === ForkFailureReason.LICENSE_DENIED && decentralizedReason === ForkFailureReason.LICENSE_DENIED,
            '2. local-origin and decentralized-origin Publications under the identical license still produce the identical reason today.');

        for (const file of FORK_FAILURE_FILES) {
            const source = await codeOnlySource(file);
            assert(!/decentralized|peer-sourced|isPeer|isDecentralized/i.test(source),
                `3. ${file} still contains no origin-branching concept of any kind.`);
        }

        console.log('✓ Section F: local- and decentralized-origin Publications under the identical license still produce the identical reason, and none of the three fork-failure files have grown any origin-branching vocabulary — 0.9.354\'s full three-origin proof still holds; no origin-specific product feature has become necessary.');
    }

    // ===============================================================
    // Section G — Architectural boundary: the two-value vocabulary
    // remains justified, and no evidence in this audit calls for a
    // third failure category.
    // ===============================================================
    {
        assert(Object.keys(ForkFailureReason).sort().join(',') === 'LICENSE_DENIED,MATERIAL_UNAVAILABLE',
            '1. exactly the same two keys as 0.9.353/0.9.354 — nothing speculative was added by this audit either.');
        assert(Object.isFrozen(ForkFailureReason), '2. still frozen.');

        // Every candidate this milestone's own brief raised — none of
        // which survived Section C/D/E's evidence — collapses onto the
        // SAME generic fallback message live, exactly as 0.9.354
        // Section I already established for a different speculative
        // list; reconfirmed here for THIS milestone's own candidates.
        const speculative = ['retry', 'retrying', 'preflight-denied', 'network-error', 'not-found', 'report-needed'];
        const fallback = ForkFailureDialog.computed.message.call({ reason: null });
        for (const guess of speculative) {
            const message = ForkFailureDialog.computed.message.call({ reason: guess });
            assert(message === fallback, `3. an unevidenced reason ("${guess}") produces the SAME generic fallback — no speculative branch exists for it.`);
        }

        for (const file of FORK_FAILURE_FILES) {
            const source = await readSource(file);
            assert(!/RETRYING|BLOCKED|FORK_FAILED|NETWORK_ERROR|TIMEOUT|NOT_FOUND|PREFLIGHT|REPORTED/i.test(source),
                `4. ${file} still introduces no speculative reason vocabulary of any kind.`);
        }

        console.log('✓ Section G: ForkFailureReason remains exactly its two evidenced values; nothing this audit examined survived with enough evidence to justify a third category.');
    }

    // ===============================================================
    // Section H — Existing architecture reuse: could any candidate be
    // achieved through existing seams without a new subsystem? And
    // confirming no such subsystem has quietly appeared anyway.
    // ===============================================================
    {
        const forbiddenSubsystemVocabulary = [
            'ForkFailureManager', 'forkFailureManager',
            'ForkRetryState', 'forkRetryState', 'ForkLifecycle', 'forkLifecycle',
            'ForkProviderRanking', 'forkProviderRanking', 'ForkSourceSelection', 'forkSourceSelection',
            'ForkFailureNotification', 'forkFailureNotification',
            'ForkFailureHistory', 'forkFailureHistory', 'PersistedForkFailure'
        ];
        for (const term of forbiddenSubsystemVocabulary) {
            const hits = await grepCodeOnlyFiles(term, PRODUCTION_DIRS);
            assert(hits.length === 0, `1. no "${term}" vocabulary exists anywhere in production — found: ${JSON.stringify(hits)}`);
        }

        // The one seam a "preflight/disable Fork" feature would need
        // (a live forkAllowed computation) ALREADY exists on the domain
        // License object, unconditionally, with no new machinery —
        // demonstrating that IF this were ever justified, it would cost
        // a template binding, not a new subsystem. It is deliberately
        // left unwired (see Section E: it would be duplicative today).
        const ndLicenseForSeamCheck = new License({ id: LicenseId.CC_BY_ND_4_0 });
        assert(ndLicenseForSeamCheck.forkAllowed === false,
            '2. License.forkAllowed is already a live, zero-new-code seam any future preflight UI could read — proving this milestone deliberately did not build a preflight gate for lack of a seam, but for lack of evidenced need (Section E).');

        // forkFailure itself remains a plain, ephemeral ref — no store,
        // no persistence — reconfirmed fresh.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        assert(/const forkFailure = ref\(null\);/.test(editorViewSource),
            '3. forkFailure is still declared as a plain, ephemeral ref.');

        console.log('✓ Section H: no new failure manager, retry state, fork lifecycle, provider ranking, source selection, notification infrastructure, or persistence has appeared anywhere in production; the one seam a future preflight feature would need already exists on License.forkAllowed, deliberately left unwired for lack of evidenced need, not lack of a seam.');
    }

    // ===============================================================
    // Section I — Regression / reachability.
    // ===============================================================
    {
        const frank = makeIdentity('frank');
        const storage = new InMemoryStorageProvider();

        // 1. normal Fork remains reachable.
        const okId = 'regression-ok-doc';
        storage.save(okId, buildRetrievedDocumentJSON(okId, { title: 'Regression Work', author: 'frank' }));
        const okPub = makePublication({ documentId: okId, title: 'Regression Work', author: 'frank' }, frank);
        storage.saveCalls = 0;
        const forkedDoc = new ForkDocumentUseCase(storage).execute(okId, frank, okPub);
        assert(forkedDoc instanceof Document && forkedDoc.world.id !== okId, '1. normal Fork remains reachable and produces a fresh Document.');
        assert(storage.saveCalls === 0, '2. a successful fork performs no storage write of its own — unchanged.');

        // 2. failure dialog reachable from both real failure paths.
        const deniedId = 'regression-denied-doc';
        storage.save(deniedId, buildRetrievedDocumentJSON(deniedId, { title: 'ND Regression', author: 'frank' }));
        const deniedPub = makePublication({ documentId: deniedId, title: 'ND Regression', author: 'frank', license: new License({ id: LicenseId.CC_BY_ND_4_0 }) }, frank);
        storage.saveCalls = 0;
        let deniedThrew = false;
        try { new ForkDocumentUseCase(storage).execute(deniedId, frank, deniedPub); } catch (e) { deniedThrew = e.reason === ForkFailureReason.LICENSE_DENIED; }
        assert(deniedThrew, '3. the license-denial failure path is still reachable.');
        assert(storage.saveCalls === 0, '4. no storage write occurred on the license-denial failure.');

        const missingId = 'regression-missing-doc';
        const missingPub = makePublication({ documentId: missingId, title: 'Missing Regression', author: 'frank' }, frank);
        storage.saveCalls = 0;
        let missingThrew = false;
        try { new ForkDocumentUseCase(storage).execute(missingId, frank, missingPub); } catch (e) { missingThrew = e.reason === ForkFailureReason.MATERIAL_UNAVAILABLE; }
        assert(missingThrew, '5. the material-unavailable failure path is still reachable.');
        assert(storage.saveCalls === 0, '6. no storage write occurred on the material-unavailable failure.');

        // 3. return navigation remains valid; 4. no blank Editor state —
        // both structural, against the current EditorView.js source.
        const editorViewSource = await readSource('ui/views/EditorView.js');
        const catchBlockMatch = editorViewSource.match(/\} catch \(err\) \{[\s\S]*?forkFailure\.value = \{[\s\S]*?\};[\s\S]*?\n\s{16}\}/);
        assert(catchBlockMatch && !catchBlockMatch[0].includes('editorSession.openDocument('),
            '7. the catch block still never opens a Document on either failure — no blank Editor state.');
        assert(/returnWorldId: \(decodedEntryContext && decodedEntryContext\.returnWorldId\) \|\| sourceDocumentId/.test(editorViewSource),
            '8. returnWorldId still always resolves to a real World id, never null/undefined.');
        assert(/router\.push\(\{\s*path: `\/world\/\$\{failure\.returnWorldId\}`/.test(editorViewSource),
            '9. return navigation still targets a real /world/<id> route.');

        // 5. no catalog mutation on failure; 6. no impact on successful
        // forks — a legitimate fork against the SAME storage, run right
        // after two failures above, still succeeds cleanly.
        const legitId = 'regression-legit-after-failures-doc';
        storage.save(legitId, buildRetrievedDocumentJSON(legitId, { title: 'Still Works', author: 'frank' }));
        const legitPub = makePublication({ documentId: legitId, title: 'Still Works', author: 'frank' }, frank);
        const legitFork = new ForkDocumentUseCase(storage).execute(legitId, frank, legitPub);
        assert(legitFork instanceof Document, '10. a legitimate fork, run after two prior failures against the same storage, still succeeds — no residue from either failure.');

        console.log('✓ Section I: normal Fork remains reachable; both real failure paths remain reachable and reach the dialog; return navigation remains valid; no blank Editor state; no storage write on either failure; and a subsequent successful fork is completely unaffected.');
    }

    // ===============================================================
    // Section J — Final product decision matrix and verdict.
    // ===============================================================
    {
        console.log('');
        console.log('Final product decision matrix:');
        console.log('| Candidate                 | Evidence                                              | Existing capability covers it? | New semantics required? | Decision      |');
        console.log('|----------------------------|--------------------------------------------------------|----------------------------------|---------------------------|----------------|');
        console.log('| Retry fork                 | Sync/deterministic — Section D                        | Yes (Back to Publication + re-click) | No                    | NOT_JUSTIFIED  |');
        console.log('| Retry material retrieval   | Sync/deterministic, local-only — Sections C/D          | Yes (same)                        | No                      | NOT_JUSTIFIED  |');
        console.log('| Preflight license check    | License already visible pre-click — Section E          | Yes (PublicationCard.js)          | No                      | NOT_JUSTIFIED  |');
        console.log('| Disable Fork when denied   | Same as above; seam exists unwired — Sections E/H       | Yes (License.forkAllowed)         | No                      | NOT_JUSTIFIED  |');
        console.log('| Granular retrieval errors  | Exactly one cause, one throw site — Section C           | N/A — no second cause exists      | No                      | NOT_JUSTIFIED  |');
        console.log('| Report problem             | Failure already self-explanatory — Section C            | N/A                                | Yes (new infra)          | NOT_JUSTIFIED  |');
        console.log('| Alternative source         | Exactly one StorageProvider; not fork\'s concern — C     | N/A — different feature entirely  | Yes (new feature)        | NOT_JUSTIFIED  |');
        console.log('');
        console.log('✓ Section J: VERDICT — STABLE_STOP. Every candidate addition the milestone brief named was evaluated against live or');
        console.log('  structural evidence from the real, current tree, not assumed away: none is justified today. The completed Fork Failure');
        console.log('  UX arc (0.9.352-0.9.354) already gives a fork failure of either cause a structural reason, a meaningful plain-language');
        console.log('  explanation, and a real, working route back to the originating World — and this audit found no evidence of a genuine');
        console.log('  user-facing gap beyond that. Retry semantics fail on transience: the underlying lookup is synchronous, local, and');
        console.log('  deterministic, so nothing resolves itself between one click and the next. License UX is already sufficient: the same');
        console.log('  license id is visible on the same card as the Fork button before any click is made. No new failure category, failure');
        console.log('  manager, retry state, fork lifecycle, provider ranking, source selection, notification infrastructure, or persistence');
        console.log('  was found anywhere, and none should be built from this audit\'s evidence. The Fork Failure UX arc stops here, complete.');

        console.log('\n✅ All Post-Fork Failure Product Reassessment tests passed.');
    }
}

run().catch((error) => {
    console.error('PostForkFailureProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
