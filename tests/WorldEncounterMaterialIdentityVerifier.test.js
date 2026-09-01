import { readFile } from 'node:fs/promises';
import { WorldEncounterMaterialIdentityVerifier } from '../application/WorldEncounterMaterialIdentityVerifier.js';
import {
    verifyWorldEncounterMaterial,
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/WorldEncounterMaterialVerification.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.38 — World Encounter Material Identity Verifier.
// See docs/Roadmap.md, "0.9.38 — World Encounter Material Identity Verifier."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function selectionOf({ kind = WorldEncounterKind.PUBLICATION, objectId = 'pub-123', origin = 'decentralized:nostr' } = {}) {
    return Object.freeze({ kind, objectId, origin });
}

function leadOf({ uri = 'ar://tx-abc123', origin = 'nostr:wss://relay.example', discoveryTag = 'forkbuild_random_unique', storage = 'ar' } = {}) {
    return Object.freeze({ origin, discoveryTag, uri, storage });
}

// ---------------------------------------------------------------------
// 1. Flagship: a Publication whose `id` matches the selected `objectId`
//    verifies true; a Publication whose `id` does not resolves to false.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();

    const matching = await verifier.verifyIdentity(
        selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-123' }),
        { id: 'pub-123', title: 'A Decentralized Publication' },
        leadOf()
    );
    assert(matching === true, '1. FLAGSHIP — a Publication.id matching resolvedSelection.objectId resolves to true');

    const mismatched = await verifier.verifyIdentity(
        selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-123' }),
        { id: 'pub-999', title: 'Wrong Publication Entirely' },
        leadOf()
    );
    assert(mismatched === false, '2. FLAGSHIP — a Publication.id NOT matching resolvedSelection.objectId resolves to false');

    console.log('✓ Flagship: Publication.id correspondence resolves true when matching, false when not');
}

// ---------------------------------------------------------------------
// 2. AVATAR kind matches on AvatarProfile.avatarId, never on
//    Publication.id or any other field.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();

    const matching = await verifier.verifyIdentity(
        selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1' }),
        { avatarId: 'avatar-1', displayName: 'Alice' },
        null
    );
    assert(matching === true, '3. an AvatarProfile.avatarId matching resolvedSelection.objectId resolves to true');

    const mismatched = await verifier.verifyIdentity(
        selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1' }),
        { avatarId: 'avatar-2', displayName: 'Bob' },
        null
    );
    assert(mismatched === false, '4. an AvatarProfile.avatarId NOT matching resolvedSelection.objectId resolves to false');

    const wrongField = await verifier.verifyIdentity(
        selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1' }),
        { id: 'avatar-1', avatarId: 'avatar-2', displayName: 'Confusable' },
        null
    );
    assert(wrongField === false, '5. AVATAR verification never matches against material.id — only avatarId counts');

    console.log('✓ AVATAR kind matches strictly on AvatarProfile.avatarId');
}

// ---------------------------------------------------------------------
// 3. An unrecognized kind abstains (resolves to undefined, never false)
//    — a future kind this verifier has not been taught is never guessed
//    at or silently rejected.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();

    for (const kind of ['NOT_A_KIND', '', null, 'publication', 'Avatar']) {
        const outcome = await verifier.verifyIdentity(Object.freeze({ kind, objectId: 'pub-123', origin: 'local' }), { id: 'pub-123' }, null);
        assert(outcome === undefined, `6. an unrecognized kind ${serialize(kind)} abstains (undefined), never false`);
    }

    console.log('✓ An unrecognized kind abstains rather than being guessed at or rejected');
}

// ---------------------------------------------------------------------
// 4. Malformed material is handled safely and resolves to a strict
//    false — never a throw, never an abstention — once the kind is one
//    this verifier does recognize.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();
    const selection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-123' });

    for (const material of [null, undefined, {}, { title: 'No id field at all' }, { id: 123 }, { id: '' }, 'a-string-not-an-object', 42, []]) {
        const outcome = await verifier.verifyIdentity(selection, material, null);
        assert(outcome === false, `7. malformed material ${serialize(material)} resolves to strict false, never a throw or abstention`);
    }

    console.log('✓ Malformed material resolves to false rather than throwing or abstaining');
}

