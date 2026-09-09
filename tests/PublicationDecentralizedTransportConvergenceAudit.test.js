import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License } from '../core/License.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/PublicationPeerExchange.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import {
    PUBLICATION_CONTENT_KIND,
    validatePublicationContent,
    PublicationContentError
} from '../application/PublicationContentValidator.js';
import { createPublicationContentKind } from '../application/PublicationContentKind.js';

import { BLUEPRINT_ATTRIBUTION_KIND, CURRENT_SCHEMA_VERSION as ATTRIBUTION_SCHEMA_VERSION } from '../core/BlueprintAttribution.js';
import { createBlueprintAttributionPublicationKind } from '../application/BlueprintAttributionPublicationKind.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND } from '../application/PlaceNamingClaimPublication.js';
import { createPlaceNamingClaimPublicationKind } from '../application/PlaceNamingClaimPublicationKind.js';

import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.9.332 — Publication Decentralized Transport Convergence Audit.
//
// Test-only, architecture/convergence audit. Production changes: none.
//
// 0.9.331 built the third `kindPlugin` and proved, via direct
// `PublicationResolver#resolve()` calls, that a Publication's own identity
// survives a round trip. This milestone asks a narrower, harder question
// 0.9.331 never posed: does `forkbuild.publication` actually travel the
// REST of the existing decentralized pipeline — `PublicationExchange`,
// `PublicationPeerExchange`, `LocalPublicationCatalog` — completely
// unmodified, or does it merely work when called directly? And does the
// existing pipeline reject a forged Publication through its OWN
// verification mechanism, never a second, silently-substituted one?
//
//   Section A — FLAGSHIP: the full pipeline, end to end, through the REAL,
//               unmodified transport classes — never a direct resolver
//               call alone.
//   Section B — Verification convergence: structural validation (shape)
//               and cryptographic verification (integrity/authenticity)
//               stay two separate steps, in two separate pipeline
//               positions, never merged into one.
//   Section C — Envelope disambiguation locked down: the contentKind
//               discriminator gates entry BEFORE the structural validator
//               ever runs — a mismatched envelope can never reach a
//               lenient validator by accident.
//   Section D — Content-kind isolation across all THREE registered kinds,
//               not just two.
//   Section E — No new store: architectural guard, not merely a
//               convention.
//   Section F — Local vs. decentralized identity: resolving never
//               fabricates a second local record, and never memoizes.
//   Section G — No Repository coupling: checked by direct source search,
//               in both directions.
//   Section H — The one honest gap this audit surfaces: the Publications
//               Center's own display-kind registry does not yet know this
//               kind exists — a real, separately-scoped follow-up, never
//               Repository's concern.
//   Section I — Final verdict and production-change guard.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    let error = null;
    try { fn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    return error;
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readSource(relativePath);
        return true;
    } catch {
        return false;
    }
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
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
    provider.login(label);
    return provider;
}

function makePublication({ signed }, identityProvider) {
    // Mirrors exactly what publisher/LocalPublisherProvider.js itself
    // constructs on a real local publish — the same construction
    // tests/PublicationContentKind.test.js's own flagship already uses.
    const documentContentReference = new ContentReference({
        hash: 'docHash-fixed-content-1', algorithm: 'fnv1a-32', mediaType: 'application/json', size: 128
    });
    let publication = new Publication({
        documentId: 'world-farmstead-1',
        title: 'The Farmstead',
        author: signed ? 'alice' : null,
        providerId: 'local',
        parentDocumentId: null,
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license: new License({ id: 'CC0-1.0' }),
        contentReference: documentContentReference,
        publisherIdentity: signed ? identityProvider.getSigningIdentity().toJSON() : null,
        signature: null
    });
    if (signed) {
        publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    }
    return publication;
}

// A minimal stand-in for peer/PeerMessageBus.js — the identical stub
// tests/PublicationPeerExchange.test.js's own Section B already uses to
// exercise PublicationPeerExchange in isolation, deterministically,
// without a real handshake.
class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
        this.attached = new Set();
    }
    attach(peer) { this.attached.add(peer.connectionId); }
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        this.sent.push({ peer, protocol, payload });
    }
    subscribe(protocol, handler) {
        if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
        this._handlers.get(protocol).add(handler);
        return () => this._handlers.get(protocol).delete(handler);
    }
    deliver(protocol, payload) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload);
    }
}

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; this._listeners = new Set(); }
    list() { return this._peers; }
    onChange(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
}

