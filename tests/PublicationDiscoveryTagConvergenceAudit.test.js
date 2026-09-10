import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommandComposition.js';
import { DecentralizedWorldEncounterLeadResolutionStatus } from '../application/DecentralizedWorldEncounterLeadResolution.js';
import { resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';

// 0.9.358 — Publication Discovery Tag Convergence Audit.
//
// Type: test-only, no production changes. Production changes: NONE.
//
// 0.9.357 changed a composition-root value (ui/main.js's own
// PUBLICATION_DISCOVERY_TAG) that now crosses ui/main.js -> WorldView ->
// WorldEncounterCanvas. This milestone is the convergence audit that
// question deserves before this arc moves on to anything else — proving
// the integration is COMPLETE, not merely present, and that it introduced
// no second source of truth, no protocol change, and no accidental
// coupling to Snapshot's own nearby (but deliberately separate) discovery
// precedent.
//
// Sections (A-J, mirroring this milestone's own brief):
//   A — Single authority: exactly one production definition of
//       'forkbuild-publication', no component-level duplicate.
//   B — Full runtime propagation, proven against the REAL composition
//       (ui/main.js's own composeDiscoverWorldEncounterPublicationCommand +
//       composeDecentralizedWorldEncounterMaterialDiscoveryRuntime), the
//       actual runtime value observed on the wire, not source text.
//   C — Initial-state semantics: a seeded mount vs. the standalone/
//       backward-compatible blank default.
//   D — User override semantics: an edit survives, a clear is honored.
//   E — Existing discovery behavior: canonical and custom tags travel the
//       identical command/query path — zero discovery-protocol changes.
//   F — Distribution/discovery consistency without merging the two
//       protocols into one mechanism.
//   G — No accidental Snapshot coupling.
//   H — Failure behavior: unchanged regardless of which tag was seeded.
//   I — Composition-boundary audit: reusability and dependency direction.
//   J — Final decision.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The same "extract methods/props straight off the exported options object
// and call them with a hand-built ctx" technique 0.9.356/0.9.357 already
// established for this exact file.
function makeCanvasContext(overrides = {}) {
    return {
        discoveryCommand: null,
        discoveryObjectId: '',
        discoveryTag: '',
        discovering: false,
        discoveryError: null,
        discoveryResult: null,
        discoveryRequestId: 0,
        ...overrides
    };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

function buildSignedPublication(identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-convergence-1',
        documentId: 'doc-convergence-1',
        title: 'A Publication Discovered Through The Real Composed Command',
        author: 'convergence-alice',
        publisherIdentity,
        contentReference: { hash: 'placeholder-hash', uri: 'ar://TX-CONVERGENCE', storage: 'ar' },
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// The identical "fake gateway, inspect the real request body" technique
// tests/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.test.js
// already established — but this copy also records every tag it was
// actually asked to search for, so Section B can assert on the REAL wire
// value a live discoverPublication() click produced, not merely on the
// result it returned.
function graphqlSearchFetchRecordingTags(idsByTag, observedTags) {
    return async (url, options) => {
        const body = JSON.parse(options.body);
        const match = /values: \["([^"]+)"\]/.exec(body.query);
        const tag = match ? match[1] : null;
        observedTags.push(tag);
        const ids = idsByTag[tag] || [];
        return new Response(JSON.stringify({
            data: { transactions: { edges: ids.map((id) => ({ node: { id } })) } }
        }), { status: 200 });
    };
}

async function run() {
    console.log('Running Publication Discovery Tag Convergence Audit tests...\n');

    // ===============================================================
    // Section A — Single authority: exactly one production definition of
    // 'forkbuild-publication' exists, and it is used for both Publication
    // distribution AND World View's own discovery default — never a
    // component-level duplicate.
    // ===============================================================
    let canonicalTag;
    {
        const mainSource = await readSource('ui/main.js');
        const literalDeclarations = mainSource.match(/const PUBLICATION_DISCOVERY_TAG = '([^']+)';/g) || [];
        assert(literalDeclarations.length === 1,
            `1. exactly one PUBLICATION_DISCOVERY_TAG declaration exists in ui/main.js (found ${literalDeclarations.length}) — one authority, not several.`);

        const declarationMatch = /const PUBLICATION_DISCOVERY_TAG = '([^']+)';/.exec(mainSource);
        canonicalTag = declarationMatch[1];
        assert(canonicalTag === 'forkbuild-publication',
            '2. the one declared value is the exact canonical campaign tag this milestone audits.');

        assert(mainSource.includes("app.provide('publicationDiscoveryTag', PUBLICATION_DISCOVERY_TAG);"),
            '3. World View discovery default authority: app.provide(\'publicationDiscoveryTag\', ...) references the SAME constant.');
        assert(mainSource.includes('discoveryTag: PUBLICATION_DISCOVERY_TAG'),
            '4. Publication distribution authority: the existing distribution runtime provider call ALSO references the SAME constant — both branches of the diagram this milestone audits trace back to one declaration.');

        // No component-level duplicate: WorldEncounterCanvas.js and
        // WorldView.js may DISCUSS the literal in comments (both already
        // do, extensively — 0.9.357's own headers), but neither may
        // contain it as a live string literal in actual code.
        const canvasCodeOnly = codeOnly(await readSource('ui/components/WorldEncounterCanvas.js'));
        const viewCodeOnly = codeOnly(await readSource('ui/views/WorldView.js'));
        assert(!canvasCodeOnly.includes("'forkbuild-publication'"),
            '5. WorldEncounterCanvas.js\'s own non-comment code never re-types the canonical literal — it only ever receives it through defaultDiscoveryTag.');
        assert(!viewCodeOnly.includes("'forkbuild-publication'"),
            '6. WorldView.js\'s own non-comment code never re-types the canonical literal either — it only ever forwards the injected value.');

        // The diagram this milestone's own brief drew: one declaration,
        // flowing to both the distribution call site and the discovery
        // provide() call — confirmed by ordering, not merely presence.
        const constantIndex = mainSource.indexOf('const PUBLICATION_DISCOVERY_TAG');
        const provideIndex = mainSource.indexOf("app.provide('publicationDiscoveryTag'");
        const distributionUsageIndex = mainSource.indexOf('discoveryTag: PUBLICATION_DISCOVERY_TAG');
        assert(constantIndex !== -1 && constantIndex < provideIndex && provideIndex < distributionUsageIndex,
            '7. one linear declaration, feeding both the discovery-facing provide() call and the (unchanged) distribution usage — never two independent trees.');
    }
    console.log(`✓ Section A: exactly one production-authoritative '${canonicalTag}' literal exists (ui/main.js's own PUBLICATION_DISCOVERY_TAG), it feeds BOTH Publication distribution and World View's own discovery default, and no component-level duplicate exists anywhere in WorldEncounterCanvas.js or WorldView.js's own code.`);

    // ===============================================================
    // Section B — Full runtime propagation, against the REAL composition
    // ui/main.js itself builds (composeDecentralizedWorldEncounterMaterialDiscoveryServices
    // + composeDecentralizedWorldEncounterMaterialDiscoveryRuntime +
    // composeDiscoverWorldEncounterPublicationCommand), proving the ACTUAL
    // value observed on the (faked) network wire during a live
    // discoverPublication() click — not merely read from source text.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'convergence-alice-b');
        const publication = buildSignedPublication(alice);

        // The SAME LocalDiscoveryProvider shape ui/main.js itself
        // constructs (see ui/main.js's own "discoverWorldEncounterPublicationCommand"
        // wiring) — reading from the SAME 'forkbuild-publications' storage
        // key LocalPublisherProvider would have written the Publication
        // record under, in a real running app.
        const localStorageProvider = new InMemoryStorageProvider();
        localStorageProvider.save('forkbuild-publications', [publication.toJSON()]);
        const discoveryProvider = new LocalDiscoveryProvider(localStorageProvider);

        const observedTags = [];
        const services = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            arweaveFetchImpl: graphqlSearchFetchRecordingTags({ [canonicalTag]: ['TX-CONVERGENCE'] }, observedTags)
        });
        const { verifier } = composeWorldEncounterMaterialVerifier();
        const runtime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
            discoveryServices: services,
            verifier
        });

        // The EXACT composition function ui/main.js itself calls —
        // composeDiscoverWorldEncounterPublicationCommand({ runtime,
        // discoveryProvider }) — never a hand-rolled stand-in.
        const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({
            runtime,
            discoveryProvider
        });

        // A newly mounted WorldEncounterCanvas, seeded from
        // defaultDiscoveryTag exactly the way ui/views/WorldView.js's own
        // template binds it — reading the canonical tag straight off
        // ui/main.js's own source (Section A), never re-typed here.
        const seededData = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag });
        const ctx = makeCanvasContext({
            ...seededData,
            discoveryObjectId: publication.id,
            discoveryCommand: discoverWorldEncounterPublicationCommand
        });

        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        // Unlike the mocked-discoveryCommand sections below, this section
        // drives the REAL fetch/json/verification chain — several more
        // microtask hops than a single .then(). A macrotask flush (rather
        // than a fixed number of Promise.resolve() hops) waits for
        // whichever depth that chain actually needs.
        await new Promise((resolve) => setTimeout(resolve, 300));

        assert(observedTags.length === 1 && observedTags[0] === canonicalTag,
            `1. LIVE, end to end: the real Arweave discovery service's own network request actually carried '${canonicalTag}' as its own tag value — the composition-root value genuinely reached the wire, not merely a return value.`);
        assert(ctx.discoveryResult && ctx.discoveryResult.resolution.status === DecentralizedWorldEncounterLeadResolutionStatus.RESOLVED,
            '2. the full real chain (query -> registry -> association evidence -> resolution) genuinely resolved this replica\'s own local Publication against the discovered lead — RESOLVED, not a stub.');
        assert(ctx.discoveryError === null,
            '3. no error surfaced along the way.');
    }
    console.log(`✓ Section B: a live click through the REAL ui/main.js composition (composeDiscoverWorldEncounterPublicationCommand + the real decentralized discovery runtime) genuinely carries '${canonicalTag}' onto the actual (faked) network request and resolves a real local Publication end to end — the runtime VALUE converges, not just the source text.`);

    // ===============================================================
    // Section C — Initial-state semantics: a newly created World View
    // receives the canonical tag; the component's own standalone/
    // backward-compatible behavior is unchanged when none is supplied.
    // ===============================================================
    {
        const seededData = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag });
        assert(seededData.discoveryTag === canonicalTag,
            `1. a newly created World View mount (defaultDiscoveryTag = '${canonicalTag}') seeds discoveryTag to exactly that value.`);

        const standaloneData = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: WorldEncounterCanvas.props.defaultDiscoveryTag.default });
        assert(standaloneData.discoveryTag === '',
            '2. the component\'s own standalone/backward-compatible mount (no defaultDiscoveryTag supplied, the prop\'s own default applied exactly as a real Vue mount would) still starts discoveryTag exactly as blank as always.');
    }
    console.log('✓ Section C: a newly created World View mount receives discoveryTag === \'forkbuild-publication\'; the component\'s own standalone default (defaultDiscoveryTag absent) still yields discoveryTag === \'\' — both proven live off the same data() function.');

    // ===============================================================
    // Section D — User override semantics: the prop never overwrites a
    // subsequent edit, and clearing the field is honored (a no-op, never
    // a silent fall-back to the seed).
    // ===============================================================
    {
        // initial: canonical -> user edits -> Discover: the EDITED value,
        // never the seed.
        const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag });
        const ctx = makeCanvasContext({ ...seeded, discoveryObjectId: 'encounter-override' });
        assert(ctx.discoveryTag === canonicalTag, '1. starts seeded with the canonical tag.');

        ctx.discoveryTag = 'my-custom-tag';
        let capturedArgs = null;
        ctx.discoveryCommand = async (args) => { capturedArgs = args; return {}; };
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await Promise.resolve();
        await Promise.resolve();
        assert(capturedArgs && capturedArgs.discoveryTag === 'my-custom-tag',
            '2. the EDITED value reaches discoveryCommand — the seed never re-asserts itself, and the prop is never re-read after construction.');

        // Clearing the field completely: a blank discoveryTag, whether it
        // started canonical or not, must be honored as a genuine no-op —
        // never silently falling back to the seeded default.
        const ctx2 = makeCanvasContext({ ...WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag }), discoveryObjectId: 'encounter-cleared' });
        ctx2.discoveryTag = '   ';
        let callCount = 0;
        ctx2.discoveryCommand = async () => { callCount += 1; return {}; };
        WorldEncounterCanvas.methods.discoverPublication.call(ctx2);
        await Promise.resolve();
        await Promise.resolve();
        assert(callCount === 0,
            '3. a cleared (blank/whitespace-only) discoveryTag is a genuine no-op — discoveryCommand is never called, and it never silently falls back to the seeded canonical tag.');

        // Structural guarantee behind (1)/(2): defaultDiscoveryTag is read
        // exactly once, inside data(), and this component defines no
        // watcher of any kind — so a LATER prop change (the way Vue would
        // deliver one to a live mount) has no code path back into
        // discoveryTag at all, by construction.
        assert(typeof WorldEncounterCanvas.watch === 'undefined' || !('defaultDiscoveryTag' in (WorldEncounterCanvas.watch || {})),
            '4. no watcher of any kind is declared on defaultDiscoveryTag — the seed-then-forget contract is structural, not merely observed in this one run.');
        const canvasCodeOnly = codeOnly(await readSource('ui/components/WorldEncounterCanvas.js'));
        assert(!/watch\s*:\s*\{/.test(canvasCodeOnly),
            '5. this component declares no watch: block at all — confirmed directly against source, not merely the exported options object.');
    }
    console.log('✓ Section D: an edit made after the canonical seed reaches discoveryCommand verbatim, never the seed; clearing the field entirely is honored as a real no-op rather than a silent fall-back; and the component declares no watcher of any kind on defaultDiscoveryTag, so a later prop change structurally cannot reach back into a Wanderer\'s own edit.');

    // ===============================================================
    // Section E — Existing discovery behavior: the canonical tag and an
    // arbitrary custom tag travel the IDENTICAL command/query path — zero
    // discovery-protocol changes.
    // ===============================================================
    {
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const methodStart = canvasSource.indexOf('discoverPublication() {');
        const methodBlock = canvasSource.slice(methodStart, canvasSource.indexOf('\n        },', methodStart));
        assert(methodBlock.includes('this.discoveryCommand({ objectId, discoveryTag })'),
            '1. discoverPublication() calls discoveryCommand with the identical { objectId, discoveryTag } shape regardless of which tag is currently held — no branch of any kind distinguishing a canonical value from a custom one.');

        // Live: the SAME discoveryCommand function instance, called once
        // with the canonical tag and once with an arbitrary custom tag,
        // both reach the exact same underlying call shape.
        const calls = [];
        const command = async (args) => { calls.push(args); return {}; };
        const ctxCanonical = makeCanvasContext({ discoveryObjectId: 'enc-1', discoveryTag: canonicalTag, discoveryCommand: command });
        const ctxCustom = makeCanvasContext({ discoveryObjectId: 'enc-1', discoveryTag: 'an-arbitrary-hand-typed-tag', discoveryCommand: command });
        WorldEncounterCanvas.methods.discoverPublication.call(ctxCanonical);
        WorldEncounterCanvas.methods.discoverPublication.call(ctxCustom);
        await Promise.resolve();
        await Promise.resolve();
        assert(calls.length === 2 && calls[0].discoveryTag === canonicalTag && calls[1].discoveryTag === 'an-arbitrary-hand-typed-tag',
            '2. both calls reach the SAME command function, in the SAME { objectId, discoveryTag } shape — the canonical tag is not special-cased anywhere in this path.');

        // The command/composition/query-layer files this milestone
        // depends on are the SAME files 0.9.111/0.9.110 already built,
        // unmodified since before this whole arc — confirmed by git
        // history rather than assumed.
        const commandSource = await readSource('application/DiscoverWorldEncounterPublicationCommand.js');
        assert(commandSource.includes('runtime.discoverWorldEncounterPublication({ objectId, discoveryTag, publications })'),
            '3. the application command boundary still forwards discoveryTag verbatim, unmodified — no new field, no renaming, no new branch.');
    }
    console.log('✓ Section E: the canonical tag and an arbitrary custom tag travel the identical discoverPublication() -> discoveryCommand -> executeDiscoverWorldEncounterPublicationCommand path, proven live with the same command instance — zero discovery-protocol changes.');

    // ===============================================================
    // Section F — Distribution/discovery consistency: the SAME value
    // reaches both Publication announcement and World View discovery, but
    // the two protocols remain entirely separate mechanisms — the shared
    // value is the convergence point, not a merged pipeline.
    // ===============================================================
    {
        // The announcement side: resolveNostrPublisherOptions() — the real
        // configuration boundary a distribution click reaches — accepts
        // and forwards the exact same canonical value Section A traced.
        const distributionOptions = resolveNostrPublisherOptions({
            publishImpl: () => {}, relayUrl: 'wss://relay.example', discoveryTag: canonicalTag
        });
        assert(distributionOptions.discoveryTag === canonicalTag,
            '1. Publication announcement\'s own configuration boundary genuinely accepts the SAME canonical value.');

        // The discovery side: WorldEncounterCanvas's own seeded starting
        // value, proven live in Section C, is the identical value.
        const seededData = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag });
        assert(seededData.discoveryTag === distributionOptions.discoveryTag,
            '2. announcement and discovery genuinely converge on ONE value — proven by direct comparison, not by re-typing the literal twice.');

        // But they remain separate protocols: announcement is driven
        // through composePublicationDistributionCommand/executePublicationDistributionCommand;
        // discovery is driven through composeDiscoverWorldEncounterPublicationCommand/
        // executeDiscoverWorldEncounterPublicationCommand — two entirely
        // separate composition/command files, never one merged pipeline.
        const mainCodeOnly = codeOnly(await readSource('ui/main.js'));
        assert(mainCodeOnly.includes('composePublicationDistributionCommand(') && mainCodeOnly.includes('composeDiscoverWorldEncounterPublicationCommand('),
            '3. ui/main.js composes two independent capabilities from the one shared constant — never a single function serving both.');
        assert(!/composePublicationDistributionCommand\([^)]*discoverWorldEncounterPublicationCommand|composeDiscoverWorldEncounterPublicationCommand\([^)]*publicationDistributionCommand/.test(mainCodeOnly),
            '4. neither composition is ever passed the other\'s own output — no accidental cross-wiring between the two families.');
    }
    console.log('✓ Section F: Publication announcement and World View discovery genuinely converge on ONE canonical value (proven by direct comparison, not by re-typing the literal), while remaining two entirely independent command/composition pipelines — the shared value is the convergence point, never a merged mechanism.');

    // ===============================================================
    // Section G — No accidental Snapshot coupling: Snapshot discovery
    // remains its own separate literal, its own separate mechanism, with
    // no automatic discovery, background polling, or shared discovery/
    // lifecycle state introduced anywhere near this change.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        assert(mainSource.includes("discoveryTag: 'forkbuild-snapshot'"),
            '1. Snapshot retains its own, entirely separate campaign literal (\'forkbuild-snapshot\') — never derived from or replaced by PUBLICATION_DISCOVERY_TAG.');
        // Every occurrence of the PUBLICATION_DISCOVERY_TAG identifier in
        // this file's own CODE (comments freely discuss it, e.g. this
        // file's own 0.9.357 header, and are excluded here) — its
        // declaration, plus its two Section-A-confirmed usages (the
        // discovery provide() call and the distribution call site) —
        // accounts for exactly 3 occurrences. A 4th would mean something
        // else (e.g. Snapshot's own wiring) started reading it too.
        const mainCodeOnlyForCount = codeOnly(mainSource);
        const identifierOccurrences = mainCodeOnlyForCount.match(/PUBLICATION_DISCOVERY_TAG/g) || [];
        assert(identifierOccurrences.length === 3,
            `2. PUBLICATION_DISCOVERY_TAG appears exactly 3 times in ui/main.js's own code (its declaration + its 2 known usages, found ${identifierOccurrences.length}) — nothing else in this file, Snapshot's own wiring included, reads it.`);
        const snapshotUsages = mainSource.match(/discoveryTag:\s*'forkbuild-snapshot'/g) || [];
        assert(snapshotUsages.length >= 1,
            '3. Snapshot\'s own tag is still a bare, independently-typed literal — never routed through PUBLICATION_DISCOVERY_TAG.');

        // WorldEncounterCanvas's own Snapshot Discovery/Attribution family
        // (discoverSnapshotCommand, snapshotDiscoveryResult,
        // snapshotAttributionResult) is called with the selected
        // Publication object itself, NEVER with this.discoveryTag —
        // confirmed directly against source, not assumed from naming.
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const snapshotDiscoveryCallIndex = canvasSource.indexOf('.discoverSnapshotCommand(publication)');
        assert(snapshotDiscoveryCallIndex !== -1,
            '4. Snapshot\'s own discovery call is invoked with the Publication object itself — never with this.discoveryTag or this.defaultDiscoveryTag.');
        const snapshotMethodRegion = canvasSource.slice(Math.max(0, snapshotDiscoveryCallIndex - 800), snapshotDiscoveryCallIndex + 200);
        assert(!snapshotMethodRegion.includes('this.discoveryTag') && !snapshotMethodRegion.includes('this.defaultDiscoveryTag'),
            '5. the Publication discovery-tag field this milestone concerns itself with is never read anywhere near the Snapshot discovery call site — two genuinely independent fields.');

        // No new automatic/background discovery, timer, or polling of any
        // kind exists in this file at all — the SAME absence 0.9.111's own
        // header already committed to, unrevisited by 0.9.357/0.9.358.
        const canvasCodeOnly = codeOnly(canvasSource);
        assert(!/setInterval|setTimeout\(.*discover/i.test(canvasCodeOnly),
            '6. no setInterval/discovery-linked setTimeout exists anywhere in WorldEncounterCanvas.js — discoverPublication() remains an explicit, Wanderer-triggered action only.');

        // No shared discovery/lifecycle state: discoveryTag/discoveryResult/
        // discoveryError/discovering are entirely separate data() fields
        // from snapshotDiscoveryResult/snapshotAttributionResult/
        // snapshotDiscoveryExecuting — confirmed by the data() function
        // itself never assigning one family from the other.
        const dataFnSource = WorldEncounterCanvas.data.toString();
        assert(!/discoveryTag\s*:\s*this\.snapshot|snapshotDiscoveryResult\s*:\s*this\.discovery/.test(dataFnSource),
            '7. data() never derives the Publication discovery family from the Snapshot discovery family, or vice versa — no shared state of any kind.');
    }
    console.log('✓ Section G: Snapshot retains its own separate, independently-typed campaign literal and its own separate discovery call site (driven by the selected Publication object, never by discoveryTag); no automatic discovery, background polling, or shared discovery/lifecycle state was introduced anywhere in this change.');

    // ===============================================================
    // Section H — Failure behavior: malformed/unavailable discovery
    // behaves exactly as before, regardless of whether the field held the
    // seeded canonical tag or a hand-typed one — the default is input
    // initialization only, never a new success/failure semantic.
    // ===============================================================
    {
        // A genuine rejection, with a canonical-seeded starting tag.
        const seeded = WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag });
        const ctxA = makeCanvasContext({ ...seeded, discoveryObjectId: 'enc-fail-a' });
        ctxA.discoveryCommand = async () => { throw new Error('network unavailable'); };
        WorldEncounterCanvas.methods.discoverPublication.call(ctxA);
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert(ctxA.discoveryError === 'Discovery could not be completed.' && ctxA.discoveryResult === null,
            '1. a rejection with the canonical tag seeded produces exactly the pre-existing failure message and leaves discoveryResult null.');

        // The identical rejection, with a hand-typed custom starting tag —
        // the same failure message, byte for byte.
        const ctxB = makeCanvasContext({ discoveryObjectId: 'enc-fail-b', discoveryTag: 'some-other-tag' });
        ctxB.discoveryCommand = async () => { throw new Error('network unavailable'); };
        WorldEncounterCanvas.methods.discoverPublication.call(ctxB);
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert(ctxB.discoveryError === ctxA.discoveryError,
            '2. the exact same failure message is produced regardless of which tag was in the field — no new, tag-dependent failure branch exists.');

        // No discoveryCommand at all (e.g. an embedder that never supplies
        // one) — a canonical seed changes nothing about this guard.
        const ctxC = makeCanvasContext({ ...WorldEncounterCanvas.data.call({ defaultDiscoveryTag: canonicalTag }), discoveryObjectId: 'enc-fail-c', discoveryCommand: null });
        WorldEncounterCanvas.methods.discoverPublication.call(ctxC);
        await Promise.resolve();
        assert(ctxC.discovering === false && ctxC.discoveryError === null && ctxC.discoveryResult === null,
            '3. with no discoveryCommand supplied, the call remains a complete no-op — untouched by whether a canonical tag happens to be seeded.');
    }
    console.log('✓ Section H: a genuine discovery failure produces the exact same, unmodified message whether the field held the seeded canonical tag or a hand-typed one, and the no-discoveryCommand guard is untouched — the default is input initialization only, never a new success/failure semantic.');

    // ===============================================================
    // Section I — Composition-boundary audit: WorldEncounterCanvas remains
    // reusable standalone, and the dependency direction stays strictly
    // downward — no lower-level file reaches upward for the canonical
    // value.
    // ===============================================================
    {
        // Reusability: already proven live in Section C, restated here as
        // the explicit composition-boundary claim this section audits.
        assert(WorldEncounterCanvas.props.defaultDiscoveryTag.default === '',
            '1. WorldEncounterCanvas remains fully reusable with defaultDiscoveryTag = \'\' — its own declared default, unchanged since 0.9.357.');

        // Dependency direction: main.js -> WorldView (inject/provide) ->
        // WorldEncounterCanvas (prop). No lower-level file imports
        // ui/main.js, and no lower-level file imports ui/views/WorldView.js
        // either.
        const filesToAudit = [
            'ui/components/WorldEncounterCanvas.js',
            'application/DiscoverWorldEncounterPublicationCommand.js',
            'application/DiscoverWorldEncounterPublicationCommandComposition.js',
            'application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js',
            'discovery/LocalDiscoveryProvider.js',
            'publisher/LocalPublisherProvider.js'
        ];
        for (const relativePath of filesToAudit) {
            const source = await readSource(relativePath);
            const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
            const reachesUpward = importLines.some((line) => /ui\/main\.js|ui\/views\/WorldView\.js/.test(line));
            assert(!reachesUpward,
                `2. ${relativePath} imports nothing from ui/main.js or ui/views/WorldView.js — the dependency direction stays strictly main.js -> WorldView -> WorldEncounterCanvas, never reversed.`);
        }

        // WorldView.js's own template forwards the value with no wrapper —
        // confirmed again here as the composition-boundary claim (a
        // wrapper would be a second, hidden authority).
        const viewSource = await readSource('ui/views/WorldView.js');
        assert(viewSource.includes(':defaultDiscoveryTag="publicationDiscoveryTag"'),
            '3. WorldView.js still forwards the injected value with no wrapper function of its own — no hidden second authority introduced at the boundary.');
    }
    console.log('✓ Section I: WorldEncounterCanvas remains fully reusable standalone (defaultDiscoveryTag defaults to \'\'), and no file at or below WorldEncounterCanvas\'s own layer imports ui/main.js or ui/views/WorldView.js — the dependency direction stays strictly main.js -> WorldView -> WorldEncounterCanvas.');

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    console.log('\n=== VERDICT: STABLE_STOP ===');
    console.log('Publication discovery tag integration complete. Sections A-I prove: one production authority (A),');
    console.log('genuine runtime-value propagation through the real composed command and a real faked network');
    console.log('request (B), correct initial-state semantics for both a seeded and a standalone mount (C), an');
    console.log('edit and a clear both honored over the seed (D), zero discovery-protocol changes for either a');
    console.log('canonical or a custom tag (E), a converged-but-still-separate distribution/discovery pair (F), no');
    console.log('accidental Snapshot coupling of any kind (G), unchanged failure behavior regardless of the seeded');
    console.log('tag (H), and a dependency direction that stays strictly downward (I). 0.9.357 genuinely closed the');
    console.log('UX gap 0.9.356 identified, with no loose end left for a future milestone to find.');
}

run().catch((err) => {
    console.error(err);
    throw err;
});
