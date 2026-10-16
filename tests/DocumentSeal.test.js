// Sealed exports and whose build an import becomes (core/DocumentSeal.js,
// identity/DocumentSealing.js, application/document/DocumentImportPolicy.js):
// a maker's export carries their seal; importing someone else's build makes
// the importer's credited copy only when its license allows remixes, and is
// refused when it doesn't or when the file was changed after it was sealed.
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { License, LicenseId } from '../core/License.js';
import { DOCUMENT_SEAL_KIND } from '../core/DocumentSeal.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { DocumentSealStatus, sealDocumentJson, verifyDocumentSeal } from '../identity/DocumentSealing.js';
import { ExportDocumentUseCase } from '../application/document/ExportDocumentUseCase.js';
import { ImportDocumentUseCase } from '../application/document/ImportDocumentUseCase.js';
import { DocumentImportOutcome, DocumentImportRefusedError, decideDocumentImport } from '../application/document/DocumentImportPolicy.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { DocumentManifest } from '../application/document/DocumentManifest.js';
import { ExportAllDocumentsUseCase, ImportDocumentBundleUseCase } from '../application/document/DocumentBundle.js';
import { useBlueprintExchange } from '../ui/views/editorView/useBlueprintExchange.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function player(name) {
    const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
    identity.login(name);
    return identity;
}

function buildBy(identity, { title = 'Monument', licenseId = LicenseId.ALL_RIGHTS_RESERVED } = {}) {
    const world = new World();
    const building = new Building({ creator: identity.currentUser().username });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({
            title,
            author: identity.currentUser().username,
            authorIdentityId: identity.getSigningIdentity().id,
            license: new License({ id: licenseId })
        })
    });
}

// The file as it would be written and read back.
function exportFile(document, identity) {
    return JSON.parse(JSON.stringify(new ExportDocumentUseCase(undefined, { identityProvider: identity }).execute(document)));
}

function importAs(identity, file, options = {}) {
    return new ImportDocumentUseCase(undefined, undefined, { identityProvider: identity, ...options }).execute(file);
}

function refusal(fn) {
    try {
        fn();
    } catch (e) {
        return e;
    }
    return null;
}

const alice = player('alice');
const bob = player('bob');
const aliceId = alice.getSigningIdentity().id;
const bobId = bob.getSigningIdentity().id;

// A maker's export is sealed; anyone else's, or a locked one, is not.
{
    const monument = buildBy(alice);
    const file = exportFile(monument, alice);
    assert(file.seal && file.seal.kind === DOCUMENT_SEAL_KIND, 'the maker\'s export carries a seal');
    assert(file.seal.authorIdentityId === aliceId && file.seal.signature.signer === aliceId, 'the seal is signed by the maker');
    assert(verifyDocumentSeal(file).status === DocumentSealStatus.VALID, 'the seal verifies');
    assert(file.world.id === monument.world.id && file.metadata.title === 'Monument', 'the document itself is unchanged beside the seal');

    assert(!exportFile(monument, bob).seal, 'someone who isn\'t the maker exports it unsealed');
    assert(!exportFile(monument, null).seal, 'an export with nobody signed in is unsealed');
    const locked = { getSigningIdentity: () => alice.getSigningIdentity(), signCanonical: () => { throw new Error('identity is locked'); } };
    assert(sealDocumentJson(monument.toJSON(), locked) === null, 'an identity that can\'t sign leaves the file unsealed');
    console.log('✓ only the maker\'s export is sealed, and the seal verifies');
}

// Bob can't import Alice's All Rights Reserved build as his.
{
    const file = exportFile(buildBy(alice), alice);
    const error = refusal(() => importAs(bob, file));
    assert(error instanceof DocumentImportRefusedError && error.outcome === DocumentImportOutcome.NOT_ALLOWED,
        'someone else\'s All Rights Reserved build is refused');
    assert(error.author === 'alice', 'the refusal names its maker');
    for (const licenseId of [LicenseId.CC_BY_ND_4_0, LicenseId.UNSPECIFIED]) {
        const other = refusal(() => importAs(bob, exportFile(buildBy(alice, { licenseId }), alice)));
        assert(other?.outcome === DocumentImportOutcome.NOT_ALLOWED, `someone else's ${licenseId} build is refused`);
    }
    console.log('✓ someone else\'s build whose license allows no copies is refused');
}

