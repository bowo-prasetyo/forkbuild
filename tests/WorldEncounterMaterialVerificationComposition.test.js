import { readFile } from 'node:fs/promises';
import { WorldEncounterMaterialVerificationComposition } from '../application/WorldEncounterMaterialVerificationComposition.js';
import {
    verifyWorldEncounterMaterial,
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/WorldEncounterMaterialVerification.js';
import { WorldEncounterMaterialIdentityVerifier } from '../application/WorldEncounterMaterialIdentityVerifier.js';
import { WorldEncounterMaterialSignatureVerifier } from '../application/WorldEncounterMaterialSignatureVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';

// 0.9.42 — World Encounter Material Verification Composition.
// See docs/Roadmap.md, "0.9.42 — World Encounter Material Verification Composition."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function selectionOf({ kind = WorldEncounterKind.PUBLICATION, objectId = 'P123', origin = 'decentralized:nostr' } = {}) {
    return Object.freeze({ kind, objectId, origin });
}

function leadOf({ uri = 'ar://tx-abc123', origin = 'nostr:wss://relay.example', discoveryTag = 'forkbuild_random_unique', storage = 'ar' } = {}) {
    return Object.freeze({ origin, discoveryTag, uri, storage });
}

class FakeVerifier extends WorldEncounterMaterialVerifier {
    constructor(outcome) {
        super();
        this.outcome = outcome;
        this.calls = 0;
    }