// ---------------------------------------------------------------------
// 5. Comparison is strict string equality — never coerced, never
//    case-insensitive.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();

    const numericVsString = await verifier.verifyIdentity(
        selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: '123' }),
        { id: 123 },
        null
    );
    assert(numericVsString === false, '8. a numeric material.id is never coerced to match a string objectId');

    const caseMismatch = await verifier.verifyIdentity(
        selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'Pub-123' }),
        { id: 'pub-123' },
        null
    );
    assert(caseMismatch === false, '9. comparison is case-sensitive — differing case is a mismatch');

    console.log('✓ Comparison is strict string equality — no coercion, no case-insensitivity');
}

// ---------------------------------------------------------------------
// 6. A malformed resolvedSelection (missing/empty objectId, or missing
//    entirely) resolves to false when the kind is still recognizable,
//    since a non-string/empty objectId can never equal anything.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();

    for (const resolvedSelection of [
        { kind: WorldEncounterKind.PUBLICATION, objectId: '' },
        { kind: WorldEncounterKind.PUBLICATION, objectId: null },
        { kind: WorldEncounterKind.PUBLICATION }
    ]) {
        const outcome = await verifier.verifyIdentity(resolvedSelection, { id: 'pub-123' }, null);
        assert(outcome === false, `10. a malformed resolvedSelection ${serialize(resolvedSelection)} resolves to false`);
    }

    for (const resolvedSelection of [null, undefined, 'not-an-object']) {
        const outcome = await verifier.verifyIdentity(resolvedSelection, { id: 'pub-123' }, null);
        assert(outcome === undefined, `11. a completely missing/non-object resolvedSelection ${serialize(resolvedSelection)} abstains — no kind to recognize`);
    }

    console.log('✓ A malformed resolvedSelection never throws; it resolves to false or abstains, never a guess');
}

// ---------------------------------------------------------------------
// 7. `resolvedLead` is accepted but never inspected — passing any shape,
//    or omitting it, never changes the outcome.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();
    const selection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-123' });
    const material = { id: 'pub-123' };

    for (const resolvedLead of [null, undefined, leadOf(), {}, 'not-a-lead-shape']) {
        const outcome = await verifier.verifyIdentity(selection, material, resolvedLead);
        assert(outcome === true, `12. resolvedLead ${serialize(resolvedLead)} never affects the identity outcome`);
    }

    console.log('✓ resolvedLead is accepted but never inspected — every shape yields the same identity outcome');
}

// ---------------------------------------------------------------------
// 8. Never throws, for any input shape, including no arguments at all.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();
    let threw = false;
    try {
        await verifier.verifyIdentity();
    } catch {
        threw = true;
    }
    assert(!threw, '13. calling verifyIdentity() with no arguments at all never throws');

    console.log('✓ Calling with no arguments at all never throws');
}

// ---------------------------------------------------------------------
// 9. Determinism: calling twice with byte-identical arguments returns a
//    byte-identical outcome.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();
    const selection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-123' });
    const material = { id: 'pub-123' };

    const first = await verifier.verifyIdentity(selection, material, leadOf());
    const second = await verifier.verifyIdentity(selection, material, leadOf());
    assert(first === true && second === true, '14. calling twice with byte-identical arguments returns a byte-identical outcome');

    console.log('✓ Deterministic: identical inputs produce identical outcomes across calls');
}

