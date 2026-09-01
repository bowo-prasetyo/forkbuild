import { readFile } from 'node:fs/promises';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldEncounterMaterialSignatureVerifier } from '../application/WorldEncounterMaterialSignatureVerifier.js';
import {
    verifyWorldEncounterMaterial,
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/WorldEncounterMaterialVerification.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { Publication } from '../publisher/Publication.js';

// 0.9.41 — World Encounter Material Signature Verifier.
// See docs/Roadmap.md, "0.9.41 — World Encounter Material Signature Verifier."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function selectionOf({ kind = WorldEncounterKind.PUBLICATION, objectId = 'pub-123', origin = 'decentralized:nostr' } = {}) {
    return Object.freeze({ kind, objectId, origin });
}

function leadOf({ uri = 'ar://tx-abc123', origin = 'nostr:wss://relay.example', discoveryTag = 'forkbuild_random_unique', storage = 'ar' } = {}) {
    return Object.freeze({ origin, discoveryTag, uri, storage });
}

function buildRealSigner(username) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

// Builds a genuinely, cryptographically signed Publication using this
// codebase's own real Ed25519 signing machinery — the exact sequence
// `publisher/LocalPublisherProvider.js` already uses in production.
function signedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-123',
        documentId: 'doc-1',
        title: 'A Decentralized Publication',
        author: 'alice',
        publisherIdentity,
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// ---------------------------------------------------------------------
// 1. Flagship: a genuinely, cryptographically signed Publication verifies
//   true — both as a real Publication instance (the local-origin shape)
//   and as a plain parsed-JSON object (the decentralized-origin shape).
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-1');
    const publication = signedPublication(alice);

    const asInstance = await verifier.verifyIdentity(selectionOf(), publication, leadOf());
    assert(asInstance === true, '1. FLAGSHIP — a genuinely signed Publication instance verifies true');

    const asPlainJson = await verifier.verifyIdentity(selectionOf(), publication.toJSON(), leadOf());
    assert(asPlainJson === true, '2. FLAGSHIP — the identical publication, as plain parsed JSON (the decentralized/Arweave retrieval shape), verifies true just the same');

    console.log('✓ Flagship: a genuinely signed Publication verifies true, as an instance or as plain JSON');
}

// ---------------------------------------------------------------------
// 2. Tampering with the material after it was signed invalidates the
//    signature — a REJECTED (strict false) outcome, never a pass.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-2');
    const publication = signedPublication(alice);

    const tampered = { ...publication.toJSON(), title: 'A Different Title Entirely' };
    const outcome = await verifier.verifyIdentity(selectionOf(), tampered, null);
    assert(outcome === false, '3. tampering with signed content after signing resolves to strict false');

    console.log('✓ Tampering with signed content after signing is actively rejected');
}

// ---------------------------------------------------------------------
// 3. A signature produced by one identity, then attributed to another,
//    is rejected — the signer must actually BE the claimed publisher.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-3');
    const mallory = buildRealSigner('mallory-3');

    const publication = signedPublication(alice);
    const impersonated = { ...publication.toJSON(), publisherIdentity: mallory.getSigningIdentity().toJSON() };
    const outcome = await verifier.verifyIdentity(selectionOf(), impersonated, null);
    assert(outcome === false, "4. a signature whose signer does not match the claimed publisherIdentity is rejected");

    console.log('✓ A signer that does not match the claimed publisherIdentity is rejected');
}

// ---------------------------------------------------------------------
// 4. An unsigned (legacy, pre-0.2.16) Publication abstains — nothing was
//    ever cryptographically asserted, so this is never a pass or a fail.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const legacy = new Publication({ id: 'pub-123', documentId: 'doc-1', title: 'Legacy', author: 'alice', signature: null, publisherIdentity: null });

    const outcome = await verifier.verifyIdentity(selectionOf(), legacy, null);
    assert(outcome === undefined, '5. an unsigned legacy Publication abstains (undefined) — never treated as verified, never as rejected');

    const outcomeJson = await verifier.verifyIdentity(selectionOf(), legacy.toJSON(), null);
    assert(outcomeJson === undefined, '6. the identical unsigned Publication as plain JSON abstains the same way');

    console.log('✓ An unsigned legacy Publication abstains rather than passing or failing');
}

