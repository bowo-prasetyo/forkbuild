import { readFile } from 'node:fs/promises';

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

// 0.9.353 — Fork Failure Reason Presentation.
//
// 0.9.352's own Section F traced the exact product gap: a fork failure
// — license denial OR retrieval failure alike — gave the user one raw,
// class-name-prefixed Error string in a transient toast, then an
// unconditional trip to a blank, un-contextualized Editor document with
// no way back to the Publication they came from. This milestone closes
// that gap at the smallest seam 0.9.352 itself recommended (Section J):
//
//   application/ForkFailureReason.js   — a small, named enum (NEW),
//       mirroring application/PublicationResolutionOutcome.js's own
//       already-proven shape.
//   application/ForkDocumentUseCase.js — its two existing throw sites
//       (license denial, missing document) now attach `.reason` from
//       that enum. Domain semantics UNCHANGED: still throws, still the
//       same message text, still enforced before any load/clone/save.
//   ui/components/ForkFailureDialog.js — a small presentational dialog
//       (NEW) reading ONLY `.reason`, mapping it to one of two specific
//       messages (never string-matching `.message`).
//   ui/views/EditorView.js             — the route.query.fork catch
//       block now sets a `forkFailure` ref (covering the Editor with
//       the dialog above) instead of a transient toast, and offers a
//       route back to the Publication/World the viewer came from.
//
// This file tests the real, unmodified production code above — no
// production change is made by this file itself. Sections A-D exercise
// ForkDocumentUseCase directly (semantic distinction, success
// regression); E-F verify the UI boundary structurally, the same
// readSource() posture 0.9.352's own Section D/F/I already used, since
// ui/views/EditorView.js and ui/components/ForkFailureDialog.js both
// import `vue`/`vue-router` and so stay outside this repo's plain
// `node tests/*.test.js` sweep if imported directly; G-J close out
// failure isolation, origin neutrality, the architecture boundary, and
// scope.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

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
        documentId,
        title,
        author,
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

// Same admission gate as 0.9.337-0.9.352's own test files — a
// Publication resolved through a real PublicationResolver.publish(),
// modeling "this Publication arrived via decentralized resolution"
// without needing a live peer connection (0.9.352's own Section C
// already proved local vs. decentralized converge identically; this
// file reuses that same posture for Section H below, never re-proving
// the peer transport itself).
async function resolveAsDecentralizedPublication(publication, identityProvider) {
    const storage = new InMemoryStorageProvider();
    const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    return resolvePublicationView(envelope, { coordinator, kindPlugins });
}

function buildRetrievedDocumentJSON(documentId, { title, author }) {
    const document = new Document({
        world: new World({ id: documentId }),
        metadata: new DocumentMetadata({ title, author })
    });
    return new DocumentSerializer().serialize(document);
}