// Published All Rights Reserved, exported Public Domain: Bob gets his own
// copy that credits Alice and records where it came from.
{
    const monument = buildBy(alice);
    monument.metadata.license = new License({ id: LicenseId.CC0_1_0 });
    const file = exportFile(monument, alice);
    const copy = importAs(bob, file);
    assert(copy.metadata.author === 'bob' && copy.metadata.authorIdentityId === bobId, 'the copy is Bob\'s');
    assert(copy.world.id !== monument.world.id, 'the copy is a new build');
    assert(copy.metadata.parentDocumentId === monument.world.id, 'the copy records the build it came from');
    assert(copy.metadata.license.id === LicenseId.CC0_1_0, 'the copy keeps its maker\'s license');
    assert(copy.metadata.license.attribution?.author === 'alice' && copy.metadata.license.attribution?.title === 'Monument',
        'the copy credits its maker by name');
    assert(copy.world.getBuildings()[0].getBricks().length === 1, 'the copy has the build\'s bricks');

    const byCredit = importAs(bob, exportFile(buildBy(alice, { licenseId: LicenseId.CC_BY_4_0 }), alice));
    assert(byCredit.metadata.authorIdentityId === bobId && byCredit.metadata.license.attribution?.author === 'alice',
        'a CC BY build opens as a credited copy too');
    console.log('✓ someone else\'s remixable build opens as the importer\'s credited copy');
}

// Editing the file after it was sealed breaks the seal.
{
    const file = exportFile(buildBy(alice), alice);
    const loosened = JSON.parse(JSON.stringify(file));
    loosened.metadata.license = { id: LicenseId.CC0_1_0 };
    assert(verifyDocumentSeal(loosened).status === DocumentSealStatus.BROKEN, 'a changed license breaks the seal');
    const error = refusal(() => importAs(bob, loosened));
    assert(error?.outcome === DocumentImportOutcome.ALTERED, 'a file changed after sealing is refused');

    const reSealedByBob = JSON.parse(JSON.stringify(loosened));
    reSealedByBob.seal = sealDocumentJson({ ...loosened, metadata: { ...loosened.metadata, authorIdentityId: bobId } }, bob).seal;
    assert(verifyDocumentSeal(reSealedByBob).status === DocumentSealStatus.BROKEN, 'nobody else can seal a file in the maker\'s name');

    const unsealed = JSON.parse(JSON.stringify(file));
    delete unsealed.seal;
    assert(refusal(() => importAs(bob, unsealed))?.outcome === DocumentImportOutcome.NOT_ALLOWED,
        'deleting the seal still leaves the maker\'s terms respected');
    console.log('✓ a file changed after sealing is refused, and a seal can\'t be forged');
}

// A player's own builds open as themselves, so moving between devices works.
{
    const monument = buildBy(alice);
    const own = importAs(alice, exportFile(monument, alice));
    assert(own.metadata.author === 'alice' && own.metadata.authorIdentityId === aliceId, 'the maker\'s own file stays theirs');
    assert(own.metadata.parentDocumentId === null && own.metadata.license.id === LicenseId.ALL_RIGHTS_RESERVED, 'and opens as the same build');

    const unsealed = monument.toJSON();
    assert(importAs(alice, unsealed).metadata.authorIdentityId === aliceId, 'an unsealed file of one\'s own opens as one\'s own');

    const asDevice = importAs(bob, exportFile(monument, alice), { ownIdentityIds: () => [aliceId] });
    assert(asDevice.metadata.authorIdentityId === aliceId && asDevice.metadata.parentDocumentId === null,
        'a device acting for the maker opens it as the maker\'s own');

    const coBuilt = buildBy(alice);
    const coBuiltJson = coBuilt.toJSON();
    coBuiltJson.metadata.builtWith = [{ name: 'bob', identityId: bobId }];
    const restoredCoBuilt = importAs(bob, coBuiltJson);
    assert(restoredCoBuilt.metadata.authorIdentityId === aliceId && restoredCoBuilt.metadata.parentDocumentId === null,
        'a build that credits the importer as having built it with its maker opens as it is');

    const noMaker = monument.toJSON();
    noMaker.metadata.authorIdentityId = null;
    assert(importAs(bob, noMaker).metadata.parentDocumentId === null, 'a file naming no maker identity opens as before');
    console.log('✓ a player\'s own builds, and files naming no maker, open as they always did');
}

// The decision on its own.
{
    const forbids = new License({ id: LicenseId.ALL_RIGHTS_RESERVED });
    const allows = new License({ id: LicenseId.CC_BY_4_0 });
    const someone = 'did:key:someone';
    assert(decideDocumentImport({ authorIdentityId: null, license: forbids }) === DocumentImportOutcome.OWN, 'no maker: own');
    assert(decideDocumentImport({ authorIdentityId: someone, license: forbids, ownIdentityIds: [someone] }) === DocumentImportOutcome.OWN, 'own identity: own');
    assert(decideDocumentImport({ authorIdentityId: someone, license: forbids, sealStatus: DocumentSealStatus.BROKEN, ownIdentityIds: [someone] }) === DocumentImportOutcome.OWN,
        'one\'s own build stays one\'s own even if its file was edited');
    assert(decideDocumentImport({ authorIdentityId: someone, license: allows, sealStatus: DocumentSealStatus.BROKEN }) === DocumentImportOutcome.ALTERED, 'broken seal: altered');
    assert(decideDocumentImport({ authorIdentityId: someone, license: forbids, ownIdentityIds: ['me'], builtWith: [{ identityId: 'me' }] }) === DocumentImportOutcome.OWN,
        'built with its maker: as it is');
    assert(decideDocumentImport({ authorIdentityId: someone, license: forbids, sealStatus: DocumentSealStatus.BROKEN, ownIdentityIds: ['me'], builtWith: [{ identityId: 'me' }] }) === DocumentImportOutcome.ALTERED,
        'a credit added to a sealed file after sealing doesn\'t count');
    assert(decideDocumentImport({ authorIdentityId: someone, license: allows }) === DocumentImportOutcome.COPY, 'remixable: copy');
    assert(decideDocumentImport({ authorIdentityId: someone, license: forbids, sealStatus: DocumentSealStatus.VALID }) === DocumentImportOutcome.NOT_ALLOWED, 'no copies: not allowed');
    console.log('✓ the import decision covers every case');
}

