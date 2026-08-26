import { SnapshotContentMaterializationCoordinator } from '../application/SnapshotContentMaterializationCoordinator.js';
import { SnapshotContentMaterializationUiState } from '../application/SnapshotContentMaterializationUiState.js';
import { describeMaterializationAttempt, describeMaterializationButtonLabel } from '../application/SnapshotContentMaterializationView.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { PublicationSnapshotTransferPackageError } from '../application/PublicationSnapshotTransferPackageValidator.js';
import { buildPublicationReplicaPackage } from '../application/PublicationReplicaPackage.js';
import { ImportPublicationReplicaPackageUseCase } from '../application/ImportPublicationReplicaPackageUseCase.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { LocalSnapshotContentAvailabilityOutcome } from '../application/LocalSnapshotContentAvailabilityOutcome.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { PublicationAnchorExchange } from '../application/PublicationAnchorExchange.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.34 — Explicit Snapshot Materialization UX.
//
//   Section A: SnapshotContentMaterializationCoordinator constructor
//              validation, and import() as an unchanged, deliberately
//              thin pass-through to application/
//              ImportPublicationSnapshotTransferPackageUseCase.js#execute()
//              — plus the deliberate absence of availableSources().
//   Section B: describeMaterializationAttempt()/describeMaterializationButtonLabel()
//              pure view functions over idle/importing and every
//              SnapshotContentTransferOutcome value, including the exact
//              permitted sentences and the words this milestone must
//              never use.
//   Section C — FLAGSHIP: Alice publishes P, holds S locally, and builds
//              a Publication Snapshot Transfer Package. Bob already knows
//              P (imported only a Publication Replica Package) but does
//              not possess S; he clicks "Import Snapshot" and obtains it
//              (IMPORTED), then an explicit "Check Local Snapshot" reports
//              AVAILABLE — proving 0.8.34's own action is what connects
//              0.8.32's transfer pipeline to 0.8.33's inspection. Clicking
//              "Import Snapshot" again on the identical package reports
//              ALREADY_AVAILABLE with the bytes unchanged. A tampered
//              package is REJECTED and stores nothing. Carol receives a
//              valid transfer package for a publication she has never
//              cataloged: the bytes are still stored (publicationKnown
//              never gates materialization, exactly as 0.8.32 established
//              one layer under), and the UI names that fact explicitly.
//   Section D: a malformed paste (invalid JSON, and a structurally invalid
//              package) each land in the identical UNAVAILABLE state a
//              local precondition failure already shares with a real
//              PublicationSnapshotTransferPackageError, mirroring
//              EditorView.js#importBlueprint()'s own two-stage handling.
//
// See docs/Principles.md, "Snapshot Materialization Is An Explicit User
// Action, Distinct From Every Other Way A Replica Learns About Content
// (0.8.34)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let threw = null;
    try { await promise; } catch (e) { threw = e; }
    assert(threw !== null, message);
}

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