// ---------------------------------------------------------------------
// 5. AVATAR material always abstains — this file only cryptographically
//    judges PUBLICATION material; see this file's own "abstaining is not
//    failing."
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();

    for (const material of [{ avatarId: 'avatar-1', displayName: 'Alice' }, {}, null, 'not-an-object']) {
        const outcome = await verifier.verifyIdentity(
            selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1' }),
            material,
            null
        );
        assert(outcome === undefined, `7. AVATAR material ${serialize(material)} always abstains — no cryptographic layer over AvatarProfile exists yet`);
    }

    console.log('✓ AVATAR material always abstains, regardless of shape');
}

// ---------------------------------------------------------------------
// 6. An unrecognized kind abstains, never guessed at.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-6');
    const publication = signedPublication(alice);

    for (const kind of ['NOT_A_KIND', '', null, 'publication', undefined]) {
        const outcome = await verifier.verifyIdentity(Object.freeze({ kind, objectId: 'pub-123', origin: 'local' }), publication, null);
        assert(outcome === undefined, `8. an unrecognized kind ${serialize(kind)} abstains, even with a genuinely valid signature present`);
    }

    console.log('✓ An unrecognized kind abstains regardless of whether the material carries a valid signature');
}

// ---------------------------------------------------------------------
// 7. Malformed material never throws and always abstains — there is
//    nothing cryptographic to even attempt checking.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const selection = selectionOf();

    for (const material of [null, undefined, 'a-string-not-an-object', 42, true]) {
        const outcome = await verifier.verifyIdentity(selection, material, null);
        assert(outcome === undefined, `9. malformed material ${serialize(material)} abstains rather than throwing or being guessed at`);
    }

    // An array is technically typeof 'object' — it degrades to an
    // unsigned-shaped Publication (no signature field), which itself
    // abstains, exactly like {} does.
    const arrayOutcome = await verifier.verifyIdentity(selection, [], null);
    assert(arrayOutcome === undefined, '10. an array carries no usable signature field and abstains rather than throwing');

    console.log('✓ Malformed material never throws — it abstains');
}

// ---------------------------------------------------------------------
// 8. Adversarial cryptographic material — a syntactically present but
//    fundamentally broken publicKey/signature hex string — never throws.
//    identity/Ed25519.js#hexToBytes() genuinely throws for this input one
//    layer down; this file must catch it and report a strict false, never
//    let it propagate as an unhandled rejection.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-8');
    const publication = signedPublication(alice);
    const signatureJson = publication.signature.toJSON();

    const garbagePublicKey = {
        ...publication.toJSON(),
        publisherIdentity: { ...publication.publisherIdentity, publicKey: 'not-valid-hex!!' }
    };
    let threw = false;
    let outcome;
    try {
        outcome = await verifier.verifyIdentity(selectionOf(), garbagePublicKey, null);
    } catch {
        threw = true;
    }
    assert(!threw, '11. a garbage publicKey hex string never throws out of verifyIdentity()');
    assert(outcome === false, '12. a garbage publicKey hex string resolves to strict false — a genuinely broken signature, never an abstention');

    const garbageSignatureBytes = {
        ...publication.toJSON(),
        signature: { ...signatureJson, signature: 'zz-not-hex-zz' }
    };
    threw = false;
    try {
        outcome = await verifier.verifyIdentity(selectionOf(), garbageSignatureBytes, null);
    } catch {
        threw = true;
    }
    assert(!threw, '13. a garbage signature hex string never throws out of verifyIdentity() either');
    assert(outcome === false, '14. a garbage signature hex string also resolves to strict false');

    console.log('✓ Adversarial/malformed cryptographic material never throws — it resolves to strict false');
}