// Export All Builds and its import follow the same rules.
{
    const aliceStorage = new InMemoryStorageProvider();
    const save = new SaveDocumentUseCase(aliceStorage);
    const locked = buildBy(alice, { title: 'Locked' });
    const open = buildBy(alice, { title: 'Open', licenseId: LicenseId.CC_BY_4_0 });
    save.execute(new DocumentManager(locked));
    save.execute(new DocumentManager(open));
    const bundle = JSON.parse(JSON.stringify(await new ExportAllDocumentsUseCase(aliceStorage, new DocumentManifest(aliceStorage), { identityProvider: alice }).execute()));
    assert(bundle.documents.length === 2 && bundle.documents.every((json) => verifyDocumentSeal(json).status === DocumentSealStatus.VALID),
        'every build the exporter made is sealed in the bundle');

    const bobStorage = new InMemoryStorageProvider();
    const intoBob = await new ImportDocumentBundleUseCase(bobStorage, { identityProvider: bob }).execute(bundle);
    assert(intoBob.remixed === 1 && intoBob.refused === 1 && intoBob.added === 0, 'someone else\'s bundle: the remixable build as a copy, the other left out');
    const saved = new DocumentManifest(bobStorage).list();
    assert(saved.length === 1, 'only the copy is saved');
    const savedCopy = bobStorage.load(saved[0].id);
    assert(savedCopy.metadata.authorIdentityId === bobId && savedCopy.metadata.parentDocumentId === open.world.id, 'the saved copy is Bob\'s and records its source');

    const restored = await new ImportDocumentBundleUseCase(new InMemoryStorageProvider(), { identityProvider: alice }).execute(bundle);
    assert(restored.added === 2 && restored.refused === 0 && restored.remixed === 0, 'the maker restores all her own builds as they were');

    const tampered = JSON.parse(JSON.stringify(bundle));
    tampered.documents[0].metadata.license = { id: LicenseId.CC0_1_0 };
    const intoBobAgain = await new ImportDocumentBundleUseCase(new InMemoryStorageProvider(), { identityProvider: bob }).execute(tampered);
    assert(intoBobAgain.refused >= 1, 'a build changed inside a bundle is left out');
    console.log('✓ Export All Builds seals the maker\'s builds, and its import follows the same rules');
}

// The Editor's Import says what it did, or why it didn't.
{
    function importThroughEditor(identity, file) {
        const log = [];
        const useCase = new ImportDocumentUseCase(undefined, undefined, { identityProvider: identity });
        useBlueprintExchange({
            blueprintAttributionExchange: null,
            blueprintAttributionUseCase: { summarize: () => ({ attributions: [] }) },
            blueprintLineageExchange: null,
            blueprintLineageUseCase: { claimsForBlueprint: () => [] },
            documentManager: null,
            editorSession: { importDocument: (json) => useCase.execute(json) },
            feedback: { show: (message) => log.push(message) },
            refreshPersonalStructureGroups: () => {},
            personalStructureLibraryStore: null
        }).importDocument(JSON.stringify(file));
        return log.at(-1);
    }
    const open = buildBy(alice, { licenseId: LicenseId.CC_BY_4_0 });
    assert(importThroughEditor(bob, exportFile(open, alice)) === 'Opened as your own copy of alice\'s "Monument"', 'a copy says whose build it is');
    assert(importThroughEditor(alice, exportFile(open, alice)) === 'Imported "Monument"', 'one\'s own build says it was imported');
    assert(importThroughEditor(bob, exportFile(buildBy(alice), alice)) === 'Its maker hasn\'t allowed copies, so it can\'t be imported as your build.',
        'a refusal says the maker hasn\'t allowed copies');
    const changed = exportFile(buildBy(alice), alice);
    changed.metadata.license = { id: LicenseId.CC0_1_0 };
    assert(importThroughEditor(bob, changed) === 'This build was changed after its maker signed it, so it can\'t be imported.', 'a changed file says so');
    console.log('✓ the Editor says what Import did, or why it didn\'t');
}

console.log('\n✅ All DocumentSeal tests passed.');
