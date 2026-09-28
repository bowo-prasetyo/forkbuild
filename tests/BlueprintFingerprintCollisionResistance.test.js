// A blueprint fingerprint is the only link between a design and the signed
// authorship and lineage claims about it, so a different design must never
// be able to take it. The old "bp:" fingerprints were 32-bit FNV-1a and can
// be matched in milliseconds: claims under them are kept apart, never
// counted, never imported, and only their author can sign again.
import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import {
    canonicalizeBlueprint, deriveBlueprintFingerprint, deriveLegacyBlueprintFingerprint,
    isCurrentBlueprintFingerprint, isLegacyBlueprintFingerprint
} from '../core/BlueprintFingerprint.js';
import { BlueprintAttribution } from '../core/BlueprintAttribution.js';
import { BlueprintLineageClaim } from '../core/BlueprintLineageClaim.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalBlueprintAttributionStore } from '../application/blueprint/LocalBlueprintAttributionStore.js';
import { LocalBlueprintAttributionPublicationLog } from '../application/blueprint/LocalBlueprintAttributionPublicationLog.js';
import { LocalBlueprintLineageClaimStore } from '../application/blueprint/LocalBlueprintLineageClaimStore.js';
import { BlueprintAttributionUseCase } from '../application/blueprint/BlueprintAttributionUseCase.js';
import { BlueprintAttributionExchange } from '../application/blueprint/BlueprintAttributionExchange.js';
import { BlueprintLineageUseCase } from '../application/blueprint/BlueprintLineageUseCase.js';
import { BlueprintLineageExchange } from '../application/blueprint/BlueprintLineageExchange.js';
import { createBlueprintAttributionPublicationKind } from '../application/blueprint/BlueprintAttributionPublicationKind.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

function bricks(count) {
    return Array.from({ length: count }, (_, i) => new Brick({ definitionId: 'core:cube', position: new Position(i, 0.5, 0) }));
}

// A different design whose legacy fingerprint equals `target`: three
// characters in its description join the FNV-1a state before them to the
// state after them, run backwards from the target.
function forgeLegacyFingerprint(target) {
    const base = { name: 'Totally different', category: 'residential', bricks: bricks(40) };
    const json = (description) => JSON.stringify(canonicalizeBlueprint(new Structure({ ...base, description })));
    const probe = json('X@@@');
    const at = probe.indexOf('X@@@');
    const head = probe.slice(0, at + 1);
    const tail = probe.slice(at + 4);
    const prime = 0x01000193;
    const inverse = 0x359c449b;
    let forward = 0x811c9dc5;
    for (let i = 0; i < head.length; i++) forward = Math.imul(forward ^ head.charCodeAt(i), prime) >>> 0;
    let backward = parseInt(target.slice('bp:'.length), 16);
    for (let i = tail.length - 1; i >= 0; i--) backward = ((Math.imul(backward, inverse) >>> 0) ^ tail.charCodeAt(i)) >>> 0;
    for (let c3 = 0x4e00; c3 < 0x9fff; c3++) {
        const beforeC3 = ((Math.imul(backward, inverse) >>> 0) ^ c3) >>> 0;
        for (let c2 = 0x4e00; c2 < 0x9fff; c2++) {
            const beforeC2 = ((Math.imul(beforeC3, inverse) >>> 0) ^ c2) >>> 0;
            const c1 = ((Math.imul(beforeC2, inverse) >>> 0) ^ forward) >>> 0;
            if (c1 >= 0x4e00 && c1 < 0x9fff) {
                return new Structure({ ...base, description: 'X' + String.fromCharCode(c1, c2, c3) });
            }
        }
    }
    throw new Error('no collision found');
}

const aliceDesign = new Structure({ name: 'Alice Tower', category: 'residential', description: 'A tidy tower', bricks: bricks(3) });
const malloryDesign = forgeLegacyFingerprint(deriveLegacyBlueprintFingerprint(aliceDesign));

// Alice's authorship claim as the app signed it before this change.
function legacyAttribution(identity, design) {
    let attribution = new BlueprintAttribution({
        fingerprint: deriveLegacyBlueprintFingerprint(design),
        authorIdentityId: identity.getSigningIdentity().id
    });
    return attribution.withSignature(identity.signCanonical(attribution.getSigningDescriptor()));
}

{
    assert(deriveLegacyBlueprintFingerprint(malloryDesign) === deriveLegacyBlueprintFingerprint(aliceDesign),
        'a different design really matches the legacy fingerprint');
    assert(isLegacyBlueprintFingerprint(deriveLegacyBlueprintFingerprint(aliceDesign)), 'legacy fingerprints are recognized');
    const alice = deriveBlueprintFingerprint(aliceDesign);
    assert(isCurrentBlueprintFingerprint(alice), 'current fingerprints are "bp2:" and SHA-256');
    assert(deriveBlueprintFingerprint(malloryDesign) !== alice, 'the forged design has a different current fingerprint');
    console.log('✓ a legacy fingerprint collision is found at once, and the current fingerprint tells the designs apart');
}