// ---------------------------------------------------------------------
// 9. `resolvedLead` is accepted but never inspected — passing any shape,
//    or omitting it, never changes the outcome.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-9');
    const publication = signedPublication(alice);

    for (const resolvedLead of [null, undefined, leadOf(), {}, 'not-a-lead-shape']) {
        const outcome = await verifier.verifyIdentity(selectionOf(), publication, resolvedLead);
        assert(outcome === true, `15. resolvedLead ${serialize(resolvedLead)} never affects the signature outcome`);
    }

    console.log('✓ resolvedLead is accepted but never inspected — every shape yields the same signature outcome');
}

// ---------------------------------------------------------------------
// 10. Never throws, for any input shape, including no arguments at all.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    let threw = false;
    try {
        await verifier.verifyIdentity();
    } catch {
        threw = true;
    }
    assert(!threw, '16. calling verifyIdentity() with no arguments at all never throws');

    console.log('✓ Calling with no arguments at all never throws');
}

// ---------------------------------------------------------------------
// 11. Determinism: calling twice with byte-identical arguments returns a
//     byte-identical outcome.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-11');
    const publication = signedPublication(alice);

    const first = await verifier.verifyIdentity(selectionOf(), publication.toJSON(), leadOf());
    const second = await verifier.verifyIdentity(selectionOf(), publication.toJSON(), leadOf());
    assert(first === true && second === true, '17. calling twice with byte-identical arguments returns a byte-identical outcome');

    console.log('✓ Deterministic: identical inputs produce identical outcomes across calls');
}

// ---------------------------------------------------------------------
// 12. An injected authorizationVerifier is actually used, and is always
//     handed a real Publication instance — even when the material this
//     file received was plain JSON.
// ---------------------------------------------------------------------
{
    let received = null;
    const fakeAuthorizationVerifier = {
        verifyPublication(publication) {
            received = publication;
            return { valid: true, signed: true, reason: null };
        }
    };
    const verifier = new WorldEncounterMaterialSignatureVerifier({ authorizationVerifier: fakeAuthorizationVerifier });

    const outcome = await verifier.verifyIdentity(selectionOf(), { id: 'pub-123', signature: { algorithm: 'Ed25519' } }, null);
    assert(outcome === true, '18. an injected authorizationVerifier\'s own decision is honored');
    assert(received instanceof Publication, '19. plain JSON material is re-hydrated into a real Publication instance before being handed to the injected authorizationVerifier');
    assert(received.id === 'pub-123', '20. the re-hydrated Publication carries the original material\'s own fields');

    const rejecting = { verifyPublication: () => ({ valid: false, signed: true, reason: 'bad' }) };
    const rejectingVerifier = new WorldEncounterMaterialSignatureVerifier({ authorizationVerifier: rejecting });
    assert((await rejectingVerifier.verifyIdentity(selectionOf(), { id: 'pub-123' }, null)) === false, '21. signed: true, valid: false maps to strict false');

    const abstaining = { verifyPublication: () => ({ valid: true, signed: false, reason: 'unsigned' }) };
    const abstainingVerifier = new WorldEncounterMaterialSignatureVerifier({ authorizationVerifier: abstaining });
    assert((await abstainingVerifier.verifyIdentity(selectionOf(), { id: 'pub-123' }, null)) === undefined, '22. signed: false abstains regardless of what valid says');

    console.log('✓ An injected authorizationVerifier is honored, and always receives a real Publication instance');
}

