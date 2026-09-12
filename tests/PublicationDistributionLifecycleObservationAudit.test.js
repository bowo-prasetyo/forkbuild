import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionState } from '../application/PublicationDistributionLifecycle.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/ArweaveAnnouncementPublisher.js';

// 0.9.432 — Multi-Substrate Distribution Lifecycle Observation Audit.
//
// Type: test-only audit. No production file is touched.
//
// 0.9.431 found a real, precisely-named, non-blocking gap and explicitly
// declined to fix it: "this application's own local record of 'which
// substrates has this publication been announced on'... is a single slot
// per publication, 'replacement, never merge'... It silently shows only the
// most recently used substrate once a second one has been used for the
// same publication... even though both announcements remain fully real and
// independently discoverable." That milestone's own verdict named the
// central question this audit now answers in full:
//
//   What is the smallest change required for the lifecycle/Distribution UI
//   to retain and expose independently successful announcements from
//   multiple substrates without changing distribution execution semantics?
//
// This is explicitly NOT a mandate to build 0.9.433 (the possible future
// production change) — it is the audit that would justify or refute it.
// Multi-select fan-out remains out of scope, exactly as 0.9.431 concluded.
//
// LETTERED SECTIONS (matching this milestone's own requesting brief):
//   A. Reconstruct the existing lifecycle contract — what a single-slot
//      record actually means today, from the store's own header, never
//      assumed.
//   B. Identify the actual collision key — prove the collision is
//      `publicationId` alone, and that the minimum additional identity
//      needed already exists in data already flowing through the system.
//   C. Test coexistence in both orders — a test-only prototype seam,
//      never touching production, proving two substrate observations CAN
//      coexist without changing store.set()/get()'s own existing contract.
//   D. Preserve single-provider behavior — exactly one observable record
//      for a publication distributed to only one substrate.
//   E. Separate current observation from history — the prototype seam
//      replaces per-provider, it never accumulates per-provider.
//   F. Preserve existing lifecycle semantics — no new PARTIAL/FAILED/
//      SUCCESS/MULTI_SUCCESS vocabulary anywhere in this file or the
//      prototype it defines.
//   G. UI observation — the smallest presentation change, traced from the
//      real Distribution panel's own current, single-slot template.
//   H. Backward compatibility — every real production consumer of
//      `store.get()`/`store.set()` expects exactly one lifecycle object;
//      confirmed by reading their own source, never assumed.
//   I. Cross-role isolation — the observation gap is proven specific to
//      Announcement/Discovery; Content placement and Proof/Anchor never
//      reference this store at all.
//   J. Final classification.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, EXACTLY AS THE REQUESTING
// BRIEF NAMED: fan-out, multi-select, automatic publication, fallback,
// retries, an append-only history system, aggregate success states,
// provider ranking, provider health, a generalized substrate abstraction,
// and any change to `application/PublicationDistributionLifecycleStore.js`,
// `application/PublicationDistributionLifecycle.js`,
// `application/PublicationDistributionLifecycleTransition.js`,
// `application/PublicationDistributionCommand.js`, or
// `ui/components/WorldEncounterCanvas.js` — every one of those files is
// only ever READ by this audit, never written.

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
// Joins wrapped `//`-comment prose into single lines so a literal phrase
// spanning a line wrap can still be matched with a plain regex — never
// used to change what a check considers "present," only to stop line-wrap
// position from being an accidental factor in whether a check passes.
function flattenComments(text) {
    return text.replace(/\n\/\/\s?/g, ' ');
}

// The same fake Arweave substrate technique 0.9.431's own
// MultiSubstrateAnnouncementDiscoveryProductReassessment.test.js already
// established — reused here unmodified so this audit exercises the exact
// same real production seam, never a divergent harness of its own.
function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
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
        const id = newId('Announce');
        ledger.set(id, { data: material, tag: { name: tag.name, value: tag.value } });
        return { id };
    }
    return { ledger, contentSigner, fetchImpl, uploadTaggedTransaction };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}

function makeRealComposedCommand() {
    const net = makeFakeArweaveSubstrate();
    const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const command = composePublicationDistributionCommand({
        lifecycleStore,
        arweaveUploaderOptions: { signer: net.contentSigner, fetchImpl: net.fetchImpl },
        nostrPublisherOptions: {
            discoveryTag: 'audit-nostr',
            publishImpl: async () => ({ published: true, id: nextFakeNostrEventId() })
        },
        arweaveAnnouncementPublisherOptions: {
            discoveryTag: 'audit-arweave',
            uploadTaggedTransaction: net.uploadTaggedTransaction
        }
    });
    return { command, lifecycleStore, net };
}

