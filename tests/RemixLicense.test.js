// A remix keeps its original's builder credited and its terms
// (core/document/License.js, remixLicenseIds(), derivedFrom(), relicense()): a remix of
// a non-commercial castle can't be relabelled into one anyone may sell, nor
// lose the name of whoever built it, through Build Properties in the Editor
// (UpdateDocumentMetadataUseCase) or World View; the builder of the original
// may relicense their own remix as they like.
import { License, LicenseId } from '../core/document/License.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { World } from '../core/document/World.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { ForkDocumentUseCase } from '../application/document/ForkDocumentUseCase.js';
import { UpdateDocumentMetadataUseCase } from '../application/document/UpdateDocumentMetadataUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const ALL = Object.values(LicenseId);

// What a remix may move to, for each original's license.
{
    assert(License.remixLicenseIds(LicenseId.CC0_1_0).length === ALL.length, 'a public-domain original allows any license');
    assert(!License.remixLicenseIds(LicenseId.CC_BY_4_0).includes(LicenseId.CC0_1_0), 'an attribution original never becomes public domain');
    assert(License.remixLicenseIds(LicenseId.CC_BY_4_0).includes(LicenseId.CC_BY_NC_4_0), 'but may take on more terms');
    assert(License.remixLicenseIds(LicenseId.CC_BY_SA_4_0).join() === LicenseId.CC_BY_SA_4_0, 'ShareAlike carries forward unchanged');
    const nonCommercial = License.remixLicenseIds(LicenseId.CC_BY_NC_4_0);
    assert(nonCommercial.includes(LicenseId.CC_BY_NC_4_0) && nonCommercial.includes(LicenseId.ALL_RIGHTS_RESERVED), 'NonCommercial stays, or gets stricter');
    assert(![LicenseId.CC0_1_0, LicenseId.CC_BY_4_0, LicenseId.CC_BY_SA_4_0, LicenseId.CC_BY_ND_4_0].some((id) => nonCommercial.includes(id)),
        'no license that would allow commercial use');
    assert(License.remixLicenseIds('LicenseRef-custom').length === ALL.length, 'an id this version doesn\'t know isn\'t judged');
    console.log('✓ what a remix may move to');
}

// relicense(): the credit stays, a disallowed choice keeps the license,
// the original's own builder is free, and a build that isn't a remix is
// unchanged.
{
    const remix = License.derivedFrom(new License({ id: LicenseId.CC_BY_NC_4_0 }), {
        author: 'ana', title: 'Castle', sourceDocumentId: 'doc-castle', sourceAuthorIdentityId: 'id-ana'
    });
    assert(remix.id === LicenseId.CC_BY_NC_4_0 && remix.attribution.sourceLicenseId === LicenseId.CC_BY_NC_4_0, 'a remix records its original\'s license');

    const laundered = License.relicense(remix, new License({ id: LicenseId.CC0_1_0 }), { authorIdentityId: 'id-ben' });
    assert(laundered.id === LicenseId.CC_BY_NC_4_0, `a non-commercial remix can't be made public domain (${laundered.id})`);
    assert(laundered.attribution.author === 'ana' && laundered.attribution.title === 'Castle', 'and still credits its builder');

    const stricter = License.relicense(remix, new License({ id: LicenseId.ALL_RIGHTS_RESERVED }), { authorIdentityId: 'id-ben' });
    assert(stricter.id === LicenseId.ALL_RIGHTS_RESERVED && stricter.attribution.author === 'ana', 'a stricter license is allowed, keeping the credit');
    const back = License.relicense(stricter, new License({ id: LicenseId.CC_BY_4_0 }), { authorIdentityId: 'id-ben' });
    assert(back.id === LicenseId.ALL_RIGHTS_RESERVED, 'the original\'s terms are remembered after a change: still no CC BY');

    const own = License.relicense(remix, new License({ id: LicenseId.CC_BY_4_0 }), { authorIdentityId: 'id-ana' });
    assert(own.id === LicenseId.CC_BY_4_0, 'the original\'s builder may relicense their own remix');

    const plain = new License({ id: LicenseId.CC0_1_0 });
    assert(License.relicense(new License({ id: LicenseId.CC_BY_NC_4_0 }), plain) === plain, 'a build that isn\'t a remix takes any license');

    // A remix made before the original's license was recorded: its license
    // then still is the original's.
    const older = new License({ id: LicenseId.CC_BY_SA_4_0, attribution: { author: 'ana', title: 'Castle' } });
    assert(License.relicense(older, new License({ id: LicenseId.CC_BY_4_0 })).id === LicenseId.CC_BY_SA_4_0, 'an older remix is held to its license');
    console.log('✓ relicensing a remix');
}

// Forking and then changing the license in Build Properties, as someone
// else: the credit and the non-commercial terms survive.
{
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const world = new World();
    const castle = new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Castle', author: 'ana', authorIdentityId: 'id-ana', license: new License({ id: LicenseId.CC_BY_NC_4_0 }) })
    });
    storage.save(world.id, serializer.serialize(castle));
    const ben = { currentUser: () => ({ username: 'ben' }), getSigningIdentity: () => ({ id: 'id-ben' }) };

    const remix = new ForkDocumentUseCase(storage, serializer).execute(world.id, ben);
    const stamped = remix.metadata.license;
    assert(stamped.id === LicenseId.CC_BY_NC_4_0 && stamped.attribution.author === 'ana', 'the remix carries the original\'s license and credit');
    assert(stamped.attribution.sourceAuthorIdentityId === 'id-ana' && stamped.attribution.sourceLicenseId === LicenseId.CC_BY_NC_4_0,
        'and records whose it was and under which license');

    let dirty = false;
    const documentManager = { document: remix, markDirty: () => { dirty = true; } };
    new UpdateDocumentMetadataUseCase().execute(documentManager, { license: new License({ id: LicenseId.CC_BY_4_0 }) });
    assert(dirty, 'the edit is applied');
    assert(remix.metadata.license.id === LicenseId.CC_BY_NC_4_0, `Build Properties can't make it commercial (${remix.metadata.license.id})`);
    assert(remix.metadata.license.attribution.author === 'ana', 'nor drop the credit');

    // Ana remixing her own castle may relicense it.
    const anaIdentity = { currentUser: () => ({ username: 'ana' }), getSigningIdentity: () => ({ id: 'id-ana' }) };
    const ownRemix = new ForkDocumentUseCase(storage, serializer).execute(world.id, anaIdentity);
    new UpdateDocumentMetadataUseCase().execute({ document: ownRemix, markDirty() {} }, { license: new License({ id: LicenseId.CC_BY_4_0 }) });
    assert(ownRemix.metadata.license.id === LicenseId.CC_BY_4_0, 'the builder relicenses their own remix');
    console.log('✓ a remix keeps its original\'s credit and terms through Build Properties');
}

console.log('✅ All RemixLicense tests passed.');
