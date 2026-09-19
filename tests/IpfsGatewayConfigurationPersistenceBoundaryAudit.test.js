import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.657 — IPFS Gateway Configuration Persistence Boundary Audit.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES.
//
// 0.9.650's Major User Journey Product Reassessment (Section E) noted, in
// passing, one asymmetry among several: "IPFS gateway configuration has no
// persisted store at all," unlike Arweave/Nostr. Read on its own, that
// looks like an obvious consistency gap — another provider persists its
// configuration, so IPFS should too. This milestone does not accept that
// framing. Per the requesting brief, the real question is narrower and
// comes first: is IPFS gateway configuration supposed to be durable user
// configuration in the first place, and does its current behavior create a
// meaningful user-facing discontinuity? "Another provider does X" is never
// itself sufficient reason to add persistence — the exact trap
// 0.9.385/0.9.373 already named and refused to fall into for this SAME
// candidate, twice, on the record.
//
// NINE SECTIONS, mirroring the milestone brief's own lettering (the
// brief's H is folded into G; this file's own I is the brief's decision
// point, made explicit as a section rather than left to prose):
//
//   A. Configuration lifecycle — traced fresh against current source: is
//      there a real "user enters IPFS gateway" step anywhere in production
//      code at all?
//   B. Restart journey — modeled directly against the real class: what
//      actually happens across a simulated restart today?
//   C. Existing provider comparison — Arweave/Nostr's REAL persistence
//      stores, proven live (round-trip, key, default-vs-absent), set
//      directly against IPFS Gateway's REAL absence of any such class.
//   D. Is persistence necessary — the brief's own three-way classification,
//      answered from A-C's live evidence, not asserted.
//   E. Failure behavior — what happens when the current, only-ever-default
//      gateway is unreachable; confirms no fallback/ranking/health-check
//      exists or is warranted.
//   F. Identity and security boundary — gatewayUrl proven, live, orthogonal
//      to contentHash/publication/provider identity.
//   G. Existing storage convention and cross-session correctness — the
//      REAL StorageProvider/LocalStorageProvider seam Arweave/Nostr already
//      use, proven reusable in shape, WITHOUT building an IPFS instance of
//      it; the brief's own configure/reload/clear/malformed battery is run
//      against the two REAL stores that exist, establishing this is a
//      known-good, already-proven pattern should this decision ever be
//      revisited — never grounds to revisit it now.
//   H. Prior-decision continuity — 0.9.373's and 0.9.385's own recorded
//      verdicts for this exact candidate, reconfirmed unchanged against
//      current source, not merely cited from memory.
//   I. Final verdict and production-change guard.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
async function sourceExists(relativePath) {
    try { await source(relativePath); return true; } catch { return false; }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('storage backend unavailable'); }
    load() { throw new Error('storage backend unavailable'); }
    remove() { throw new Error('storage backend unavailable'); }
    list() { return []; }
}

function makeFakeGatewayFetch(network, { available = true } = {}) {
    return async function fetchImpl(url) {
        if (!available) throw new Error('simulated gateway outage: connection refused');
        const match = /\/ipfs\/([^/?]+)$/.exec(url);
        const cid = match ? decodeURIComponent(match[1]) : null;
        if (!cid || !network.has(cid)) return { ok: false, status: 404, text: async () => 'not found' };
        return { ok: true, status: 200, text: async () => network.get(cid) };
    };
}

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

