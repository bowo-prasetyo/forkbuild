import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';

// 0.9.443 — Nostr Relay Observation Identity Boundary.
//
// 0.9.442's own product reassessment (tests/NostrRelayMultiplicityResilienceProductReassessment.test.js,
// Section F) found the exact prerequisite gap: two REAL, independently
// obtained Nostr relay-level discovery facts for the SAME publication — one
// via relay A, one via relay B — collapse to ONE observation at
// `PublicationDistributionLifecycleStore.js`'s own `(publicationId,
// discoveryProvider)` key, because `discoveryProvider` names only the
// SUBSTRATE ("nostr"), never the RELAY. This milestone is the deliberately
// narrow fix that Section F named as a prerequisite for any future
// multi-relay fan-out/failover milestone — and nothing more:
//
//   publicationId                          publicationId
//        │                                      │
//        └── discoveryProvider = "nostr"         └── discoveryProvider = "nostr"
//                 │                                       ├── relay A observation
//                 └── one observation                     └── relay B observation
//        (BEFORE — 0.9.433/0.9.442)              (AFTER — 0.9.443)
//
// THE FIX. `PublicationDistributionLifecycleStore.js#recordDiscoveryObservation()`
// gains one new, OPTIONAL fourth argument, `discoveryOrigin` — widening the
// EFFECTIVE key to `(publicationId, discoveryProvider, discoveryOrigin)`
// only when a caller actually supplies it. `application/PublicationDistributionCommand.js`
// now supplies it — the real relay URL the SAME call already computed —
// but ONLY when the resolved provider is `'nostr'`; every other provider
// (today: `'arweave'`) keeps recording with exactly three arguments,
// unchanged. `discoveryProvider` itself is NEVER redefined:
// `application/PublicationDistributionRuntimeComposition.js`'s own strict
// two-value substrate selector is untouched by this milestone.
//
// TEN LETTERED SECTIONS, MATCHING THIS MILESTONE'S OWN REQUESTED STRUCTURE:
//
//   A. Existing observation identity — the pre-0.9.443 collision, still
//      reproducible on demand when a caller does not supply discoveryOrigin
//      (backward compatibility is "the old behavior is still reachable,"
//      never "the old behavior is gone").
//   B. Nostr relay identity — two distinct, real relay origins for the
//      identical publication, driven through the real composed command.
//   C. Coexistence — A's and B's own real facts survive together, each
//      independently retrievable, field for field.
//   D. Same-relay replacement — a second observation from the SAME relay
//      replaces, never accumulates.
//   E. Reverse order — B-then-A produces the identical final set as
//      A-then-B.
//   F. Cross-provider isolation — Nostr relay observations never interfere
//      with an Arweave observation for the same publication, and Arweave
//      itself never acquires relay-level identity by this change.
//   G. Publication isolation — relay A's own observation for publication P
//      never affects publication Q, including on removal.
//   H. Cleanup — removing a publication removes ALL of its relay-specific
//      observations; replacing one relay's own observation leaves another
//      relay's own observation for the same publication untouched.
//   I. Legacy/backward compatibility — an observation recorded exactly as
//      0.9.433 always did (no discoveryOrigin at all) remains fully
//      readable, and a minimal legacy store shape keeps working.
//   J. UI observation — the real `WorldEncounterCanvas` computed renders
//      every current Nostr relay observation without collapsing them, and
//      the real template's own `:key` no longer collides across two Nostr
//      observations sharing one `discoveryProvider`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, PER 0.9.442's OWN
// RECOMMENDATION AND THIS MILESTONE'S OWN REQUEST. Multiple-relay
// CONFIGURATION of any kind; a relay list Settings UI; `Promise.all()`
// fan-out; sequential failover; retry policy; relay health checking; relay
// ranking; relay fallback; partial-success status; aggregate distribution
// status; relay selection policy; automatic relay discovery; a generic
// multi-provider endpoint abstraction; any change to Arweave gateway
// behavior, Bitcoin, or content-provider selection. Every "second relay" in
// every section below is a second, EXPLICIT, already-real call this test
// file makes — never a fan-out mechanism this milestone builds.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ---------------------------------------------------------------------
// Fake substrates — the same techniques tests/ConcurrentDiscoveryObservationPreservation.test.js
// and tests/ConcurrentDiscoveryObservationIntegrationBoundaryAudit.test.js
// already established. The orchestrator always constructs a real
// ArweavePublicationMaterialUploader regardless of discoveryProvider, so
// every composed command below supplies one, even Nostr-only ones — that
// uploader is simply never exercised when serializedMaterial is empty.
// ---------------------------------------------------------------------
function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    let announcementUploadCount = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = {
        async sign(material) {
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, { data: transaction.data, tag: null });
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    async function uploadTaggedTransaction(material, tag) {
        announcementUploadCount += 1;
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }
    return { contentSigner, fetchImpl, uploadTaggedTransaction, getAnnouncementUploadCount: () => announcementUploadCount };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

// Composes a real, production `publicationDistributionCommand` bound to
// exactly ONE Nostr relay — mirroring how 0.9.442's own Section D/E built
// two independent, real `NostrPublicationDiscoveryPublisher` instances, one
// per relay, with zero new abstraction. Two calls to THIS function, with
// two different `relayUrl`s, are how this test file models "two configured
// relays" — never a fan-out mechanism, always two separate, explicit
// actions a caller chooses to take.
function composeNostrRelayCommand({ lifecycleStore, relayUrl, arweaveSubstrate }) {
    let publishCount = 0;
    const substrate = arweaveSubstrate || makeFakeArweaveSubstrate();
    const command = composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: { signer: substrate.contentSigner, fetchImpl: substrate.fetchImpl },
        nostrPublisherOptions: {
            relayUrl,
            discoveryTag: 'relay-identity-boundary',
            publishImpl: async () => {
                publishCount += 1;
                return { published: true, id: nextFakeNostrEventId() };
            }
        }
    });
    return { command, getPublishCount: () => publishCount };
}

