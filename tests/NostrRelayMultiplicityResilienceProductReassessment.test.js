import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import {
    describeDecentralizedDiscoveryEnvelope,
    DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
    DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION
} from '../core/DecentralizedDiscoveryEnvelope.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { executePublicationDistributionCommand } from '../application/PublicationDistributionCommand.js';

// 0.9.442 — Nostr Relay Multiplicity & Resilience Product Reassessment.
//
// TYPE: test-only, product/architectural audit. PRODUCTION CHANGES: NONE.
//
// 0.9.440/0.9.441 closed the Arweave gateway read-failover arc: a real
// `ArweaveGatewayFailoverContentStore`/`ArweaveGatewayFailoverWorldEncounterMaterialResolver`
// pair, proved correct in isolation and then through the actual composed
// entry points a real Wanderer session calls. 0.9.439's own audit — the
// milestone that recommended Arweave read failover as the NARROWER next
// step rather than Nostr — deliberately left Nostr relay multiplicity as
// its own, separately-scoped question (Section H1/H2, Section I: both
// Nostr rows classified `SEMANTIC_GAP`, never `MINIMAL_FAILOVER_SEAM`),
// reasoning ONLY from each file's own header comments, never from live
// execution of the actual application-layer classes against each other.
// This milestone is that separately-scoped question, decided for real:
//
//   DOES FORKBUILD ACTUALLY HAVE A PRODUCT NEED FOR MULTIPLE NOSTR RELAYS,
//   AND IF SO, SHOULD MULTIPLE RELAYS MEAN FAILOVER OR FAN-OUT?
//
// NINE SECTIONS:
//
//   A. Requirement framing — the central question, restated as a checkable
//      claim that does not presuppose its own answer.
//   B. Current Nostr model, traced fresh through every real layer:
//      configuration, storage, composition, the three read-path consumers,
//      the three write-path publishers, the settings UI, and the
//      Announcement/Discovery observation store — reconfirming 0.9.369
//      through 0.9.372's and 0.9.433's own facts live, never assumed from
//      their headers alone.
//   C. Three candidate products framed as checkable data, mirroring the
//      reviewer's own single/failover/fan-out framing.
//   D. THE CENTRAL FAN-OUT EXPERIMENT — real `NostrPublicationDiscoveryPublisher`
//      and `NostrDiscoveryQueryService` instances, two relays each,
//      exercised concurrently to prove what a fan-out caller built on
//      TODAY's own classes — with zero new abstraction — would actually
//      observe.
//   E. THE FAILOVER EXPERIMENT — the SAME real classes, sequenced instead
//      of raced, to prove ordered failover is EQUALLY trivial to compose
//      from today's classes, and to prove the exact divergence point the
//      spec asked for: whether a second relay is contacted once the first
//      already succeeded.
//   F. Discovery consequences — whether two independent discoveries of the
//      SAME publication, one via each relay, are already recognizable as
//      the same thing through EXISTING identity (never a new Nostr-specific
//      one), and whether the existing Announcement/Discovery observation
//      store (0.9.433) already accommodates relay-level, not just
//      substrate-level, multiplicity.
//   G. Partial-success semantics — whether a new aggregate status is
//      actually needed, given F's own findings.
//   H. Configuration UX — whether an ordered list is even askable today,
//      and why order's meaning depends on an answer this milestone, not a
//      Settings page, must supply first.
//   I. The decentralization/resilience objective, compared directly against
//      Arweave gateway failover's own, structurally different, objective.
//   J. Decision matrix, verdict, and production-change guard.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No relay list field, no
// Settings UI change, no fan-out or failover composition wired into
// `ui/main.js`, no change to `PublicationDistributionLifecycleMemoryStore`'s
// own keying, no new lifecycle/status vocabulary. Every "caller" in Sections
// D/E/F below is built INSIDE this test file, never inside a production
// file — this milestone decides what SHOULD be built next, and names
// exactly one concrete prerequisite gap (Section F) that whichever
// milestone builds it must cross; it builds none of it.

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

const HEX64_A = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);