async function run() {
    // ===============================================================
    // Section A — reconstruct the existing lifecycle contract. What does
    // the current single-slot record actually mean? Read from the store's
    // own header, never assumed.
    // ===============================================================
    {
        const storeSource = await source('application/PublicationDistributionLifecycleStore.js');
        const storeProse = flattenComments(storeSource);

        assert(/the most recently remembered lifecycle description for this publication/i.test(storeProse), n('A1. the store\'s own header states its meaning explicitly: "the most recently remembered lifecycle description for this publication" — a LATEST-VALUE cache, never phrased as a complete historical set'));
        assert(/never a history, never an event stream/i.test(storeProse), n('A2. the header explicitly disclaims being a historical record: "never a history, never an event stream, never a cache with eviction or expiry"'));
        assert(/REPLACEMENT, NEVER MERGE/.test(storeSource), n('A3. the header\'s own section title confirms replacement semantics — a second set() for the same key discards the first, by design, not by omission'));
        assert(/holds a single current value per publication identity/i.test(storeProse), n('A4. the header is explicit about the axis of singularity: ONE current value PER PUBLICATION IDENTITY — never per publication-and-dimension, never per publication-and-substrate'));

        // Confirm structurally, not just from prose: the lifecycle a single
        // `set()` call stores is one `{ material, discovery }` object, where
        // `discovery` is itself one object (state/origin/discoveryTag/id) —
        // never a list. This is the same structural fact 0.9.431's own
        // Section F already established for `PublicationDistributionLifecycle.js`
        // and `...Transition.js`; this section confirms it holds for the
        // store's own stored VALUE too, not just the modules that produce it.
        const { lifecycleStore } = makeRealComposedCommand();
        const lifecycle = { material: { state: 'ABSENT' }, discovery: { state: 'ABSENT' } };
        lifecycleStore.set('pub-a-shape', lifecycle);
        const stored = lifecycleStore.get('pub-a-shape');
        assert(!Array.isArray(stored.discovery) && typeof stored.discovery === 'object', n('A5. the stored discovery section is one plain object, never an array — the collision this audit investigates is a data-shape fact, confirmed live, not merely a prose claim'));

        // The interpretation this audit settles on, from A1-A5 together:
        // the single slot represents "the most recent lifecycle fact this
        // application has observed for this publication, across BOTH
        // dimensions jointly" — never scoped to one distribution dimension,
        // and never intended to be a complete historical set. That joint,
        // whole-publication scope is exactly why a fact from one substrate
        // and a fact from a different substrate, both real, both about the
        // SAME dimension (discovery), collide: nothing in this contract
        // ever anticipated two independently-true facts for one dimension.
        console.log('✓ Section A: the store\'s own contract is a single most-recent lifecycle fact per publication identity, joint across material/discovery, explicitly never a history — confirmed from its own header and confirmed structurally live. It was never intended to represent a complete historical or multi-substrate set; the collision this audit investigates is therefore an intended consequence of an existing, explicit contract, never a bug in that contract\'s own implementation');
    }

    // ===============================================================
    // Section B — identify the actual collision key. Is the identity
    // effectively `publicationId` alone? What is the minimum additional
    // identity needed to distinguish two substrate observations?
    // ===============================================================
    {
        const storeSource = await source('application/PublicationDistributionLifecycleStore.js');
        assert(/KEYED BY `publication\.id` — NEVER BY A DISTRIBUTION-DIMENSION IDENTITY/.test(storeSource), n('B1. the store\'s own header settles the key space explicitly: publication identity ALONE — "not material uri, not discovery uri, not relay origin, not a discovery tag, not a Nostr event id"'));

        // Live proof the collision is exactly (and only) `publicationId`:
        // two DIFFERENT publications, each distributed to a DIFFERENT
        // substrate, never collide — confirming the key is doing exactly
        // what B1 says, no more, no less.
        {
            const { command, lifecycleStore } = makeRealComposedCommand();
            const pubX = makeFakePublication('pub-b-distinct-x');
            const pubY = makeFakePublication('pub-b-distinct-y');
            await command({ publication: pubX, serializedMaterial: JSON.stringify(pubX.toJSON()), discoveryProvider: 'nostr' });
            await command({ publication: pubY, serializedMaterial: JSON.stringify(pubY.toJSON()), discoveryProvider: 'arweave' });
            const lifecycleX = lifecycleStore.get(pubX.id);
            const lifecycleY = lifecycleStore.get(pubY.id);
            assert(lifecycleX.discovery.origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('B2. distinct publication identities never collide, regardless of substrate — pubX\'s own Nostr fact is intact'));
            assert(lifecycleY.discovery.origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('B3. ...and pubY\'s own Arweave fact is intact, independently — the collision is never triggered by substrate choice alone'));
        }

        // Live proof the collision IS triggered by the SAME publicationId
        // plus a DIFFERENT substrate, confirming B1's key space is both
        // necessary and sufficient to explain 0.9.431's own finding.
        {
            const { command, lifecycleStore } = makeRealComposedCommand();
            const publication = makeFakePublication('pub-b-collide');
            await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider: 'arweave' });
            await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider: 'nostr' });
            const lifecycle = lifecycleStore.get(publication.id);
            assert(lifecycle.discovery.origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL, n('B4. same publicationId, second substrate: the collision reproduces exactly as 0.9.431 found — the Arweave fact has no representation left'));

            // The precise structural reason: buildDiscoverySection() in
            // PublicationDistributionLifecycleTransition.js builds a
            // WHOLESALE replacement discovery section from the new fact
            // alone — it never reads or folds in anything from the
            // section it replaces. Confirmed from that file's own source,
            // never merely inferred from the collision's own symptom.
            const transitionSource = codeOnly(await source('application/PublicationDistributionLifecycleTransition.js'));
            const buildDiscoverySectionStart = transitionSource.indexOf('function buildDiscoverySection');
            const buildDiscoverySectionEnd = transitionSource.indexOf('\n}', buildDiscoverySectionStart) + 2;
            const buildDiscoverySectionBody = transitionSource.slice(buildDiscoverySectionStart, buildDiscoverySectionEnd);
            assert(!/current/.test(buildDiscoverySectionBody), n('B5. buildDiscoverySection() reads nothing from a prior/current section when building a PRESENT replacement — the collision is structurally total, never a partial merge that happens to lose one field'));
        }

        // What is the minimum additional identity needed? Not a NEW
        // generic identifier — the value that already, uniquely
        // distinguishes the two colliding facts is `discovery.origin`
        // itself, already present in every stored discovery section, and
        // it is already guaranteed distinct per substrate by each
        // publisher's own static default:
        assert(NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL !== ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('B6. discovery.origin ALONE already distinguishes the two substrates today — Nostr\'s own DEFAULT_RELAY_URL and Arweave\'s own DEFAULT_GATEWAY_URL are guaranteed-distinct constants, not merely distinct by coincidence in this audit\'s own fakes'));

        // But `origin` is a raw URL, never a stable enum a caller chose —
        // reconstructing "which substrate" from parsing a URL would be
        // exactly the kind of NEW, invented identifier this milestone's
        // own brief warns against. The value that ALREADY exists,
        // ALREADY flows through this exact call, and ALREADY names the
        // substrate as a caller's own explicit choice (not a derived
        // guess) is `discoveryProvider` itself — the very string
        // `executePublicationDistributionCommand()` already accepts and
        // forwards, unread, per 0.9.430's own amendment.
        const commandSource = await source('application/PublicationDistributionCommand.js');
        assert(/discoveryProvider/.test(commandSource), n('B7. `discoveryProvider` (\'nostr\'|\'arweave\') already exists as an explicit, caller-supplied argument at exactly the call site (`executePublicationDistributionCommand`) that already reads the fresh result and already calls `lifecycleStore.set()` — the minimum additional identity this audit is looking for was already flowing past the exact seam that needs it, before this milestone, unused for this purpose'));
        // AMENDED BY 0.9.433 — Concurrent Discovery Observation Preservation.
        // B8 originally confirmed this as a genuine, still-open gap:
        // `recordPublicationDistributionResult()` received the store and
        // the result, but not `discoveryProvider`. 0.9.433 closed exactly
        // that gap, threading `discoveryProvider` into that same function —
        // this assertion is inverted, never deleted, so this section keeps
        // testifying to the exact seam 0.9.433 changed, rather than going
        // silently stale against the source it once described.
        assert(/recordPublicationDistributionResult\([^)]*discoveryProvider/.test(codeOnly(commandSource)), n('B8. AMENDED BY 0.9.433 — the gap this section originally found is now closed: `recordPublicationDistributionResult()` receives `discoveryProvider` too, exactly the minimal additional threading this audit identified as missing'));

        console.log('✓ Section B: the collision key is confirmed to be `publicationId` alone (never a distribution-dimension identity), the collision itself traces to a structurally total replacement in `buildDiscoverySection()`, and the minimum additional identity needed is `discoveryProvider` — a value already explicit, already caller-supplied, and already flowing through the exact call site that would need it, requiring no new generic identifier of any kind');
    }

    // ===============================================================
    // Section C — test coexistence in both orders. A TEST-ONLY prototype
    // seam (defined in this file, never imported into application/ or
    // ui/) proving two substrate observations CAN coexist without
    // changing `PublicationDistributionLifecycleMemoryStore`'s own
    // existing get()/set()/subscribe() contract at all.
    // ===============================================================

    // The real, unmodified store is wrapped, never subclassed or
    // monkey-patched — `get()`/`set()`/`subscribe()` are called through
    // to the real store, verbatim, so every 0.9.52/0.9.53 guarantee this
    // codebase already tests stays intact. This class exists ONLY in this
    // test file — see Section J's own production-guard check, below.
    class ObservationSeamPrototype {
        constructor(store) {
            this._store = store;
            this._byProvider = new Map(); // publicationId -> Map(discoveryProvider -> discoverySection)
        }

        // Pass-through — unchanged existing surface. A caller upgrading to
        // this prototype loses nothing it already had.
        get(publicationId) { return this._store.get(publicationId); }
        set(publicationId, lifecycle) { return this._store.set(publicationId, lifecycle); }
        subscribe(publicationId, listener) { return this._store.subscribe(publicationId, listener); }

        // The ONE new fact this prototype records, additively, alongside
        // (never instead of) the existing set() call — see Section E for
        // why this replaces per-provider rather than ever accumulating.
        recordDiscoveryObservation(publicationId, discoveryProvider, discoverySection) {
            if (!this._byProvider.has(publicationId)) {
                this._byProvider.set(publicationId, new Map());
            }
            this._byProvider.get(publicationId).set(discoveryProvider, discoverySection);
        }

        // The ONE new accessor — additive, never a replacement for get().
        getDiscoveryObservations(publicationId) {
            const byProvider = this._byProvider.get(publicationId);
            if (!byProvider) return [];
            return Array.from(byProvider.entries()).map(([discoveryProvider, section]) => ({ discoveryProvider, ...section }));
        }
    }

    async function distributeBothOrdersWithSeam(providerOrder) {
        const { command, lifecycleStore, net } = makeRealComposedCommand();
        const seam = new ObservationSeamPrototype(lifecycleStore);
        const publication = makeFakePublication(`pub-c-${providerOrder.join('-then-')}`);
        const results = {};
        for (const discoveryProvider of providerOrder) {
            const result = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider });
            results[discoveryProvider] = result;
            // Exactly the ONE additional call `application/
            // PublicationDistributionCommand.js` would need to make,
            // alongside its own existing lifecycleStore.set() (Section B7/B8)
            // — never a replacement for that call.
            if (result && result.discovery) {
                seam.recordDiscoveryObservation(publication.id, discoveryProvider, {
                    state: PublicationDistributionState.PRESENT,
                    origin: result.discovery.relayUrl,
                    discoveryTag: result.discovery.discoveryTag,
                    id: result.discovery.id
                });
            }
        }
        return { publication, results, lifecycleStore, seam, net };
    }

    {
        const { publication, results, lifecycleStore, seam } = await distributeBothOrdersWithSeam(['nostr', 'arweave']);

        // The pre-existing store contract is UNCHANGED — still collapses,
        // exactly as 0.9.431 found and Section B reconfirmed. This
        // prototype does not fix that by mutating the existing seam; it
        // adds a new one beside it.
        const collapsed = lifecycleStore.get(publication.id);
        assert(collapsed.discovery.origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL, n('C1[nostr-then-arweave]. the existing store.get() contract is untouched by this prototype — it still names only the last substrate, exactly as before'));

        // The NEW seam retains BOTH, independently retrievable.
        const observations = seam.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('C2[nostr-then-arweave]. the seam\'s own accessor returns BOTH substrate observations for this publication, never collapsed to one'));
        const nostrObservation = observations.find((o) => o.discoveryProvider === 'nostr');
        const arweaveObservation = observations.find((o) => o.discoveryProvider === 'arweave');
        assert(nostrObservation.origin === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL && nostrObservation.id === results.nostr.discovery.id, n('C3[nostr-then-arweave]. the retained Nostr observation is genuinely the real, earlier Nostr fact — correctly attributed, not fabricated'));
        assert(arweaveObservation.origin === ArweaveAnnouncementPublisher.DEFAULT_GATEWAY_URL && arweaveObservation.id === results.arweave.discovery.id, n('C4[nostr-then-arweave]. the retained Arweave observation is genuinely the real, later Arweave fact — correctly attributed, not fabricated'));

        console.log('✓ Section C (nostr-then-arweave): both substrate observations remain independently retrievable through an ADDITIVE seam, while the pre-existing single-slot contract remains completely unchanged and unmodified');
    }

    {
        // Reverse order — proving the seam is symmetric, exactly like
        // 0.9.431's own Section C proved the collapse itself is symmetric.
        const { publication, results, seam } = await distributeBothOrdersWithSeam(['arweave', 'nostr']);
        const observations = seam.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('C5[arweave-then-nostr]. reversing the order still retains both observations'));
        const nostrObservation = observations.find((o) => o.discoveryProvider === 'nostr');
        const arweaveObservation = observations.find((o) => o.discoveryProvider === 'arweave');
        assert(nostrObservation.id === results.nostr.discovery.id && arweaveObservation.id === results.arweave.discovery.id, n('C6[arweave-then-nostr]. both facts are correctly attributed regardless of order — the invariant the requesting brief named holds: publishing on substrate B never erases the observable result of a prior successful announcement on substrate A'));

        console.log('✓ Section C (arweave-then-nostr): the invariant holds in both directions — a later substrate observation never erases an earlier one\'s own independent retrievability');
    }

    // ===============================================================
    // Section D — preserve single-provider behavior. Exactly one
    // observable record for a publication distributed to only one
    // substrate — the change must be invisible until a SECOND substrate
    // is actually used.
    // ===============================================================
    {
        for (const onlyProvider of ['nostr', 'arweave']) {
            const { command, lifecycleStore } = makeRealComposedCommand();
            const seam = new ObservationSeamPrototype(lifecycleStore);
            const publication = makeFakePublication(`pub-d-${onlyProvider}-only`);
            const result = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()), discoveryProvider: onlyProvider });
            seam.recordDiscoveryObservation(publication.id, onlyProvider, {
                state: PublicationDistributionState.PRESENT,
                origin: result.discovery.relayUrl,
                discoveryTag: result.discovery.discoveryTag,
                id: result.discovery.id
            });

            const observations = seam.getDiscoveryObservations(publication.id);
            assert(observations.length === 1, n(`D1[${onlyProvider}-only]. exactly one observable record when only one substrate was ever used — the seam introduces no visible change for the existing, unchanged single-provider case`));
            assert(observations[0].discoveryProvider === onlyProvider, n(`D2[${onlyProvider}-only]. ...and it correctly names the one substrate actually used`));
            assert(seam.get(publication.id).discovery.origin === result.discovery.relayUrl, n(`D3[${onlyProvider}-only]. the pre-existing get() accessor still agrees with the seam's own new accessor when only one substrate exists — no divergence for the common, single-provider case`));
        }

        // A publication never distributed at all: the seam reports zero
        // observations, never a fabricated placeholder.
        {
            const { lifecycleStore } = makeRealComposedCommand();
            const seam = new ObservationSeamPrototype(lifecycleStore);
            assert(seam.getDiscoveryObservations('pub-d-never-distributed').length === 0, n('D4. a publication with no distribution attempt at all reports zero observations, never a fabricated ABSENT entry for a substrate that was never tried'));
        }

        console.log('✓ Section D: single-provider behavior is fully preserved — the seam is invisible (one record, in agreement with the existing accessor) until a genuine second substrate observation exists for the same publication');
    }

    // ===============================================================
    // Section E — separate current observation from history. The seam
    // must replace per-provider, never accumulate per-provider — coexisting
    // CURRENT facts across substrates is the goal, not an append-only
    // history of every attempt on every substrate.
    // ===============================================================
    {
        const { lifecycleStore } = makeRealComposedCommand();
        const seam = new ObservationSeamPrototype(lifecycleStore);
        const publicationId = 'pub-e-retry';

        seam.recordDiscoveryObservation(publicationId, 'nostr', { state: PublicationDistributionState.PRESENT, origin: 'wss://relay-attempt-1.example', discoveryTag: 'tag', id: 'a'.repeat(64) });
        assert(seam.getDiscoveryObservations(publicationId).length === 1, n('E1. one recorded Nostr observation'));

        // A SECOND Nostr observation for the SAME publication — e.g. a
        // retry to a different relay — replaces the first, it never
        // appends a second Nostr entry alongside it.
        seam.recordDiscoveryObservation(publicationId, 'nostr', { state: PublicationDistributionState.PRESENT, origin: 'wss://relay-attempt-2.example', discoveryTag: 'tag', id: 'b'.repeat(64) });
        const afterRetry = seam.getDiscoveryObservations(publicationId);
        assert(afterRetry.length === 1, n('E2. a second observation for the SAME substrate REPLACES, never accumulates — this remains "current substrate-specific facts," never "attempt #1, attempt #2..." per substrate'));
        assert(afterRetry[0].origin === 'wss://relay-attempt-2.example', n('E3. ...and the retained fact is genuinely the newer one, exactly like the pre-existing store\'s own "replacement, never merge" rule, now applied at one finer key granularity (publicationId + provider) rather than a new rule of its own'));

        // Now add a genuinely DIFFERENT substrate — this one DOES coexist,
        // because it is a different key, never because this seam accumulates
        // history for any one key.
        seam.recordDiscoveryObservation(publicationId, 'arweave', { state: PublicationDistributionState.PRESENT, origin: 'https://arweave.example', discoveryTag: 'tag', id: 'ar-tx' });
        const afterSecondSubstrate = seam.getDiscoveryObservations(publicationId);
        assert(afterSecondSubstrate.length === 2, n('E4. a genuinely different substrate coexists as a second entry...'));
        assert(afterSecondSubstrate.find((o) => o.discoveryProvider === 'nostr').origin === 'wss://relay-attempt-2.example', n('E5. ...while the Nostr slot still shows only its own latest fact, never an accumulated list of the two Nostr attempts above'));

        console.log('✓ Section E: the seam keeps exactly "current fact per substrate," coexisting only ACROSS substrates — it never becomes an append-only per-substrate history, preserving the requesting brief\'s own distinction between the two');
    }

    // ===============================================================
    // Section F — preserve existing lifecycle semantics. No new
    // PARTIAL/FAILED/SUCCESS/MULTI_SUCCESS vocabulary anywhere this
    // milestone touches, including the prototype defined above.
    // ===============================================================
    {
        // The prototype's own source, as written in this very file, is
        // scanned the same way 0.9.53's own architectural-regression
        // section scans production code — proving this audit holds
        // itself to the identical restraint it is auditing for.
        const thisFileSource = codeOnly(await source('tests/PublicationDistributionLifecycleObservationAudit.test.js'));
        const prototypeStart = thisFileSource.indexOf('class ObservationSeamPrototype');
        const prototypeEnd = thisFileSource.indexOf('async function distributeBothOrdersWithSeam');
        const prototypeSource = thisFileSource.slice(prototypeStart, prototypeEnd);

        assert(prototypeSource.length > 0, n('F1. the prototype class source was actually located for scanning, not an empty slice from a stale search'));
        const forbiddenVocabulary = ['PARTIAL', 'MULTI_SUCCESS', 'FAILED', 'SUCCESS', 'PENDING', 'RETRYING', 'CONFIRMED', 'WITHDRAWN'];
        for (const term of forbiddenVocabulary) {
            assert(!prototypeSource.includes(term), n(`F2[${term}]. the prototype introduces no "${term}" vocabulary — it reuses PublicationDistributionState.PRESENT exactly as the existing lifecycle family already defines it, never inventing an aggregate status of its own`));
        }
        assert(!/status\s*[:=]/.test(prototypeSource), n('F3. no overall status/success/distributed field is computed anywhere in the prototype — each provider\'s own section retains exactly the semantics 0.9.50 already gave it (state/origin/discoveryTag/id), independently'));

        console.log('✓ Section F: the prototype seam introduces no new lifecycle vocabulary — every retained fact keeps precisely the PRESENT-state semantics 0.9.50 already established, per substrate, with no aggregate verdict layered on top');
    }

    // ===============================================================
    // Section G — UI observation. Trace the real Distribution panel and
    // establish the smallest presentation change necessary — never a new
    // dashboard or history screen.
    // ===============================================================
    {
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');
        const distributionPanelStart = canvasSource.indexOf('world-encounter-distribution-panel');
        // AMENDED BY 0.9.433 — Concurrent Discovery Observation Preservation.
        // G1/G2/G4 originally confirmed "today" (as of 0.9.432) there was
        // exactly one Discovery row and no `v-for` in this panel at all —
        // exactly the gap this section's own prose recommended closing.
        // 0.9.433 closed it, so this window is widened (the added
        // v-for/template markup no longer fits the original 1200-character
        // slice) and G1/G4 are inverted to confirm the recommended change
        // now genuinely exists in production, never merely re-asserting
        // the pre-0.9.433 absence against post-0.9.433 source.
        const distributionPanelTemplate = canvasSource.slice(distributionPanelStart, distributionPanelStart + 2000);

        assert(distributionPanelTemplate.includes('{{ distributionMaterialState }}'), n('G1a. the Material row is unchanged — still bound to the single computed `distributionMaterialState`, never touched by this milestone'));
        assert((distributionPanelTemplate.match(/<dt>Discovery/g) || []).length >= 2, n('G1. AMENDED BY 0.9.433 — the panel template now contains more than one literal "Discovery" row source: the fallback single row (unchanged text) plus the new per-provider `v-for` row, confirming the recommended change is genuinely present, not merely described'));
        assert(distributionPanelTemplate.includes('{{ distributionDiscoveryState }}'), n('G2. the pre-existing single-row fallback is still bound to the same computed `distributionDiscoveryState` (0.9.100, unmodified) — used whenever zero or one substrate observation exists, which Section D already proved is indistinguishable from today\'s behavior'));

        assert(canvasSource.includes('<h4 class="world-encounter-distribution-title">Distribution</h4>'), n('G3. the existing "Distribution" heading is confirmed as the one place this change lives — never a new heading or a separate panel, matching the requesting brief\'s own "not a new dashboard" instruction'));
        assert(/v-for="observation in discoveryObservations"/.test(distributionPanelTemplate), n('G4. AMENDED BY 0.9.433 — the Distribution panel now contains exactly the `v-for` this section recommended, scoped to the Discovery row alone, over the seam\'s own `discoveryObservations` computed — never a modification of any pre-existing loop, since none existed before this milestone'));

        console.log('✓ Section G (AMENDED BY 0.9.433): the recommended `v-for` over per-provider observations now genuinely exists in production, replacing the single Discovery `<dt>/<dd>` pair with one pair per observed substrate when more than one exists, entirely inside the existing "Distribution" heading — never a new panel, dashboard, or history screen');
    }

    // ===============================================================
    // Section H — backward compatibility. Every real production consumer
    // of `store.get()`/`store.set()` expects exactly one lifecycle
    // object — confirmed from their own source, never assumed.
    // ===============================================================
    {
        const commandSource = codeOnly(await source('application/PublicationDistributionCommand.js'));
        assert(/lifecycleStore\.get\([^)]*\)\s*\|\|\s*BASELINE_LIFECYCLE/.test(commandSource), n('H1. PublicationDistributionCommand.js reads lifecycleStore.get() and falls back to a single-object BASELINE_LIFECYCLE — it would break (or silently misbehave) if get() ever returned an array instead of an object, since it immediately reads `.material.state` off whatever get() returns'));
        assert(/\.material\.state\s*===\s*PublicationDistributionState\.PRESENT/.test(commandSource), n('H2. ...confirmed precisely: the very next line reads `.material.state` directly off the get() result, which requires a single object, never a collection'));

        const canvasSource = codeOnly(await source('ui/components/WorldEncounterCanvas.js'));
        assert(/this\.distributionLifecycleStore\.get\(publicationId\)/.test(canvasSource), n('H3. WorldEncounterCanvas.js also calls store.get(publicationId) directly'));
        assert(/return this\.distributionLifecycle \? this\.distributionLifecycle\.material\.state/.test(canvasSource), n('H4. ...and its own computed property reads `.material.state` off the stored value with a ternary null-check, never a `.map()`/`.find()`/array-index operation — an unambiguous single-object expectation'));

        const restorerSource = codeOnly(await source('application/PublicationDistributionLifecycleRestorer.js'));
        assert(/this\._store\.set\(publicationId, lifecycle\)/.test(restorerSource), n('H5. PublicationDistributionLifecycleRestorer.js calls store.set() with a single lifecycle value it loaded from persistence — it neither knows nor needs to know about a per-provider shape'));

        // Every real consumer this audit could find is enumerated
        // structurally, not merely by memory — confirming Section I's own
        // blast-radius claim from a different angle: this is a closed,
        // fully-audited set of callers, all compatible with an ADDITIVE
        // change (a new accessor alongside get()/set()), none compatible
        // with a BREAKING change (get()/set() themselves changing shape).
        const persistenceBridgeSource = codeOnly(await source('application/PublicationDistributionLifecyclePersistenceBridge.js'));
        assert(/store\.subscribe/.test(persistenceBridgeSource), n('H6. PublicationDistributionLifecyclePersistenceBridge.js only ever calls store.subscribe() (never get()/set() on the store itself) — it forwards whatever lifecycle value it is notified with, verbatim, to persistence.save(), so it is compatible with either shape as long as subscribe()\'s own (publicationId, lifecycle) signature is unchanged'));

        console.log('✓ Section H: every real production consumer of this store (PublicationDistributionCommand.js, WorldEncounterCanvas.js, PublicationDistributionLifecycleRestorer.js) reads get()/set() as returning/accepting exactly one lifecycle object, confirmed from each one\'s own source — the smallest compatibility-preserving seam is therefore an ADDITIVE accessor alongside the existing one (as Section C\'s own prototype already demonstrates), never a change to get()/set()\'s own existing return/parameter shape. This mirrors a real, already-existing precedent in this codebase: application/LocalPublicationSnapshotPlacementCatalog.js keeps its own single-item get(placementId) completely unchanged while separately offering findByPublicationId(publicationId), an additive list accessor beside it — the same shape this section\'s own evidence points to here');

        // Confirm that precedent is real, not asserted from memory.
        const placementCatalogSource = await source('application/LocalPublicationSnapshotPlacementCatalog.js');
        assert(/get\(placementId\)/.test(placementCatalogSource) && /findByPublicationId\(publicationId\)/.test(placementCatalogSource), n('H7. the cited precedent is confirmed live: LocalPublicationSnapshotPlacementCatalog.js genuinely exposes both a single-item get() and a separate, additive findByPublicationId() list accessor, side by side'));
    }

    // ===============================================================
    // Section I — cross-role isolation. Prove the observation distinction
    // this audit investigates applies ONLY to Announcement/Discovery
    // distribution — never to Content placement or Proof/Anchor, even
    // though Arweave now serves all three roles.
    // ===============================================================
    {
        const lifecycleStoreConsumers = [
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionLifecycleHydration.js',
            'application/PublicationDistributionLifecyclePersistence.js',
            'application/PublicationDistributionLifecyclePersistenceBridge.js',
            'application/PublicationDistributionLifecycleRestorer.js',
            'ui/components/WorldEncounterCanvas.js',
            'ui/main.js'
        ];
        for (const file of lifecycleStoreConsumers) {
            const code = await source(file);
            assert(/PublicationDistributionLifecycle(Memory)?Store/.test(code), n(`I1[${file}]. sanity: this file genuinely does reference the lifecycle store family — confirming the enumerated blast radius is accurate, not merely asserted`));
        }

        // Content placement (Arweave-as-Content) never references the
        // Announcement/Discovery lifecycle store at all.
        const placementFiles = [
            'core/PublicationSnapshotPlacement.js',
            'application/LocalPublicationSnapshotPlacementCatalog.js',
            'application/AddPublicationSnapshotPlacementUseCase.js'
        ];
        for (const file of placementFiles) {
            const code = await source(file).catch(() => '');
            if (!code) continue;
            assert(!/PublicationDistributionLifecycle/.test(code), n(`I2[${file}]. Content placement never imports or references any part of the Announcement/Discovery lifecycle family — the two dimensions share Arweave as a SUBSTRATE, never any code path or observation seam`));
        }

        // Proof/Anchor (Arweave-as-Proof) likewise never references it.
        const anchorFiles = [
            'application/CreateArweaveAnchorPublisherUseCase.js',
            'application/CreateArweaveAnchorProofVerifierUseCase.js',
            'application/CreateArweaveAnchorEvidenceViewUseCase.js'
        ];
        for (const file of anchorFiles) {
            const code = await source(file);
            assert(!/PublicationDistributionLifecycle/.test(code), n(`I3[${file}]. Proof/Anchor never references the Announcement/Discovery lifecycle family either — confirming this audit's own scope (and any future 0.9.433 built from it) can touch only the Announcement/Discovery seam without any risk of Content or Proof/Anchor entries appearing merely because they also use Arweave`));
        }

        // And the reverse direction: the lifecycle store family itself
        // never reaches into placement or anchor code.
        const lifecycleFamilyFiles = [
            'application/PublicationDistributionLifecycleStore.js',
            'application/PublicationDistributionLifecycle.js',
            'application/PublicationDistributionLifecycleTransition.js',
            'application/PublicationDistributionCommand.js'
        ];
        for (const file of lifecycleFamilyFiles) {
            const code = await source(file);
            assert(!/SnapshotPlacement|ArweaveAnchor/.test(code), n(`I4[${file}]. the lifecycle family never references placement or anchor concepts either — the isolation this section proves is genuinely bidirectional, never merely "placement doesn't reach in"`));
        }

        console.log('✓ Section I: cross-role isolation is confirmed bidirectionally and structurally — the Announcement/Discovery lifecycle store family and Content-placement/Proof-anchor code share zero imports, zero references, and zero code paths, despite all three roles using Arweave as a substrate. Any future fix built from this audit is therefore provably scoped to Announcement/Discovery alone');
    }

    // ===============================================================
    // Section J — final classification.
    // ===============================================================
    {
        const verdict = 'OBSERVATION_GAP_REQUIRES_MINIMAL_STORE_CHANGE';

        // Production guard: this audit is test-only, exactly as its own
        // header states. Every file it read is confirmed unmodified by
        // diffing against nothing being staged for it — the concrete,
        // checkable proxy for that guarantee is that every file this
        // audit names as "read" appears ONLY inside `source()` calls in
        // this very file, never inside a Write/Edit-style mutation this
        // file could never perform anyway (this file has no filesystem
        // write capability of its own — it only ever calls readFile()).
        const thisFileSource = await source('tests/PublicationDistributionLifecycleObservationAudit.test.js');
        const importLines = thisFileSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.every((line) => !/from 'node:fs/.test(line) || line.includes('{ readFile }')), n('J1a. the only filesystem import this audit file makes is `{ readFile } from \'node:fs/promises\'` — no write-capable import (writeFile, appendFile, fs, etc.) exists anywhere in its own import statements'));
        assert(importLines.every((line) => !line.includes("from '../ui/")), n('J1b. this audit file imports nothing from ui/ — it never constructs, mounts, or drives the real Vue component, only reads its source text as a string via `source()`'));
        // Checked as actual usage (a construct/class/function this file
        // defines or calls), never as a substring match against this
        // file's OWN prose — this file's own header necessarily NAMES
        // several of these terms, by design, to document that they are
        // excluded; a substring match would therefore trip on its own
        // documentation rather than on a genuine violation.
        const thisFileCodeOnly = codeOnly(thisFileSource);
        assert(!/class\s+\w*(FanOut|Registry)/.test(thisFileCodeOnly), n('J2. this audit defines no fan-out coordinator class and no provider-registry class of its own — `ObservationSeamPrototype` (Section C) is the only class this file defines, and it is neither'));
        assert(!/PublicationDistributionState\.(PARTIAL|FAILED|SUCCESS|MULTI_SUCCESS)/.test(thisFileCodeOnly), n('J3. no code in this file reads or constructs a PARTIAL/FAILED/SUCCESS/MULTI_SUCCESS value off PublicationDistributionState — every state comparison in this file uses only the two values that module already exports (ABSENT/PRESENT)'));

        console.log(`
✓ Section J — VERDICT: ${verdict}

Sections A/B establish the gap precisely: the store's own single-slot
contract (A) collides exactly at \`publicationId\` (B1-B5), and the minimum
additional identity needed — \`discoveryProvider\` — already exists as an
explicit, caller-supplied value at the exact call site that would need it
(B6-B8), requiring no new generic identifier.

Sections C/D/E prove a minimal, additive seam is buildable today without
touching \`PublicationDistributionLifecycleStore.js\`'s own existing
get()/set()/subscribe() contract: two substrate observations coexist,
independently and correctly attributed, in both orders (C); a single-
provider publication remains represented by exactly one record, identical
to today's behavior (D); and the seam replaces per-substrate without ever
becoming an append-only history (E).

Section F confirms no new lifecycle vocabulary is required — every
retained fact keeps exactly its existing PublicationDistributionState.PRESENT
semantics. Section G traces the smallest real UI change (one v-for over the
existing Discovery row, inside the existing Distribution heading — never a
new panel). Section H confirms every real consumer of this store expects a
single-object get()/set() and therefore constrains any real fix to an
ADDITIVE accessor, never a breaking change to the existing two — a shape
this codebase already has a working precedent for
(LocalPublicationSnapshotPlacementCatalog.js's own get()+findByPublicationId()
pair). Section I confirms the fix's own blast radius is provably confined to
Announcement/Discovery, never leaking into Content placement or Proof/Anchor
merely because all three share Arweave as a substrate.

Every piece of evidence needed to justify a narrowly-scoped 0.9.433 is now
in hand, and none of it required guessing an API in advance: the minimal
shape is (1) thread \`discoveryProvider\` into
\`recordPublicationDistributionResult()\` in
\`application/PublicationDistributionCommand.js\`, (2) record each PRESENT
discovery fact keyed by (publicationId, discoveryProvider) in a small,
additive structure inside \`PublicationDistributionLifecycleStore.js\` —
never replacing its existing per-publication get()/set()/subscribe()
surface — and (3) a template-only, v-for-scoped change to the existing
Distribution panel's own Discovery row in
\`ui/components/WorldEncounterCanvas.js\`. This was recommended as
0.9.433's own scope, not built here — this milestone itself stays
test-only, per its own header, and touches no production file. AMENDED
BY 0.9.433 (which DID build exactly this shape, in the three files named
above, plus \`tests/ConcurrentDiscoveryObservationPreservation.test.js\`):
Sections B8 and G, above, are updated in place to confirm the recommended
change now genuinely exists in production, rather than left to silently
disagree with the source they once described.
`);

        assert(verdict === 'OBSERVATION_GAP_REQUIRES_MINIMAL_STORE_CHANGE', n('J4. the verdict this file actually reports matches the verdict printed above'));
    }

    console.log(`\nAll PublicationDistributionLifecycleObservationAudit tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