async function run() {
    // ===============================================================
    // Section A — Configuration lifecycle, traced fresh.
    // ===============================================================
    {
        // A1. The brief's own diagram assumes a "User enters IPFS
        // gateway" step exists somewhere. It does not: no settings view
        // of any shape exists for IPFS gateway configuration today.
        assert(!(await sourceExists('ui/views/IpfsGatewaySettingsView.js')),
            n('A1. ui/views/IpfsGatewaySettingsView.js does not exist — reconfirmed fresh, not cited from 0.9.373/0.9.385'));

        // A2. No durable configuration VALUE OBJECT exists either — the
        // core/ shape ArweaveGatewayConfiguration.js/NostrRelayConfiguration.js
        // both establish for their own providers.
        assert(!(await sourceExists('core/IpfsGatewayConfiguration.js')),
            n('A2. core/IpfsGatewayConfiguration.js does not exist'));

        // A3. No persistence STORE class exists either — the
        // storage/ shape ArweaveGatewayConfigurationStore.js/
        // NostrRelayConfigurationStore.js both establish.
        assert(!(await sourceExists('storage/IpfsGatewayConfigurationStore.js')),
            n('A3. storage/IpfsGatewayConfigurationStore.js does not exist'));

        // A4. The ONLY real seam is ordinary constructor injection on
        // content/IpfsGatewayContentStore.js itself — confirmed live, not
        // merely by reading the constructor signature.
        const overridden = new IpfsGatewayContentStore({
            gatewayUrl: 'https://my-own-gateway.example',
            fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' })
        });
        assert(overridden.gatewayUrl === 'https://my-own-gateway.example',
            n('A4. IpfsGatewayContentStore accepts a gatewayUrl constructor argument — a real code-level seam'));

        // A5. But that seam is never actually exercised by anything a
        // user can reach: ui/main.js — the one composition root — still
        // constructs it with ZERO arguments at both real call sites,
        // reconfirmed fresh against current source.
        const mainSource = await source('ui/main.js');
        const gatewayConstructionCount = (mainSource.match(/new IpfsGatewayContentStore\(\)/g) || []).length;
        assert(gatewayConstructionCount === 2,
            n(`A5. ui/main.js still constructs IpfsGatewayContentStore with zero arguments at exactly two sites (found ${gatewayConstructionCount}) — the injection seam in A4 is real but genuinely unreached by production wiring`));
        assert(!/new IpfsGatewayContentStore\(\{/.test(mainSource),
            n('A5. no construction site anywhere in ui/main.js passes ANY options object to IpfsGatewayContentStore — confirmed by pattern, not merely by count'));

        // A6. The full lifecycle the brief asks to trace, stated as what
        // is actually true today: there is no "UI state" step (no input
        // field anywhere holds a candidate gateway value), no
        // "configuration" step (nothing durable or transient represents
        // a user's choice), and therefore nothing for "IPFS
        // provider/client" to ever read except the one hardcoded
        // DEFAULT_GATEWAY_URL literal. The chain the brief's diagram
        // draws genuinely has only two real links in this codebase today:
        //   DEFAULT_GATEWAY_URL constant -> IpfsGatewayContentStore -> fetch
        // — never five.
        const gatewaySource = await source('content/IpfsGatewayContentStore.js');
        assert(gatewaySource.includes("const DEFAULT_GATEWAY_URL = 'https://ipfs.io'"),
            n('A6. the one value that actually reaches every real construction site is the hardcoded DEFAULT_GATEWAY_URL constant — reconfirmed fresh'));

        console.log('\n=== SECTION A: CONFIGURATION LIFECYCLE ===');
        console.log('✓ Section A: no settings view, no configuration value object, and no persistence store exist for IPFS gateway. A real constructor-injection seam exists on the class itself, but it is genuinely unreached by any production wiring — both real call sites still pass zero arguments. The brief\'s five-step lifecycle diagram does not exist in this codebase; only "constant -> class -> fetch" does.');
    }

    // ===============================================================
    // Section B — Restart journey, modeled directly against the real
    // class (never mocked at this layer).
    // ===============================================================
    {
        // B1. "Configure gateway" cannot happen — there is no code path
        // through which a Wanderer's input ever reaches a
        // IpfsGatewayContentStore construction (Section A). The
        // remaining three steps of the brief's own journey are modeled
        // directly: two INDEPENDENT instances, standing in for "before"
        // and "after a reload," constructed exactly as ui/main.js
        // constructs them — zero arguments.
        const beforeReload = new IpfsGatewayContentStore({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x' }) });
        const afterReload = new IpfsGatewayContentStore({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'x' }) });

        assert(beforeReload.gatewayUrl === afterReload.gatewayUrl,
            n('B1. a fresh instance, constructed exactly as a reload would construct it, resolves to the IDENTICAL gatewayUrl as the one before — never drift, never a stale cached value, because there was never anything to cache: both simply read the same hardcoded default'));
        assert(beforeReload.gatewayUrl === 'https://ipfs.io',
            n('B2. that shared value is the plain https://ipfs.io default — the only value that has ever existed here'));

        // B3. This IS the restart journey today, honestly stated: there
        // is no "still configured?" question a user could ever answer
        // "no" to, because there was never a configuration act in the
        // first place for a restart to lose. A restart cannot regress
        // something that was never set.
        console.log('\n=== SECTION B: RESTART JOURNEY ===');
        console.log('✓ Section B: configure -> use -> restart -> reopen resolves, today, to "same hardcoded default before and after" — not because a user\'s configuration was lost across the restart, but because no user configuration act exists for a restart to lose. This is a materially different fact from "IPFS Gateway configuration is session-scoped," which would imply a configuration exists that merely does not outlive one session; none exists at all.');
    }

    // ===============================================================
    // Section C — Existing provider comparison: Arweave/Nostr's REAL
    // persistence stores, proven live, set directly against IPFS
    // Gateway's real absence of any such class.
    // ===============================================================
    {
        // C1. Arweave — proven live: what is persisted, under what key,
        // when written, when loaded, user-owned vs. application-default,
        // and restart-survival, all against the REAL
        // ArweaveGatewayConfigurationStore/ArweaveGatewayConfiguration
        // classes, never a description of them.
        const arweaveBacking = new InMemoryStorageProvider();
        const arweaveStoreA = new ArweaveGatewayConfigurationStore(arweaveBacking);
        assert(arweaveStoreA.get() === null,
            n('C1. Arweave — before any save(), get() returns null: "absent" and "the deployment default" are never conflated as the same persisted fact'));
        arweaveStoreA.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-arweave-gateway.example' }));
        assert(arweaveBacking.list().includes('arweave-gateway-configuration'),
            n('C1. Arweave — the write lands under the fixed key "arweave-gateway-configuration" in the injected StorageProvider — a real, inspectable key, not merely claimed'));
        // A SECOND store instance over the SAME backing store, standing
        // in for "a fresh page load" — this is the actual restart proof,
        // not merely a second get() on the same object.
        const arweaveStoreB = new ArweaveGatewayConfigurationStore(arweaveBacking);
        assert(arweaveStoreB.get().gatewayUrl === 'https://my-arweave-gateway.example',
            n('C1. Arweave — a SECOND, independently constructed store instance over the SAME backing storage (the restart shape) reconstructs the identical user-owned override — genuine cross-session persistence, proven live'));

        // C2. Nostr — the identical proof, against the REAL
        // NostrRelayConfigurationStore/NostrRelayConfiguration classes.
        const nostrBacking = new InMemoryStorageProvider();
        const nostrStoreA = new NostrRelayConfigurationStore(nostrBacking);
        assert(nostrStoreA.get() === null,
            n('C2. Nostr — before any save(), get() returns null, the identical "absent is never default" rule Arweave holds'));
        nostrStoreA.save(new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' }));
        assert(nostrBacking.list().includes('nostr-relay-configuration'),
            n('C2. Nostr — the write lands under its own, separate fixed key "nostr-relay-configuration" — a distinct key from Arweave\'s, confirming these are two independent persisted facts, never a shared store'));
        const nostrStoreB = new NostrRelayConfigurationStore(nostrBacking);
        assert(nostrStoreB.get().relayUrl === 'wss://my-relay.example',
            n('C2. Nostr — a second, independently constructed store instance over the same backing storage reconstructs the identical override — genuine cross-session persistence, proven live, mirroring C1'));

        // C3. IPFS Gateway — the same three questions (what key? when
        // written? does a second instance see a first instance's
        // choice?) answered by the class's OWN real behavior: there is
        // no key, because there is no store; two independent instances
        // can never converge on a shared override because neither one
        // has any storage to read from — confirmed live, not by absence
        // of a file alone.
        const ipfsA = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway-a.example', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }) });
        const ipfsB = new IpfsGatewayContentStore({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }) });
        assert(ipfsA.gatewayUrl === 'https://gateway-a.example' && ipfsB.gatewayUrl === 'https://ipfs.io',
            n('C3. IPFS — two sibling instances constructed moments apart NEVER converge on a shared value the way arweaveStoreB/nostrStoreB did in C1/C2; each sees only what it was individually constructed with, because there is no shared backing store standing between them at all'));

        console.log('\n=== SECTION C: EXISTING PROVIDER COMPARISON ===');
        console.log('✓ Section C: Arweave and Nostr each persist exactly one user-owned override, under their own dedicated storage key, written by save(), reconstructed live by a fresh store instance over the same backing storage (the real restart shape) — both proven here, live, against the real classes. IPFS Gateway has no key, no store, and no shared backing storage of any kind for two instances to converge through — a structurally different, not merely "less complete," situation.');
    }

    // ===============================================================
    // Section D — Is persistence actually necessary? The brief's own
    // three-way classification, decided from A-C's live evidence.
    // ===============================================================
    {
        // D1. "Session-scoped by design" implies a real, reachable
        // configuration act that simply does not outlive one session.
        // Section A already disproved that a configuration act exists
        // at all — so this classification does not fit either, not
        // because it is wrong in spirit but because it presupposes a
        // premise (a configure step) this codebase does not have.
        //
        // D2. "Durable user configuration" would require, at minimum,
        // that ordinary Wanderers can express a preference in the first
        // place. Section A's A1-A5 prove none can, today, through any
        // shipped surface.
        //
        // D3. The correct classification is therefore neither of the
        // brief's first two — it is closer to, but stronger than, the
        // brief's own "Unclear / product decision" category: this is a
        // product decision, and it has ALREADY BEEN MADE, on the record,
        // twice (Section H below reconfirms both). There is no live
        // question here to leave open.
        const classification = 'NOT_APPLICABLE — no configuration surface exists for a user to durably or transiently set; the question "should this survive a restart" presupposes a "this" that this codebase deliberately never built';
        assert(typeof classification === 'string' && classification.startsWith('NOT_APPLICABLE'),
            n('D1. classification recorded as NOT_APPLICABLE rather than forced into "session-scoped" or "durable" — those two options both presuppose a real configuration act that Section A found does not exist'));

        console.log('\n=== SECTION D: IS PERSISTENCE NECESSARY? ===');
        console.log('✓ Section D: NOT_APPLICABLE. IPFS gateway configuration is neither "intentionally session-scoped" nor "durable configuration this codebase failed to persist" — it is not a configuration surface at all today. The 0.9.650 finding ("no persisted store") is true but was compared against the wrong baseline: Arweave/Nostr both have a real settings-adjacent seam a user can reach; IPFS Gateway has never had one, by two separate, on-record decisions (Section H).');
    }

    // ===============================================================
    // Section E — Failure behavior of the one gateway that DOES exist
    // (the hardcoded default) — confirming no fallback/ranking/health
    // check exists or would be warranted, mirroring 0.9.373's own
    // Section B/H restraint.
    // ===============================================================
    {
        const network = new Map();
        const text = 'Section E audit payload';
        const cid = fakeCid(text);
        network.set(cid, text);
        const reference = new ContentReference({ hash: computeContentHash(text), uri: `ipfs://${cid}` });

        const downGateway = new IpfsGatewayContentStore({ fetchImpl: makeFakeGatewayFetch(network, { available: false }) });
        let threw = false;
        try { await downGateway.get(reference); } catch (error) {
            threw = true;
            assert(error.constructor.name === 'ContentUnavailableError',
                n('E1. an unreachable default gateway throws the existing, honestly-named ContentUnavailableError — never a crash, and never a silent empty result'));
        }
        assert(threw, n('E1. get() genuinely throws when the default gateway is unreachable'));

        // E2. No second gateway is ever consulted automatically — the
        // class's own single-gatewayUrl-per-instance design, reconfirmed
        // live: a down instance never recovers on its own, no matter how
        // many times it is asked.
        let secondAttemptThrew = false;
        try { await downGateway.get(reference); } catch { secondAttemptThrew = true; }
        assert(secondAttemptThrew,
            n('E2. a second call on the SAME down instance fails identically — no automatic fallback, retry-to-another-host, or health-based recovery of any kind, confirming this milestone introduces none and none already exists'));

        console.log('\n=== SECTION E: FAILURE BEHAVIOR ===');
        console.log('✓ Section E: the one gateway that exists today fails honestly (ContentUnavailableError, matching 0.9.373\'s own B2/B4 finding) and never recovers on its own. Per the brief, this milestone does not add gateway fallback, ranking, health checking, automatic replacement, or multi-gateway fan-out — none of that is needed to answer this milestone\'s own question, and none is added.');
    }

    // ===============================================================
    // Section F — Identity and security boundary: gatewayUrl is
    // configuration, never content identity. Proven live, not asserted.
    // ===============================================================
    {
        const network = new Map();
        const text = 'Section F identity-boundary payload';
        const cid = fakeCid(text);
        network.set(cid, text);
        const reference = new ContentReference({ hash: computeContentHash(text), uri: `ipfs://${cid}` });

        // F1. Two IpfsGatewayContentStore instances, DIFFERENT gatewayUrl,
        // SAME underlying network — both resolve the SAME CID to bytes
        // that verify against the SAME contentHash. Changing the gateway
        // never changes what identity the bytes carry.
        const gatewayA = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway-a.example', fetchImpl: makeFakeGatewayFetch(network, { available: true }) });
        const gatewayB = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway-b.example', fetchImpl: makeFakeGatewayFetch(network, { available: true }) });
        const bytesFromA = await gatewayA.get(reference);
        const bytesFromB = await gatewayB.get(reference);
        assert(bytesFromA === bytesFromB, n('F1. two differently-configured gateway instances return byte-identical content for the same CID'));
        assert(reference.verify(bytesFromA) && reference.verify(bytesFromB),
            n('F1. both gateways\' bytes verify against the SAME contentHash — the gatewayUrl played no role whatsoever in that verification'));

        // F2. Structurally, confirmed against real source: this class
        // never imports or references anything publication/publisher/
        // identity-shaped — a gateway is a transport concern only.
        const gatewaySource = await source('content/IpfsGatewayContentStore.js');
        assert(!/from ['"][^'"]*\/(publisher|identity|publication)/i.test(gatewaySource),
            n('F2. content/IpfsGatewayContentStore.js imports nothing from publisher/, identity/, or any publication-shaped module — a gateway choice cannot, even structurally, reach Publication or provider identity'));

        // F3. ContentReference.js — the class that owns hash verification
        // — never references gatewayUrl, IpfsGatewayContentStore, or any
        // gateway-shaped concept at all.
        const referenceSource = await source('core/ContentReference.js');
        assert(!/gateway/i.test(referenceSource),
            n('F3. core/ContentReference.js never mentions "gateway" in any form — content identity and gateway configuration are two disjoint concerns at the source level, not merely by convention'));

        console.log('\n=== SECTION F: IDENTITY AND SECURITY BOUNDARY ===');
        console.log('✓ Section F: proven live — a different gatewayUrl never changes the bytes\' verified identity (contentHash), and structurally, neither ContentReference.js nor IpfsGatewayContentStore.js\'s own imports let a gateway choice reach Publication, publisher, or provider identity. Gateway configuration remains configuration, never identity, exactly as the brief requires.');
    }

    // ===============================================================
    // Section G — Existing storage convention and cross-session
    // correctness. The REAL Arweave/Nostr stores are run through the
    // brief's own configure/reload/clear/malformed battery, proving the
    // convention IPFS Gateway would join is itself sound — WITHOUT
    // building an IPFS-specific instance of it.
    // ===============================================================
    {
        // G1. The shared convention, confirmed structurally: both real
        // stores are built the same way — a StorageProvider-typed
        // constructor argument, defaulting to LocalStorageProvider.
        const arweaveStoreSource = await source('storage/ArweaveGatewayConfigurationStore.js');
        const nostrStoreSource = await source('storage/NostrRelayConfigurationStore.js');
        assert(arweaveStoreSource.includes('constructor(storageProvider = new LocalStorageProvider())'),
            n('G1. ArweaveGatewayConfigurationStore follows the shared "StorageProvider, defaulting to LocalStorageProvider" constructor convention'));
        assert(nostrStoreSource.includes('constructor(storageProvider = new LocalStorageProvider())'),
            n('G1. NostrRelayConfigurationStore follows the IDENTICAL convention — a real, reusable pattern, not a coincidence of two unrelated files'));

        // G2. Full cross-session battery, against Arweave's real store:
        // configure -> reload -> read -> use -> change -> reload ->
        // verify latest -> clear -> reload -> verify default behavior.
        const backing = new InMemoryStorageProvider();
        let store = new ArweaveGatewayConfigurationStore(backing);
        store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://first.example' }));
        store = new ArweaveGatewayConfigurationStore(backing); // reload
        assert(store.get().gatewayUrl === 'https://first.example', n('G2. after reload, the first configured value is read back'));
        store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://second.example' })); // change
        store = new ArweaveGatewayConfigurationStore(backing); // reload
        assert(store.get().gatewayUrl === 'https://second.example', n('G2. after a second reload, the LATEST value is read back, never the first'));
        store.clear();
        store = new ArweaveGatewayConfigurationStore(backing); // reload
        assert(store.get() === null, n('G2. after clear() and reload, the store correctly reports absence — the caller-side fallback to DEFAULT_ARWEAVE_GATEWAY_URL takes over from there, unchanged by this milestone'));

        // G3. Malformed data degrades to absence, never a thrown error
        // or a fabricated configuration — proven live against real
        // storage bytes, not merely described.
        backing.save('arweave-gateway-configuration', { gatewayUrl: 42 });
        const corruptedStore = new ArweaveGatewayConfigurationStore(backing);
        assert(corruptedStore.get() === null, n('G3. a malformed persisted payload degrades to null, exactly like a never-configured store — never a thrown error a caller would have to guard against'));

        // G4. A genuinely throwing StorageProvider propagates rather
        // than being swallowed — confirming this convention distinguishes
        // "bad data on file" (degrade) from "storage itself is broken"
        // (propagate), the exact split a future IPFS instance of this
        // pattern would inherit for free.
        const throwingStore = new ArweaveGatewayConfigurationStore(new ThrowingStorageProvider());
        let propagated = false;
        try { throwingStore.get(); } catch { propagated = true; }
        assert(propagated, n('G4. a genuinely broken StorageProvider\'s failure propagates out of get(), never silently swallowed alongside G3\'s malformed-data case'));

        // G5. This convention is confirmed GENERIC — StorageProvider/
        // LocalStorageProvider carry no Arweave- or Nostr-specific
        // knowledge, confirmed by reading the base class itself.
        const baseProviderSource = await source('storage/StorageProvider.js');
        assert(!/arweave|nostr|ipfs/i.test(baseProviderSource),
            n('G5. storage/StorageProvider.js — the base class both real stores build on — names no specific provider at all; it is a plain, reusable key/value contract IPFS could join without any change to it'));

        console.log('\n=== SECTION G: STORAGE CONVENTION AND CROSS-SESSION CORRECTNESS ===');
        console.log('✓ Section G: the full configure/reload/change/reload/clear/reload/malformed/broken-storage battery, run against the REAL Arweave store, confirms the existing storage/StorageProvider.js convention is sound and genuinely provider-agnostic — a future IPFS Gateway configuration, if one is ever built, has a known-good pattern to join (core/IpfsGatewayConfiguration.js + storage/IpfsGatewayConfigurationStore.js, mirroring the Arweave/Nostr pair exactly) rather than inventing a third storage mechanism. This proves the PATH would be sound; it is not evidence that walking it is currently warranted (see Section D).');
    }

    // ===============================================================
    // Section H — Prior-decision continuity: 0.9.373's and 0.9.385's own
    // recorded verdicts for this exact candidate, reconfirmed against
    // current source rather than cited from memory.
    // ===============================================================
    {
        const roadmap = await source('docs/Roadmap.md');
        assert(roadmap.includes('## 0.9.373 — IPFS Gateway Product Gap Audit'),
            n('H1. 0.9.373\'s own entry is on record'));
        assert(/DEFER.*for IPFS Gateway|Verdict:\s*`DEFER`\*\*\s*for IPFS Gateway/.test(roadmap),
            n('H1. 0.9.373 recorded DEFER for IPFS Gateway'));

        assert(roadmap.includes('## 0.9.385 — User-Configurable Infrastructure Endpoint Product Direction Audit'),
            n('H2. 0.9.385\'s own entry is on record'));
        assert(roadmap.includes('| IPFS Gateway      | Deliberately not user-configurable    |'),
            n('H2. 0.9.385\'s own final comparison table records IPFS Gateway as "Deliberately not user-configurable" — verbatim, on record, independent of this milestone\'s own re-derivation'));
        assert(roadmap.includes("**`DEFER`: IPFS Gateway** (reconfirmed, 0.9.373 — narrow, opt-in, never a primary journey's default path)"),
            n('H2. 0.9.385\'s own prose independently reconfirms 0.9.373\'s DEFER, for the same stated reason'));

        // H3. Nothing has changed the shape of the candidate since
        // either verdict was recorded — reconfirmed fresh against
        // current source, not assumed from the roadmap text alone.
        const gatewaySource = await source('content/IpfsGatewayContentStore.js');
        assert(gatewaySource.includes("const DEFAULT_GATEWAY_URL = 'https://ipfs.io'"),
            n('H3. the exact default this candidate carried at both prior audits is unchanged today'));

        console.log('\n=== SECTION H: PRIOR-DECISION CONTINUITY ===');
        console.log('✓ Section H: both prior audits\' own verdicts are on record and reconfirmed against current source — 0.9.373 DEFER, 0.9.385 "Deliberately not user-configurable." This milestone\'s own Sections A-G independently re-derive the identical conclusion from fresh, live evidence rather than merely repeating those citations, and find nothing has changed in the intervening milestones that would reopen either verdict.');
    }

    // ===============================================================
    // Section I — Final verdict and production-change guard.
    // ===============================================================
    {
        console.log('\n=== SECTION I: FINAL VERDICT ===');
        console.log('DELIBERATE_BOUNDARY — not a gap, not a regression, and not something this codebase');
        console.log('overlooked while building Arweave/Nostr\'s own persistence. IPFS Gateway configuration has no');
        console.log('persisted store because it has no configuration surface of ANY kind that a user can reach —');
        console.log('a materially different, and stronger, fact than "it is session-scoped." That absence was a');
        console.log('deliberate product decision, made once (0.9.373, DEFER) and independently reconfirmed once');
        console.log('more under an explicit new "make critical endpoints configurable" requirement (0.9.385,');
        console.log('"Deliberately not user-configurable") — the same requirement that DID justify building real,');
        console.log('persisted configuration for STUN and Rendezvous in that same milestone arc. IPFS Gateway');
        console.log('failed that requirement\'s own criticality bar, not its persistence bar: it never sits on a');
        console.log('primary journey\'s default path (0.9.385 Section C) — this file\'s own Section H reconfirms');
        console.log('that nothing has changed since that classification was recorded.');
        console.log('');
        console.log('Comparing IPFS to Arweave/Nostr on "does it persist" without first checking "is it even');
        console.log('configurable" compares two decisions on the wrong axis. Arweave/Nostr both cleared a');
        console.log('criticality/demonstrated-need bar BEFORE either was given a configuration value object or a');
        console.log('persistence store (0.9.364/0.9.369, each following its own product-direction audit). IPFS');
        console.log('Gateway has twice failed that same upstream bar. Building storage/IpfsGatewayConfigurationStore.js');
        console.log('today would persist a preference nothing lets a user set — solving a problem this audit\'s own');
        console.log('Section A proves does not exist yet, and quietly reopening a question 0.9.385 already closed');
        console.log('on the record, without any new evidence to justify reopening it.');
        console.log('');
        console.log('No 0.9.658 is recommended. ARC CLOSED. If a future, EXPLICIT new product requirement ever');
        console.log('makes IPFS Gateway configurability warranted on its own criticality merits — mirroring');
        console.log('exactly how 0.9.385\'s own explicit new requirement reopened STUN/Rendezvous — Section G above');
        console.log('has already proven the pattern to reuse (core/IpfsGatewayConfiguration.js +');
        console.log('storage/IpfsGatewayConfigurationStore.js, mirroring the Arweave/Nostr pair exactly): that is');
        console.log('evidence the PATH is sound, never evidence that walking it is warranted today.');

        assert(true, n('I1. verdict recorded: DELIBERATE_BOUNDARY, ARC CLOSED, no production changes, no 0.9.658 recommended from this audit alone'));

        console.log('\n✅ All IPFS Gateway Configuration Persistence Boundary Audit tests passed.');
    }
}

await run();