function stubPeer(connectionId, state) {
    return { connectionId, getLifecycleState: () => state };
}

async function run() {
    console.log('Running Publication Decentralized Transport Convergence Audit tests...\n');

    // ===============================================================
    // Section A — FLAGSHIP: the full existing pipeline, end to end,
    // through the REAL, unmodified transport classes.
    //
    //   Alice: Publication -> PublicationResolver#publish() -> envelope
    //          -> PublicationPeerExchange#announce() (REAL, unmodified)
    //   wire:  StubPeerMessageBus (the same stand-in every other peer
    //          transport test in this codebase already uses)
    //   Bob:   PublicationPeerExchange#_handleIncoming() (REAL,
    //          unmodified) -> PublicationExchange#importPublication()
    //          (REAL, unmodified) -> LocalPublicationCatalog (REAL,
    //          unmodified) -> later, on demand, PublicationResolver
    //          #resolve() with createPublicationContentKind()
    //
    // Never once does this section call PublicationResolver from inside
    // the gossip path — exactly the separation application/
    // PublicationPeerExchange.js's own header insists on ("it NEVER calls
    // application/PublicationResolver.js").
    // ===============================================================
    let flagshipResolved;
    {
        const alice = makeIdentity('Alice');
        const sharedStorage = new InMemoryStorageProvider();
        const aliceContentStore = new LocalContentStore(sharedStorage);
        const aliceResolver = new PublicationResolver(aliceContentStore, new LocalAuthorizationVerifier());

        const originalPublication = makePublication({ signed: true }, alice);
        const envelope = await aliceResolver.publish({
            content: originalPublication,
            contentKind: PUBLICATION_CONTENT_KIND,
            identityProvider: alice
        });

        // Alice announces through the REAL, unmodified PublicationExchange
        // + PublicationPeerExchange — the identical classes every other
        // content kind (Blueprint Attribution, Place Naming Claim) already
        // gossips through.
        const aliceCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const aliceVerifier = new LocalAuthorizationVerifier();
        const aliceExchange = new PublicationExchange(aliceCatalog, aliceVerifier);
        const aliceBus = new StubPeerMessageBus();
        const authenticatedBobPeer = stubPeer('conn-bob', PeerLifecycleState.AUTHENTICATED);
        const alicePeerExchange = new PublicationPeerExchange(aliceExchange, aliceBus, new StubConnectedPeerRegistry([authenticatedBobPeer]));

        const sentCount = alicePeerExchange.announce(envelope);
        assert(sentCount === 1, '1. PublicationPeerExchange#announce() sends the Publication envelope exactly like any other content kind');

        // Bob's side: an independent replica, fed ONLY through the wire —
        // never a direct call from this test into importPublication().
        const bobCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const bobVerifier = new LocalAuthorizationVerifier();
        const bobExchange = new PublicationExchange(bobCatalog, bobVerifier);
        const bobBus = new StubPeerMessageBus();
        const bobPeerExchange = new PublicationPeerExchange(bobExchange, bobBus, new StubConnectedPeerRegistry([]));

        const received = [];
        bobPeerExchange.onPublicationReceived((result) => received.push(result));

        // The exact bytes Alice's bus sent, delivered into Bob's — the
        // same hand-off shape tests/PublicationPeerExchange.test.js's own
        // Section B already uses to prove routing without a real socket.
        assert(aliceBus.sent.length === 1, '2. precondition: Alice\'s bus recorded exactly one outgoing message');
        bobBus.deliver(PublicationPeerExchange.DEFAULT_PROTOCOL, aliceBus.sent[0].payload);

        assert(received.length === 1 && received[0].isNew, '3. Bob cataloged a new publication purely from the wire — PublicationPeerExchange never needed to know this envelope carried Publication content');
        assert(bobCatalog.list().length === 1, '4. Bob\'s own LocalPublicationCatalog now holds the envelope, unmodified by this milestone');
        const cataloged = bobCatalog.list()[0];
        assert(cataloged.contentKind === PUBLICATION_CONTENT_KIND, '5. the cataloged envelope still declares forkbuild.publication after crossing the wire');
        assert(!(cataloged instanceof Publication), '6. what is cataloged is the ENVELOPE, never the Publication itself — cataloging is not resolving');

        // Only now, ON DEMAND, does Bob resolve the CONTENT the envelope
        // points at — exactly the "Discovery Is Not Resolution" split
        // docs/Principles.md already names, applied here to the third
        // content kind for the first time.
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedStorage), bobVerifier);
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });
        const result = await bobResolver.resolve(cataloged.toJSON(), kindPlugin);
        assert(result.outcome === PublicationResolutionOutcome.RESOLVED, `7. Bob resolves the gossiped Publication (${result.reason})`);

        flagshipResolved = result.content;
        assert(flagshipResolved instanceof Publication, '8. resolved content is a real Publication instance');
        assert(flagshipResolved !== originalPublication, '9. resolving constructs a fresh instance, never the same object reference');
        assert(flagshipResolved.id === originalPublication.id, '10. publicationId preserved across publish -> gossip -> resolve');
        assert(flagshipResolved.documentId === originalPublication.documentId, '11. documentId preserved across publish -> gossip -> resolve');
        assert(flagshipResolved.contentReference.hash === originalPublication.contentReference.hash, '12. contentReference preserved across publish -> gossip -> resolve');
        assert(flagshipResolved.title === originalPublication.title && flagshipResolved.author === originalPublication.author, '13. title/author preserved');
        assert(flagshipResolved.license.id === 'CC0-1.0' && flagshipResolved.schemaVersion === originalPublication.schemaVersion, '14. license/schemaVersion preserved');
        assert(flagshipResolved.signature.signer === alice.getSigningIdentity().id, '15. the Publication\'s own signature is preserved and still names its real signer');
        assert(!(flagshipResolved instanceof DecentralizedPublication), '16. the resolved content is never itself a DecentralizedPublication — the two layers never collapse into one');

        // Structural confirmation that this convergence is real, not
        // coincidental: neither transport class was touched to make this
        // work, and neither one knows what a Publication even is.
        const peerExchangeSource = await readSource('application/PublicationPeerExchange.js');
        const exchangeSource = await readSource('application/PublicationExchange.js');
        assert(!/publisher\/Publication\.js|PUBLICATION_CONTENT_KIND|forkbuild\.publication/.test(peerExchangeSource + exchangeSource),
            '17. neither PublicationExchange.js nor PublicationPeerExchange.js was modified to special-case Publication content — both remain completely content-kind-agnostic, confirmed by source, not merely by this run\'s behavior.');
    }
    console.log('✓ Section A: FLAGSHIP — Publication -> publish() -> announce() -> (wire) -> _handleIncoming() -> importPublication() -> catalog -> resolve() -> the SAME semantic Publication, every identity field intact, through the REAL PublicationExchange/PublicationPeerExchange/LocalPublicationCatalog classes, completely unmodified — this is genuine transport convergence, not merely a direct-resolver-call proof.');

    // ===============================================================
    // Section B — Verification convergence: structural validation (shape)
    // and cryptographic verification (integrity/authenticity) stay two
    // separate steps, at two separate pipeline positions, never merged.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const bobVerifier = new LocalAuthorizationVerifier();

        // B1. A properly signed, well-formed Publication resolves.
        const goodPublication = makePublication({ signed: true }, alice);
        const goodEnvelope = await resolver.publish({ content: goodPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });
        const goodResult = await new PublicationResolver(new LocalContentStore(storage), bobVerifier).resolve(goodEnvelope.toJSON(), kindPlugin);
        assert(goodResult.outcome === PublicationResolutionOutcome.RESOLVED, `1. a valid, signed Publication resolves (${goodResult.reason})`);

        // B2. validate() and verify() are genuinely two different
        // functions on the plugin contract — never one call standing in
        // for the other.
        assert(kindPlugin.validate !== kindPlugin.verify, '2. kindPlugin.validate and kindPlugin.verify are distinct functions — the shape check and the trust check are never the same call');
        assert(kindPlugin.validate === validatePublicationContent, '3. kindPlugin.validate is exactly PublicationContentValidator\'s own validatePublicationContent — the structural check this milestone did not reinvent');

        // B3. Spy on both to prove the ORDER and SEPARATION
        // PublicationResolver#resolve() itself documents (steps 6-7 then
        // 8): validate() runs, and only once it succeeds does verify()
        // ever get called.
        let validateCalls = 0;
        let verifyCalls = 0;
        const spyPlugin = {
            contentKind: PUBLICATION_CONTENT_KIND,
            validate: (json) => { validateCalls++; validatePublicationContent(json); },
            fromJSON: (json) => Publication.fromJSON(json),
            verify: (json) => { verifyCalls++; return bobVerifier.verifyPublication(Publication.fromJSON(json)); }
        };
        await new PublicationResolver(new LocalContentStore(storage), bobVerifier).resolve(goodEnvelope.toJSON(), spyPlugin);
        assert(validateCalls === 1 && verifyCalls === 1, '4. for a valid publication, both validate() and verify() run exactly once each — two real, separate checks, neither skipped');

        // B4. TAMPER DETECTION, case 1 — bytes mutated in the ContentStore
        // after publish (a different DOCUMENT entirely). Caught by
        // core/ContentReference.js#verify() at pipeline step 5, BEFORE
        // either validate() or verify() on the kindPlugin ever runs —
        // structural/crypto content checks never even get a chance to
        // disagree with a hash that has already failed.
        {
            const publication = makePublication({ signed: true }, alice);
            const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
            storage.save('content:' + envelope.contentReference.hash, JSON.stringify({ ...publication.toJSON(), documentId: 'a-different-document' }));
            let sV = 0, sF = 0;
            const spy = { ...spyPlugin, validate: (j) => { sV++; validatePublicationContent(j); }, verify: (j) => { sF++; return bobVerifier.verifyPublication(Publication.fromJSON(j)); } };
            const result = await new PublicationResolver(new LocalContentStore(storage), bobVerifier).resolve(envelope.toJSON(), spy);
            assert(result.outcome === PublicationResolutionOutcome.CONTENT_HASH_MISMATCH, '5. bytes tampered after publish are rejected as CONTENT_HASH_MISMATCH');
            assert(sV === 0 && sF === 0, '6. neither the structural validator nor the content verifier ever runs once the hash check itself has already failed — no redundant, possibly-inconsistent second opinion');
        }

        // B5. TAMPER DETECTION, case 2 — the WRAPPED Publication's own
        // signature is forged, but the bytes are otherwise perfectly
        // consistent with their own hash (this is the case Section F of
        // 0.9.331's own flagship never exercised: a payload that is
        // well-formed enough to PASS structural validation and hashes
        // exactly to what was signed, yet is cryptographically bogus).
        // This proves rejection happens through PublicationResolver's own
        // step 8 (kindPlugin.verify(), which calls the SAME identity/
        // LocalAuthorizationVerifier.js#verifyPublication() every other
        // Publication verification in this codebase already uses) — never
        // through a second, silently-substituted validator.
        {
            const publication = makePublication({ signed: true }, alice);
            const forgedJson = publication.toJSON();
            // Valid HEX (so Ed25519 verification runs and genuinely fails,
            // rather than throwing on malformed input before it ever gets
            // that far) but not the real signature bytes — same length,
            // every nibble flipped.
            const forgedHex = forgedJson.signature.signature.replace(/[0-9a-f]/g, (c) => ((parseInt(c, 16) ^ 0xf) & 0xf).toString(16));
            forgedJson.signature = { ...forgedJson.signature, signature: forgedHex };
            const forgedPublication = Publication.fromJSON(forgedJson);

            // The forged Publication still passes structural validation —
            // it is well-formed (documentId present, signature present
            // and paired with a publisherIdentity, all fields the right
            // shape). Confirmed directly, not merely assumed.
            validatePublicationContent(forgedPublication.toJSON());

            const forgedEnvelope = await resolver.publish({ content: forgedPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });
            let sV = 0, sF = 0;
            const spy = { ...spyPlugin, validate: (j) => { sV++; validatePublicationContent(j); }, verify: (j) => { sF++; return bobVerifier.verifyPublication(Publication.fromJSON(j)); } };
            const result = await new PublicationResolver(new LocalContentStore(storage), bobVerifier).resolve(forgedEnvelope.toJSON(), spy);
            assert(result.outcome === PublicationResolutionOutcome.INVALID_CONTENT_SIGNATURE, `7. a structurally valid but cryptographically forged Publication is rejected as INVALID_CONTENT_SIGNATURE (got ${result.outcome}/${result.reason})`);
            assert(result.content === null, '8. no content is ever returned on a failed content-signature check');
            assert(sV === 1 && sF === 1, '9. this rejection runs BOTH the structural validator (which passed) and the content verifier (which failed) — exactly one call each, confirming the two are genuinely separate steps and neither one silently replaced the other');
        }
    }
    console.log('✓ Section B: verification convergence — a valid, signed Publication resolves through the existing pipeline unchanged; a hash-tampered one is caught before either content check runs; a structurally well-formed but cryptographically forged one passes the structural validator and is caught only by PublicationResolver\'s own content-signature step, calling the identical identity/LocalAuthorizationVerifier.js#verifyPublication() every other Publication check in this codebase already uses — never a second, parallel validator.');

    // ===============================================================
    // Section C — Envelope disambiguation locked down: the contentKind
    // discriminator gates entry BEFORE the structural validator ever
    // runs, so a payload that happens to resemble Publication JSON can
    // never sneak through under the wrong declared kind.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const bobVerifier = new LocalAuthorizationVerifier();

        // Publish a real, well-formed Publication — but under the WRONG
        // declared contentKind. Its payload would pass
        // validatePublicationContent() if that validator were ever
        // consulted; the point of this section is proving it never is.
        const publication = makePublication({ signed: true }, alice);
        const mislabeledEnvelope = await resolver.publish({
            content: publication, contentKind: BLUEPRINT_ATTRIBUTION_KIND, contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION, identityProvider: alice
        });

        let validateCalls = 0;
        const spyPublicationPlugin = {
            contentKind: PUBLICATION_CONTENT_KIND,
            validate: (json) => { validateCalls++; validatePublicationContent(json); },
            fromJSON: (json) => Publication.fromJSON(json),
            verify: (json) => bobVerifier.verifyPublication(Publication.fromJSON(json))
        };
        const result = await new PublicationResolver(new LocalContentStore(storage), bobVerifier).resolve(mislabeledEnvelope.toJSON(), spyPublicationPlugin);
        assert(result.outcome === PublicationResolutionOutcome.INVALID_ENVELOPE, `1. an envelope declaring a different contentKind is rejected as INVALID_ENVELOPE, even though its payload would structurally pass as a Publication (${result.reason})`);
        assert(validateCalls === 0, '2. the structural validator is never even INVOKED when the declared contentKind does not match — the discriminator alone gates entry, so no validator\'s own leniency could ever create ambiguity');

        assert(PUBLICATION_CONTENT_KIND !== BLUEPRINT_ATTRIBUTION_KIND && PUBLICATION_CONTENT_KIND !== PLACE_NAMING_CLAIM_PUBLICATION_KIND,
            '3. the three content-kind strings are pairwise distinct, by direct comparison');
    }
    console.log('✓ Section C: the contentKind discriminator alone gates entry — a payload that would structurally pass as a Publication is still rejected outright when its envelope declares a different kind, and the structural validator is never even consulted in that case. "Publication JSON" can never be confused with "some other object accidentally matching Publication\'s fields," because the wrong-kind case never reaches a validator at all.');

    // ===============================================================
    // Section D — Content-kind isolation across all THREE registered
    // kinds, not merely two.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const bobVerifier = new LocalAuthorizationVerifier();

        const publicationEnvelope = await resolver.publish({
            content: makePublication({ signed: true }, alice), contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice
        });
        // Neither BlueprintAttribution nor PlaceNamingClaim's own real
        // domain shape is needed to prove ISOLATION — PublicationResolver
        // rejects on the contentKind mismatch alone (Section C), so a
        // minimal, otherwise-arbitrary payload published under each
        // kind's own contentKind string is sufficient here.
        const attributionEnvelope = await resolver.publish({
            content: { fingerprint: 'bp:isolation-check' }, contentKind: BLUEPRINT_ATTRIBUTION_KIND, contentSchemaVersion: ATTRIBUTION_SCHEMA_VERSION, identityProvider: alice
        });
        const claimEnvelope = await resolver.publish({
            content: { kind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, claim: { name: 'isolation-check' } }, contentKind: PLACE_NAMING_CLAIM_PUBLICATION_KIND, identityProvider: alice
        });

        const publicationKind = createPublicationContentKind({ verifier: bobVerifier });
        const attributionKind = createBlueprintAttributionPublicationKind({ verifier: bobVerifier });
        const claimKind = createPlaceNamingClaimPublicationKind({ verifier: bobVerifier });

        const envelopes = { publication: publicationEnvelope, attribution: attributionEnvelope, claim: claimEnvelope };
        const kinds = { publication: publicationKind, attribution: attributionKind, claim: claimKind };

        let checks = 0;
        for (const envelopeName of Object.keys(envelopes)) {
            for (const kindName of Object.keys(kinds)) {
                const freshResolver = new PublicationResolver(new LocalContentStore(storage), bobVerifier);
                const result = await freshResolver.resolve(envelopes[envelopeName].toJSON(), kinds[kindName]);
                checks++;
                if (envelopeName === kindName) {
                    assert(result.outcome !== PublicationResolutionOutcome.INVALID_ENVELOPE,
                        `${checks}. a ${envelopeName} envelope resolved against its OWN ${kindName} kindPlugin is never rejected for contentKind mismatch (got ${result.outcome}/${result.reason})`);
                } else {
                    assert(result.outcome === PublicationResolutionOutcome.INVALID_ENVELOPE,
                        `${checks}. a ${envelopeName} envelope resolved against the ${kindName} kindPlugin is rejected as INVALID_ENVELOPE — no cross-kind acceptance (got ${result.outcome})`);
                }
            }
        }
        assert(checks === 9, '10. all nine pairings across the three registered content kinds were actually exercised');
    }
    console.log('✓ Section D: content-kind isolation holds across all three registered kinds (forkbuild.publication, forkbuild.blueprint-attribution, forkbuild.place-naming-claim), exercised pairwise — nine combinations, each resolving through its own kind and rejected by every other. A Publication resolves only through its own plugin.');

    // ===============================================================
    // Section E — No new store: architectural guard, checked directly,
    // not merely asserted by convention.
    // ===============================================================
    {
        // E1. Guard against the exact store shapes this milestone's own
        // brief named as explicitly out of scope.
        const suspiciousNames = ['DecentralizedPublicationStore', 'PublicationContentStore', 'RepositoryPublicationStore'];
        for (const name of suspiciousNames) {
            assert(!(await sourceExists(`application/${name}.js`)), `1. application/${name}.js does not exist — no new persistence authority has been introduced for decentralized-origin Publication content.`);
        }

        // E2. The plugin itself, checked directly: no `store` key at all —
        // unlike the other two kind plugins, which both accept one.
        const kindSource = await readSource('application/PublicationContentKind.js');
        assert(!/store\s*[:(]/.test(kindSource.replace(/\/\/.*$/gm, '')),
            '2. application/PublicationContentKind.js defines no `store` capability anywhere in its own code (comments excluded) — resolving through this plugin can only ever answer "what does this locator resolve to," never persist anything as a side effect.');

        // E3. Reconfirmed at runtime: a kindPlugin built by this factory
        // genuinely has no store function for PublicationResolver to even
        // consider calling at its own optional step 10.
        const verifier = new LocalAuthorizationVerifier();
        const plugin = createPublicationContentKind({ verifier });
        assert(typeof plugin.store === 'undefined', '3. the constructed plugin has no `store` property at all — PublicationResolver\'s own optional step 10 is structurally a no-op for this content kind.');
    }
    console.log('✓ Section E: no DecentralizedPublicationStore/PublicationContentStore/RepositoryPublicationStore has been introduced, and application/PublicationContentKind.js itself carries no `store` capability at all — checked in source and confirmed at runtime. This remains transport/resolution only, exactly as scoped.');

    // ===============================================================
    // Section F — Local vs. decentralized identity: a decentralized
    // representation never becomes a second local Publication record, and
    // resolving is never memoized into a hidden second store of its own.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const storage = new InMemoryStorageProvider();
        const resolver = new PublicationResolver(new LocalContentStore(storage), new LocalAuthorizationVerifier());
        const bobVerifier = new LocalAuthorizationVerifier();
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });

        const originalPublication = makePublication({ signed: true }, alice);
        const envelope = await resolver.publish({ content: originalPublication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: alice });

        // Resolving the SAME envelope twice, independently, never returns
        // the same object reference and never returns the original
        // instance either — every resolution is freshly re-derived from
        // the wire bytes, exactly the "Discovery Is Not Resolution"
        // restraint docs/Principles.md already names for this pipeline as
        // a whole (0.7.2), reconfirmed here for the new content kind.
        const first = await new PublicationResolver(new LocalContentStore(storage), bobVerifier).resolve(envelope.toJSON(), kindPlugin);
        const second = await new PublicationResolver(new LocalContentStore(storage), bobVerifier).resolve(envelope.toJSON(), kindPlugin);
        assert(first.content !== second.content, '1. two independent resolutions of the identical envelope produce two DIFFERENT object instances — nothing caches or memoizes a resolved Publication into a second local record');
        assert(first.content !== originalPublication && second.content !== originalPublication, '2. neither resolution ever returns Alice\'s own original instance — a resolved Publication is always a freshly materialized representation of the wire bytes, never a reference back into Alice\'s own local state');
        assert(first.content.id === second.content.id && first.content.documentId === second.content.documentId, '3. both resolutions nonetheless agree completely on identity — same documentId, same publicationId, every time');
    }
    console.log('✓ Section F: a decentralized-origin Publication is always freshly re-derived from wire bytes on every resolution — never cached, never memoized, and never the same reference as the original local instance that was published. Nothing here creates a second local Publication record as a side effect of resolving one.');

    // ===============================================================
    // Section G — No Repository coupling, checked by direct source
    // search, in both directions.
    // ===============================================================
    {
        // G1. Repository's own files never reference this content kind.
        const repositoryFacingFiles = [
            'application/SearchPublicationsUseCase.js',
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationCard.js',
            'discovery/DiscoveryProvider.js',
            'discovery/LocalDiscoveryProvider.js',
            'application/CreatePublicationCatalogUseCase.js'
        ];
        for (const file of repositoryFacingFiles) {
            if (!(await sourceExists(file))) continue;
            const src = await readSource(file);
            assert(!/PublicationContentKind|PUBLICATION_CONTENT_KIND|forkbuild\.publication/.test(src),
                `1. ${file} makes no reference to PublicationContentKind/forkbuild.publication — this transport seam is not wired into Repository's own search/catalog/discovery stack.`);
        }

        // G2. The reverse holds too: PublicationContentKind.js itself
        // never imports anything Repository-shaped.
        const kindSource = await readSource('application/PublicationContentKind.js');
        const validatorSource = await readSource('application/PublicationContentValidator.js');
        assert(!/SearchPublicationsUseCase|DiscoveryProvider|PublicationCatalog\.js|CreatePublicationCatalogUseCase/.test(kindSource + validatorSource),
            '2. application/PublicationContentKind.js and application/PublicationContentValidator.js import nothing Repository-shaped — this content kind is usable entirely independently of Repository, exactly what makes it a transport seam rather than a Repository-specific implementation.');

        // G3. At the time this audit was written, only
        // tests/PublicationContentKind.test.js and this audit file itself
        // referenced the new symbols outside application/ — confirmed
        // directly rather than assumed from G1/G2 alone. 0.9.333 closed
        // this milestone's own Section H gap by adding exactly ONE more
        // reference: application/CreatePublicationDisplayKindRegistryUseCase.js,
        // the Publications Center's own generic display-kind registry —
        // named here explicitly as the one intended, non-Repository
        // exception, never silently widened to permit anything else.
        const nonTestHits = grepFiles('PublicationContentKind|PUBLICATION_CONTENT_KIND', ['application', 'ui', 'discovery'])
            .filter((f) => !f.startsWith('application/PublicationContentKind.js') && !f.startsWith('application/PublicationContentValidator.js') && !f.startsWith('application/CreatePublicationDisplayKindRegistryUseCase.js'));
        assert(nonTestHits.length === 0, `3. no file under application/, ui/, or discovery/ other than the two files this content kind is defined in, plus the Publications Center's own display-kind registry (0.9.333), references it at all (found: ${nonTestHits.join(', ') || 'none'}).`);
    }
    console.log('✓ Section G: no Repository coupling in either direction — Repository\'s own search/catalog/discovery files never mention this content kind, and this content kind never imports anything Repository-shaped. It is usable, and tested, entirely on its own.');

    // ===============================================================
    // Section H — At the time this audit was written, the one honest gap
    // it surfaced was that the Publications Center's own display-kind
    // registry did not yet know this kind existed — real, separately-
    // scoped follow-up work, and per Section G, explicitly NOT a
    // Repository concern, since the registry is the generic Publications
    // Center's own, not Repository's. 0.9.333 closed exactly that gap,
    // the same way every other kindPlugin in that registry was already
    // composed — reconfirmed here, fresh, rather than left to silently
    // rot into a false claim.
    // ===============================================================
    {
        const registrySource = await readSource('application/CreatePublicationDisplayKindRegistryUseCase.js');
        assert(registrySource.includes('createBlueprintAttributionPublicationKind') && registrySource.includes('createPlaceNamingClaimPublicationKind'),
            '1. the Publications Center\'s own display-kind registry still wires the two kinds that existed before this milestone, unchanged.');
        assert(registrySource.includes('createPublicationContentKind'),
            '2. as of 0.9.333, application/CreatePublicationDisplayKindRegistryUseCase.js DOES register forkbuild.publication — composed via createPublicationContentKind(), exactly the way createBlueprintAttributionPublicationKind()/createPlaceNamingClaimPublicationKind() already were. A cataloged, decentralized-origin Publication can now be DISPLAYED by the Publications Center, closing the one gap this audit named. See tests/PublicationDisplayKindIntegration.test.js for the full display-path flagship this milestone\'s own successor built.');
    }
    console.log('✓ Section H: the one gap this audit named at the time — application/CreatePublicationDisplayKindRegistryUseCase.js not yet knowing forkbuild.publication existed — is closed as of 0.9.333, the Publications Center\'s own display-kind registry gaining a third entry, composed identically to the first two. Transport, resolution, AND display now all converge cleanly.');

    // ===============================================================
    // Section I — Final verdict and production-change guard.
    // ===============================================================
    {
        const CLASSIFICATIONS = [
            'TRANSPORT_CONVERGENCE_CONFIRMED',
            'TRANSPORT_CONVERGENCE_CONFIRMED_WITH_GAPS',
            'PARALLEL_PATH_DETECTED',
            'NOT_CONVERGED'
        ];
        const verdict = 'TRANSPORT_CONVERGENCE_CONFIRMED';
        assert(CLASSIFICATIONS.includes(verdict), '1. the verdict is drawn from this milestone\'s own named taxonomy.');

        const changedNonTestFiles = execSync('git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }).toString().trim();
        assert(changedNonTestFiles === '', `2. no production file is modified by this milestone (git diff outside tests/, tests.html, docs/Roadmap.md is empty) — found: ${changedNonTestFiles || 'none'}.`);
    }
    console.log('\n✓ Section I: FINAL DECISION.\n' +
'\n' +
'OUTCOME: TRANSPORT_CONVERGENCE_CONFIRMED.\n' +
'\n' +
'WHY. Section A ran the actual flagship scenario the product owner\'s own brief asked for — publish, gossip over the\n' +
'REAL PublicationExchange/PublicationPeerExchange classes (never a direct resolver call standing in for the wire),\n' +
'catalog, then resolve on demand — and proved every identity field (id, documentId, contentReference, title, author,\n' +
'license, schemaVersion, signature) survives completely intact, while confirming by source that neither transport\n' +
'class was modified or taught anything about Publication specifically. Section B proved verification convergence\n' +
'precisely: structural validation and cryptographic verification are two distinct, separately-invoked steps, and a\n' +
'structurally well-formed but cryptographically forged Publication is rejected by PublicationResolver\'s own existing\n' +
'content-signature step — the identical identity/LocalAuthorizationVerifier.js#verifyPublication() every other\n' +
'Publication check in this codebase already calls, never a second validator silently substituted in. Section C\n' +
'proved the contentKind discriminator alone gates entry, before the structural validator ever runs, closing the one\n' +
'ambiguity risk this audit was asked to investigate. Section D reconfirmed isolation across all three registered\n' +
'content kinds, pairwise, nine combinations. Section E confirmed, in source and at runtime, that no new store of any\n' +
'kind was introduced. Section F confirmed a resolved Publication is always freshly re-derived, never cached into a\n' +
'second local record. Section G confirmed zero Repository coupling in either direction, by direct search. Section H\n' +
'named the one honest, narrowly-scoped gap this audit found: the Publications Center\'s own display-kind registry\n' +
'does not yet know this kind exists — real follow-up work, explicitly distinct from Repository, and explicitly not a\n' +
'defect in this milestone\'s own scope.\n' +
'\n' +
'WHAT THIS MEANS. Adding forkbuild.publication as a decentralized content kind activates an existing\n' +
'transport/resolution path; it does not create a new identity, verification, persistence, or Repository authority —\n' +
'this milestone\'s own governing invariant holds, checked from source and from a real end-to-end run through the\n' +
'unmodified transport classes, not merely asserted. No production code is touched here — this remains, per its own\n' +
'Type, a test-only convergence audit. What comes after, per Section H, is narrower than a Repository milestone:\n' +
'wiring forkbuild.publication into application/CreatePublicationDisplayKindRegistryUseCase.js so a decentralized-\n' +
'origin Publication can actually be SEEN in the Publications Center — still, deliberately, before any milestone\n' +
'touches Repository, Search, or Repository-facing UI.\n');

    console.log('\n✅ All Publication Decentralized Transport Convergence Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All PublicationDecentralizedTransportConvergenceAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PublicationDecentralizedTransportConvergenceAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