async function run() {
    console.log('Running Fork Failure Reason Presentation tests...\n');

    // ===============================================================
    // Section A — License denial: a real license-denied fork reaches
    // the intended presentation (ForkFailureReason.LICENSE_DENIED).
    // ===============================================================
    {
        const alice = makeIdentity('alice');
        const bob = makeIdentity('bob');
        const documentId = 'license-denial-doc';
        const ndLicense = new License({ id: LicenseId.CC_BY_ND_4_0 });
        const publication = makePublication({ documentId, title: 'No Derivatives', author: 'alice', license: ndLicense }, alice);
        assert(publication.license.forkAllowed === false, '1. setup: this license genuinely disallows forking.');

        const storage = new InMemoryStorageProvider();
        storage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'No Derivatives', author: 'alice' }));

        let caught = null;
        try {
            new ForkDocumentUseCase(storage).execute(documentId, bob, publication);
        } catch (err) {
            caught = err;
        }
        assert(caught instanceof Error, '2. a license-denied fork genuinely throws.');
        assert(caught.reason === ForkFailureReason.LICENSE_DENIED,
            `3. the thrown Error carries reason "${caught.reason}" — exactly ForkFailureReason.LICENSE_DENIED, a structural signal, not a string a caller has to parse out of .message.`);
        assert(caught.message === 'ForkDocumentUseCase: forking is not permitted under license CC-BY-ND-4.0',
            '4. the existing, real message text is unchanged — 0.9.353 adds a signal, it does not rewrite domain wording.');
    }
    console.log('✓ Section A: a real license-denied fork reaches ForkFailureReason.LICENSE_DENIED, with the existing message text left unchanged.');

    // ===============================================================
    // Section B — Material unavailable: a real missing-material fork
    // reaches a DIFFERENT presentation (ForkFailureReason.MATERIAL_UNAVAILABLE).
    // ===============================================================
    {
        const carol = makeIdentity('carol');
        const dave = makeIdentity('dave');
        const documentId = 'material-unavailable-doc';
        const publication = makePublication({ documentId, title: 'Never Retrieved', author: 'carol' }, carol);

        const emptyStorage = new InMemoryStorageProvider();
        let caught = null;
        try {
            new ForkDocumentUseCase(emptyStorage).execute(documentId, dave, publication);
        } catch (err) {
            caught = err;
        }
        assert(caught instanceof Error, '1. a missing-material fork genuinely throws.');
        assert(caught.reason === ForkFailureReason.MATERIAL_UNAVAILABLE,
            `2. the thrown Error carries reason "${caught.reason}" — exactly ForkFailureReason.MATERIAL_UNAVAILABLE.`);
        assert(caught.message === `ForkDocumentUseCase: no document found with id "${documentId}"`,
            '3. the existing, real message text is unchanged.');
    }
    console.log('✓ Section B: a real missing-material fork reaches ForkFailureReason.MATERIAL_UNAVAILABLE — a genuinely different value from Section A\'s LICENSE_DENIED.');

    // ===============================================================
    // Section C — Semantic distinction: the two failures cannot
    // collapse into the same user-facing reason, live and structurally.
    // ===============================================================
    {
        assert(ForkFailureReason.LICENSE_DENIED !== ForkFailureReason.MATERIAL_UNAVAILABLE,
            '1. the two ForkFailureReason values are genuinely distinct.');
        assert(Object.isFrozen(ForkFailureReason),
            '2. ForkFailureReason is a frozen enum — mirroring application/PublicationResolutionOutcome.js\'s own shape, never a mutable bag a caller could redefine.');

        // Live, side by side: same storage, two different Publications,
        // two different, correctly-attributed reasons.
        const erin = makeIdentity('erin');
        const licenseDoc = 'semantic-distinction-license-doc';
        const missingDoc = 'semantic-distinction-missing-doc';
        const ndPub = makePublication({ documentId: licenseDoc, title: 'ND Work', author: 'erin', license: new License({ id: LicenseId.CC_BY_ND_4_0 }) }, erin);
        const cc0Pub = makePublication({ documentId: missingDoc, title: 'Never Retrieved Work', author: 'erin' }, erin);

        const storage = new InMemoryStorageProvider();
        storage.save(licenseDoc, buildRetrievedDocumentJSON(licenseDoc, { title: 'ND Work', author: 'erin' }));
        // missingDoc deliberately never saved.

        let licenseReason = null;
        let materialReason = null;
        try { new ForkDocumentUseCase(storage).execute(licenseDoc, erin, ndPub); } catch (err) { licenseReason = err.reason; }
        try { new ForkDocumentUseCase(storage).execute(missingDoc, erin, cc0Pub); } catch (err) { materialReason = err.reason; }

        assert(licenseReason === ForkFailureReason.LICENSE_DENIED && materialReason === ForkFailureReason.MATERIAL_UNAVAILABLE,
            '3. the SAME use case, the SAME storage instance, produces two DIFFERENT reasons for two genuinely different causes.');

        // Structural: ForkFailureDialog.js maps each reason to a
        // DIFFERENT literal string — never the same text, never derived
        // from one another.
        const dialogSource = await readSource('ui/components/ForkFailureDialog.js');
        const licenseMessageMatch = dialogSource.match(/\[ForkFailureReason\.LICENSE_DENIED\]:\s*['"]([^'"]+)['"]/);
        const materialMessageMatch = dialogSource.match(/\[ForkFailureReason\.MATERIAL_UNAVAILABLE\]:\s*['"]([^'"]+)['"]/);
        assert(licenseMessageMatch && materialMessageMatch, '4. ForkFailureDialog.js names a distinct message literal for each reason.');
        assert(licenseMessageMatch[1] !== materialMessageMatch[1],
            `5. the two presented messages are genuinely different strings: "${licenseMessageMatch[1]}" vs. "${materialMessageMatch[1]}".`);
        assert(!/message\.includes\(.license.\)|message\.includes\(.license.\)/i.test(dialogSource),
            '6. ForkFailureDialog.js never infers the reason by string-matching a message — it branches on the `.reason` prop value alone.');
    }
    console.log('✓ Section C: LICENSE_DENIED and MATERIAL_UNAVAILABLE are structurally distinct values that never collapse into one presentation, live and in ForkFailureDialog.js\'s own message map.');

    // ===============================================================
    // Section D — Successful fork regression: valid licensed material
    // still opens a genuine, editable Document — the successful path
    // is untouched by 0.9.353.
    // ===============================================================
    {
        const frank = makeIdentity('frank');
        const grace = makeIdentity('grace');
        const documentId = 'successful-fork-regression-doc';
        const publication = makePublication({ documentId, title: 'Freely Forkable', author: 'frank', license: new License({ id: LicenseId.CC0_1_0 }) }, frank);

        const storage = new InMemoryStorageProvider();
        storage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'Freely Forkable', author: 'frank' }));

        const forkedDocument = new ForkDocumentUseCase(storage).execute(documentId, grace, publication);
        assert(forkedDocument instanceof Document, '1. a legitimately-licensed, retrieved fork still returns a real, editable Document.');
        assert(forkedDocument.metadata.title === 'Fork of Freely Forkable', '2. the fork\'s own derived title is unchanged.');
        assert(forkedDocument.world.id !== documentId, '3. the fork still gets a fresh world.id.');
        assert(!('reason' in forkedDocument), '4. a SUCCESSFUL fork carries no .reason of any kind — that field only ever appears on a thrown Error.');
    }
    console.log('✓ Section D: a valid, licensed, retrieved fork still succeeds exactly as before — 0.9.353 touches only the two existing failure paths, never the success path.');

    // ===============================================================
    // Section E — Navigation recovery: both failure paths leave the
    // user with a valid way back to the originating Publication/World.
    // ===============================================================
    {
        const editorViewSource = await readSource('ui/views/EditorView.js');

        // The catch block records a `returnWorldId`, falling back to
        // the Publication's own documentId when there is no
        // entryContext (i.e. the Repository/Author Catalog "Fork"
        // entry point, which never attaches one — see 0.9.352 Section D).
        const catchBlockMatch = editorViewSource.match(/\} catch \(err\) \{[\s\S]*?forkFailure\.value = \{[\s\S]*?\};[\s\S]*?\n\s{16}\}/);
        assert(catchBlockMatch, '1. the fork-failure catch block is located in source.');
        const catchBlock = catchBlockMatch[0];
        assert(/returnWorldId: \(decodedEntryContext && decodedEntryContext\.returnWorldId\) \|\| sourceDocumentId/.test(catchBlock),
            '2. returnWorldId prefers the "Edit a Copy" entry context\'s own returnWorldId, but ALWAYS falls back to sourceDocumentId — never leaves a fork reached via Repository/Author Catalog with no way back.');

        // backFromForkFailure() navigates by the SAME /world/<id> shape
        // backToWorld() already uses — no second navigation concept.
        assert(editorViewSource.includes('function backFromForkFailure()'), '3. backFromForkFailure() exists.');
        const backFnMatch = editorViewSource.match(/function backFromForkFailure\(\) \{[\s\S]*?\n\s{8}\}/);
        assert(backFnMatch, '4. backFromForkFailure() located in source.');
        assert(/router\.push\(\{\s*path: `\/world\/\$\{failure\.returnWorldId\}`/.test(backFnMatch[0]),
            '5. backFromForkFailure() navigates to /world/<returnWorldId> — the identical route ui/components/PublicationCatalog.js\'s own Explore action and Toolbar\'s own "← Back to World" already use.');

        // ForkFailureDialog wires that function to its own 'back' emit.
        assert(editorViewSource.includes('@back="backFromForkFailure"'),
            '6. the ForkFailureDialog in the template is wired to backFromForkFailure() — a REAL route back, not a decorative button.');
    }
    console.log('✓ Section E: both failure causes leave forkFailure.returnWorldId set (the "Edit a Copy" World when known, else the Publication\'s own documentId) and ForkFailureDialog\'s own "Back to Publication" action navigates there via the same /world/<id> route Explore and "← Back to World" already use.');

    // ===============================================================
    // Section F — No blank-editor dead end: neither known failure
    // opens a Document, and the failure is covered by a persistent
    // dialog rather than an auto-hiding toast.
    // ===============================================================
    {
        const editorViewSource = await readSource('ui/views/EditorView.js');
        const forkBlockMatch = editorViewSource.match(/if \(route\.query\.fork\) \{[\s\S]*?\n\s{12}\} else if \(route\.query\.load\)/);
        assert(forkBlockMatch, '1. the route.query.fork handler block is located in source.');
        const forkBlock = forkBlockMatch[0];
        const catchIndex = forkBlock.indexOf('} catch (err) {');
        assert(catchIndex > -1, '2. the catch block is present.');
        const catchBody = forkBlock.slice(catchIndex);
        assert(!catchBody.includes('editorSession.openDocument('),
            '3. the catch block never calls openDocument() — a failed fork never opens ANYTHING as if it had succeeded.');
        assert(!catchBody.includes('feedback.show('),
            '4. the catch block no longer uses the transient, 2.5s auto-hiding feedback.show() toast for a fork failure — replaced by the persistent forkFailure dialog.');
        assert(catchBody.includes('forkFailure.value = {'),
            '5. the catch block sets forkFailure — the ref that drives ForkFailureDialog\'s v-if in the template.');

        assert(editorViewSource.includes('<ForkFailureDialog') && editorViewSource.includes('v-if="forkFailure"'),
            '6. ForkFailureDialog is rendered in the template, gated on forkFailure — present exactly when a fork just failed.');

        const dialogSource = await readSource('ui/components/ForkFailureDialog.js');
        assert(dialogSource.includes("class=\"modal-overlay\""),
            '7. ForkFailureDialog uses the SAME full-screen modal-overlay shell every other blocking dialog in this codebase (MetadataEditorDialog, CreateBlueprintDialog) already uses — it visually covers whatever is underneath, rather than a corner toast the user could miss.');
    }
    console.log('✓ Section F: a fork failure of either cause never opens a Document, never uses the old auto-hiding toast, and is instead covered by a persistent, full-screen ForkFailureDialog until the viewer explicitly acts — no blank-editor dead end.');

    // ===============================================================
    // Section G — Failure isolation: no catalog/storage/Publication
    // mutation occurs on a failed fork, of either cause.
    // ===============================================================
    {
        const heidi = makeIdentity('heidi');
        const documentId = 'failure-isolation-doc';
        const ndLicense = new License({ id: LicenseId.CC_BY_ND_4_0 });
        const publication = makePublication({ documentId, title: 'Isolated', author: 'heidi', license: ndLicense }, heidi);

        const storage = new InMemoryStorageProvider();
        storage.save(documentId, buildRetrievedDocumentJSON(documentId, { title: 'Isolated', author: 'heidi' }));
        storage.saveCalls = 0;

        let licenseThrew = false;
        try { new ForkDocumentUseCase(storage).execute(documentId, heidi, publication); } catch { licenseThrew = true; }
        assert(licenseThrew && storage.saveCalls === 0,
            '1. a license-denied attempt writes nothing to storage — the check runs before any load/clone/save, unchanged by 0.9.353.');

        const emptyStorage = new InMemoryStorageProvider();
        let materialThrew = false;
        try { new ForkDocumentUseCase(emptyStorage).execute(documentId, heidi, makePublication({ documentId, title: 'Isolated', author: 'heidi' }, heidi)); } catch { materialThrew = true; }
        assert(materialThrew && emptyStorage.saveCalls === 0,
            '2. a missing-material attempt also writes nothing to storage.');

        assert(publication.license.id === LicenseId.CC_BY_ND_4_0 && publication.documentId === documentId,
            '3. the source Publication itself is unmutated by either failed attempt.');

        // A subsequent, legitimate fork of the SAME documentId still
        // succeeds — neither prior, differently-caused failure left
        // residue behind.
        const legitimatePublication = makePublication({ documentId, title: 'Isolated', author: 'heidi', license: new License({ id: LicenseId.CC0_1_0 }) }, heidi);
        const forkedDocument = new ForkDocumentUseCase(storage).execute(documentId, heidi, legitimatePublication);
        assert(forkedDocument instanceof Document,
            '4. a subsequent, legitimately-licensed fork against the same documentId still succeeds.');
    }
    console.log('✓ Section G: a failed fork, of either cause, writes nothing to storage and leaves the source Publication unmutated; a subsequent legitimate fork of the same documentId still succeeds — 0.9.352 Section H\'s own invariant, reconfirmed unchanged by 0.9.353\'s presentation-only fix.');

    // ===============================================================
    // Section H — Origin neutrality: local and decentralized-origin
    // Publications produce the SAME reason for the SAME failure cause.
    // ===============================================================
    {
        const ivan = makeIdentity('ivan');
        const localDocId = 'origin-neutrality-local-doc';
        const decentralizedDocId = 'origin-neutrality-decentralized-doc';
        const ndLicense = new License({ id: LicenseId.CC_BY_ND_4_0 });

        const localPub = makePublication({ documentId: localDocId, title: 'Local ND Work', author: 'ivan', license: ndLicense }, ivan);
        const decentralizedPubRaw = makePublication({ documentId: decentralizedDocId, title: 'Decentralized ND Work', author: 'ivan', license: ndLicense }, ivan);
        const decentralizedView = await resolveAsDecentralizedPublication(decentralizedPubRaw, ivan);
        assert(decentralizedView.resolved === true, '1. setup: the decentralized-origin Publication genuinely resolves.');

        const storage = new InMemoryStorageProvider();
        for (const [id, title] of [[localDocId, 'Local ND Work'], [decentralizedDocId, 'Decentralized ND Work']]) {
            storage.save(id, buildRetrievedDocumentJSON(id, { title, author: 'ivan' }));
        }

        let localReason = null;
        let decentralizedReason = null;
        try { new ForkDocumentUseCase(storage).execute(localDocId, ivan, localPub); } catch (err) { localReason = err.reason; }
        try { new ForkDocumentUseCase(storage).execute(decentralizedDocId, ivan, decentralizedView.content); } catch (err) { decentralizedReason = err.reason; }

        assert(localReason === ForkFailureReason.LICENSE_DENIED && decentralizedReason === ForkFailureReason.LICENSE_DENIED,
            '2. a local-origin and a decentralized-origin Publication under the SAME license produce the SAME ForkFailureReason.');

        // Structural: no origin-specific branch was introduced anywhere
        // in this milestone's own new/changed files.
        for (const file of ['application/ForkFailureReason.js', 'application/ForkDocumentUseCase.js', 'ui/components/ForkFailureDialog.js']) {
            const source = await readSource(file);
            assert(!/decentralized|peer-sourced|isPeer|isDecentralized/i.test(source),
                `3. ${file} contains no "decentralized"/origin-branching concept of any kind.`);
        }
    }
    console.log('✓ Section H: a local-origin and a decentralized-origin Publication under the identical license produce the identical ForkFailureReason, and none of 0.9.353\'s own new/changed files contain any origin-branching concept.');

    // ===============================================================
    // Section I — Architecture boundary: no UI-specific license logic
    // moved into the domain; the UI boundary reads a signal, it never
    // re-derives one.
    // ===============================================================
    {
        const forkUseCaseSource = await readSource('application/ForkDocumentUseCase.js');
        assert(!/vue|dialog|toast|feedback\.show|router\./i.test(forkUseCaseSource),
            '1. application/ForkDocumentUseCase.js contains no UI vocabulary of any kind — it still only ever attaches a plain `.reason` code to a thrown Error.');

        const reasonSource = await readSource('application/ForkFailureReason.js');
        assert(/^export const ForkFailureReason = Object\.freeze\(\{/m.test(reasonSource),
            '2. ForkFailureReason.js is a plain frozen value enum — mirroring PublicationResolutionOutcome.js\'s own shape, never a class hierarchy.');
        assert(!/class\s+\w*Error/.test(reasonSource), '3. ForkFailureReason.js defines no Error subclass of its own.');

        const dialogSource = await readSource('ui/components/ForkFailureDialog.js');
        assert(!/pubLicense|forkAllowed|License\(/i.test(dialogSource),
            '4. ForkFailureDialog.js never re-implements the license check itself — it only ever reads the `.reason` code the domain layer already decided.');
        assert(!dialogSource.includes('err.message'),
            '5. ForkFailureDialog.js never inspects a raw Error message — its ONLY input is the `.reason` prop.');
    }
    console.log('✓ Section I: the domain layer (ForkDocumentUseCase.js) carries no UI vocabulary, and the UI layer (ForkFailureDialog.js) never re-derives the license decision or inspects a raw error message — the decision is made exactly once, at the domain boundary, and only READ at the presentation boundary.');

    // ===============================================================
    // Section J — Scope: no retry system, error lifecycle, notification
    // feature, license-management feature, or retrieval scheduler was
    // introduced; no persistent lifecycle state was added anywhere.
    // ===============================================================
    {
        // Deliberately does NOT flag ForkFailureReason.MATERIAL_UNAVAILABLE
        // itself — that value is exactly the sanctioned, one-shot
        // presentation outcome this milestone's own brief asked for; the
        // banned vocabulary is a PERSISTENT lifecycle state built on top
        // of it (a bare `RETRYING`/`BLOCKED`/`FORK_FAILED` constant, or a
        // retry loop), never the reason code itself.
        for (const file of ['application/ForkFailureReason.js', 'application/ForkDocumentUseCase.js', 'ui/components/ForkFailureDialog.js']) {
            const source = await readSource(file);
            assert(!/RETRYING|BLOCKED|FORK_FAILED|setInterval|retry\(/i.test(source),
                `1. ${file} introduces no retry loop and no persistent lifecycle state constant.`);
        }

        const editorViewSource = await readSource('ui/views/EditorView.js');
        const forkFailureRegionMatch = editorViewSource.match(/const forkFailure = ref\(null\);[\s\S]*?\n\s{8}(?=const|function)/);
        assert(forkFailureRegionMatch, '2. forkFailure is declared as a plain, ephemeral ref — the same shape entryContext already is, never a store or a persisted document field.');

        // The Publication/Document domain objects themselves gained no
        // new field for this milestone — a failed fork is a
        // presentation outcome for one attempted action, never
        // recorded on the Publication or Document it targeted.
        const publicationSource = await readSource('publisher/Publication.js');
        assert(!/forkFailure|ForkFailureReason/.test(publicationSource),
            '3. publisher/Publication.js carries no forkFailure-shaped field — 0.9.353 adds no durable Publication state.');
        const documentMetadataSource = await readSource('core/DocumentMetadata.js');
        assert(!/forkFailure|ForkFailureReason/.test(documentMetadataSource),
            '4. core/DocumentMetadata.js carries no forkFailure-shaped field either.');
    }
    console.log('✓ Section J: no retry system, persistent lifecycle state, or Publication/Document field was introduced anywhere — forkFailure stays exactly what the milestone brief asked for, a presentation outcome for one attempted action.');

    console.log('\nAll Fork Failure Reason Presentation tests passed.');
    console.log('\n=== 0.9.353 VERDICT: INTEGRATED ===');
    console.log('ForkDocumentUseCase\'s two failure causes now carry a small, named ForkFailureReason code; EditorView.js');
    console.log('reads it to show one of two specific, actionable messages via ForkFailureDialog instead of a raw-Error');
    console.log('toast, and offers a real route back to the originating Publication/World instead of an unconditional');
    console.log('trip to a blank Editor document. The successful fork path, failure isolation, and origin neutrality');
    console.log('are all reconfirmed unchanged.');
}

run().catch((error) => {
    console.error('ForkFailureReasonPresentation.test.js FAILED:', error);
    process.exitCode = 1;
});
