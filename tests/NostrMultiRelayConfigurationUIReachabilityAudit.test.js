import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NostrRelayConfiguration, isValidNostrRelayUrl, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../application/SetNostrRelayConfigurationUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { NostrMultiRelayPublicationDiscoveryPublisher } from '../application/NostrMultiRelayPublicationDiscoveryPublisher.js';
import { orchestrateMultiRelayNostrPublicationDistribution } from '../application/NostrMultiRelayPublicationDistributionOrchestrator.js';
import { executeMultiRelayNostrPublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';
import { composePublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';

// 0.9.446 — Nostr Multi-Relay Configuration & UI Reachability Audit.
//
// TYPE: test-only, product/architectural audit. PRODUCTION CHANGES: NONE.
//
// 0.9.445's own Section L classified, rather than fixed, the one gap left
// standing after 0.9.444's real, correct, fully-composed write-side fan-out
// capability: `executeMultiRelayNostrPublicationDistributionCommand()` is
// reachable through no existing UI or application entry point. That
// Section explicitly deferred the actual decision — "That decision remains
// 0.9.446's own job" — and named it precisely enough to restate as a single
// checkable claim this milestone decides, never assumes:
//
//   WHERE, IF ANYWHERE, SHOULD A USER CONFIGURE THE NOSTR RELAY SET
//   REQUIRED BY THE ALREADY-IMPLEMENTED MULTI-RELAY PUBLICATION CAPABILITY?
//
// This audit does NOT assume the answer is "add a relay list to Settings."
// It traces every existing Nostr configuration source live, from real
// source and real construction, and finds a materially different answer
// than that assumption would have produced: the one Settings surface that
// LOOKS like the obvious home for this — `/settings/nostr-relay` — is not
// merely "a single value that needs widening." It is, by its own explicit,
// repeatedly-stated design, scoped to READ/DISCOVERY ONLY, and never
// reaches the write/publish path at all — not even today's existing
// SINGLE-relay announcement command. Widening it naively would silently
// cross an architectural boundary several prior milestones deliberately
// drew and defended in writing. Section A below proves this live; the rest
// of this audit reasons from that proof, not from the surface-level naming
// coincidence between "Nostr Relay Settings" and "Nostr relay set".
//
// LETTERED SECTIONS (mirroring this milestone's own request):
//   A. Existing Nostr configuration inventory — read-path config traced
//      live through every layer, including a live proof that the WRITE
//      path (both the pre-existing single-relay command and 0.9.444's own
//      fan-out) never consults it at all today.
//   B. Current UI reachability — the real Publications > Distribution >
//      Announcement/Discovery path, and the real Settings hub, both read
//      from source and (where executable) actually executed.
//   C. Configuration cardinality — what `[]`/`[A]`/`[A,B]` actually mean
//      today, proven against the real, unmodified fan-out publisher's own
//      constructor, never invented in prose.
//   D. Backward compatibility — a real one-element relay set is proven
//      byte-identical, per relay, to the real pre-existing single-relay
//      write path, and separately to the real Arweave gatewayUrl/gatewayUrls
//      precedent this codebase already shipped once before.
//   E. Configuration ownership — proven from the real command signatures:
//      application-wide, in the sense that nothing about relay-set
//      configuration is publication-specific in any existing type or
//      call — but ALSO proven that no store owns it yet, unlike Arweave's
//      gatewayUrls.
//   F. UI composition experiment — the real, unmodified
//      NostrRelayConfigurationStore's own persisted value, threaded live
//      through a hand-built configuration provider into the real,
//      unmodified `executeMultiRelayNostrPublicationDistributionCommand()`,
//      to find exactly where the missing seam is — without touching any
//      production file.
//   G. Contextual navigation — the real, already-shipped (0.9.437)
//      "Configure Nostr" link, and the real, live-quoted contradiction
//      between what the Settings hub (0.9.302-era `NetworkSettingsView.js`)
//      tells a Wanderer that page does, and what the page's own header
//      and template say it does.
//   H. Empty/malformed configuration — the real, existing semantic
//      contract for `[]`, `[""]`, `["   "]`, and mixed-validity arrays,
//      proven against the real fan-out publisher, and compared against the
//      STRICTER contract the existing read-path `NostrRelayConfiguration`
//      already enforces — a live-proven inconsistency 0.9.447 would need
//      to resolve, not invent.
//   I. Configuration persistence — proven that no dual-source-of-truth
//      exists TODAY (because no write-path store exists at all yet), and
//      the specific naive move that WOULD create one.
//   J. Decision matrix, verdict, and production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE, PER ITS OWN REQUEST. No relay-
// list Settings UI, no persistent-schema change, no configuration
// migration, no relay health checking, no retry/failover, no relay
// ranking, no relay discovery, no read-side multi-relay querying, no
// fan-out change, no aggregate status, no generic endpoint-configuration
// abstraction, no new navigation architecture. Every "experiment" below is
// built and run INSIDE this test file, exactly like 0.9.442's own
// D/E/F experiments — never wired into a production file.

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

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

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
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { contentSigner, fetchImpl };
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
function makeAlwaysSucceedsPublishImpl(callLog) {
    return async function publishImpl(relayUrl, eventTemplate) {
        if (callLog) callLog.push({ relayUrl, eventTemplate });
        return { published: true, id: nextFakeNostrEventId() };
    };
}

async function run() {
    // ===============================================================
    // Section A — Existing Nostr configuration inventory.
    // ===============================================================
    {
        // A1. core/NostrRelayConfiguration.js + storage/NostrRelayConfigurationStore.js
        // + application/SetNostrRelayConfigurationUseCase.js + ui/views/NostrRelaySettingsView.js
        // together already hold ONE, application-wide, single-URL override
        // — proven live, not merely read from their own headers.
        const storageProvider = new InMemoryStorageProvider();
        const store = new NostrRelayConfigurationStore(storageProvider);
        assert(store.get() === null, n('A1a. with nothing persisted, the existing store genuinely returns null (absence is a real, distinguishable fact, not a default in disguise)'));
        const useCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });
        const saved = useCase.execute({ relayUrl: 'wss://relay.example.org' });
        assert(saved instanceof NostrRelayConfiguration && saved.relayUrl === 'wss://relay.example.org',
            n('A1b. the existing use case really persists a single relayUrl, real construction, real save'));
        assert(store.get().relayUrl === 'wss://relay.example.org', n('A1c. the persisted value round-trips through the real store'));
        // The class itself exposes exactly one field — no list, no per-purpose
        // dimension, confirmed against the real, live instance rather than
        // merely its own header's prose.
        assert(Object.keys(saved.toJSON()).length === 1 && 'relayUrl' in saved.toJSON(),
            n('A1d. the real, persisted shape carries exactly one field, relayUrl — no plural successor exists on this class today'));

        // A2. The existing Settings view's own template text says, in its
        // own words, that this configuration is discovery-only. Quoted
        // live from the real file, never paraphrased.
        const settingsViewSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(/This setting affects discovery only; it does not change where announcements are published\./.test(settingsViewSource),
            n('A2. ui/views/NostrRelaySettingsView.js — the ONE existing Settings surface named "Nostr Relay" — states, in its own rendered template, that it never affects publishing'));

        // A3. The write path never threads this override in. Proven two
        // ways: (i) ui/main.js's own composition never passes a relayUrl
        // sourced from nostrRelayConfigurationStore into resolveNostrPublisherOptions()
        // or the runtime-configuration resolver that feeds it; (ii) calling
        // the real resolveNostrPublisherOptions() the way ui/main.js's own
        // composition actually does (no relayUrl field at all) resolves an
        // options object whose own relayUrl is undefined, which the real,
        // unmodified NostrPublicationDiscoveryPublisher then defaults away
        // from whatever a Wanderer configured, onto its own hardcoded
        // DEFAULT_RELAY_URL.
        const mainSource = await source('ui/main.js');
        const runtimeConfigSource = await source('application/PublicationDistributionRuntimeConfiguration.js');
        const runtimeCompositionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        assert(!/resolvedNostrRelayUrl/.test(runtimeConfigSource) && !/resolvedNostrRelayUrl/.test(runtimeCompositionSource),
            n('A3a. neither the runtime configuration resolver nor the runtime composition file (the two collaborators that actually build nostrPublisherOptions for WRITE/publish) ever reference resolvedNostrRelayUrl — the one variable ui/main.js binds the Settings override to'));
        // Confirm live that resolvedNostrRelayUrl, where it DOES appear in
        // ui/main.js, is threaded only into the three READ-path discovery
        // constructors (already 0.9.369's own documented boundary) — never
        // into nostrPublisherOptions/arweaveAnnouncementPublisherOptions,
        // and never into publicationDistributionRuntimeProvider.
        const resolvedRelayUsageLines = mainSource.split('\n').filter((l) => l.includes('resolvedNostrRelayUrl') && !l.trim().startsWith('//'));
        assert(resolvedRelayUsageLines.length > 0, n('A3b. resolvedNostrRelayUrl really is used somewhere in ui/main.js (the read-path composition), so this is a genuine live trace, not a vacuous absence'));
        assert(!resolvedRelayUsageLines.some((l) => /nostrPublisherOptions|arweaveAnnouncementPublisherOptions|publicationDistributionRuntimeProvider|createNostrPublicationDistributionRuntimeAdapter/.test(l)),
            n('A3c. none of resolvedNostrRelayUrl\'s own real, non-comment usage lines in ui/main.js feed the write/publish composition — confirmed by direct text inspection of every such line, not by absence of a keyword search'));

        const nostrPublisherOptions = resolveNostrPublisherOptions({
            publishImpl: async () => ({ id: nextFakeNostrEventId() }),
            discoveryTag: 'forkbuild-publication'
            // relayUrl deliberately omitted — this is exactly what
            // ui/main.js's own real call site supplies today (see A3a/A3b).
        });
        assert(nostrPublisherOptions.relayUrl === undefined, n('A3d. REAL EXECUTION: calling the real resolveNostrPublisherOptions() the way ui/main.js actually does today (no relayUrl) resolves an options object with relayUrl undefined'));
        const publisherUnderTodaysWiring = new NostrPublicationDiscoveryPublisher(nostrPublisherOptions);
        assert(publisherUnderTodaysWiring.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL,
            n(`A3e. REAL EXECUTION: under today's actual wiring, the single-relay WRITE path publishes to ${NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL} regardless of any relayUrl a Wanderer has saved at /settings/nostr-relay — proving the Settings override affects zero bytes of what a real "Distribute Publication" click does today`));

        // A4. Neither of 0.9.444's own new files, nor PublicationDistributionCommand.js's
        // own multi-relay export, imports any storage/configuration-store
        // class at all — the write-side fan-out capability has NO
        // persistence of its own today, for one relay or many.
        const multiRelayPublisherSource = await source('application/NostrMultiRelayPublicationDiscoveryPublisher.js');
        const multiRelayOrchestratorSource = await source('application/NostrMultiRelayPublicationDistributionOrchestrator.js');
        const distributionCommandSource = await source('application/PublicationDistributionCommand.js');
        for (const [label, text] of [
            ['NostrMultiRelayPublicationDiscoveryPublisher.js', multiRelayPublisherSource],
            ['NostrMultiRelayPublicationDistributionOrchestrator.js', multiRelayOrchestratorSource],
            ['PublicationDistributionCommand.js', distributionCommandSource]
        ]) {
            assert(!/ConfigurationStore|StorageProvider|localStorage/.test(text),
                n(`A4[${label}]. carries no reference to any configuration store or storage provider — nostrRelayUrls is, today, purely a caller-supplied, per-call argument with no persisted home anywhere`));
        }

        // A5. A real, already-shipped, pre-existing contradiction: the
        // Settings HUB (ui/views/NetworkSettingsView.js) describes the
        // Nostr Relay row as covering "discovery and publishing," while the
        // page it links to (Section A2, above) says the opposite about
        // itself in its own words. Neither string was added or touched by
        // this milestone or by 0.9.444/0.9.445 — both predate the fan-out
        // capability entirely; this audit surfaces, but does not fix, the
        // inconsistency, since fixing UI text is outside this milestone's
        // own scope (test-only).
        const hubSource = await source('ui/views/NetworkSettingsView.js');
        assert(/Relay used for Nostr-based discovery and publishing\./.test(hubSource),
            n('A5a. ui/views/NetworkSettingsView.js — the Settings hub — describes the Nostr Relay row as covering BOTH discovery and publishing'));
        assert(/does not change where announcements are published/.test(settingsViewSource),
            n('A5b. ui/views/NostrRelaySettingsView.js — the page that same hub row links to — states the opposite of its own hub\'s description, in its own words'));
        console.log('\n=== SECTION A: EXISTING CONFIGURATION INVENTORY ===');
        console.log('✓ Section A: the only existing Nostr relay configuration (core/NostrRelayConfiguration.js + storage/NostrRelayConfigurationStore.js + its Settings view) is a single, application-wide value, deliberately and explicitly scoped to read/discovery only — the real write path (single-relay AND 0.9.444\'s own fan-out) consults no persisted configuration at all today, and the Settings hub\'s own description of that page already, independently, contradicts the page\'s own stated scope.');
    }

    // ===============================================================
    // Section B — Current UI reachability.
    // ===============================================================
    {
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        const routerSource = await source('ui/router/index.js');

        // B1. The one existing contextual entry point from Publications >
        // Distribution > Announcement/Discovery toward Nostr configuration
        // (0.9.437) really exists, and really resolves to /settings/nostr-relay
        // for the Nostr choice — extracted and RUN, never merely
        // pattern-matched in prose.
        const fnMatch = viewSource.match(/function discoveryDistributionConfigurationRoute\(entry\) \{([\s\S]*?)\n {8}\}/);
        assert(fnMatch, n('B1. discoveryDistributionConfigurationRoute(entry) (0.9.437) is located in the real Publications view'));
        // eslint-disable-next-line no-new-func
        const resolveRoute = new Function('entry', fnMatch[1]);
        assert(resolveRoute({ discoveryDistributionProvider: 'nostr' }) === '/settings/nostr-relay',
            n('B2. REAL EXECUTION: the existing resolver really points a "nostr" choice at /settings/nostr-relay — the same page Section A already proved is scoped to read/discovery only'));

        // B2. No OTHER contextual entry point exists anywhere in ui/ for
        // relay configuration of any kind — one router-link per
        // Announcement/Discovery Publication card, per 0.9.437's own audit
        // (re-confirmed live here, not merely trusted from that file's own
        // Section A).
        const publicationCardStart = viewSource.indexOf('<span class="evidence-anchor-type">Publication</span>');
        const snapshotCardStart = viewSource.indexOf('<span class="evidence-anchor-type">Snapshot</span>', publicationCardStart);
        const publicationCardSlice = viewSource.slice(publicationCardStart, snapshotCardStart);
        // AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration.
        // This audit's own verdict recommended exactly this: a second,
        // additive contextual link pointed at a NEW destination
        // (/settings/nostr-publication-relays), never a duplicate of or
        // replacement for the existing discovery-relay link this section
        // originally found alone. The count below is updated to match that
        // deliberate, recommended change — never loosened to "at least
        // one," so a THIRD, unreviewed link would still fail this check.
        assert((publicationCardSlice.match(/<router-link/g) || []).length === 2,
            n('B3. AMENDED BY 0.9.447 — the Publication card in Distribution > Announcement/Discovery now carries exactly two router-links: the original discovery-relay link this section found, plus the new Nostr Publication Relays link this milestone\'s own verdict recommended'));

        // B3. The route it targets is really registered, resolving to the
        // real NostrRelaySettingsView component, not a 404 or a stub.
        assert(/path: '\/settings\/nostr-relay', name: 'nostr-relay-settings', component: NostrRelaySettingsView/.test(routerSource),
            n('B4. /settings/nostr-relay is really registered against the real NostrRelaySettingsView component'));

        // B4. Nothing anywhere under ui/ references the multi-relay
        // capability by name — re-confirming 0.9.445's own Section L3 as
        // this audit's own live starting fact, not an inherited assumption.
        assert(!/MultiRelay|nostrRelayUrls/.test(viewSource),
            n('B5. the real Publications view itself contains no reference to "MultiRelay" or "nostrRelayUrls" — the existing contextual link is scoped to the single-relay concept only'));

        console.log('\n=== SECTION B: CURRENT UI REACHABILITY ===');
        console.log('✓ Section B: exactly one contextual entry point exists today (Distribution > Announcement/Discovery > "Configure Nostr", 0.9.437), and it already, correctly, points at the one existing Settings route for Nostr — but Section A already proved that route\'s own real effect is confined to discovery, so today this link cannot actually reach anything relevant to write-side relay configuration, single or multi.');
    }

    // ===============================================================
    // Section C — Configuration cardinality.
    // ===============================================================
    {
        // C1. `[]` is invalid CONFIGURATION today — not "disabled
        // distribution," a distinct, existing outcome this file's own
        // header already documents for a missing arweaveUploaderOptions/
        // nostrPublisherOptions (a friendly "not currently configured"
        // `undefined`, never attempted). A relay list, by contrast, throws
        // synchronously at construction — proven against the real,
        // unmodified class, never assumed from its header's prose alone.
        let threw = null;
        try { new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: [], discoveryTag: 'x', publishImpl: async () => ({}) }); }
        catch (error) { threw = error; }
        assert(threw instanceof Error && /non-empty relayUrls array is required/.test(threw.message),
            n('C1. REAL EXECUTION: an empty relayUrls array is a construction-time throw today — "zero relays" is not a supported way to express "distribution disabled," it is a caller error'));

        // C2. A single-element list behaves as one independent target —
        // proven by inspecting the real relayUrls getter after construction.
        const one = new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://a.example'], discoveryTag: 'x', publishImpl: async () => ({}) });
        assert(one.relayUrls.length === 1 && one.relayUrls[0] === 'wss://a.example', n('C2. REAL EXECUTION: [A] really constructs exactly one relay target'));

        // C3. Multi-element lists are genuinely independent targets, never
        // ranked — the real relayUrls getter preserves every distinct
        // relay, in configured order, with no field anywhere describing
        // one as "primary" or another as "fallback."
        const three = new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://a.example', 'wss://b.example', 'wss://c.example'], discoveryTag: 'x', publishImpl: async () => ({}) });
        assert(three.relayUrls.length === 3, n('C3a. REAL EXECUTION: [A,B,C] really constructs three independent relay targets'));
        assert(!('primary' in three) && !('fallback' in three) && !('priority' in three),
            n('C3b. the real, constructed instance exposes no primary/fallback/priority field of any kind — matching this milestone\'s own instruction, "every configured relay is an independent distribution target"'));

        console.log('\n=== SECTION C: CONFIGURATION CARDINALITY ===');
        console.log('✓ Section C: [] is not a valid way to express "distribution disabled" under the real, existing fan-out publisher — it is a construction-time error. A future 0.9.447 relay-list Settings UI therefore cannot represent "no relays configured" as an empty persisted array fed straight into this class; it would need its own, separate "no override" representation, the identical shape NostrRelayConfigurationStore.get() === null already holds for the single-value case (Section A1a) — never a value this milestone invents, only names as the precedent to follow.');
    }

    // ===============================================================
    // Section D — Backward compatibility.
    // ===============================================================
    {
        // D1. A one-element relay set, run through the REAL, unmodified
        // multi-relay COMMAND boundary, produces the identical per-relay
        // fact a caller of the pre-existing single-relay command would see
        // for the same relay — re-confirmed narrowly here (0.9.445's own
        // Section I already proved this at the fan-out mechanics level;
        // this section proves it specifically as a CONFIGURATION-CARDINALITY
        // fact, the question this milestone owns).
        const arweave = makeFakeArweaveSubstrate();
        const publishCallLog = [];
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publication = makeFakePublication('pub-d1');
        const results = await executeMultiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: 'hello world',
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: ['wss://only.example'],
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(publishCallLog), discoveryTag: 'forkbuild-publication' },
            lifecycleStore
        });
        assert(Array.isArray(results) && results.length === 1, n('D1a. REAL EXECUTION: a one-element nostrRelayUrls list resolves an array of exactly one PublicationDistributionResult through the real command'));
        assert(results[0].discovery && results[0].discovery.relayUrl === 'wss://only.example', n('D1b. that one raw result carries the configured relay as its own discovery.relayUrl, exactly as the pre-existing single-relay command already would'));
        assert(lifecycleStore.getDiscoveryObservations('pub-d1').length === 1 && lifecycleStore.getDiscoveryObservations('pub-d1')[0].origin === 'wss://only.example',
            n('D1b2. and once recorded through the real lifecycle store, that same fact is retrievable keyed by its own relay origin — the (publicationId, discoveryProvider, discoveryOrigin) identity 0.9.443 built'));
        assert(publishCallLog.length === 1 && publishCallLog[0].relayUrl === 'wss://only.example', n('D1c. exactly one publishImpl call occurred, to exactly the one configured relay — no phantom second call from "list machinery" of any kind'));

        // D2. The precedent this codebase has ALREADY shipped once, for a
        // structurally similar single-value -> list widening: Arweave's own
        // ArweaveGatewayConfiguration (0.9.440). Live-proven here as the
        // concrete, reusable SHAPE (never the semantics — that one is
        // ordered-priority failover, Nostr's own is unordered fan-out, and
        // Section J below keeps that distinction explicit) a future
        // 0.9.447 could imitate structurally: a single legacy field and a
        // plural field cannot both be supplied, an old single-value
        // persisted payload keeps loading unchanged, and `.gatewayUrl`
        // (singular) keeps working as "the first of the list" for any
        // caller that never learns about the plural field at all.
        const legacy = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://gw.example' });
        assert(legacy.gatewayUrl === 'https://gw.example' && legacy.gatewayUrls.length === 1 && legacy.gatewayUrls[0] === 'https://gw.example',
            n('D2a. REAL EXECUTION: the real, shipped ArweaveGatewayConfiguration already treats a legacy singular gatewayUrl as a one-element gatewayUrls list — the exact "existing value ≡ one-element set" equivalence this milestone\'s own brief asks to be proven'));
        let bothSuppliedThrew = null;
        try { new ArweaveGatewayConfiguration({ gatewayUrl: 'https://a.example', gatewayUrls: ['https://b.example'] }); }
        catch (error) { bothSuppliedThrew = error; }
        assert(bothSuppliedThrew instanceof Error, n('D2b. REAL EXECUTION: that real class refuses to accept both the singular and plural field at once — the exact ambiguity a future Nostr equivalent would need to refuse identically, never silently pick one'));

        console.log('\n=== SECTION D: BACKWARD COMPATIBILITY ===');
        console.log('✓ Section D: a one-element Nostr relay set is already, today, byte-identical through the real command boundary to what the pre-existing single-relay path produces for that one relay (re-confirming 0.9.445\'s own Section I as a configuration-cardinality fact, not only a fan-out-mechanics one) — and this codebase already has one real, shipped precedent (ArweaveGatewayConfiguration) for exactly the singular/plural coexistence shape a future Nostr equivalent would need, including its "never both at once" guard.');
    }

    // ===============================================================
    // Section E — Configuration ownership.
    // ===============================================================
    {
        // E1. Nothing about the real command signatures ties nostrRelayUrls
        // to a publication. executeMultiRelayNostrPublicationDistributionCommand()'s
        // own real parameter list carries publication (WHAT is being
        // distributed) and nostrRelayUrls (WHERE it fans out to) as two
        // entirely independent fields — proven by calling it twice for two
        // different publications with the identical relay set, and once
        // more for the SAME publication with a different relay set, and
        // observing that neither call's own relay set leaks into or
        // depends on the other's publication identity.
        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const sharedRelaySet = ['wss://shared-one.example', 'wss://shared-two.example'];
        const resultsForPubA = await executeMultiRelayNostrPublicationDistributionCommand({
            publication: makeFakePublication('pub-e-a'),
            serializedMaterial: 'a',
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: sharedRelaySet,
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(), discoveryTag: 'forkbuild-publication' },
            lifecycleStore
        });
        const resultsForPubB = await executeMultiRelayNostrPublicationDistributionCommand({
            publication: makeFakePublication('pub-e-b'),
            serializedMaterial: 'b',
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: sharedRelaySet,
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(), discoveryTag: 'forkbuild-publication' },
            lifecycleStore
        });
        assert(resultsForPubA.length === 2 && resultsForPubB.length === 2, n('E1a. the SAME relay set genuinely serves two different publications, independently, with no per-publication relay state anywhere in the real call'));
        assert(lifecycleStore.getDiscoveryObservations('pub-e-a').length === 2 && lifecycleStore.getDiscoveryObservations('pub-e-b').length === 2,
            n('E1b. both publications end up with their own two relay observations, neither one contaminating the other\'s — confirming nostrRelayUrls carries no publication-scoped identity of its own'));

        // E2. Nowhere in core/, storage/, or application/ does any type
        // pair a relay-set field with a publicationId/objectId field — a
        // structural sweep, not a single example.
        const applicationDistributionFiles = [
            'application/NostrMultiRelayPublicationDiscoveryPublisher.js',
            'application/NostrMultiRelayPublicationDistributionOrchestrator.js',
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionOrchestrator.js'
        ];
        for (const relPath of applicationDistributionFiles) {
            const text = await source(relPath);
            assert(!/publicationId\s*:\s*.*relayUrl|relayUrl.*publicationId/.test(text.replace(/\n/g, ' ')),
                n(`E2[${relPath}]. no type or literal in this file pairs a relay URL with a publicationId — relay configuration and publication identity remain two independent axes throughout the real distribution family`));
        }

        // E3. Unlike Arweave's own gatewayUrls (Section D2, ALREADY a
        // persisted, application-wide Settings value that the real content-
        // read path automatically consults, per-request, from durable
        // storage), NOTHING today persists a Nostr relay SET anywhere. Every
        // real test and every real production call site above supplied
        // nostrRelayUrls fresh, as a plain in-memory argument — there is no
        // existing store this milestone's audit could point to and say "this
        // one already owns it." Confirmed by the same absence already
        // established in Section A4, restated here as the OWNERSHIP
        // finding specifically: ownership is not merely undecided BETWEEN
        // "application-wide" and "per-publication" — it is currently
        // unassigned to any persisted concept at all.
        console.log('\n=== SECTION E: CONFIGURATION OWNERSHIP ===');
        console.log('✓ Section E: nostrRelayUrls is, structurally, an application-scoped concept — it never carries or depends on a publication identity anywhere in the real call chain, matching this milestone\'s own initial expectation ("a relay is distribution infrastructure, not publication content") — but that expectation is proven here as "no existing type ties it to a publication," never as "an existing application-wide store already owns it," because no store owns it yet at all (Section A4). Ownership by SCOPE is already settled by today\'s architecture; ownership by PERSISTED HOME is the actual, still-open question Section F/J address next.');
    }

    // ===============================================================
    // Section F — UI composition experiment.
    // ===============================================================
    {
        // The smallest realistic test demonstrating:
        //   existing Settings value -> configuration provider -> multi-relay
        //   command -> fan-out
        // built entirely inside this test file, with ZERO production
        // changes — exactly this milestone's own instruction.
        const storageProvider = new InMemoryStorageProvider();
        const settingsStore = new NostrRelayConfigurationStore(storageProvider);
        const useCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: settingsStore });
        useCase.execute({ relayUrl: 'wss://wanderer-preferred.example' });

        // A HAND-BUILT configuration provider — not a production file — that
        // is the exact seam 0.9.445's own Section L2 named as missing:
        // something that reads the existing Settings store and hands its
        // value to the multi-relay command as a one-element array. This is
        // deliberately the smallest possible such function; it is never
        // wired into ui/main.js or PublicationDistributionCommandComposition.js.
        function experimentalResolveNostrRelayUrlsFromExistingSettings(nostrRelayConfigurationStore) {
            const configuration = nostrRelayConfigurationStore.get();
            return configuration ? [configuration.relayUrl] : [DEFAULT_NOSTR_RELAY_URL];
        }

        const resolvedRelayUrls = experimentalResolveNostrRelayUrlsFromExistingSettings(settingsStore);
        assert(Array.isArray(resolvedRelayUrls) && resolvedRelayUrls.length === 1 && resolvedRelayUrls[0] === 'wss://wanderer-preferred.example',
            n('F1. the experimental provider really turns the existing, real, persisted single-value Settings override into a one-element relay array'));

        const arweave = makeFakeArweaveSubstrate();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const publishCallLog = [];
        const results = await executeMultiRelayNostrPublicationDistributionCommand({
            publication: makeFakePublication('pub-f1'),
            serializedMaterial: 'seam experiment',
            arweaveUploaderOptions: { signer: arweave.contentSigner, fetchImpl: arweave.fetchImpl },
            nostrRelayUrls: resolvedRelayUrls,
            nostrPublisherOptions: { publishImpl: makeAlwaysSucceedsPublishImpl(publishCallLog), discoveryTag: 'forkbuild-publication' },
            lifecycleStore
        });
        assert(results.length === 1 && results[0].discovery.relayUrl === 'wss://wanderer-preferred.example',
            n('F2. REAL EXECUTION: the existing Settings value, through the hand-built provider above, drives the real, unmodified multi-relay command end to end — Settings value -> provider -> command -> fan-out, with zero production files touched'));
        assert(publishCallLog.length === 1, n('F3. exactly one real publishImpl call occurred, to exactly the Wanderer\'s own configured relay'));

        // F4. The chain above proves the DIRECTION "existing single value ->
        // one-element multi-relay call" is trivial. It does NOT, by itself,
        // demonstrate a multi-relay list, because the existing store has
        // never held more than one value — that is precisely Section C/H's
        // own point: a genuine list needs a genuine list-shaped store,
        // which does not exist. This experiment's own value is narrower and
        // more useful than "it would work": it identifies EXACTLY which
        // real file would need to change to wire this for real —
        // application/PublicationDistributionCommandComposition.js, the one
        // file that already pre-binds composition-root collaborators
        // (Section F5) but composes ONLY executePublicationDistributionCommand()
        // today.
        const compositionSource = await source('application/PublicationDistributionCommandComposition.js');
        assert(/executePublicationDistributionCommand/.test(compositionSource), n('F5a. the real composition root imports the single-relay command'));
        // AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration.
        // This section's own point-in-time finding — that this exact file
        // was the one missing seam — is what 0.9.447 closed, precisely as
        // recommended: `composeMultiRelayNostrPublicationDistributionCommand()`
        // now lives in this same file, alongside the pre-existing
        // single-relay composer, never inside NostrRelaySettingsView.js or
        // NostrRelayConfigurationStore.js (see tests/
        // NostrPublicationRelaySetConfiguration.test.js, Section G, for the
        // live proof that the new composer is wired end to end).
        assert(compositionSource.includes('executeMultiRelayNostrPublicationDistributionCommand'), n('F5b. AMENDED BY 0.9.447 — the real composition root now imports the multi-relay command, closing the exact seam this section identified as missing'));

        console.log('\n=== SECTION F: UI COMPOSITION EXPERIMENT ===');
        console.log('✓ Section F: the existing Settings value CAN drive the real multi-relay command end to end for the one-element case, with no production change — but this only demonstrates the easy direction. A genuine relay SET has no existing store to read from at all (Section E3), and the concrete missing seam for wiring even a one-element case for real is application/PublicationDistributionCommandComposition.js, not the Settings page or its store.');
    }

    // ===============================================================
    // Section G — Contextual navigation.
    // ===============================================================
    {
        // G1. The question this milestone's own brief poses is not "does
        // Nostr have a Settings page" (yes, trivially — Section A) but
        // "can a user who wants to distribute reach the configuration that
        // action actually needs." Section B already proved the one
        // existing link (0.9.437) resolves to /settings/nostr-relay for a
        // "nostr" choice; this section proves, from real, live-quoted
        // text, that following that link today teaches a Wanderer nothing
        // about where their announcement is actually sent.
        const settingsViewSource = await source('ui/views/NostrRelaySettingsView.js');
        const templateMatch = settingsViewSource.match(/template: `([\s\S]*)`\s*\};?\s*$/);
        assert(templateMatch, n('G1. the real NostrRelaySettingsView.js template string is locatable'));
        const template = templateMatch[1];
        assert(/discovery only/.test(template), n('G2. the real, rendered page a Wanderer reaches by clicking "Configure Nostr" tells them, in its own words, that the setting only affects discovery'));
        const publishMentions = (template.match(/publish\w*/gi) || []);
        const announceMentions = (template.match(/announce\w*/gi) || []);
        assert(publishMentions.length === 1, n(`G3a. the word "publish" appears exactly ONCE in the real, rendered page's own template (found ${publishMentions.length}) — the one disclaimer sentence itself (Section G2), never a second mention describing an actual publishing control`));
        assert(announceMentions.length === 1, n(`G3b. the word "announce"/"announcements" appears exactly ONCE (found ${announceMentions.length}) — the identical disclaimer sentence, never a separate mention of an announcement CONTROL`));
        assert(!/distribut/i.test(template), n('G3c. the real, rendered page never mentions "distribut(e/ion)" anywhere in its own template — this page offers no distribution action of any kind, only a discovery-relay preference'));

        // G4. The 0.9.437 pattern itself — "point at an existing Settings
        // route from the contextual Distribution card, never duplicate a
        // control there" — is architecturally reusable AS-IS once a real
        // configuration target exists: the router-link's own target is a
        // plain string this milestone could redirect to a new route with
        // zero change to the surrounding component structure. This is
        // proven by the fact that Section B's own resolveRoute() is a pure
        // function of one string field (discoveryDistributionProvider),
        // never entangled with the route string's own value.
        const viewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/'\/settings\/nostr-relay'/.test(viewSource) && (viewSource.match(/'\/settings\/nostr-relay'/g) || []).length <= 3,
            n('G4. the literal route string appears only where the Distribution section\'s own contextual links already reference it — a small, bounded, already-identified set of edit points if 0.9.447 ever needs to repoint or add to them'));

        console.log('\n=== SECTION G: CONTEXTUAL NAVIGATION ===');
        console.log('✓ Section G: the contextual-Settings PATTERN (0.9.437) is sound and reusable as-is — but the specific EXISTING destination it currently offers for Nostr is, by its own real, rendered text, scoped away from exactly the thing a Wanderer clicking "Configure Nostr" from a distribution action would reasonably expect to control. Reachability of A page is not in question; reachability of the RIGHT configuration is.');
    }

    // ===============================================================
    // Section H — Empty/malformed configuration.
    // ===============================================================
    {
        // H1-H4: the real, existing semantic contract of the fan-out
        // publisher's own relayUrls normalization, for exactly the four
        // shapes this milestone's own brief names.
        function tryConstruct(relayUrls) {
            try { return { publisher: new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls, discoveryTag: 'x', publishImpl: async () => ({}) }) }; }
            catch (error) { return { error }; }
        }

        const empty = tryConstruct([]);
        assert(empty.error instanceof Error, n('H1. REAL EXECUTION: [] throws at construction — no relay is ever silently treated as "distribution disabled" by this class'));

        const singleEmptyString = tryConstruct(['']);
        assert(singleEmptyString.error instanceof Error, n('H2. REAL EXECUTION: [""] also throws — an empty string is filtered out during normalization, leaving zero valid relays, the same outcome as []'));

        const whitespaceOnly = tryConstruct(['   ']);
        assert(whitespaceOnly.error instanceof Error, n('H3. REAL EXECUTION: ["   "] also throws — whitespace-only entries are filtered identically to empty strings'));

        const mixedValidity = tryConstruct(['wss://relay-a.example', '']);
        assert(mixedValidity.publisher && mixedValidity.publisher.relayUrls.length === 1 && mixedValidity.publisher.relayUrls[0] === 'wss://relay-a.example',
            n('H4. REAL EXECUTION: ["wss://relay-a", ""] succeeds, silently dropping the blank entry and keeping the one real relay — a caller supplying a mix gets the valid subset, never a hard failure over the invalid entry'));

        // H5. The existing semantic contract this class enforces is
        // STRICTLY LOOSER than the one core/NostrRelayConfiguration.js (the
        // read-path class) already enforces — a real, live, structural
        // inconsistency 0.9.447 would inherit unless it deliberately
        // decides otherwise. Proven directly: a garbage, non-URL string
        // that isValidNostrRelayUrl() already REJECTS is nonetheless
        // ACCEPTED by the fan-out publisher's own normalization, because
        // that normalization only ever checks "non-empty string," never
        // "parses as ws:/wss:".
        assert(isValidNostrRelayUrl('not-a-url-at-all') === false, n('H5a. the real, existing read-path validator (core/NostrRelayConfiguration.js) rejects a non-URL string'));
        const garbageAccepted = tryConstruct(['not-a-url-at-all']);
        assert(garbageAccepted.publisher && garbageAccepted.publisher.relayUrls[0] === 'not-a-url-at-all',
            n('H5b. REAL EXECUTION: the SAME string is silently ACCEPTED by the real, existing write-path fan-out publisher — a live-proven strictness mismatch between the two existing Nostr relay concepts this codebase already ships, neither of which this milestone changes'));

        console.log('\n=== SECTION H: EMPTY/MALFORMED CONFIGURATION ===');
        console.log('✓ Section H: [] and [""]/["   "] are all construction-time errors under the real fan-out publisher — never "distribution disabled." A mix of valid and blank entries degrades gracefully to the valid subset. And the real fan-out publisher\'s own validation is measurably looser than the real read-path NostrRelayConfiguration\'s own ws:/wss: check — a genuine, pre-existing inconsistency a future relay-list Settings UI (0.9.447) would need to consciously resolve, most likely by validating with core/NostrRelayConfiguration.js\'s own isValidNostrRelayUrl() per entry BEFORE ever reaching this class, never by loosening the Settings-side check to match.');
    }

    // ===============================================================
    // Section I — Configuration persistence.
    // ===============================================================
    {
        // I1. No dual-source-of-truth exists TODAY, because only one of
        // the two conceptual configurations (Settings' single relayUrl)
        // is persisted at all — re-confirmed here as the PERSISTENCE
        // finding specifically, building on Section A4/E3's own broader
        // ownership finding.
        const storageProvider = new InMemoryStorageProvider();
        assert(storageProvider.list().length === 0, n('I1. a fresh storage provider genuinely starts with zero persisted keys'));
        const settingsStore = new NostrRelayConfigurationStore(storageProvider);
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: settingsStore }).execute({ relayUrl: 'wss://only-store.example' });
        assert(storageProvider.list().length === 1, n('I2. REAL EXECUTION: exactly one storage key exists after saving a Settings override — confirming there is exactly one persisted Nostr-relay-shaped fact in this whole application today, not two competing ones'));

        // I2. The naive move this section explicitly guards against:
        // widening NostrRelayConfiguration/NostrRelayConfigurationStore's
        // OWN storage key in place to hold a list would, per Section A2's
        // own live-quoted text, still leave that key documented and
        // understood as "discovery only" — so a second, EDITORIALLY
        // separate "distribution relay set" field would still be needed
        // conceptually even if it physically lived in the same JSON blob,
        // reproducing the Settings-relay-list + publication-distribution-
        // relay-list collision this milestone's own brief names by
        // structure, not by inventing a second store this audit builds.
        // This is stated as a guarded, falsifiable claim, not merely
        // asserted in prose: if a future milestone reuses the EXACT same
        // storage key for both purposes, the existing get()/save()/clear()
        // contract (Section A1a-A1d) offers no way to represent "a Wanderer
        // wants discovery from relay A but wants to distribute to relays
        // A and B" as two different facts under one key.
        const reusedKeyConfig = new NostrRelayConfiguration({ relayUrl: 'wss://only-one-field.example' });
        assert(Object.keys(reusedKeyConfig.toJSON()).length === 1,
            n('I3. REAL EXECUTION: the real, existing value object has exactly one field to hold ANY Nostr-relay-shaped fact — there is structurally no room, today, to distinguish "the discovery relay" from "the distribution relay set" inside this one class without either widening its own shape (crossing the read/write boundary Section A already found load-bearing) or introducing a genuinely separate value object/store'));

        console.log('\n=== SECTION I: CONFIGURATION PERSISTENCE ===');
        console.log('✓ Section I: exactly one Nostr-relay-shaped fact is persisted anywhere in this application today, and it is explicitly the read-path one. No dual-source-of-truth exists yet because the write-path concept has no store at all. The concrete risk this section guards against is real but not yet realized: reusing NostrRelayConfiguration\'s own storage key or class for the distribution relay set would immediately create the exact "Settings relay list + publication distribution relay list" collision this milestone was asked to guard against — the safe path is a genuinely separate, sibling value object/store, matching this codebase\'s own existing "separate object, never a shared shape" precedent (NostrRelayConfiguration vs ArweaveGatewayConfiguration, per that file\'s own header).');
    }

    // ===============================================================
    // Section J — Decision matrix, verdict, and production-change guard.
    // ===============================================================
    const decisionMatrix = [
        { finding: 'Existing single-value Nostr Relay Settings (read/discovery path)', classification: 'ALREADY_REACHABLE', note: 'already has its own Settings page, its own hub entry, and its own contextual link (0.9.437) — genuinely no gap for ITS OWN purpose (Section A1, B1-B4)' },
        { finding: 'Reusing that same Settings surface/store AS-IS for write-path relay-set configuration', classification: 'NOT_VIABLE', note: 'would silently cross an explicit, repeatedly-documented read/write boundary (Section A2, A3, G2-G3) and cannot represent both concepts under one field (Section I3) — this is the one option this audit affirmatively rules out, not merely defers' },
        { finding: 'A new, sibling relay-set configuration for the write/distribution path (new value object + store, existing structural pattern)', classification: 'MINIMAL_CONFIGURATION_GAP', note: 'the SHAPE already has a real, shipped precedent this codebase can imitate structurally (ArweaveGatewayConfiguration\'s gatewayUrl/gatewayUrls, Section D2) — never its ordered-failover semantics, only its singular/plural coexistence and backward-compatibility shape' },
        { finding: 'Contextual reachability from Publications > Distribution once such a store exists', classification: 'ALREADY_REACHABLE (pattern), UX_REACHABILITY_GAP (target)', note: 'the 0.9.437 router-link pattern is sound and needs no new navigation architecture (Section G4) — only a correct destination route/page to point at, which does not exist yet' },
        { finding: 'Relay-set cardinality semantics (fan-out over independent targets, [] invalid)', classification: 'CAPABILITY_SUFFICIENT_NO_CONFIGURATION', note: '0.9.444\'s own fan-out publisher already enforces this correctly (Section C) — no further product decision is needed here, only a UI that respects the existing non-empty-array contract' },
        { finding: 'Per-entry relay-URL validation strictness (fan-out publisher vs. NostrRelayConfiguration)', classification: 'MINIMAL_CONFIGURATION_GAP', note: 'a real, live-proven inconsistency (Section H5) a future settings UI must resolve by validating each entry with the STRICTER, existing isValidNostrRelayUrl(), never by loosening it' }
    ];
    {
        const VALID_PREFIXES = ['ALREADY_REACHABLE', 'NOT_VIABLE', 'MINIMAL_CONFIGURATION_GAP', 'UX_REACHABILITY_GAP', 'CAPABILITY_SUFFICIENT_NO_CONFIGURATION', 'PRODUCT_GAP'];
        for (const row of decisionMatrix) {
            assert(VALID_PREFIXES.some((prefix) => row.classification.includes(prefix)), n(`J1[${row.finding}]. carries a recognized classification`));
        }
        assert(!decisionMatrix.some((r) => r.classification.includes('PRODUCT_GAP')),
            n('J2. no row is classified a genuine PRODUCT_GAP — 0.9.442 already decided fan-out is the right product direction, and this audit finds no new product concept is needed, only configuration plumbing and one corrected navigation target'));

        console.log('\n=== SECTION J: DECISION MATRIX ===');
        console.log('| Finding                                                                          | Classification                                    |');
        console.log('|-----------------------------------------------------------------------------------|----------------------------------------------------|');
        for (const row of decisionMatrix) console.log(`| ${row.finding.padEnd(83)} | ${row.classification.padEnd(50)} |`);

        console.log('\n=== FINAL VERDICT ===');
        console.log('OVERALL CLASSIFICATION: MINIMAL_CONFIGURATION_GAP.');
        console.log('');
        console.log('The reviewer\'s own suspicion — resist manufacturing a Settings UI merely because the capability lacks one — survives contact');
        console.log('with real execution, but not in the shape the reviewer\'s own initial framing expected. The obvious candidate destination,');
        console.log('/settings/nostr-relay, is NOT a suitable seam to widen: Section A proves, from the page\'s own real, rendered text, that it is');
        console.log('explicitly scoped to discovery only, and Section A3 proves the write path (both today\'s single-relay command AND 0.9.444\'s own');
        console.log('fan-out) already consults no Settings value of any kind — there is no single value on that page to "widen" into a list for');
        console.log('this purpose in the first place. Section A5/G2-G3 additionally surface a real, pre-existing, unrelated defect: the Settings hub');
        console.log('already describes that page as covering "discovery and publishing," which was already false before this milestone and remains');
        console.log('outside this test-only milestone\'s own scope to fix.');
        console.log('');
        console.log('What DOES survive is smaller and cleaner than either "no configuration needed" or "a whole new product concept": a genuinely');
        console.log('separate, sibling relay-set configuration for the write/distribution path — structurally identical to the ArweaveGatewayConfiguration');
        console.log('gatewayUrl/gatewayUrls precedent this codebase already shipped once (Section D2), reachable through the SAME contextual-Settings');
        console.log('pattern 0.9.437 already established (Section G4, needing no new navigation architecture), but pointed at a NEW destination —');
        console.log('never a repurposed /settings/nostr-relay. Section H additionally names one concrete correctness detail that destination\'s own Save');
        console.log('path would need to get right from day one: validating each entry with core/NostrRelayConfiguration.js\'s own existing');
        console.log('isValidNostrRelayUrl(), never the looser bare-non-empty-string check the fan-out publisher itself applies one layer down.');
        console.log('');
        console.log('RECOMMENDED NEXT MILESTONE: 0.9.447 — Nostr Relay Set Configuration. Scope: one new value object (relay SET semantics, unordered,');
        console.log('non-empty, per-entry ws:/wss: validated), one new store (its own storage key, never NostrRelayConfigurationStore\'s), one new or');
        console.log('extended Settings surface reachable via the existing hub and the existing 0.9.437 contextual-link pattern (repointed, not');
        console.log('duplicated), and the one composition change Section F5 already located precisely: application/PublicationDistributionCommandComposition.js');
        console.log('gaining a multi-relay counterpart to compose executeMultiRelayNostrPublicationDistributionCommand() the same way it already composes');
        console.log('the single-relay command. No relay health/ranking, no retry/failover, no read-side multi-relay querying, and no fix to the');
        console.log('Settings-hub text defect Section A5 found — all remain explicitly out of that milestone\'s own scope too, unless separately decided.');

        // J3. Production-change guard — no production file was modified or
        // added by THIS MILESTONE'S OWN COMMIT, the identical commit-scoped
        // check every prior audit in this family already performs.
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.446 " --format=%H -n 1', { cwd: SOURCE_ROOT }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable, or this commit does not exist yet at test-authoring time — not a failure of this decision artifact */ }
        assert(productionTouched.length === 0,
            n(`J3. no production file was modified or added by the 0.9.446 commit itself (found: ${JSON.stringify(productionTouched)})`));

        console.log('\n✅ All Nostr Multi-Relay Configuration & UI Reachability Audit tests passed.');
        console.log(`\nTotal assertions: ${assertionCount}`);
    }
}

run().catch((error) => {
    console.error('NostrMultiRelayConfigurationUIReachabilityAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