    async verifyIdentity() {
        this.calls += 1;
        return this.outcome;
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRealSigner(username) {
    const storage = new InMemoryStorageProvider();
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function signedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'P123',
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
// 1. Flagship: the identity verifier (0.9.38) and the signature verifier
//    (0.9.41) — both real, both confirming — compose to true, and that
//    composition, injected into 0.9.37's own unmodified
//    verifyWorldEncounterMaterial(), resolves VERIFIED end to end.
// ---------------------------------------------------------------------
{
    const alice = buildRealSigner('alice-1');
    const publication = signedPublication(alice);
    const resolvedSelection = selectionOf({ objectId: 'P123' });
    const resolvedLead = leadOf();

    const composed = new WorldEncounterMaterialVerificationComposition({
        verifiers: [new WorldEncounterMaterialIdentityVerifier(), new WorldEncounterMaterialSignatureVerifier()]
    });

    const outcome = await composed.verifyIdentity(resolvedSelection, publication, resolvedLead);
    assert(outcome === true, '1. FLAGSHIP — identity + signature, both confirming, compose to true');

    const result = await verifyWorldEncounterMaterial({ resolvedSelection, resolvedLead, material: publication, verifier: composed });
    assert(result.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '2. FLAGSHIP — wired through verifyWorldEncounterMaterial(), the composition resolves VERIFIED');

    console.log('✓ Flagship: a real identity verifier + a real signature verifier compose to VERIFIED');
}

// ---------------------------------------------------------------------
// 2. Any sub-verifier resolving false makes the whole composition false
//    — even when every other sub-verifier confirms true.
// ---------------------------------------------------------------------
{
    const composed = new WorldEncounterMaterialVerificationComposition({
        verifiers: [new FakeVerifier(true), new FakeVerifier(false), new FakeVerifier(true)]
    });

    const outcome = await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    assert(outcome === false, '3. one contradicting sub-verifier makes the whole composition false, regardless of the others');

    const result = await verifyWorldEncounterMaterial({ resolvedSelection: selectionOf(), material: { id: 'P123' }, verifier: composed });
    assert(result.status === WorldEncounterMaterialVerificationStatus.REJECTED, '4. wired through verifyWorldEncounterMaterial(), a contradiction resolves REJECTED');

    console.log('✓ Any sub-verifier resolving false rejects the whole composition');
}

// ---------------------------------------------------------------------
// 3. No rejection, but at least one abstention: the composition abstains
//    (undefined), never guessed into a pass — the conservative default
//    this milestone deliberately ships instead of a per-kind
//    applicability policy (see the implementation file's own header).
// ---------------------------------------------------------------------
{
    const composed = new WorldEncounterMaterialVerificationComposition({
        verifiers: [new FakeVerifier(true), new FakeVerifier(undefined)]
    });

    const outcome = await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    assert(outcome === undefined, '5. true + abstain, with no contradiction, abstains rather than passing');

    const result = await verifyWorldEncounterMaterial({ resolvedSelection: selectionOf(), material: { id: 'P123' }, verifier: composed });
    assert(result.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '6. wired through verifyWorldEncounterMaterial(), true + abstain resolves UNVERIFIABLE');

    console.log('✓ true + abstain, with no contradiction, abstains rather than passing');
}

// ---------------------------------------------------------------------
// 4. The real, current behavior of composing 0.9.38 + 0.9.41 against an
//    AVATAR selection: the signature verifier always abstains for AVATAR
//    (0.9.41's own "only PUBLICATION is judged"), so even a confirmed
//    identity composes to UNVERIFIABLE, never VERIFIED — this pins the
//    deliberate, conservative default in place of a hypothetical
//    per-kind applicability policy this milestone does not implement.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'A1' });
    const material = { avatarId: 'A1', displayName: 'Wanderer' };
    const composed = new WorldEncounterMaterialVerificationComposition({
        verifiers: [new WorldEncounterMaterialIdentityVerifier(), new WorldEncounterMaterialSignatureVerifier()]
    });

    const outcome = await composed.verifyIdentity(resolvedSelection, material, null);
    assert(outcome === undefined, '7. a confirmed AVATAR identity composed with an always-abstaining signature verifier abstains, not passes');

    const result = await verifyWorldEncounterMaterial({ resolvedSelection, material, verifier: composed });
    assert(result.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '8. wired through verifyWorldEncounterMaterial(), the same AVATAR case resolves UNVERIFIABLE, not VERIFIED');

    console.log('✓ AVATAR identity + always-abstaining signature composes to UNVERIFIABLE, the deliberate conservative default');
}

// ---------------------------------------------------------------------
// 5. Zero sub-verifiers — an empty list, or none supplied at all — is an
//    abstention, never a vacuous pass.
// ---------------------------------------------------------------------
{
    for (const verifiers of [[], undefined, null]) {
        const composed = new WorldEncounterMaterialVerificationComposition({ verifiers });
        const outcome = await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
        assert(outcome === undefined, `9. zero sub-verifiers (${serialize(verifiers)}) abstains rather than passing vacuously`);
    }

    console.log('✓ Zero sub-verifiers abstains rather than passing vacuously');
}

// ---------------------------------------------------------------------
// 6. Malformed sub-verifier entries — missing, null, or exposing no
//    callable verifyIdentity — are treated as abstentions, never as a
//    contradiction, and never throw.
// ---------------------------------------------------------------------
{
    for (const malformed of [undefined, null, {}, { verifyIdentity: 'not-a-function' }, 'a-verifier-shaped-string']) {
        const composed = new WorldEncounterMaterialVerificationComposition({ verifiers: [new FakeVerifier(true), malformed] });
        const outcome = await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
        assert(outcome === undefined, `10. a malformed sub-verifier entry ${serialize(malformed)} abstains rather than throwing or contradicting`);
    }

    console.log('✓ Malformed sub-verifier entries abstain rather than throwing or contradicting');
}

// ---------------------------------------------------------------------
// 7. Short-circuiting: sub-verifiers after the first strict false are
//    never asked. Sub-verifiers before it, and abstentions, are always
//    asked in full.
// ---------------------------------------------------------------------
{
    const first = new FakeVerifier(true);
    const second = new FakeVerifier(false);
    const third = new FakeVerifier(true);
    const composed = new WorldEncounterMaterialVerificationComposition({ verifiers: [first, second, third] });

    const outcome = await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    assert(outcome === false, '11. the composition still resolves false with a short-circuit in place');
    assert(first.calls === 1 && second.calls === 1, '12. sub-verifiers up to and including the first false are asked');
    assert(third.calls === 0, '13. a sub-verifier after the first false is never asked');

    console.log('✓ Sub-verifiers after the first strict false are never asked');
}

// ---------------------------------------------------------------------
// 8. Every sub-verifier is asked at most once when none reject; order is
//    preserved.
// ---------------------------------------------------------------------
{
    const calls = [];
    class OrderTrackingVerifier extends WorldEncounterMaterialVerifier {
        constructor(name, outcome) { super(); this.name = name; this.outcome = outcome; }
        async verifyIdentity() { calls.push(this.name); return this.outcome; }
    }
    const composed = new WorldEncounterMaterialVerificationComposition({
        verifiers: [new OrderTrackingVerifier('first', true), new OrderTrackingVerifier('second', undefined), new OrderTrackingVerifier('third', true)]
    });

    await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    assert(serialize(calls) === serialize(['first', 'second', 'third']), '14. sub-verifiers are asked exactly once each, in supplied order, when none reject');

    console.log('✓ Sub-verifiers are asked exactly once each, in supplied order, absent a rejection');
}

// ---------------------------------------------------------------------
// 9. A thrown rejection from a sub-verifier propagates, never swallowed
//    into an abstention.
// ---------------------------------------------------------------------
{
    const failing = new WorldEncounterMaterialVerifier();
    failing.verifyIdentity = async () => { throw new Error('sub-verifier backend unreachable'); };
    const composed = new WorldEncounterMaterialVerificationComposition({ verifiers: [new FakeVerifier(true), failing] });

    let rejected = false;
    try {
        await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    } catch {
        rejected = true;
    }
    assert(rejected, '15. a rejection from a sub-verifier propagates through the composition, never swallowed as an abstention');

    console.log('✓ A sub-verifier rejection propagates rather than being swallowed');
}

// ---------------------------------------------------------------------
// 10. resolvedSelection/material/resolvedLead are forwarded verbatim to
//     every sub-verifier, unmodified.
// ---------------------------------------------------------------------
{
    const resolvedSelection = selectionOf({ objectId: 'P123' });
    const resolvedLead = leadOf();
    const material = Object.freeze({ id: 'P123' });

    class RecordingVerifier extends WorldEncounterMaterialVerifier {
        constructor() { super(); this.received = null; }
        async verifyIdentity(a, b, c) { this.received = { resolvedSelection: a, material: b, resolvedLead: c }; return true; }
    }
    const recorder = new RecordingVerifier();
    const composed = new WorldEncounterMaterialVerificationComposition({ verifiers: [recorder] });

    await composed.verifyIdentity(resolvedSelection, material, resolvedLead);
    assert(recorder.received.resolvedSelection === resolvedSelection, '16. resolvedSelection is forwarded to each sub-verifier by reference');
    assert(recorder.received.material === material, '17. material is forwarded to each sub-verifier by reference');
    assert(recorder.received.resolvedLead === resolvedLead, '18. resolvedLead is forwarded to each sub-verifier by reference');

    console.log('✓ resolvedSelection/material/resolvedLead are forwarded verbatim to every sub-verifier');
}

// ---------------------------------------------------------------------
// 11. A composition can itself be composed — it satisfies the same
//     WorldEncounterMaterialVerifier contract it consumes.
// ---------------------------------------------------------------------
{
    assert(new WorldEncounterMaterialVerificationComposition({ verifiers: [] }) instanceof WorldEncounterMaterialVerifier, '19. the composition class extends WorldEncounterMaterialVerifier');

    const inner = new WorldEncounterMaterialVerificationComposition({ verifiers: [new FakeVerifier(true), new FakeVerifier(true)] });
    const outer = new WorldEncounterMaterialVerificationComposition({ verifiers: [inner, new FakeVerifier(true)] });

    const outcome = await outer.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    assert(outcome === true, '20. a composition nested inside another composition resolves correctly');

    console.log('✓ A composition is itself a WorldEncounterMaterialVerifier and can be nested');
}

// ---------------------------------------------------------------------
// 12. Calling verifyIdentity() with no arguments at all never throws.
// ---------------------------------------------------------------------
{
    const composed = new WorldEncounterMaterialVerificationComposition({ verifiers: [new FakeVerifier(true)] });
    const outcome = await composed.verifyIdentity();
    assert(outcome === true, '21. calling with no resolvedSelection/material/resolvedLead never throws — sub-verifiers decide what to do with them');

    console.log('✓ Calling with no arguments at all never throws');
}

// ---------------------------------------------------------------------
// 13. Determinism: repeated calls with the same inputs and sub-verifiers
//     produce the same outcome, asking every sub-verifier again each
//     time (no caching).
// ---------------------------------------------------------------------
{
    const a = new FakeVerifier(true);
    const b = new FakeVerifier(true);
    const composed = new WorldEncounterMaterialVerificationComposition({ verifiers: [a, b] });

    const first = await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    const second = await composed.verifyIdentity(selectionOf(), { id: 'P123' }, leadOf());
    assert(first === true && second === true, '22. repeated calls produce the same outcome');
    assert(a.calls === 2 && b.calls === 2, '23. no caching — each sub-verifier is asked again on a second call');

    console.log('✓ No caching: repeated calls invoke every sub-verifier again');
}

// ---------------------------------------------------------------------
// 14. Architectural regression: no knowledge of concrete verifier
//     classes, no re-reading of resolvedSelection/material/resolvedLead
//     fields, no trust/ranking vocabulary, and neither 0.9.37's own
//     boundary nor either existing concrete verifier is ever modified.
// ---------------------------------------------------------------------
{
    const path = '../application/WorldEncounterMaterialVerificationComposition.js';
    const sourceUrl = new URL(path, import.meta.url);
    const fullSource = await readFile(sourceUrl, 'utf8');
    const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!codeOnly.includes('WorldEncounterMaterialIdentityVerifier'), '24. never imports or knows about the 0.9.38 identity verifier by name');
    assert(!codeOnly.includes('WorldEncounterMaterialSignatureVerifier'), '25. never imports or knows about the 0.9.41 signature verifier by name');
    assert(!codeOnly.includes('WorldEncounterKind'), '26. never imports core/WorldEncounter.js — no kind-specific applicability policy of its own');
    assert(!/\bresolvedSelection\.\w/.test(codeOnly), '27. never reads a field off resolvedSelection');
    assert(!/\bmaterial\.\w/.test(codeOnly), '28. never reads a field off material');
    assert(!/\bresolvedLead\.\w/.test(codeOnly), '29. never reads a field off resolvedLead');
    assert(!codeOnly.includes('WorldEncounterMaterialInspection'), '30. never imports the 0.9.39 inspection orchestration boundary');

    const forbiddenTerms = ['trusted', 'reputation', 'authority', 'weight', 'confidence', 'ranking', 'scoring', 'preferred'];
    for (const term of forbiddenTerms) {
        assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `31. code must never use "${term}" — no trust/ranking vocabulary at this boundary`);
    }

    const verificationBoundarySource = await readFile(new URL('../application/WorldEncounterMaterialVerification.js', import.meta.url), 'utf8');
    assert(!verificationBoundarySource.includes('WorldEncounterMaterialVerificationComposition'), '32. 0.9.37\'s own verification boundary is never modified to know about this file');

    const identityVerifierSource = await readFile(new URL('../application/WorldEncounterMaterialIdentityVerifier.js', import.meta.url), 'utf8');
    assert(!identityVerifierSource.includes('WorldEncounterMaterialVerificationComposition'), '33. the 0.9.38 identity verifier is never modified to know about this file');

    const signatureVerifierSource = await readFile(new URL('../application/WorldEncounterMaterialSignatureVerifier.js', import.meta.url), 'utf8');
    assert(!signatureVerifierSource.includes('WorldEncounterMaterialVerificationComposition'), '34. the 0.9.41 signature verifier is never modified to know about this file');

    console.log('✓ Architectural regression: no concrete-verifier knowledge, no field reads, no trust vocabulary; nothing upstream is modified');
}

console.log('\nAll WorldEncounterMaterialVerificationComposition tests passed.');