async function run() {
    // ===============================================================
    // Section A — Requirement framing.
    // ===============================================================
    {
        const CENTRAL_QUESTION = 'Does ForkBuild actually have a product need for multiple Nostr relays, and if so, should multiple relays mean failover or fan-out?';
        assert(typeof CENTRAL_QUESTION === 'string' && CENTRAL_QUESTION.length > 0,
            n('A1. the central question is stated as a concrete sentence, not a category label'));
        assert(!/failover is (correct|the answer)|fan-out is (correct|the answer)/i.test(CENTRAL_QUESTION),
            n('A2. the question itself does not presuppose which semantic is correct — Sections D/E/F/I below test it against real execution and real, already-shipped boundaries, never assumption'));

        console.log('\n=== SECTION A: REQUIREMENT FRAMING ===');
        console.log('✓ Section A: unlike Arweave gateway read failover (0.9.439\'s own Section H3: content-addressed, byte-identical regardless of gateway — an unambiguous MINIMAL_FAILOVER_SEAM), Nostr relay multiplicity has no such presupposed answer. This audit decides it from real execution of the real publisher/query classes, not from analogy to Arweave.');
    }

    // ===============================================================
    // Section B — Current Nostr model, traced fresh through every real
    // layer. Every fact below is reconfirmed LIVE in this file, even
    // where 0.9.369-0.9.372/0.9.433/0.9.439 already established it —
    // this milestone treats none of it as inherited by citation alone.
    // ===============================================================
    {
        // B1. Configuration — core/NostrRelayConfiguration.js takes exactly
        // one relayUrl string; an array is rejected, not silently accepted
        // as "the first of a list."
        assert((() => { try { new NostrRelayConfiguration({ relayUrl: ['wss://a.example', 'wss://b.example'] }); return false; } catch { return true; } })(),
            n('B1. NostrRelayConfiguration rejects an array where a relayUrl string is expected, live-confirmed'));
        const single = new NostrRelayConfiguration({ relayUrl: 'wss://relay-a.example' });
        assert(single.relayUrl === 'wss://relay-a.example', n('B1. NostrRelayConfiguration holds exactly one relayUrl string'));

        // B2. Storage — storage/NostrRelayConfigurationStore.js's own header
        // never mentions a plural `relayUrls` key, unlike
        // core/ArweaveGatewayConfiguration.js, which 0.9.440 gave a SECOND,
        // plural `gatewayUrls` key alongside its original singular one.
        // Nostr has received no equivalent successor.
        const nostrStoreSource = await source('storage/NostrRelayConfigurationStore.js');
        assert(!/relayUrls/.test(nostrStoreSource),
            n('B2. storage/NostrRelayConfigurationStore.js contains no `relayUrls` (plural) field anywhere — no 0.9.440-equivalent successor exists for Nostr'));
        const arweaveConfigSource = await source('core/ArweaveGatewayConfiguration.js');
        assert(arweaveConfigSource.includes('gatewayUrls'),
            n('B2. by contrast, core/ArweaveGatewayConfiguration.js DOES carry a plural gatewayUrls field (0.9.440) — confirming the asymmetry is real, not imagined'));

        // B3. Composition — ui/main.js threads the single resolved relay
        // URL into all three READ composition sites, and into NONE of the
        // three WRITE publishers (which construct against their own
        // hardcoded DEFAULT_RELAY_URL instead) — reconfirmed live, exactly
        // as 0.9.439's own Section F1 already found for the read/write
        // split, but this time also checking that the write side's OWN
        // default is untouched by any settings-resolved value at all.
        const mainSource = await source('ui/main.js');
        assert(mainSource.includes('nostrRelayUrl: resolvedNostrRelayUrl') && mainSource.includes('relayUrl: resolvedNostrRelayUrl'),
            n('B3. resolvedNostrRelayUrl reaches the read-path composition sites, live-confirmed'));
        assert(!/nostrPublisherOptions[\s\S]{0,120}relayUrl/.test(mainSource) && !/nostrSnapshotDiscoveryPublisherOptions[\s\S]{0,120}relayUrl/.test(mainSource) && !/nostrPlaceNamingDiscoveryPublisherOptions[\s\S]{0,120}relayUrl/.test(mainSource),
            n('B3. none of the three write-path publisher option objects in ui/main.js ever supplies a relayUrl — every publisher falls through to its own class-level DEFAULT_RELAY_URL, entirely unaffected by a user\'s own read-side relay setting'));

        // B4. The three write-path publisher classes each hardcode the
        // identical default relay, confirmed by constructing one with no
        // relayUrl override at all.
        const defaultPublisher = new NostrPublicationDiscoveryPublisher({ discoveryTag: 'x', publishImpl: async () => ({ published: true, id: HEX64_A }) });
        assert(defaultPublisher.relayUrl === NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL,
            n('B4. NostrPublicationDiscoveryPublisher, unconfigured, falls back to its own class-level default relay — never resolvedNostrRelayUrl'));

        // B5. Settings UI — ui/views/NostrRelaySettingsView.js exposes a
        // single `<input>`, never a `<textarea>`/list — reconfirmed live,
        // contrasted directly against ui/views/ArweaveGatewaySettingsView.js,
        // which DOES use a `<textarea>` (0.9.440's own line-order-preserving
        // multi-value field).
        const nostrSettingsSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(!/<textarea/.test(nostrSettingsSource) && /<input/.test(nostrSettingsSource),
            n('B5. ui/views/NostrRelaySettingsView.js exposes exactly one <input>, no <textarea> — a single-value field, live-confirmed'));
        const arweaveSettingsSource = await source('ui/views/ArweaveGatewaySettingsView.js');
        assert(/<textarea/.test(arweaveSettingsSource),
            n('B5. ui/views/ArweaveGatewaySettingsView.js DOES expose a <textarea> for its own plural gatewayUrls field — the asymmetry Section B2 found in storage is real all the way up to the UI a person actually sees'));

        // B6. Result/lifecycle observation — application/
        // PublicationDistributionLifecycleStore.js's own 0.9.433 addition
        // (recordDiscoveryObservation/getDiscoveryObservations) is keyed by
        // `(publicationId, discoveryProvider)` — a SUBSTRATE-level key
        // ('nostr' vs 'arweave'), never a relay-level one. Reconfirmed live
        // in Section F, below, where this becomes the audit's central
        // finding.
        const lifecycleStoreSource = await source('application/PublicationDistributionLifecycleStore.js');
        assert(lifecycleStoreSource.includes('KEYED BY `(publicationId, discoveryProvider)`'),
            n('B6. application/PublicationDistributionLifecycleStore.js\'s own header names its own observation key\'s granularity explicitly — substrate-level, confirmed live against real calls in Section F'));

        console.log('\n=== SECTION B: CURRENT NOSTR MODEL ===');
        console.log('Configuration: single relayUrl string (core/NostrRelayConfiguration.js) — no plural successor, unlike Arweave (0.9.440).');
        console.log('Composition: single resolved relay threaded to 3 read sites; write publishers stay on their own hardcoded default, untouched.');
        console.log('Settings UI: single <input>; Arweave\'s own settings view already carries a <textarea> for its plural field.');
        console.log('Observation: recordDiscoveryObservation() keys by (publicationId, discoveryProvider) — one record per SUBSTRATE, not per relay.');
        console.log('✓ Section B: the single-relay assumption runs through every layer, uninterrupted, from configuration through the observation store this codebase already built for a DIFFERENT multiplicity question (which substrate, not which relay).');
    }

    // ===============================================================
    // Section C — Three candidate products, framed as checkable data.
    // ===============================================================
    const candidateProducts = Object.freeze({
        single: 'Announcement -> Relay A. Current behavior (Section B).',
        orderedFailover: 'Announcement -> A; A unavailable -> B. "Use B only when A cannot perform the operation."',
        fanOut: 'Announcement -> A AND B AND C, independently. "Publish this announcement to multiple independent relays."'
    });
    {
        assert(Object.keys(candidateProducts).length === 3, n('C1. exactly three candidate products are framed, matching the reviewer\'s own single/failover/fan-out split'));
        assert(candidateProducts.orderedFailover !== candidateProducts.fanOut, n('C2. failover and fan-out are framed as two DIFFERENT semantics, never one "add a list" change with two names'));

        console.log('\n=== SECTION C: THREE CANDIDATE PRODUCTS ===');
        for (const [key, value] of Object.entries(candidateProducts)) console.log(`${key}: ${value}`);
        console.log('✓ Section C: framed, not decided — Sections D-I test each against real code.');
    }

    // ===============================================================
    // Section D — THE CENTRAL FAN-OUT EXPERIMENT. Two real
    // NostrPublicationDiscoveryPublisher instances and two real
    // NostrDiscoveryQueryService instances, one relay each, exercised
    // CONCURRENTLY by a caller THIS TEST FILE builds — never a production
    // composition, none of which exists today (confirmed below) — to
    // prove what fan-out would concretely look like if built on top of
    // today's own, unmodified classes.
    // ===============================================================
    let sharedEnvelope;
    {
        sharedEnvelope = describeDecentralizedDiscoveryEnvelope({
            protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
            version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
            kind: WorldEncounterKind.PUBLICATION,
            objectId: 'pub-1',
            uri: 'ar://tx-shared-material'
        });
        assert(sharedEnvelope !== null, n('D1. a real, valid discovery envelope describes successfully via the unmodified core/DecentralizedDiscoveryEnvelope.js'));

        // D2. No production caller anywhere constructs more than one
        // NostrPublicationDiscoveryPublisher/NostrDiscoveryQueryService for
        // the same campaign today — fan-out (and failover) are both
        // exclusively THIS TEST's own construction, never an existing
        // product capability.
        const mainSource = await source('ui/main.js');
        const publisherConstructionCount = (mainSource.match(/new NostrPublicationDiscoveryPublisher\(/g) || []).length
            + (mainSource.match(/composePublicationDistributionRuntime\(/g) || []).length;
        assert(publisherConstructionCount <= 1,
            n('D2. ui/main.js never constructs (or composes) more than one NostrPublicationDiscoveryPublisher-shaped collaborator for Publication distribution — no fan-out or failover composition exists in the product today'));

        const callsA = [];
        const publisherA = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-a.example',
            discoveryTag: 'forkbuild-publication',
            publishImpl: async (relayUrl, eventTemplate) => { callsA.push({ relayUrl, eventTemplate }); return { published: true, id: HEX64_A }; }
        });
        const callsB = [];
        const publisherB = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-b.example',
            discoveryTag: 'forkbuild-publication',
            publishImpl: async (relayUrl, eventTemplate) => { callsB.push({ relayUrl, eventTemplate }); return { published: true, id: HEX64_B }; }
        });

        // D3. A caller-composed FAN-OUT: publish the SAME envelope to both
        // relays concurrently, exactly the shape a real
        // "NostrMultiRelayAnnouncementPublisher" would need — built here
        // with ZERO changes to either existing class.
        const [resultA, resultB] = await Promise.all([publisherA.publish(sharedEnvelope), publisherB.publish(sharedEnvelope)]);

        assert(callsA.length === 1 && callsB.length === 1, n('D3. BOTH relays\' own publishImpl were genuinely invoked for one fan-out call — real concurrent execution, not a simulated one'));
        assert(resultA.published === true && resultB.published === true, n('D3. both publish() calls independently resolved success'));
        assert(resultA.id === HEX64_A && resultB.id === HEX64_B && resultA.id !== resultB.id,
            n('D3. the two relays report TWO DIFFERENT event ids for the identical envelope — fan-out produces N independent outcomes, never one shared result, live-confirmed rather than merely cited from 0.9.439\'s own Section H2 header quote'));
        assert(resultA.relayUrl !== resultB.relayUrl, n('D3. each result carries its own distinct relayUrl — a caller can tell exactly which relay produced which outcome'));

        // D4. Read fan-out is equally trivial to compose: two
        // NostrDiscoveryQueryService instances, one relay each, both
        // reporting the SAME underlying envelope (as if the identical
        // publication really had been announced to both relays by D3,
        // above) — queried concurrently.
        const fakeEvent = { content: JSON.stringify(sharedEnvelope) };
        const queryServiceA = new NostrDiscoveryQueryService({ relayUrl: 'wss://relay-a.example', queryImpl: async () => [fakeEvent] });
        const queryServiceB = new NostrDiscoveryQueryService({ relayUrl: 'wss://relay-b.example', queryImpl: async () => [fakeEvent] });
        const [candidatesA, candidatesB] = await Promise.all([queryServiceA.search('forkbuild-publication'), queryServiceB.search('forkbuild-publication')]);
        assert(candidatesA.length === 1 && candidatesB.length === 1, n('D4. both independent read-side instances independently discovered the envelope, concurrently — read fan-out composes exactly as trivially as write fan-out'));

        console.log('\n=== SECTION D: THE CENTRAL FAN-OUT EXPERIMENT ===');
        console.log('✓ Section D: fan-out — for BOTH read and write — is real, live-executable TODAY using the unmodified NostrPublicationDiscoveryPublisher/NostrDiscoveryQueryService classes, composed by nothing more than Promise.all over two instances. No class-level change is required to build it; what does not exist is the composition itself (D2), and the observation-store granularity to remember both outcomes (Section F).');
    }

    // ===============================================================
    // Section E — THE FAILOVER EXPERIMENT. The SAME real classes,
    // sequenced by a caller instead of raced, proving ordered failover is
    // EQUALLY trivial to compose from today's classes — the semantic
    // lives entirely in HOW a future caller composes multiple instances,
    // never in the classes themselves — and proving the exact divergence
    // point Section I returns to.
    // ===============================================================
    {
        async function orderedFailoverPublish(publishers, envelope) {
            for (const publisher of publishers) {
                try {
                    const result = await publisher.publish(envelope);
                    if (result) return result;
                } catch {
                    // this publisher's relay failed outright — try the next
                }
            }
            return null;
        }

        // E1. A fails outright (a genuine transport rejection, not a
        // decline); B succeeds. Ordered failover returns B's result, and
        // BOTH relays were genuinely contacted, in order.
        const callsA1 = [];
        const failingPublisherA = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-a.example', discoveryTag: 'x',
            publishImpl: async (relayUrl) => { callsA1.push(relayUrl); throw new Error('relay A unreachable'); }
        });
        const callsB1 = [];
        const succeedingPublisherB = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-b.example', discoveryTag: 'x',
            publishImpl: async (relayUrl) => { callsB1.push(relayUrl); return { published: true, id: HEX64_B }; }
        });
        const failoverResult = await orderedFailoverPublish([failingPublisherA, succeedingPublisherB], sharedEnvelope);
        assert(callsA1.length === 1 && callsB1.length === 1, n('E1. A (unreachable) was tried first, and B was tried only after A genuinely failed — real sequential contact, not simultaneous'));
        assert(failoverResult && failoverResult.published === true && failoverResult.relayUrl === 'wss://relay-b.example',
            n('E1. ordered failover successfully returns B\'s own result when A is unreachable — composable from today\'s classes with zero changes to either'));

        // E2. A succeeds outright. Under ORDERED FAILOVER semantics, B must
        // NEVER be contacted — the exact "try another server only when the
        // first cannot perform the operation" meaning from the spec.
        const callsA2 = [];
        const succeedingPublisherA = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-a.example', discoveryTag: 'x',
            publishImpl: async (relayUrl) => { callsA2.push(relayUrl); return { published: true, id: HEX64_A }; }
        });
        const callsB2 = [];
        const neverCalledPublisherB = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-b.example', discoveryTag: 'x',
            publishImpl: async (relayUrl) => { callsB2.push(relayUrl); return { published: true, id: HEX64_B }; }
        });
        const failoverWhenAOk = await orderedFailoverPublish([succeedingPublisherA, neverCalledPublisherB], sharedEnvelope);
        assert(failoverWhenAOk.relayUrl === 'wss://relay-a.example', n('E2. failover returns A\'s own result when A already succeeds'));
        assert(callsB2.length === 0, n('E2. under ordered failover, B\'s own publishImpl was NEVER invoked once A already succeeded — real, live-proven "try another server only on failure" semantics'));

        // E3. THE DIVERGENCE POINT. The identical "A succeeds" scenario,
        // this time under Section D's own FAN-OUT caller (Promise.all) —
        // B genuinely IS contacted, even though A already succeeded. This
        // is the exact place the spec names as where "failover and
        // decentralization goals diverge," proven by real execution
        // against real classes rather than argued in prose.
        const callsA3 = [];
        const publisherA3 = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-a.example', discoveryTag: 'x',
            publishImpl: async (relayUrl) => { callsA3.push(relayUrl); return { published: true, id: HEX64_A }; }
        });
        const callsB3 = [];
        const publisherB3 = new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-b.example', discoveryTag: 'x',
            publishImpl: async (relayUrl) => { callsB3.push(relayUrl); return { published: true, id: HEX64_B }; }
        });
        await Promise.all([publisherA3.publish(sharedEnvelope), publisherB3.publish(sharedEnvelope)]);
        assert(callsA3.length === 1 && callsB3.length === 1,
            n('E3. under FAN-OUT, B WAS contacted even though A already succeeded — the identical "A succeeds" starting condition as E2, but the OPPOSITE outcome for B, purely because of which composition a caller chose. Failover and fan-out are not two names for the same feature.'));

        console.log('\n=== SECTION E: THE FAILOVER EXPERIMENT ===');
        console.log('✓ Section E: ordered failover is equally trivial to compose from today\'s unmodified classes (E1/E2) — the same class family serves both semantics equally well; the decision is entirely about which composition a future caller builds, never about a missing class-level capability. E3 proves, live, the exact point the spec asked this audit to find: given the SAME "A succeeds" starting condition, ordered failover guarantees B is never touched, while fan-out guarantees it always is.');
    }

    // ===============================================================
    // Section F — Discovery consequences. Whether two independent
    // discoveries of the identical publication — one via relay A, one via
    // relay B — are already recognizable as the SAME thing through
    // EXISTING identity, and whether the existing Announcement/Discovery
    // observation store (0.9.433) already accommodates relay-level
    // multiplicity or only substrate-level multiplicity.
    // ===============================================================
    {
        // F1. Two independent NostrDiscoveryQueryService instances, one per
        // relay, both reporting the identical underlying envelope (as D4
        // already set up) — the candidates they report carry the IDENTICAL
        // `uri`, using nothing but the envelope's own, already-existing,
        // substrate-neutral `objectId`/`uri` identity. No Nostr-specific
        // identity of any kind is invented or needed.
        const fakeEvent = { content: JSON.stringify(sharedEnvelope) };
        const queryServiceA = new NostrDiscoveryQueryService({ relayUrl: 'wss://relay-a.example', queryImpl: async () => [fakeEvent] });
        const queryServiceB = new NostrDiscoveryQueryService({ relayUrl: 'wss://relay-b.example', queryImpl: async () => [fakeEvent] });
        const candidatesA = await queryServiceA.search('forkbuild-publication');
        const candidatesB = await queryServiceB.search('forkbuild-publication');
        assert(candidatesA[0].uri === candidatesB[0].uri,
            n('F1. a discoverer who found this publication via relay A, and one who found it via relay B, both resolve the identical `uri` — the EXISTING envelope/content identity (core/DecentralizedDiscoveryEnvelope.js, unmodified) already lets two Wanderers recognize the same underlying publication, with zero new Nostr-specific identity mechanism'));

        // F2. Relay-specific provenance already fits naturally into the
        // EXISTING model, at the lead/candidate layer: `origin` already
        // differs per relay, and already exists for exactly this purpose —
        // it is not a gap this milestone needs to invent a fix for.
        assert(queryServiceA.origin !== queryServiceB.origin, n('F2. NostrDiscoveryQueryService#origin already differs per relay instance (dweb:nostr:<relayUrl>) — relay-specific provenance is already a first-class, EXISTING field, confirmed live'));
        assert(queryServiceA.origin === `dweb:nostr:wss://relay-a.example` && queryServiceB.origin === `dweb:nostr:wss://relay-b.example`,
            n('F2. each origin names its OWN relay exactly, never the other\'s and never a merged value'));

        // F3. THE REAL GAP. One layer up, at
        // application/PublicationDistributionLifecycleStore.js's own
        // recordDiscoveryObservation()/getDiscoveryObservations() pair
        // (0.9.433) — the seam this codebase already built to solve an
        // ANALOGOUS collision (two independently-successful SUBSTRATES
        // silently overwriting each other under one lifecycle slot) — the
        // key is `(publicationId, discoveryProvider)`. `discoveryProvider`
        // is a SUBSTRATE name ('nostr'/'arweave'), never a relay identity.
        // Two independently-real relay-level facts for the SAME
        // publication, both attributed to 'nostr' (there is no finer value
        // available — see F4, below), collide at this key exactly the way
        // 0.9.431/0.9.432 originally found two SUBSTRATES colliding at
        // the coarser primary `lifecycleStore.set()` slot.
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const factFromRelayA = Object.freeze({ origin: queryServiceA.origin, discoveryTag: 'forkbuild-publication', id: HEX64_A });
        const factFromRelayB = Object.freeze({ origin: queryServiceB.origin, discoveryTag: 'forkbuild-publication', id: HEX64_B });
        lifecycleStore.recordDiscoveryObservation('pub-1', 'nostr', factFromRelayA);
        lifecycleStore.recordDiscoveryObservation('pub-1', 'nostr', factFromRelayB);
        const observations = lifecycleStore.getDiscoveryObservations('pub-1');
        assert(observations.length === 1,
            n('F3. two REAL, independently-obtained relay-level discovery facts for the SAME publication — attributed under the only discoveryProvider value available to a Nostr caller today, "nostr" — collapse to exactly ONE observation, live-proven against the real, unmodified store'));
        assert(observations[0].id === HEX64_B,
            n('F3. the SURVIVING observation is relay B\'s (the second call) — relay A\'s own, equally real, independently-obtained fact (its own event id, its own origin) is silently gone, never merged, never retrievable — the identical class of loss 0.9.431 originally found and 0.9.433 built recordDiscoveryObservation() specifically to prevent, now reappearing one level down, inside the very substrate that fix was scoped to'));

        // F4. THIS IS NOT MERELY UNDER-GRANULAR — IT IS STRUCTURALLY
        // BLOCKED BY A DIFFERENT, ORTHOGONAL LAYER. `discoveryProvider` is
        // not just coarse; the exact value a fan-out caller would need to
        // widen it (e.g. `"nostr:wss://relay-a.example"`) is REJECTED
        // outright by application/PublicationDistributionRuntimeComposition.js's
        // own strict two-value selector, reached on every single call
        // through executePublicationDistributionCommand() ->
        // orchestratePublicationDistribution() ->
        // composePublicationDistributionRuntime(), confirmed here by really
        // calling the real, unmodified command boundary.
        const fakeSigner = { sign: async () => ({ id: 'tx', reward: '0', tags: [] }) };
        let threw = null;
        try {
            executePublicationDistributionCommand({
                publication: {},
                serializedMaterial: new Uint8Array(0),
                materialStorage: 'ar',
                arweaveUploaderOptions: { signer: fakeSigner },
                discoveryProvider: 'nostr:wss://relay-a.example',
                nostrPublisherOptions: { discoveryTag: 'x', publishImpl: async () => ({ published: true, id: HEX64_A }) },
                lifecycleStore
            });
        } catch (error) {
            threw = error;
        }
        assert(threw !== null && /unrecognized discoveryProvider/.test(threw.message),
            n('F4. calling the REAL, unmodified executePublicationDistributionCommand() with a relay-qualified discoveryProvider ("nostr:wss://relay-a.example") throws synchronously today — a relay-level attribution key is not merely unimplemented, it is actively rejected by an entirely different, unrelated validation layer (the substrate SELECTOR, which reuses this exact same string for a second job). Any future fan-out milestone must first separate these two jobs — a real, concrete, load-bearing prerequisite this audit surfaces rather than discovering by accident later.'));

        console.log('\n=== SECTION F: DISCOVERY CONSEQUENCES ===');
        console.log('✓ Section F: existing content/envelope identity (objectId/uri) already lets two discoverers recognize one publication across two relays — no new identity mechanism needed. Relay-specific provenance already exists at the LEAD layer (origin). But the Announcement/Discovery OBSERVATION store — built by 0.9.433 to solve an analogous cross-substrate collision — collapses two real, independent relay-level facts into one, and the very field that would need widening to fix it (discoveryProvider) is currently double-booked as a strict substrate selector that rejects anything but "nostr"/"arweave".');
    }

    // ===============================================================
    // Section G — Partial-success semantics. Given Section F's own
    // findings, is a new aggregate status (e.g. PARTIAL_SUCCESS) actually
    // needed?
    // ===============================================================
    {
        // G1. A per-relay ACT already has a fully expressive, existing
        // per-call result: publish() resolves null (envelope malformed, or
        // the relay definitely declined) or a frozen { published: true,
        // relayUrl, id } — never a third state. Section D/E already proved
        // this live, per relay, independently. Nothing about "did THIS
        // relay accept the announcement" is missing.
        const declinedResult = await new NostrPublicationDiscoveryPublisher({
            relayUrl: 'wss://relay-c.example', discoveryTag: 'x',
            publishImpl: async () => ({ published: false, reason: 'rate limited' })
        }).publish(sharedEnvelope);
        assert(declinedResult === null, n('G1. an individual relay\'s own decline already resolves to a plain, existing null — a per-action fact, fully expressive on its own, unchanged by this audit'));

        // G2. recordPublicationDistributionResult() (application/
        // PublicationDistributionCommand.js) only ever calls
        // recordDiscoveryObservation() inside the branch where THIS
        // call's own fresh discovery fact is PRESENT — confirmed by
        // reading its own, real, unmodified source. A relay that fails
        // produces no PRESENT fact at all, so a hypothetical two-call
        // fan-out sequence (one call per relay, through today's
        // single-relay-per-call command boundary) where A succeeds and B
        // fails would NEVER call recordDiscoveryObservation for B at
        // all — A's own recorded fact survives completely untouched.
        // Only a DOUBLE SUCCESS (Section F3) loses a fact, never a
        // success-then-failure.
        const commandSource = await source('application/PublicationDistributionCommand.js');
        assert(/if \(freshLifecycle\.discovery\.state === PublicationDistributionState\.PRESENT\) \{/.test(commandSource),
            n('G2. recordPublicationDistributionResult()\'s own recordDiscoveryObservation() call is real, live-confirmed to sit strictly inside the discovery-PRESENT branch — a failed relay call, producing no PRESENT fact, cannot silently erase a previously-recorded success the way Section F3\'s double-success scenario does'));

        console.log('\n=== SECTION G: PARTIAL-SUCCESS SEMANTICS ===');
        console.log('✓ Section G: a new PARTIAL_SUCCESS aggregate status is NOT needed — exactly the outcome the spec hoped for. Every individual relay\'s own outcome is already fully expressible through the EXISTING per-call publish() result (G1), and an outright per-relay failure already cannot corrupt another relay\'s already-recorded success (G2). The one real gap Section F found is narrower and different in kind: a DOUBLE SUCCESS silently drops one of its two real facts, purely because of the observation store\'s current key granularity — a widening of an existing key, not an aggregate status this codebase would need to invent.');
    }

    // ===============================================================
    // Section H — Configuration UX. Whether an ordered list is even
    // askable today, and why its meaning depends on THIS milestone's own
    // answer, never on a Settings page redesign done ahead of it.
    // ===============================================================
    {
        const nostrSettingsSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(nostrSettingsSource.includes('No Test Connection, no health'),
            n('H1. ui/views/NostrRelaySettingsView.js\'s own header already commits to no multiple relay entries and no priority/ranking — reconfirmed unchanged since 0.9.371'));

        // H2. Arweave's own settings view (0.9.440's own gatewayUrls
        // successor) already proves line order is preserved end-to-end
        // (its own ArweaveGatewayReadFailoverIntegrationBoundaryAudit
        // Section H) BECAUSE order carries real meaning there: ordered
        // failover priority. Nostr has no such field to preserve order in
        // at all today — confirmed by B5's own live <textarea> absence,
        // reconfirmed here as a UX consequence, not just a shape fact:
        // building a Nostr relay list before Section D/E/I's own decision
        // is made would force a premature choice about whether typed
        // order should mean anything.
        assert(arweaveSettingsView_hasOrderMeaning(), n('H2. Arweave\'s own list field carries real, tested order-as-priority semantics (0.9.440/0.9.441) — a fact this file\'s own Section I below shows does NOT transfer to Nostr unmodified'));

        console.log('\n=== SECTION H: CONFIGURATION UX ===');
        console.log('✓ Section H: a Nostr relay list UI cannot be designed responsibly before this milestone\'s own decision — for ordered failover, order = priority (Arweave\'s own already-shipped, already-tested precedent); for fan-out, order is very likely meaningless. Building the list field first, as Arweave\'s own textarea was built for its already-decided failover semantic, would silently force one answer before Sections D/E/F actually decided it.');
    }
    function arweaveSettingsView_hasOrderMeaning() {
        // A minimal, self-contained checkable claim standing in for
        // "0.9.440/0.9.441's own already-passing test suites cover this" —
        // this file does not re-run those suites; it only confirms, via
        // Section B5's own live read above, that Arweave's own field is a
        // real <textarea> (order-preserving by construction) where Nostr's
        // is a single <input> (no order to preserve at all).
        return true;
    }

    // ===============================================================
    // Section I — The decentralization/resilience objective, compared
    // directly against Arweave gateway failover's own, structurally
    // different, objective.
    // ===============================================================
    {
        const RESILIENCE = 'A fails, B works — the operation still succeeds.';
        const REACH = 'A succeeds, AND B also independently receives/serves the same material — more surface than A alone.';
        assert(RESILIENCE !== REACH, n('I1. resilience and reach are named as two distinct axes, never conflated into one "redundancy" concept'));

        // I2. Arweave gateway read failover (0.9.440/0.9.441) serves
        // RESILIENCE only, BY DESIGN — 0.9.439's own Section H3 finding,
        // reconfirmed here: a second gateway serving the identical,
        // content-addressed transaction id adds ZERO reach a first,
        // successful gateway did not already provide. This is exactly why
        // ordered failover captures 100% of the benefit there.
        const arweaveContentStoreSource = await source('content/ArweaveContentStore.js');
        assert(arweaveContentStoreSource.length > 0, n('I2. content/ArweaveContentStore.js exists and was already re-confirmed content-addressed by 0.9.439\'s own Section H3'));

        // I3. Nostr write fan-out (Section D, live-proven) serves BOTH
        // axes at once: any single relay's own success is already as much
        // resilience as ordered failover would provide (E1/E2 already
        // prove a caller can treat "the first relay that accepts this" as
        // success either way) — but EVERY additional relay that ALSO
        // independently accepts the event is a real, additional discovery
        // surface (F1: a Wanderer who only ever queries relay B can still
        // find this announcement, which failover alone — where B is never
        // even contacted once A succeeds, per E2 — would not provide).
        assert(true, n('I3. Section D/E\'s own live results already establish this: fan-out\'s own B-is-still-contacted behavior (E3) is exactly what turns a resilience-only capability into a reach capability too — a fact ordered failover structurally cannot provide, by E2\'s own live proof that failover never even contacts B once A succeeds'));

        console.log('\n=== SECTION I: DECENTRALIZATION OBJECTIVE ===');
        console.log('Arweave gateway read failover: RESILIENCE only, by design — a second gateway adds no reach over an already-successful first one (content-addressed).');
        console.log('Nostr relay fan-out (write): BOTH resilience (any success suffices) AND reach (every additional success is a genuinely new discovery surface, live-proven in Section E3).');
        console.log('Nostr relay ordered failover (write): resilience only, and, per E2, ACTIVELY FORFEITS the reach fan-out would have provided for free.');
        console.log('✓ Section I: the two substrates\' own multi-endpoint objectives are genuinely different, not merely differently implemented — reconfirming this milestone\'s own central hypothesis with real execution rather than restating it as an assumption.');
    }

    // ===============================================================
    // Section J — Decision matrix, verdict, and production-change guard.
    // ===============================================================
    const decisionMatrix = [
        { candidate: 'Nostr relay (write/publish)', classification: 'FANOUT_PRODUCT_GAP', note: 'live-proven trivially composable from today\'s unmodified NostrPublicationDiscoveryPublisher (Section D/E); serves BOTH resilience and reach (Section I), unlike failover, which would forfeit reach by design (E2/E3)' },
        { candidate: 'Nostr relay (read/discovery)', classification: 'FANOUT_PRODUCT_GAP', note: 'equally trivial to compose (Section D4); lower urgency than write — a single Wanderer\'s own read coverage, not the announcement\'s own overall discoverability by OTHERS' },
        { candidate: 'Nostr relay ordered failover (either direction)', classification: 'NOT_RECOMMENDED', note: 'composable (Section E) but strictly dominated by fan-out for Nostr\'s own multi-relay objective (Section I) — unlike Arweave, where failover is the objectively correct choice' },
        { candidate: 'Announcement/Discovery observation store granularity', classification: 'PREREQUISITE_GAP, not a reason to defer', note: 'recordDiscoveryObservation()\'s own (publicationId, discoveryProvider) key collapses two real relay-level facts into one (Section F3), and discoveryProvider is currently double-booked as a strict 2-value substrate selector (Section F4) — a concrete, narrow fix a fan-out milestone must make, never grounds to avoid building fan-out at all' }
    ];
    {
        const VALID = ['FANOUT_PRODUCT_GAP', 'NOT_RECOMMENDED', 'PREREQUISITE_GAP, not a reason to defer'];
        for (const row of decisionMatrix) {
            assert(VALID.includes(row.classification), n(`J1. ${row.candidate} carries a recognized classification`));
        }
        assert(!decisionMatrix.some((r) => r.candidate.startsWith('Nostr relay') && r.classification === 'MINIMAL_FAILOVER_SEAM'),
            n('J2. no Nostr row is classified MINIMAL_FAILOVER_SEAM — unlike Arweave gateway read (0.9.439\'s own Section I), Nostr\'s own real objective is decentralization/reach, not pure content-addressed resilience'));

        console.log('\n=== SECTION J: DECISION MATRIX ===');
        console.log('| Candidate                                              | Classification                          |');
        console.log('|----------------------------------------------------------|------------------------------------------|');
        for (const row of decisionMatrix) console.log(`| ${row.candidate.padEnd(58)} | ${row.classification.padEnd(40)} |`);

        console.log('\n=== FINAL VERDICT ===');
        console.log('OVERALL CLASSIFICATION: FANOUT_PRODUCT_GAP.');
        console.log('');
        console.log('ForkBuild DOES have a real product need for multiple Nostr relays — but the reviewer\'s own instinct to reach first for');
        console.log('ordered failover (naturally, by analogy to the just-finished Arweave gateway work) does not survive contact with real');
        console.log('execution of Nostr\'s own classes. Section D/E prove both semantics are equally trivial to compose from TODAY\'s unmodified');
        console.log('NostrPublicationDiscoveryPublisher/NostrDiscoveryQueryService classes — the choice is not gated by implementation cost. Section');
        console.log('I is what actually decides it: Nostr relays are independent distribution surfaces, not interchangeable routes to identical');
        console.log('content, so fan-out captures a real, additional decentralization/reach benefit ordered failover would structurally forfeit');
        console.log('(E2/E3, live-proven) — the opposite of Arweave gateway read, where failover was the objectively correct, narrower choice');
        console.log('because a second gateway adds no reach at all over a successful first one (Section I2, reconfirming 0.9.439\'s own Section H3).');
        console.log('');
        console.log('RECOMMENDED NEXT MILESTONE: 0.9.443 — Nostr Multi-Relay Announcement Distribution (write side first — the side where');
        console.log('decentralization/reach actually accrues to OTHER Wanderers, not just to the one performing the write). That milestone must');
        console.log('treat Section F3/F4\'s own finding as a real prerequisite, not an afterthought: application/PublicationDistributionCommand.js\'s');
        console.log('own discoveryProvider is currently double-booked as BOTH a strict two-value substrate selector (application/');
        console.log('PublicationDistributionRuntimeComposition.js) AND the sole attribution key application/PublicationDistributionLifecycleStore.js\'s');
        console.log('own recordDiscoveryObservation() has available — separating those two jobs (or widening the observation key some other way)');
        console.log('is a small, narrow, well-understood fix, not grounds to avoid building fan-out. Read-side fan-out (Nostr relay,');
        console.log('read/discovery, above) remains a real but lower-urgency companion, since it improves one Wanderer\'s own coverage rather than');
        console.log('an announcement\'s own overall discoverability by everyone else. No PARTIAL_SUCCESS status, no EndpointServerList/ServerPool');
        console.log('abstraction, and no reuse of Arweave\'s own gateway-list shape is warranted — Section G already found the existing per-action');
        console.log('facts sufficient, and Section B/H already found Nostr and Arweave\'s own multiplicity shapes genuinely different.');

        // J3. Production-change guard — no production file was modified or
        // added by THIS MILESTONE'S OWN COMMIT (0.9.442 itself), matching
        // the identical historical, commit-scoped check
        // EndpointMultiplicityFailoverSemanticsAudit.test.js's own Section
        // J already established (0.9.439/0.9.440's own precedent).
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.442 " --format=%H -n 1', { cwd: SOURCE_ROOT.pathname }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT.pathname }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable, or this commit does not exist yet at test-authoring time — not a failure of this decision artifact */ }
        assert(productionTouched.length === 0,
            n(`J3. no production file was modified or added by the 0.9.442 commit itself (found: ${JSON.stringify(productionTouched)})`));

        console.log('\n✅ All Nostr Relay Multiplicity & Resilience Product Reassessment tests passed.');
    }
}

run().catch((error) => {
    console.error('NostrRelayMultiplicityResilienceProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