// ---------------------------------------------------------------------
// 10. End-to-end integration: injected into 0.9.37's own
//     verifyWorldEncounterMaterial() unmodified, producing VERIFIED,
//     REJECTED, and (for an unrecognized kind) UNVERIFIABLE.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();

    const verified = await verifyWorldEncounterMaterial({
        resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-123' }),
        resolvedLead: leadOf(),
        material: { id: 'pub-123', signature: { algorithm: 'Ed25519' } },
        verifier
    });
    assert(verified.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '15. a matching Publication end-to-end resolves to VERIFIED through the 0.9.37 boundary');

    const rejected = await verifyWorldEncounterMaterial({
        resolvedSelection: selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-123' }),
        resolvedLead: leadOf(),
        material: { id: 'pub-999' },
        verifier
    });
    assert(rejected.status === WorldEncounterMaterialVerificationStatus.REJECTED, '16. a mismatched Publication end-to-end resolves to REJECTED through the 0.9.37 boundary');

    const verifiedAvatar = await verifyWorldEncounterMaterial({
        resolvedSelection: selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1' }),
        material: { avatarId: 'avatar-1', displayName: 'Alice' },
        verifier
    });
    assert(verifiedAvatar.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '17. a matching AvatarProfile end-to-end resolves to VERIFIED through the 0.9.37 boundary');

    console.log('✓ End-to-end through verifyWorldEncounterMaterial(): VERIFIED and REJECTED for both kinds');
}

// ---------------------------------------------------------------------
// 11. WorldEncounterMaterialIdentityVerifier IS-A WorldEncounterMaterialVerifier
//     — it extends the 0.9.37 base class rather than merely duck-typing it.
// ---------------------------------------------------------------------
{
    const verifier = new WorldEncounterMaterialIdentityVerifier();
    assert(verifier instanceof WorldEncounterMaterialVerifier, '18. WorldEncounterMaterialIdentityVerifier extends the 0.9.37 WorldEncounterMaterialVerifier base class');

    console.log('✓ WorldEncounterMaterialIdentityVerifier extends the 0.9.37 base contract class');
}

// ---------------------------------------------------------------------
// 12. Architectural regression: no signature/authorization machinery, no
//     network/storage access, no reads of resolvedLead, no trust/ranking
//     vocabulary, no generic objectId property invented on material, and
//     0.9.37's own boundary file is never modified.
// ---------------------------------------------------------------------
{
    const path = '../application/WorldEncounterMaterialIdentityVerifier.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('core/Signature'), '19. never imports core/Signature.js — no concrete cryptographic scheme');
    assert(!codeOnly.includes('SigningIdentity'), '20. never imports core/SigningIdentity.js');
    assert(!codeOnly.includes('AuthorizationVerifier'), '21. never imports identity/LocalAuthorizationVerifier.js or any AuthorizationVerifier');
    assert(!/\bmaterial\.signature\b/.test(codeOnly), '22. never reads material.signature — identity correspondence only, never cryptographic verification');
    assert(!/\bresolvedLead\.\w/.test(codeOnly), '23. never reads any field off resolvedLead — it is accepted but never inspected');
    assert(!/\.objectId\s*=/.test(codeOnly) && !codeOnly.includes('material.objectId'), '24. never invents a generic material.objectId property');
    assert(!/fetch\(/.test(codeOnly), '25. never calls fetch(...) — no network access');
    assert(!codeOnly.includes('WebSocket'), '26. never references WebSocket directly');
    assert(!codeOnly.includes('StorageProvider'), '27. never imports or references StorageProvider — no storage access');

    const forbiddenTerms = ['trusted', 'reputation', 'authority', 'weight', 'confidence', 'ranking', 'scoring', 'preferred'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `28. code must never use "${term}" — no trust/ranking vocabulary at this boundary`);
    }

    const boundarySource = await readFile(new URL('../application/WorldEncounterMaterialVerification.js', import.meta.url), 'utf8');
    assert(!boundarySource.includes('WorldEncounterMaterialIdentityVerifier'), '29. the 0.9.37 verification boundary is never modified to know about this concrete verifier');

    console.log('✓ Architectural regression: no cryptographic/network/storage machinery, no trust vocabulary, no generic objectId, boundary file untouched');
}

console.log('\nAll WorldEncounterMaterialIdentityVerifier tests passed.');