function signPublication(identityProvider, fields) {
    let publication = new DecentralizedPublication({ ...fields, publisherIdentity: identityProvider.getSigningIdentity().toJSON() });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// Builds a fresh "replica" — its own publication/anchor/placement
// catalogs and its own local content store — mirroring the real
// composition ui/main.js wires, never a shared or disconnected stand-in.
function makeReplica() {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const contentStore = new LocalContentStore(new InMemoryStorageProvider());
    const publicationExchange = new PublicationExchange(publicationCatalog, new LocalAuthorizationVerifier());
    const anchorExchange = new PublicationAnchorExchange(anchorCatalog, new LocalAuthorizationVerifier());
    const placementExchange = new PublicationSnapshotPlacementExchange(placementCatalog, new LocalAuthorizationVerifier());
    const importUseCase = new ImportPublicationSnapshotTransferPackageUseCase(contentStore, publicationCatalog);
    const materializationCoordinator = new SnapshotContentMaterializationCoordinator(importUseCase);
    const availabilityUseCase = new CheckLocalSnapshotContentAvailabilityUseCase(contentStore);
    return {
        publicationCatalog, anchorCatalog, placementCatalog, contentStore,
        publicationExchange, anchorExchange, placementExchange,
        materializationCoordinator, availabilityUseCase
    };
}

// Mirrors ui/views/DecentralizedPublicationsView.js#importSnapshotContent()
// exactly — a caller-supplied two-stage try/catch (JSON.parse, then the
// coordinator call), since application/
// SnapshotContentMaterializationCoordinator.js never catches either
// failure itself (see that class's own header).
async function clickImportSnapshot(coordinator, rawText) {
    let pkg;
    try {
        pkg = JSON.parse(rawText);
    } catch (e) {
        return { importing: false, outcome: null, error: 'That is not valid JSON — choose a file, or paste the contents, of an exported Publication Snapshot Transfer Package.' };
    }
    try {
        const result = await coordinator.import(pkg);
        return {
            importing: false, error: null,
            outcome: result.outcome, contentReference: result.contentReference,
            publicationId: result.publicationId, publicationKnown: result.publicationKnown
        };
    } catch (error) {
        return { importing: false, outcome: null, error: error.message.replace(/^PublicationSnapshotTransferPackage:\s*/, '') };
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — coordinator constructor validation and thin pass-
    // through behavior
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new SnapshotContentMaterializationCoordinator(null); } catch (e) { threw = true; }
        assert(threw, '1. constructor requires an ImportPublicationSnapshotTransferPackageUseCase');
        threw = false;
        try { new SnapshotContentMaterializationCoordinator({}); } catch (e) { threw = true; }
        assert(threw, '2. constructor requires an object shaped like ImportPublicationSnapshotTransferPackageUseCase (an execute() method)');

        // Deliberately no availableSources() — see application/
        // SnapshotContentMaterializationCoordinator.js's own header on
        // why this milestone invents no source-selection infrastructure.
        const { materializationCoordinator } = makeReplica();
        assert(typeof materializationCoordinator.availableSources === 'undefined',
            '3. INVARIANT: no availableSources() method exists on this first version of the coordinator');
        assert(typeof materializationCoordinator.import === 'function', '4. import() is the coordinator\'s one public action');

        // import() forwards to the underlying use case's own execute(),
        // returning its result completely unchanged.
        const dave = makeIdentity('Dave-Materialization-A');
        const daveContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const contentReference = daveContentStore.put('section-a-bytes');
        const publication = signPublication(dave, { id: 'pub-section-a', contentKind: 'forkbuild.structure', contentReference });
        const daveCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        daveCatalog.add(publication);
        const pkg = await new BuildPublicationSnapshotTransferPackageUseCase({ publicationCatalog: daveCatalog, contentStore: daveContentStore }).execute('pub-section-a');

        const directResult = await new ImportPublicationSnapshotTransferPackageUseCase(
            new LocalContentStore(new InMemoryStorageProvider()), new LocalPublicationCatalog(new InMemoryStorageProvider())
        ).execute(pkg);
        const { materializationCoordinator: freshCoordinator } = makeReplica();
        const coordinatorResult = await freshCoordinator.import(pkg);
        assert(coordinatorResult.outcome === directResult.outcome
            && coordinatorResult.publicationId === directResult.publicationId
            && coordinatorResult.contentReference.hash === directResult.contentReference.hash,
            '5. import() returns exactly what the underlying use case returns, unchanged');

        // A malformed package is never caught here — it throws straight
        // through, exactly as application/
        // PublicationAnchorCreationCoordinator.js's own signing-failure
        // header already declines to catch a caller contract violation.
        await expectRejects(freshCoordinator.import({ kind: 'not-a-transfer-package' }), '6. a structurally malformed package throws straight through import(), uncaught');
    }
    console.log('✓ Section A: coordinator constructor validation, unchanged pass-through, and the deliberate absence of availableSources()');

    // ---------------------------------------------------------------
    // Section B — pure view functions
    // ---------------------------------------------------------------
    {
        const idle = describeMaterializationAttempt(null);
        assert(idle.state === SnapshotContentMaterializationUiState.IDLE && idle.importing === false && idle.label === null && idle.message === null,
            '1. idle (never attempted) reports IDLE with no label/message');

        const importing = describeMaterializationAttempt({ importing: true });
        assert(importing.state === SnapshotContentMaterializationUiState.IMPORTING && importing.importing === true && importing.label === 'Importing…',
            '2. an in-flight import reports IMPORTING');

        const imported = describeMaterializationAttempt({ outcome: SnapshotContentTransferOutcome.STORED, publicationKnown: true, publicationId: 'p', contentReference: { hash: 'h' } });
        assert(imported.state === SnapshotContentMaterializationUiState.IMPORTED, '3. STORED + known reports IMPORTED');
        assert(imported.message === "Snapshot was imported and matches the publication's content hash.",
            '4. the exact, deliberately unhedged sentence this milestone permits for a known publication');

        const importedUnknown = describeMaterializationAttempt({ outcome: SnapshotContentTransferOutcome.STORED, publicationKnown: false, publicationId: 'p', contentReference: { hash: 'h' } });
        assert(importedUnknown.state === SnapshotContentMaterializationUiState.IMPORTED, '5. STORED + unknown still reports IMPORTED — publicationKnown never gates the outcome');
        assert(importedUnknown.message === 'Snapshot imported. The publication is not currently known locally.',
            '6. the distinct sentence this milestone requires when the publication is not cataloged');

        const already = describeMaterializationAttempt({ outcome: SnapshotContentTransferOutcome.ALREADY_STORED, publicationKnown: true });
        assert(already.state === SnapshotContentMaterializationUiState.ALREADY_AVAILABLE, '7. ALREADY_STORED reports ALREADY_AVAILABLE');
        assert(already.message === 'The snapshot is already present locally.', '8. the exact "already available" sentence');

        const rejected = describeMaterializationAttempt({ outcome: SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH, publicationId: 'p' });
        assert(rejected.state === SnapshotContentMaterializationUiState.REJECTED, '9. CONTENT_HASH_MISMATCH reports REJECTED');
        assert(rejected.contentReference === null, '10. a rejected import reports no contentReference');

        const unavailable = describeMaterializationAttempt({ error: 'That is not valid JSON.' });
        assert(unavailable.state === SnapshotContentMaterializationUiState.UNAVAILABLE, '11. a local error reports UNAVAILABLE');
        assert(unavailable.message === 'That is not valid JSON.', '12. the specific local error message is preserved, never replaced with a generic one');

        assert(describeMaterializationButtonLabel({}) === 'Import Snapshot', '13. idle button label');
        assert(describeMaterializationButtonLabel({ importing: true }) === 'Importing…', '14. in-flight button label');
        assert(describeMaterializationButtonLabel({ importing: false }) === 'Import Snapshot',
            '15. the button label is always "Import Snapshot" after a completed attempt — never "Import Another"');

        // No two of IDLE/IMPORTING/IMPORTED/ALREADY_AVAILABLE/UNAVAILABLE/
        // REJECTED ever collapse onto the same UI state.
        const states = [idle, importing, imported, already, rejected, unavailable].map((v) => v.state);
        assert(new Set(states).size === 6, '16. all six UI states are genuinely distinct');

        // The forbidden words this milestone's own design conversation
        // named directly never appear in any permitted message.
        const forbiddenWords = ['verified', 'trusted', 'authentic', 'permanent', 'canonical'];
        const allMessages = [imported, importedUnknown, already, rejected].map((v) => v.message.toLowerCase());
        for (const word of forbiddenWords) {
            for (const message of allMessages) {
                assert(!message.includes(word), `17. no permitted message ever uses the word "${word}" (checked: "${message}")`);
            }
        }
    }
    console.log('✓ Section B: pure view functions over every outcome plus idle/importing, exact sentences, and the forbidden-words check');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const PUBLICATION_ID = 'pub-flagship-materialization';
        const SNAPSHOT_BYTES = JSON.stringify({ hello: 'flagship materialization bytes' });

        // --- Alice: publishes P, holds S locally, exports a transfer
        // package, then is never online again in this test. ---
        const alice = makeIdentity('Alice-Materialization');
        const aliceContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const contentReference = aliceContentStore.put(SNAPSHOT_BYTES);
        const publication = signPublication(alice, { id: PUBLICATION_ID, contentKind: 'forkbuild.structure', contentReference });
        const alicePublicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        alicePublicationCatalog.add(publication);
        const replicaPackage = buildPublicationReplicaPackage(publication);
        const transferPackage = await new BuildPublicationSnapshotTransferPackageUseCase({
            publicationCatalog: alicePublicationCatalog, contentStore: aliceContentStore
        }).execute(PUBLICATION_ID);
        const transferPackageText = JSON.stringify(transferPackage);

        // --- Bob: already knows P (imported only the replica package),
        // does NOT yet possess S. ---
        const bob = makeReplica();
        new ImportPublicationReplicaPackageUseCase(bob.publicationExchange, bob.anchorExchange, bob.placementExchange).execute(replicaPackage);
        assert(bob.publicationCatalog.get(PUBLICATION_ID) !== null, '1. Bob knows the publication before ever importing any content');
        assert((await bob.contentStore.has(contentReference)) === false, '2. Bob does not yet possess the snapshot bytes');

        const idleView = describeMaterializationAttempt(null);
        assert(idleView.state === SnapshotContentMaterializationUiState.IDLE, '3. before any click, the derived view reports IDLE');

        // Bob clicks "Import Snapshot", pasting Alice's exported package.
        const firstAttempt = await clickImportSnapshot(bob.materializationCoordinator, transferPackageText);
        assert(firstAttempt.error === null && firstAttempt.outcome === SnapshotContentTransferOutcome.STORED, '4. a healthy import produces STORED');
        const firstView = describeMaterializationAttempt(firstAttempt);
        assert(firstView.state === SnapshotContentMaterializationUiState.IMPORTED, '5. the derived view reports IMPORTED');
        assert(firstView.message === "Snapshot was imported and matches the publication's content hash.",
            '6. Bob already knows P, so the UI states the exact, unhedged "matches" sentence');

        assert((await bob.contentStore.get(contentReference)) === SNAPSHOT_BYTES, '7. Bob now genuinely possesses the exact snapshot bytes');

        // An explicit, separate "Check Local Snapshot" click now reports
        // AVAILABLE — the exact connection this milestone exists to make:
        // 0.8.32's transfer pipeline feeding 0.8.33's own inspection.
        const availability = await bob.availabilityUseCase.execute(bob.publicationCatalog.get(PUBLICATION_ID));
        assert(availability.outcome === LocalSnapshotContentAvailabilityOutcome.AVAILABLE,
            '8. "Check Local Snapshot" now reports AVAILABLE — Import Snapshot is what connects 0.8.32\'s transfer pipeline to 0.8.33\'s own inspection');

        // Bob clicks "Import Snapshot" again on the IDENTICAL package.
        const secondAttempt = await clickImportSnapshot(bob.materializationCoordinator, transferPackageText);
        assert(secondAttempt.outcome === SnapshotContentTransferOutcome.ALREADY_STORED, '9. re-importing the identical package reports ALREADY_STORED, never an error');
        const secondView = describeMaterializationAttempt(secondAttempt);
        assert(secondView.state === SnapshotContentMaterializationUiState.ALREADY_AVAILABLE, '10. the derived view reports ALREADY_AVAILABLE');
        assert((await bob.contentStore.get(contentReference)) === SNAPSHOT_BYTES, '11. the bytes remain byte-identical after the duplicate import');

        // A tampered package is rejected outright, and nothing is
        // (re)stored under any hash it did not already legitimately own.
        const tamperedPackage = { ...transferPackage, content: 'these-are-not-alices-real-bytes' };
        const tamperedAttempt = await clickImportSnapshot(bob.materializationCoordinator, JSON.stringify(tamperedPackage));
        assert(tamperedAttempt.outcome === SnapshotContentTransferOutcome.CONTENT_HASH_MISMATCH, '12. a tampered package is rejected as CONTENT_HASH_MISMATCH');
        const tamperedView = describeMaterializationAttempt(tamperedAttempt);
        assert(tamperedView.state === SnapshotContentMaterializationUiState.REJECTED, '13. the derived view reports REJECTED — a definite negative outcome, never UNAVAILABLE');
        assert((await bob.contentStore.get(contentReference)) === SNAPSHOT_BYTES, '14. Bob\'s already-stored bytes are completely unaffected by the rejected tampered import');

        // --- Carol: receives a valid transfer package for a publication
        // she has NEVER cataloged. The bytes are still stored — see
        // application/ImportPublicationSnapshotTransferPackageUseCase.js's
        // own header: publicationKnown never gates storage. ---
        const carol = makeReplica();
        assert(carol.publicationCatalog.get(PUBLICATION_ID) === null, '15. Carol has never heard of this publication before importing');
        const carolAttempt = await clickImportSnapshot(carol.materializationCoordinator, transferPackageText);
        assert(carolAttempt.outcome === SnapshotContentTransferOutcome.STORED, '16. Carol\'s import still succeeds — she now possesses the bytes');
        const carolView = describeMaterializationAttempt(carolAttempt);
        assert(carolView.state === SnapshotContentMaterializationUiState.IMPORTED, '17. the derived view still reports IMPORTED, never a failure');
        assert(carolView.message === 'Snapshot imported. The publication is not currently known locally.',
            '18. INVARIANT: the UI names the uncataloged publication explicitly, rather than silently pretending it is known');
        assert((await carol.contentStore.get(contentReference)) === SNAPSHOT_BYTES, '19. Carol genuinely possesses the exact snapshot bytes despite never having cataloged the publication');
    }
    console.log('✓ Section C: FLAGSHIP — Bob materializes bytes he already knew about, re-import and tampering are both handled honestly, and Carol\'s uncataloged publication still receives its bytes');

    // ---------------------------------------------------------------
    // Section D — malformed input at the UI boundary
    // ---------------------------------------------------------------
    {
        const { materializationCoordinator } = makeReplica();

        const badJsonAttempt = await clickImportSnapshot(materializationCoordinator, 'this is not { json');
        assert(badJsonAttempt.outcome === null && badJsonAttempt.error, '1. invalid JSON is caught before ever reaching the coordinator');
        const badJsonView = describeMaterializationAttempt(badJsonAttempt);
        assert(badJsonView.state === SnapshotContentMaterializationUiState.UNAVAILABLE, '2. invalid JSON reports the UNAVAILABLE UI state');

        const wrongKindAttempt = await clickImportSnapshot(materializationCoordinator, JSON.stringify({ kind: 'forkbuild.something-else', schemaVersion: 1, publicationId: 'p', contentHash: 'h', content: 'c' }));
        assert(wrongKindAttempt.outcome === null && wrongKindAttempt.error, '3. a well-formed-JSON-but-wrong-kind package is caught as a real (not JSON-parse) error');
        assert(!wrongKindAttempt.error.startsWith('PublicationSnapshotTransferPackage:'), '4. the class-name prefix on a thrown PublicationSnapshotTransferPackageError is stripped before display, mirroring EditorView.js#importBlueprint()\'s own convention');
        const wrongKindView = describeMaterializationAttempt(wrongKindAttempt);
        assert(wrongKindView.state === SnapshotContentMaterializationUiState.UNAVAILABLE,
            '5. a structurally invalid package reads exactly like invalid JSON to a person looking at the button — both UNAVAILABLE, never REJECTED (which is reserved for a well-formed package whose OWN bytes fail to verify)');

        // Directly confirms the validator itself is what throws — this
        // milestone adds no structural validation of its own.
        let threw = false;
        try {
            const badPkg = { kind: 'not-a-package' };
            await materializationCoordinator.import(badPkg);
        } catch (e) {
            threw = e instanceof PublicationSnapshotTransferPackageError;
        }
        assert(threw, '6. the underlying PublicationSnapshotTransferPackageError is what import() lets through uncaught');
    }
    console.log('✓ Section D: a malformed paste and a structurally invalid package both land in the identical, honest UNAVAILABLE state');

    console.log('\n✅ All SnapshotContentMaterialization tests passed');
}

run().catch((error) => {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