{
    const aliceIdentity = makeIdentity('Alice');
    const storage = new InMemoryStorageProvider();
    const store = new LocalBlueprintAttributionStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    store.save(legacyAttribution(aliceIdentity, aliceDesign));
    const viewer = new BlueprintAttributionUseCase(store, makeIdentity('Bob'), verifier);

    const view = viewer.communityView(malloryDesign);
    assert(view.authors.length === 0, 'Alice\'s old claim does not make her the author of the forged design');
    assert(view.legacyClaims.length === 1, 'it is counted as an older claim that can\'t be checked');
    assert(viewer.communityView(aliceDesign).authors.length === 0, 'nor is it counted for her real design');
    console.log('✓ legacy authorship claims are never counted as authors');
}

{
    const aliceIdentity = makeIdentity('Alice');
    const storage = new InMemoryStorageProvider();
    const store = new LocalBlueprintAttributionStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const legacy = legacyAttribution(aliceIdentity, aliceDesign);
    store.save(legacy);
    const alice = new BlueprintAttributionUseCase(store, aliceIdentity, verifier);

    assert(alice.communityView(aliceDesign).myLegacyClaim?.id === legacy.id, 'Alice is offered her own old claim to sign again');
    const resigned = alice.resignLegacyAttribution(aliceDesign);
    assert(resigned.fingerprint === deriveBlueprintFingerprint(aliceDesign), 'she signs again under the current fingerprint');
    const after = alice.communityView(aliceDesign);
    assert(after.authors.length === 1 && after.mine, 'and is now counted as the author');
    assert(after.legacyClaims.length === 0 && after.myLegacyClaim === null, 'her old claim is retracted');
    assert(alice.communityView(malloryDesign).authors.length === 0, 'the forged design still has no author');

    let threw = false;
    try { alice.resignLegacyAttribution(aliceDesign); } catch { threw = true; }
    assert(threw, 'there is nothing to sign again a second time');
    console.log('✓ an author signs their own legacy claim again only on request');
}

{
    const aliceIdentity = makeIdentity('Alice');
    const storage = new InMemoryStorageProvider();
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new BlueprintAttributionExchange(
        new LocalBlueprintAttributionStore(storage), verifier, new LocalBlueprintAttributionPublicationLog(storage)
    );
    let message = null;
    try { exchange.importAttribution(legacyAttribution(aliceIdentity, aliceDesign).toJSON()); } catch (error) { message = error.message; }
    assert(message && message.includes('old, insecure fingerprint'), `a legacy attribution is refused on import, saying why (got: ${message})`);

    const kind = createBlueprintAttributionPublicationKind({ verifier });
    let crossChecked = null;
    try { kind.crossCheck(legacyAttribution(aliceIdentity, aliceDesign)); } catch (error) { crossChecked = error.message; }
    assert(crossChecked && crossChecked.includes('old, insecure fingerprint'), 'and when resolved from the network');

    const current = new BlueprintAttributionUseCase(new LocalBlueprintAttributionStore(new InMemoryStorageProvider()), aliceIdentity, verifier)
        .publish(aliceDesign);
    assert(exchange.importAttribution(current.toJSON()).isNew, 'a current attribution still imports');
    console.log('✓ legacy attributions are refused from files and the network');
}

{
    const aliceIdentity = makeIdentity('Alice');
    const storage = new InMemoryStorageProvider();
    const store = new LocalBlueprintLineageClaimStore(storage);
    const verifier = new LocalAuthorizationVerifier();
    const source = new Structure({ name: 'Base', category: 'residential', description: '', bricks: bricks(2) });
    let legacy = new BlueprintLineageClaim({
        sourceFingerprint: deriveLegacyBlueprintFingerprint(source),
        derivedFingerprint: deriveLegacyBlueprintFingerprint(aliceDesign),
        authorIdentityId: aliceIdentity.getSigningIdentity().id
    });
    legacy = legacy.withSignature(aliceIdentity.signCanonical(legacy.getSigningDescriptor()));
    store.save(legacy);

    const useCase = new BlueprintLineageUseCase(store, aliceIdentity, verifier);
    const view = useCase.lineageView(malloryDesign);
    assert(view.derivedFrom.length === 0, 'a legacy lineage claim is not shown for the forged design');
    assert(view.legacyClaims.length === 1, 'it is counted as an older claim');
    assert(useCase.lineageView(aliceDesign).derivedFrom.length === 0, 'nor for the real one');

    const exchange = new BlueprintLineageExchange(new LocalBlueprintLineageClaimStore(new InMemoryStorageProvider()), verifier);
    let message = null;
    try { exchange.importClaim(legacy.toJSON()); } catch (error) { message = error.message; }
    assert(message && message.includes('old, insecure fingerprint'), `a legacy lineage claim is refused on import (got: ${message})`);

    useCase.publish(aliceDesign, source);
    assert(useCase.lineageView(aliceDesign).derivedFrom.length === 1, 'declaring the lineage again shows it');
    console.log('✓ legacy lineage claims are counted apart and refused on import');
}

console.log('\n✅ All BlueprintFingerprintCollisionResistance tests passed.');