// ---------------------------------------------------------------------
// 13. End-to-end integration: injected into 0.9.37's own
//     verifyWorldEncounterMaterial() unmodified, producing VERIFIED,
//     REJECTED, and UNVERIFIABLE.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    const alice = buildRealSigner('alice-13');
    const publication = signedPublication(alice);

    const verified = await verifyWorldEncounterMaterial({
        resolvedSelection: selectionOf(),
        resolvedLead: leadOf(),
        material: publication.toJSON(),
        verifier
    });
    assert(verified.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '23. a genuinely signed publication end-to-end resolves to VERIFIED through the 0.9.37 boundary');

    const rejected = await verifyWorldEncounterMaterial({
        resolvedSelection: selectionOf(),
        resolvedLead: leadOf(),
        material: { ...publication.toJSON(), title: 'Tampered' },
        verifier
    });
    assert(rejected.status === WorldEncounterMaterialVerificationStatus.REJECTED, '24. tampered material end-to-end resolves to REJECTED through the 0.9.37 boundary');

    const unverifiable = await verifyWorldEncounterMaterial({
        resolvedSelection: selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1' }),
        material: { avatarId: 'avatar-1' },
        verifier
    });
    assert(unverifiable.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '25. AVATAR material end-to-end resolves to UNVERIFIABLE through the 0.9.37 boundary');

    console.log('✓ End-to-end through verifyWorldEncounterMaterial(): VERIFIED, REJECTED, and UNVERIFIABLE');
}

// ---------------------------------------------------------------------
// 14. WorldEncounterMaterialSignatureVerifier IS-A WorldEncounterMaterialVerifier
//     — it extends the 0.9.37 base class rather than merely duck-typing it.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialSignatureVerifier();
    assert(verifier instanceof WorldEncounterMaterialVerifier, '26. WorldEncounterMaterialSignatureVerifier extends the 0.9.37 WorldEncounterMaterialVerifier base class');

    console.log('✓ WorldEncounterMaterialSignatureVerifier extends the 0.9.37 base contract class');
}

// ---------------------------------------------------------------------
// 15. Architectural regression: never re-checks structural identity, never
//     reads resolvedLead's own fields, no trust/ranking vocabulary, no
//     network/storage/signing access of its own, and neither 0.9.37's own
//     boundary nor 0.9.38's own structural verifier is ever modified to
//     know about this file.
// ---------------------------------------------------------------------
{
    const path = '../application/WorldEncounterMaterialSignatureVerifier.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('WorldEncounterMaterialIdentityVerifier'), '27. never imports 0.9.38\'s own structural verifier — a separate, independent verifier');
    assert(!/resolvedSelection\.objectId/.test(codeOnly), '28. never reads resolvedSelection.objectId — structural correspondence is 0.9.38\'s own, separate job');
    assert(!/material\.(id|avatarId)\b/.test(codeOnly), '29. never reads a generic material.id/.avatarId for comparison — that check belongs one layer over, in 0.9.38');
    assert(!/\bresolvedLead\.\w/.test(codeOnly), '30. never reads any field off resolvedLead — it is accepted but never inspected');
    assert(!codeOnly.includes('LocalIdentityProvider'), '31. never imports identity/LocalIdentityProvider.js — this file only ever verifies a signature, never produces one');
    assert(!/fetch\(/.test(codeOnly), '32. never calls fetch(...) — no network access');
    assert(!codeOnly.includes('WebSocket'), '33. never references WebSocket directly');
    assert(!codeOnly.includes('StorageProvider'), '34. never imports or references StorageProvider — no storage access');

    const forbiddenTerms = ['trusted', 'reputation', 'weight', 'confidence', 'ranking', 'scoring', 'preferred'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `35. code must never use "${term}" — no trust/ranking vocabulary at this boundary`);
    }

    const boundarySource = await readFile(new URL('../application/WorldEncounterMaterialVerification.js', import.meta.url), 'utf8');
    assert(!boundarySource.includes('WorldEncounterMaterialSignatureVerifier'), '36. the 0.9.37 verification boundary is never modified to know about this concrete verifier');

    const identityVerifierSource = await readFile(new URL('../application/WorldEncounterMaterialIdentityVerifier.js', import.meta.url), 'utf8');
    assert(!identityVerifierSource.includes('WorldEncounterMaterialSignatureVerifier'), '37. 0.9.38\'s own structural verifier is never modified to know about this file');

    console.log('✓ Architectural regression: no structural re-checking, no trust vocabulary, no network/storage/signing access, boundary files untouched');
}

console.log('\nAll WorldEncounterMaterialSignatureVerifier tests passed.');