function composeArweaveOnlyCommand({ lifecycleStore, arweaveSubstrate }) {
    const substrate = arweaveSubstrate || makeFakeArweaveSubstrate();
    return composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: { signer: substrate.contentSigner, fetchImpl: substrate.fetchImpl },
        arweaveAnnouncementPublisherOptions: {
            discoveryTag: 'relay-identity-boundary-arweave',
            uploadTaggedTransaction: substrate.uploadTaggedTransaction
        }
    });
}

function distribute(command, publication, discoveryProvider) {
    return command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider });
}

async function run() {
    // ===============================================================
    // Section A — Existing observation identity: the pre-0.9.443
    // collision, still reachable when a caller supplies no discoveryOrigin
    // at all (this is exactly 0.9.442's own Section F3, reconfirmed live
    // against the store AFTER this milestone's own change, proving
    // backward compatibility means "still reachable," never "removed").
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const factFromRelayA = Object.freeze({ state: PublicationDistributionState.PRESENT, origin: 'wss://relay-a.example', discoveryTag: 't', id: 'a'.repeat(64) });
        const factFromRelayB = Object.freeze({ state: PublicationDistributionState.PRESENT, origin: 'wss://relay-b.example', discoveryTag: 't', id: 'b'.repeat(64) });

        lifecycleStore.recordDiscoveryObservation('pub-a-collision', 'nostr', factFromRelayA);
        lifecycleStore.recordDiscoveryObservation('pub-a-collision', 'nostr', factFromRelayB);

        const observations = lifecycleStore.getDiscoveryObservations('pub-a-collision');
        assert(observations.length === 1, n('A1. calling recordDiscoveryObservation() WITHOUT discoveryOrigin (exactly as every pre-0.9.443 caller did) still collapses two "nostr" facts to one — the collision itself is not silently removed, only made avoidable'));
        assert(observations[0].id === factFromRelayB.id, n('A2. the surviving fact is the later call\'s own, matching 0.9.442\'s own Section F3 finding exactly'));

        console.log('✓ Section A: the pre-0.9.443 collision remains fully reproducible when a caller opts out of discoveryOrigin — proving this milestone widens identity rather than silently changing default behavior');
    }

    // ===============================================================
    // Section B — Nostr relay identity: two distinct, real relay origins
    // for the identical publication, driven through the real, production
    // composed command (never the store's own methods called directly).
    // ===============================================================
    let sectionBObservations;
    let sectionBResultA;
    let sectionBResultB;
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-b-two-relays');

        const relayA = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-a.example' });
        const relayB = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-b.example' });

        sectionBResultA = await distribute(relayA.command, publication, 'nostr');
        sectionBResultB = await distribute(relayB.command, publication, 'nostr');

        assert(sectionBResultA.discovery !== null && sectionBResultB.discovery !== null, n('B1. both real distribution actions genuinely succeeded'));

        sectionBObservations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(sectionBObservations.length === 2, n('B2. publication P + nostr + relay A, and publication P + nostr + relay B, produce TWO observations — the exact requirement this milestone exists to satisfy'));
        const observationA = sectionBObservations.find((o) => o.origin === 'wss://relay-a.example');
        const observationB = sectionBObservations.find((o) => o.origin === 'wss://relay-b.example');
        assert(observationA && observationA.discoveryProvider === 'nostr' && observationA.id === sectionBResultA.discovery.id, n('B3. relay A\'s own observation is genuinely retrievable, correctly attributed'));
        assert(observationB && observationB.discoveryProvider === 'nostr' && observationB.id === sectionBResultB.discovery.id, n('B4. relay B\'s own observation is genuinely retrievable, correctly attributed, independent of A'));

        console.log('✓ Section B: two real Nostr relays for the identical publication now produce two independently retrievable observations');
    }

    // ===============================================================
    // Section C — Coexistence: A's and B's own real facts, already
    // established in Section B, survive together field for field (not
    // merely "length === 2" — every fact from Section B is re-verified
    // here, confirming this is genuine coexistence, not a lucky count).
    // ===============================================================
    {
        assert(sectionBObservations.length === 2, n('C1. both observations from Section B are still exactly two'));
        const observationA = sectionBObservations.find((o) => o.origin === 'wss://relay-a.example');
        const observationB = sectionBObservations.find((o) => o.origin === 'wss://relay-b.example');
        assert(observationA.state === PublicationDistributionState.PRESENT && observationB.state === PublicationDistributionState.PRESENT, n('C2. both retained facts independently report PRESENT'));
        assert(observationA.discoveryTag === 'relay-identity-boundary' && observationB.discoveryTag === 'relay-identity-boundary', n('C3. both retained facts carry their own real discoveryTag, unaltered by coexisting with the other'));
        assert(observationA.id !== observationB.id, n('C4. the two facts carry two genuinely different event ids — never the same underlying fact duplicated'));

        console.log('✓ Section C: A and B survive together, field for field — never merged, never one overwriting the other');
    }

    // ===============================================================
    // Section D — Same-relay replacement: re-observation from the SAME
    // relay replaces that relay's own observation, never accumulates a
    // second entry for it.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-d-same-relay-replace');
        const relayA = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-a.example' });

        const first = await distribute(relayA.command, publication, 'nostr');
        const second = await distribute(relayA.command, publication, 'nostr');

        assert(first.discovery.id !== second.discovery.id, n('D1. two real, distinct distribution attempts against the SAME relay genuinely produced two distinct underlying events'));
        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 1, n('D2. re-observation from the SAME relay replaces — exactly one observation exists, never two, after two calls to the identical relay'));
        assert(observations[0].id === second.discovery.id, n('D3. the surviving observation is the SECOND, latest call\'s own fact — the first is genuinely replaced, not merely shadowed'));

        console.log('✓ Section D: re-observation from the same relay replaces rather than accumulates');
    }

    // ===============================================================
    // Section E — Reverse order: B-then-A produces the identical final
    // observation SET as A-then-B (Section B's own forward order).
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-e-reverse-order');

        const relayB = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-b.example' });
        const relayA = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-a.example' });

        await distribute(relayB.command, publication, 'nostr');
        await distribute(relayA.command, publication, 'nostr');

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('E1. reverse order (B, then A) still retains both observations'));
        const origins = observations.map((o) => o.origin).sort();
        assert(JSON.stringify(origins) === JSON.stringify(['wss://relay-a.example', 'wss://relay-b.example']), n('E2. the resulting set of relay origins is order-independent — {relay A, relay B} either way, matching Section B\'s own forward-order result'));

        console.log('✓ Section E: order of relay contact never changes the final observation set');
    }

    // ===============================================================
    // Section F — Cross-provider isolation: Nostr relay observations
    // never interfere with an Arweave observation for the same
    // publication, and Arweave itself acquires no relay-level identity
    // from this change — it remains conceptually publicationId + arweave,
    // exactly as this milestone's own request required.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-f-cross-provider');
        const relayA = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-a.example' });
        const relayB = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-b.example' });
        const arweaveCommand = composeArweaveOnlyCommand({ lifecycleStore });

        await distribute(relayA.command, publication, 'nostr');
        await distribute(relayB.command, publication, 'nostr');
        const arweaveResult = await distribute(arweaveCommand, publication, 'arweave');
        assert(arweaveResult.discovery !== null, n('F1. the real Arweave announcement genuinely succeeded'));

        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 3, n('F2. two Nostr relay observations plus one Arweave observation — three total, none colliding with another'));
        assert(observations.filter((o) => o.discoveryProvider === 'nostr').length === 2, n('F3. exactly two Nostr observations survive, unaffected by the Arweave call that came after them'));
        const arweaveObservation = observations.find((o) => o.discoveryProvider === 'arweave');
        assert(arweaveObservation && arweaveObservation.origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('F4. the Arweave observation is correctly attributed, carrying its own real gateway origin'));

        // Arweave replacement: a second Arweave call still replaces its own
        // single slot — it never starts accumulating per-origin entries the
        // way Nostr now does, because this milestone's own command never
        // threads discoveryOrigin for any provider other than 'nostr'.
        const secondArweave = await distribute(arweaveCommand, publication, 'arweave');
        const afterSecondArweave = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(afterSecondArweave.filter((o) => o.discoveryProvider === 'arweave').length === 1, n('F5. a second Arweave call still replaces the single Arweave slot — Arweave never acquires relay/origin-level multiplicity from this milestone'));
        assert(afterSecondArweave.find((o) => o.discoveryProvider === 'arweave').id === secondArweave.discovery.id, n('F6. ...and holds the latest Arweave fact, exactly as 0.9.433 always behaved for Arweave'));
        assert(afterSecondArweave.filter((o) => o.discoveryProvider === 'nostr').length === 2, n('F7. both Nostr relay observations remain completely untouched by the Arweave replacement'));

        // Structural confirmation: the command only threads discoveryOrigin
        // for the 'nostr' branch.
        const commandCode = codeOnly(await source('application/PublicationDistributionCommand.js'));
        assert(/const discoveryOrigin = resolvedProvider === 'nostr' \? transitioned\.discovery\.origin : undefined;/.test(commandCode), n('F8. CONFIRMED FROM THE SOURCE: discoveryOrigin is derived only for the \'nostr\' provider — every other provider is recorded exactly as 0.9.433 left it'));

        console.log('✓ Section F: Nostr relay identity and Arweave provider identity are fully isolated from one another — Arweave remains conceptually publicationId + arweave');
    }

    // ===============================================================
    // Section G — Publication isolation: relay A's own observation for
    // publication P never affects publication Q, including on removal.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publicationP = makeFakePublication('pub-g-p');
        const publicationQ = makeFakePublication('pub-g-q');
        const relayA = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-a.example' });
        const relayB = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-b.example' });

        await distribute(relayA.command, publicationP, 'nostr');
        await distribute(relayA.command, publicationQ, 'nostr');
        await distribute(relayB.command, publicationP, 'nostr');

        assert(lifecycleStore.getDiscoveryObservations(publicationP.id).length === 2, n('G1. publication P holds both of its own relay observations'));
        assert(lifecycleStore.getDiscoveryObservations(publicationQ.id).length === 1, n('G2. publication Q holds only its own single relay observation, entirely independent of P'));

        lifecycleStore.remove(publicationP.id);
        assert(lifecycleStore.getDiscoveryObservations(publicationP.id).length === 0, n('G3. removing publication P clears both of its own relay observations'));
        assert(lifecycleStore.getDiscoveryObservations(publicationQ.id).length === 1, n('G4. ...while publication Q\'s own observation is completely unaffected by P\'s removal'));

        console.log('✓ Section G: publication-level isolation holds across distinct publications sharing the same relays, including on removal');
    }

    // ===============================================================
    // Section H — Cleanup: publication removal removes ALL of a
    // publication's own relay-specific observations; replacing one relay's
    // own observation leaves a different relay's own observation for the
    // SAME publication untouched.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-h-cleanup');
        const relayA = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-a.example' });
        const relayB = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-b.example' });
        const relayC = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-c.example' });

        await distribute(relayA.command, publication, 'nostr');
        await distribute(relayB.command, publication, 'nostr');
        await distribute(relayC.command, publication, 'nostr');
        assert(lifecycleStore.getDiscoveryObservations(publication.id).length === 3, n('H1. three configured relays produce three independent observations for one publication'));

        // Replacing relay B's own observation leaves relay A's and relay
        // C's own observations completely untouched.
        const beforeReplace = lifecycleStore.getDiscoveryObservations(publication.id);
        const relayAObservationBefore = beforeReplace.find((o) => o.origin === 'wss://relay-a.example');
        const relayCObservationBefore = beforeReplace.find((o) => o.origin === 'wss://relay-c.example');
        const relayBSecond = await distribute(relayB.command, publication, 'nostr');
        const afterReplace = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(afterReplace.length === 3, n('H2. replacing relay B\'s own observation still leaves exactly three observations, never four'));
        const relayAObservationAfter = afterReplace.find((o) => o.origin === 'wss://relay-a.example');
        const relayCObservationAfter = afterReplace.find((o) => o.origin === 'wss://relay-c.example');
        const relayBObservationAfter = afterReplace.find((o) => o.origin === 'wss://relay-b.example');
        assert(JSON.stringify(relayAObservationBefore) === JSON.stringify(relayAObservationAfter), n('H3. relay A\'s own observation is byte-identical before and after relay B\'s own replacement'));
        assert(JSON.stringify(relayCObservationBefore) === JSON.stringify(relayCObservationAfter), n('H4. relay C\'s own observation is likewise completely untouched'));
        assert(relayBObservationAfter.id === relayBSecond.discovery.id, n('H5. only relay B\'s own slot actually changed, to its own fresh fact'));

        // Publication removal clears every relay-specific observation at
        // once — never a partial cleanup that leaves one relay behind.
        lifecycleStore.remove(publication.id);
        assert(lifecycleStore.getDiscoveryObservations(publication.id).length === 0, n('H6. removing the publication clears ALL THREE of its own relay-specific observations in one call — never a partial cleanup'));
        assert(lifecycleStore.get(publication.id) === null, n('H7. ...and the primary lifecycle slot is equally cleared, exactly as 0.9.52 already established'));

        console.log('✓ Section H: cleanup removes every relay-specific observation together, and replacing one relay\'s own observation never disturbs another\'s');
    }

    // ===============================================================
    // Section I — Legacy/backward compatibility: an observation recorded
    // exactly as 0.9.433 always did (three arguments, no discoveryOrigin)
    // remains fully readable, and a minimal legacy store shape (get/set
    // only) keeps working through the real command, unmodified.
    // ===============================================================
    {
        // I1 — direct store call, three arguments only (0.9.433's own
        // exact call shape), still produces a single, fully-readable
        // observation with the identical return shape as before.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const legacyFact = Object.freeze({ state: PublicationDistributionState.PRESENT, origin: NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, discoveryTag: 'legacy', id: 'c'.repeat(64) });
        lifecycleStore.recordDiscoveryObservation('pub-i-legacy', 'nostr', legacyFact);
        const legacyObservations = lifecycleStore.getDiscoveryObservations('pub-i-legacy');
        assert(legacyObservations.length === 1, n('I1. a three-argument recordDiscoveryObservation() call (0.9.433\'s own exact shape) still produces exactly one observation'));
        assert(legacyObservations[0].discoveryProvider === 'nostr' && legacyObservations[0].origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('I2. the observation is fully readable, unchanged in shape from 0.9.433'));

        // I2 — a genuinely minimal { get, set } store (no
        // recordDiscoveryObservation/getDiscoveryObservations at all,
        // 0.9.103's own original contract) still runs the real,
        // Nostr-relay-aware command to completion without throwing.
        const entries = new Map();
        const minimalStore = {
            get: (id) => entries.get(id) || null,
            set: (id, lifecycle) => entries.set(id, lifecycle)
        };
        const relayA = composeNostrRelayCommand({ lifecycleStore: minimalStore, relayUrl: 'wss://relay-a.example' });
        const publication = makeFakePublication('pub-i-minimal-store');
        let threw = false;
        let result = null;
        try {
            result = await distribute(relayA.command, publication, 'nostr');
        } catch (error) {
            threw = true;
        }
        assert(!threw, n('I3. a minimal { get, set } store — predating recordDiscoveryObservation() entirely — still runs this milestone\'s own Nostr-relay-aware code path without throwing'));
        assert(result && result.discovery !== null, n('I4. and the real distribution itself genuinely succeeded'));

        console.log('✓ Section I: 0.9.433\'s own exact call shape, and a pre-0.9.433 minimal store, both keep working unmodified');
    }

    // ===============================================================
    // Section J — UI observation: the real WorldEncounterCanvas computed
    // renders every current Nostr relay observation without collapsing
    // them, and the real template's own :key no longer collides across two
    // Nostr observations that now legitimately share one discoveryProvider.
    // ===============================================================
    {
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-j-ui');
        const relayA = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-a.example' });
        const relayB = composeNostrRelayCommand({ lifecycleStore, relayUrl: 'wss://relay-b.example' });

        function ctx() {
            return {
                distributionLifecycleStore: lifecycleStore,
                selectedEncounter: { kind: 'PUBLICATION', objectId: publication.id },
                distributionLifecycle: lifecycleStore.get(publication.id)
            };
        }

        await distribute(relayA.command, publication, 'nostr');
        await distribute(relayB.command, publication, 'nostr');

        const observations = WorldEncounterCanvas.computed.discoveryObservations.call(ctx());
        assert(observations.length === 2, n('J1. the real, unmodified discoveryObservations computed reports BOTH Nostr relay observations — never collapsed to one'));
        assert(observations.every((o) => o.discoveryProvider === 'nostr') && new Set(observations.map((o) => o.origin)).size === 2, n('J2. both observations genuinely name distinct relay origins, confirming this is real multiplicity, not two copies of one fact'));

        // Confirmed live against the real template text: the :key this
        // milestone amended is no longer discoveryProvider alone (which
        // would collide for two Nostr observations), but includes origin.
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        assert(/:key="observation\.discoveryProvider \+ ':' \+ observation\.origin"/.test(canvasSource), n('J3. CONFIRMED FROM THE TEMPLATE: WorldEncounterCanvas.js\'s own v-for key is (discoveryProvider, origin), not discoveryProvider alone — two Nostr relay rows never share one Vue key'));
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/:key="observation\.discoveryProvider \+ ':' \+ observation\.origin"/.test(publicationsViewSource), n('J4. CONFIRMED FROM THE TEMPLATE: ui/views/DecentralizedPublicationsView.js\'s own v-for key is likewise (discoveryProvider, origin) — the same fix applied at both real UI call sites'));

        // No relay list UI was built — the real component's own props/data
        // carry no relay-list-shaped field, and the template contains no
        // new relay configuration control. This milestone only fixed
        // representation, never built selection.
        const canvasCode = codeOnly(canvasSource);
        assert(!/relayList|relayUrls|configuredRelays/.test(canvasCode), n('J5. no relay-list-shaped field of any kind was introduced into WorldEncounterCanvas.js — this milestone deliberately excludes the relay list UI'));

        console.log('✓ Section J: the real Publications Distribution UI already renders multiple Nostr relay observations correctly, once keyed by (discoveryProvider, origin) instead of discoveryProvider alone — no relay list UI was built');
    }

    // ===============================================================
    // Section K — Architectural guard: discoveryProvider is never
    // redefined, no fan-out/failover of any kind was introduced, and no
    // new lifecycle vocabulary appears anywhere this milestone touches.
    // ===============================================================
    {
        const runtimeCompositionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        assert(/unrecognized discoveryProvider/.test(runtimeCompositionSource), n('K1. PublicationDistributionRuntimeComposition.js still rejects any discoveryProvider outside "nostr"/"arweave" — this milestone never widened that selector to admit a relay-qualified value'));

        const storeCode = codeOnly(await source('application/PublicationDistributionLifecycleStore.js'));
        const commandCode = codeOnly(await source('application/PublicationDistributionCommand.js'));
        assert(!/Promise\.all|Promise\.allSettled|Promise\.race/.test(storeCode) && !/Promise\.all|Promise\.allSettled|Promise\.race/.test(commandCode), n('K2. neither the store nor the command contains any fan-out primitive (Promise.all/allSettled/race) — this milestone introduces no concurrent execution of any kind'));

        const forbiddenVocabulary = ['PARTIAL_SUCCESS', 'AGGREGATE', 'FAILOVER', 'FANOUT', 'FAN_OUT', 'RELAY_HEALTH', 'RELAY_RANK'];
        for (const term of forbiddenVocabulary) {
            assert(!storeCode.includes(term) && !commandCode.includes(term), n(`K3[${term}]. no new "${term}" vocabulary appears in either file's own code`));
        }

        // The store still has no idea any relay list, Settings UI, or
        // configuration concept exists.
        assert(!/relayList|RelayConfiguration|Settings/.test(storeCode), n('K4. PublicationDistributionLifecycleStore.js still has no idea a relay list, relay configuration, or Settings UI exists'));

        console.log('✓ Section K: discoveryProvider is unmodified, no fan-out mechanism exists anywhere, and no new lifecycle vocabulary was introduced');
    }

    console.log(`\nAll NostrRelayObservationIdentityBoundary tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
