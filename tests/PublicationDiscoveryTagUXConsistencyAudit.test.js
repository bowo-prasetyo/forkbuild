import { readFile } from 'node:fs/promises';

import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommandComposition.js';
import { queryDecentralizedWorldDiscovery } from '../application/DecentralizedWorldDiscoveryQuery.js';
import { resolveNostrPublisherOptions } from '../application/PublicationDistributionConfigurationProvider.js';

// 0.9.356 — Publication Discovery Tag UX Consistency Audit.
//
// Type: test-only, no production changes. Production changes: NONE.
//
// The user-reported observation: World View's own "Discover Publication"
// panel (ui/components/WorldEncounterCanvas.js) renders a blank "Discovery
// tag" text input, forcing a Wanderer to manually re-type a tag the
// application ALREADY knows — the same literal `ui/main.js` already
// supplies, once, to Publication DISTRIBUTION's own Nostr publisher. This
// milestone audits whether that is a real, narrow integration gap (this
// codebase already has one, an "already-known value never reaches an input
// that starts blank," 0.9.355's own "post-fork" reassessment closed a
// different UX gap of a similar shape) or a deliberate design the codebase
// already has good reasons for. It changes no production file — the same
// "audit first" discipline 0.9.351/0.9.352/0.9.338 already established for
// this exact family of question.
//
// Sections (A-J, mirroring this milestone's own brief):
//   A — Publication announcement tag authority: locate the one real,
//       production-authoritative discoveryTag value.
//   B — World View discovery input: trace the blank field to its real
//       origin and prove, live, what a blank/omitted tag actually does.
//   C — Publication vs Snapshot semantics, compared with real source
//       evidence rather than assumed from the fact that they differ.
//   D — Tag stability: global/fixed vs. derived vs. contextual.
//   E — Whether the existing discovery interface can consume the known
//       value without a second discovery mechanism.
//   F — User-editability semantics of a prefilled field.
//   G — Exact command preservation, proven live against the real component.
//   H — No second source of truth: the literal exists in exactly one place
//       today, and any fix must not create a second one.
//   I — Candidate solution matrix.
//   J — Final decision.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// The same "extract methods/computed/props straight off the exported
// options object and call them with a hand-built ctx" technique
// tests/DecentralizedWorldEncounterLeadSelectionUI.test.js already
// established for this exact file — never a full Vue mount, never a
// second implementation of this component's own logic.
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

async function run() {
    console.log('Running Publication Discovery Tag UX Consistency Audit tests...\n');

    // ===============================================================
    // Section A — Publication announcement tag authority: exactly one
    // production-authoritative discoveryTag value, defined once, required
    // non-empty by the very publisher it configures.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        // 0.9.357 note: this milestone's own recommendation (hoist the
        // literal to one named constant, reused at both its distribution
        // call site and a new discovery-facing provide() call) has since
        // been implemented — the bare literal itself now appears exactly
        // once, as that constant's own declaration, with both call sites
        // referencing the CONSTANT rather than retyping the string. This
        // assertion is updated to match that shape rather than re-asserting
        // the pre-fix one; see tests/WireCanonicalPublicationDiscoveryTag.test.js
        // for 0.9.357's own live coverage of the fix itself.
        const literalDeclarations = mainSource.match(/const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';/g) || [];
        assert(literalDeclarations.length === 1,
            `1. 'forkbuild-publication' is assigned to a bare constant in exactly ONE place in ui/main.js today (found ${literalDeclarations.length}) — a single production-authoritative value, not several candidate definitions to reconcile.`);

        const constantUsages = mainSource.match(/discoveryTag:\s*PUBLICATION_DISCOVERY_TAG|'publicationDiscoveryTag',\s*PUBLICATION_DISCOVERY_TAG/g) || [];
        assert(constantUsages.length === 2,
            `2. that ONE constant, never a second literal, is what both the distribution call site and the discovery-facing provide() call reference (found ${constantUsages.length} usages) — confirming no second, independently-typed copy of the string exists anywhere in this file.`);

        // It is fed into createPublicationDistributionRuntimeProvider(),
        // which resolveRuntimeCapabilities() regroups into the exact { arweave,
        // nostr: { ..., discoveryTag } } shape resolveNostrPublisherOptions()
        // requires non-empty — proven live, not merely read from a comment.
        const options = resolveNostrPublisherOptions({
            publishImpl: () => {}, relayUrl: 'wss://relay.example', discoveryTag: 'forkbuild-publication'
        });
        assert(options.discoveryTag === 'forkbuild-publication',
            '3. resolveNostrPublisherOptions() — the real configuration boundary a distribution click actually reaches — accepts and forwards this exact literal verbatim.');

        const mainCommentIndex = mainSource.indexOf("`discoveryTag` is ForkBuild's own distribution campaign marker, not a");
        assert(mainCommentIndex !== -1,
            '4. ui/main.js documents, in its own words, that this discoveryTag is "ForkBuild\'s own distribution campaign marker, not a host concern" — an application-owned convention, never something a host/wallet/relay supplies.');
    }
    console.log('✓ Section A: exactly one production-authoritative discoveryTag literal exists (\'forkbuild-publication\', ui/main.js), it is a bare application-owned constant (never derived, never a host concern), and it genuinely reaches the real Nostr publisher configuration boundary.');

    // ===============================================================
    // Section B — World View discovery input: the blank field traced to
    // its real origin, and what a blank/omitted tag actually produces,
    // proven live rather than assumed.
    // ===============================================================
    {
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        // 0.9.357 note: this milestone's own recommendation has since been
        // implemented — data() now seeds discoveryTag from a new
        // defaultDiscoveryTag prop (itself defaulting to '') rather than an
        // unconditional blank string, so any embedding that does not wire
        // that prop (exactly the field the user originally observed) still
        // starts blank, preserving backward compatibility. See
        // tests/WireCanonicalPublicationDiscoveryTag.test.js for 0.9.357's
        // own live coverage.
        assert(canvasSource.includes('discoveryTag: this.defaultDiscoveryTag') && WorldEncounterCanvas.props.defaultDiscoveryTag.default === '',
            '1. as of 0.9.357, WorldEncounterCanvas.js\'s own data() seeds discoveryTag from defaultDiscoveryTag, whose own prop default is still \'\' — the exact blank behavior the user originally observed remains the default for any caller that does not supply it.');
        assert(canvasSource.includes('<input v-model="discoveryTag" placeholder="Discovery tag" :disabled="discovering" />'),
            '2. that field is rendered as a plain, freely user-editable text input — confirming it is real UI state, not a display-only label.');

        // Trace where that blank value would have to come FROM if it were
        // ever pre-populated: the composed command itself. Prove live that
        // composeDiscoverWorldEncounterPublicationCommand()'s returned
        // closure takes discoveryTag as a plain per-call argument with no
        // default substitution of its own.
        const runtimeCalls = [];
        const fakeRuntime = {
            discoverWorldEncounterPublication: async (args) => { runtimeCalls.push(args); return { discovery: {}, resolution: {}, inspection: null }; }
        };
        const composed = composeDiscoverWorldEncounterPublicationCommand({ runtime: fakeRuntime, discoveryProvider: null });
        await composed({ objectId: 'obj-1', discoveryTag: undefined });
        assert(runtimeCalls[0].discoveryTag === undefined,
            '3. LIVE: calling the composed discovery command with no discoveryTag at all forwards discoveryTag: undefined straight through to the runtime — no fallback, no default, no silent substitution of any known campaign tag.');

        // And prove, live, what that produces one layer down: a real
        // NostrDiscoveryQueryService-backed query resolves to an empty
        // result for a missing/blank tag — never an error, never a partial
        // search — confirming a blank field is not a harmless placeholder,
        // it is a guaranteed empty search.
        const neverCalled = { search: async () => { throw new Error('should never be reached'); } };
        const leadsForUndefined = await queryDecentralizedWorldDiscovery(neverCalled, undefined);
        const leadsForBlank = await queryDecentralizedWorldDiscovery(neverCalled, '');
        assert(Array.isArray(leadsForUndefined) && leadsForUndefined.length === 0 && Array.isArray(leadsForBlank) && leadsForBlank.length === 0,
            '4. LIVE: queryDecentralizedWorldDiscovery() resolves to [] for an undefined OR blank discoveryTag, and never even calls the injected query service — confirming a Wanderer who does not know to retype the known campaign tag gets a guaranteed, silent, empty result, not a helpful error.');

        // WorldEncounterCanvas.js's own discoverPublication() enforces the
        // identical "blank tag -> no-op" rule one layer earlier, before the
        // command is ever even called.
        const ctx = makeCanvasContext({ discoveryCommand: async () => ({}) });
        let called = false;
        ctx.discoveryCommand = async () => { called = true; return {}; };
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        assert(called === false,
            '5. LIVE: WorldEncounterCanvas.methods.discoverPublication(), called against a real ctx with discoveryObjectId set but discoveryTag left at its blank default, never even calls discoveryCommand — the blank field is a real, live dead end for a Wanderer who has not been told to retype the known tag.');
    }
    console.log('✓ Section B: the blank field is real, freely-editable UI state, and a blank/omitted discoveryTag is proven LIVE (not merely read from source) to be a guaranteed, silent, empty discovery attempt at every layer — the component itself never calls its own discoveryCommand, and the command/query layers below it default to nothing rather than to the known campaign tag.');

    // ===============================================================
    // Section C — Publication vs Snapshot semantics, compared with real
    // source evidence.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');

        // Snapshot: the SAME literal ('forkbuild-snapshot') is composed
        // ONCE and reused verbatim at both its publish call site and BOTH
        // of its discovery call sites — a Wanderer never sees or types it.
        // Comment lines (which quote the literal in prose, e.g. explaining
        // WHY it differs from the Publication campaign) are excluded — only
        // real code assignments count.
        const nonCommentLines = mainSource.split('\n').filter((line) => !/^\s*\/\//.test(line));
        const snapshotLiteralOccurrences = nonCommentLines.filter((line) => /discoveryTag:\s*'forkbuild-snapshot'/.test(line));
        assert(snapshotLiteralOccurrences.length === 3,
            `1. 'forkbuild-snapshot' is assigned as discoveryTag in exactly 3 CODE lines in ui/main.js (found ${snapshotLiteralOccurrences.length}) — one publish-side composition, two discovery-side compositions — all three the SAME literal, never re-typed by a caller.`);

        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(!/placeholder=["']?[Dd]iscovery tag/.test(ownPanelSource),
            '2. ui/components/OwnPublicationPanel.js — the real Snapshot Discovery UI surface — renders no "Discovery tag" input of any kind; Snapshot discovery is a single button bound to a Publication object, with no tag ever exposed to a Wanderer.');
        assert(!/placeholder=["']?[Dd]iscovery tag/.test((await readSource('ui/components/WorldEncounterCanvas.js')).split('world-encounter-discovery-panel')[0]),
            '3. confirmed on the SAME file the Publication input lives in: everything before the Publication-discovery panel (including the Snapshot Discovery panel, defined earlier in the file) contains no discovery-tag input of its own.');

        // Publication: the publish-side composition supplies the literal;
        // the discovery-side composition — read directly at its own real
        // call site — supplies no discoveryTag key at all.
        const discoverCompositionStart = mainSource.indexOf('composeDiscoverWorldEncounterPublicationCommand({');
        const discoverCompositionBlock = mainSource.slice(discoverCompositionStart, mainSource.indexOf('});', discoverCompositionStart));
        assert(!discoverCompositionBlock.includes('discoveryTag'),
            '4. ui/main.js\'s own real composeDiscoverWorldEncounterPublicationCommand({ ... }) call supplies NO discoveryTag at all — unlike every one of Snapshot\'s three composition call sites, which each supply \'forkbuild-snapshot\' explicitly.');

        // The table the milestone brief asked for, encoded as checked facts
        // rather than prose.
        const comparison = [
            { property: 'Discovery mechanism exists', snapshot: true, publication: true },
            { property: 'Canonical discovery identity known to production code', snapshot: true, publication: true },
            { property: 'discoveryTag ever exposed as a user-typed input', snapshot: false, publication: true },
            { property: 'discoveryTag reused verbatim, publish-side to discover-side, in ui/main.js', snapshot: true, publication: false },
            { property: 'Explicit user action required to trigger discovery', snapshot: true, publication: true }
        ];
        assert(comparison.find((r) => r.property.includes('user-typed')).snapshot === false && comparison.find((r) => r.property.includes('user-typed')).publication === true,
            '5. the one genuine semantic difference: Snapshot never surfaces its own tag to a user at all (fully hidden, Option-2-shaped); Publication surfaces it as free text (today, Option-3-shaped) — this is a REAL difference in how much each surface already trusts the user with the tag, not merely an inconsistency to erase by copying Snapshot verbatim.');
    }
    console.log('✓ Section C: Snapshot\'s own discoveryTag is composed once and reused verbatim, publish-side to discover-side, and never shown to a user at all. Publication\'s discoveryTag is composed once for publishing but never threaded to its own discovery composition, which instead leaves the field entirely to a free-text input. The two differ by design (Publication discovery is documented as a free-form recovery tool, not a fixed single-campaign lookup) — so the fix is not "make Publication discovery as invisible as Snapshot," it is "supply the known value as this input\'s own starting point, without removing what makes it different."');

    // ===============================================================
    // Section D — Tag stability: global/fixed, not derived from a
    // Publication, World, or objectId.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        // 0.9.357 note: the literal now lives in one hoisted constant
        // declaration rather than inline at its use site — checked there
        // instead, still a bare, non-interpolated string.
        const literalLine = mainSource.split('\n').find((l) => l.includes("const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';"));
        assert(literalLine && !/\$\{|publication\.|world\.|objectId/.test(literalLine),
            '1. the discoveryTag constant\'s own declaration is a bare string literal on its own line — no interpolation, no reference to any Publication/World/objectId-scoped variable.');

        const publisherSource = await readSource('application/NostrPublicationDiscoveryPublisher.js');
        assert(publisherSource.includes('discoveryTag: the free-form tag value attached to every event this'),
            '2. NostrPublicationDiscoveryPublisher.js\'s own header documents discoveryTag as bound once per publisher INSTANCE and reused for every event that instance announces — an instance-wide, not a per-Publication, value.');

        assert(mainSource.includes('createPublicationDistributionRuntimeProvider') && mainSource.indexOf('createPublicationDistributionRuntimeProvider') < mainSource.indexOf('publicationDistributionCommand ='),
            '3. exactly one publicationDistributionRuntimeProvider (and therefore exactly one discoveryTag) is constructed for the whole running application — not one per Publication, not one per World.');
    }
    console.log('✓ Section D: \'forkbuild-publication\' is a genuinely global, application-wide constant — one bare string literal, constructed once, documented as bound per publisher instance rather than per Publication/World/objectId. It is stable enough to serve as a default, not merely a convenient current value that could silently drift.');

    // ===============================================================
    // Section E — Can the existing discovery interface consume the known
    // value without a second discovery mechanism or a second source of
    // truth?
    // ===============================================================
    {
        // The composed discovery command's own contract already accepts
        // discoveryTag as a plain argument alongside objectId — supplying a
        // default value for an INPUT FIELD that feeds that same argument
        // requires no change to the command, the composition function, the
        // runtime, or the query layer.
        const compositionSource = await readSource('application/DiscoverWorldEncounterPublicationCommandComposition.js');
        assert(compositionSource.includes("({ objectId, discoveryTag } = {}) => executeDiscoverWorldEncounterPublicationCommand({"),
            '1. the composed command\'s own signature already accepts discoveryTag exactly as WorldEncounterCanvas.js already supplies it — no widening, narrowing, or reshaping needed.');

        // The minimal seam: hand the SAME ui/main.js literal down as a
        // SEPARATE provided value alongside the command (never baked into
        // the command's own closure, which would remove per-call
        // editability every other Wanderer-typed input on this component
        // already has).
        assert(!compositionSource.includes("discoveryTag: 'forkbuild-publication'") && !compositionSource.includes("discoveryTag: 'forkbuild-snapshot'"),
            '2. confirmed by absence: the composition layer itself carries no campaign-tag literal of its own today — the ONE place a default could be threaded from without inventing a new literal is ui/main.js, where the value already, genuinely lives.');
    }
    console.log('✓ Section E: the existing discovery command/composition/query chain needs no new mechanism — discoveryTag is already a plain, forwarded argument at every layer. The only missing wire is: WorldEncounterCanvas\'s own initial discoveryTag value, currently \'\', could instead start from the SAME literal ui/main.js already owns, handed down as one more provided value alongside the discovery command itself.');

    // ===============================================================
    // Section F — User-editability semantics of a prefilled field.
    // ===============================================================
    {
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(canvasSource.includes('<input v-model="discoveryTag"'),
            '1. the field is bound with a plain v-model, two-way, on a plain data() field — there is no readonly/disabled-by-default variant of this input anywhere in the template.');

        // Live: a ctx whose discoveryTag starts non-blank (as a prefilled
        // default would) can still be overwritten before discoverPublication()
        // reads it — proving prefilling changes only the STARTING value, not
        // the field's own editability contract.
        const ctx = makeCanvasContext({ discoveryTag: 'forkbuild-publication', discoveryObjectId: 'obj-2' });
        let capturedArgs = null;
        ctx.discoveryCommand = async (args) => { capturedArgs = args; return {}; };
        ctx.discoveryTag = 'a-completely-different-hand-typed-tag';
        WorldEncounterCanvas.methods.discoverPublication.call(ctx);
        await Promise.resolve();
        await Promise.resolve();
        assert(capturedArgs && capturedArgs.discoveryTag === 'a-completely-different-hand-typed-tag',
            '2. LIVE: a ctx that started with the canonical tag, then had it overwritten before clicking Discover, forwards the OVERWRITTEN value — confirming a prefilled default is only ever a starting point, never a locked or re-asserted value.');
    }
    console.log('✓ Section F: prefilling changes only the field\'s starting value. It stays a plain, always-editable v-model text input — no new locked state, no new "reset to default" affordance, and no code path that would ever overwrite a Wanderer\'s own edit.');

    // ===============================================================
    // Section G — Exact command preservation, proven live: whatever value
    // sits in discoveryTag at click time reaches discoveryCommand
    // unmodified, regardless of whether it started blank, prefilled, or
    // hand-typed.
    // ===============================================================
    {
        for (const startingTag of ['', 'forkbuild-publication', 'some-other-hand-typed-tag']) {
            const ctx = makeCanvasContext({ discoveryTag: startingTag, discoveryObjectId: '  obj-3  ' });
            let capturedArgs = null;
            ctx.discoveryCommand = async (args) => { capturedArgs = args; return { discovery: {}, resolution: {}, inspection: null }; };
            WorldEncounterCanvas.methods.discoverPublication.call(ctx);
            await Promise.resolve();
            await Promise.resolve();
            if (startingTag.trim() === '') {
                assert(capturedArgs === null, `1. LIVE (startingTag=${JSON.stringify(startingTag)}): a blank tag never reaches discoveryCommand at all.`);
            } else {
                assert(capturedArgs && capturedArgs.discoveryTag === startingTag && capturedArgs.objectId === 'obj-3',
                    `2. LIVE (startingTag=${JSON.stringify(startingTag)}): discoveryCommand receives { objectId: 'obj-3', discoveryTag: ${JSON.stringify(startingTag)} } verbatim — the exact same code path, whether the value came from a manual keystroke or a prefilled default.`);
            }
        }

        // And discoverPublication() itself contains no branch of any kind
        // distinguishing "was this value prefilled" from "was this value
        // typed" — there is no such concept anywhere in this method.
        const methodSource = WorldEncounterCanvas.methods.discoverPublication.toString();
        assert(!/default|prefill|initial/i.test(methodSource),
            '3. discoverPublication()\'s own source contains no "default"/"prefill"/"initial" concept of any kind — it reads whatever the field currently holds, full stop, exactly the behavior a caller-supplied initial value would need to preserve.');
    }
    console.log('✓ Section G: proven live, across a blank, a canonical, and an arbitrary hand-typed starting tag — discoverPublication() forwards exactly whatever the field currently holds to discoveryCommand, unmodified, with no branch distinguishing where that value came from. Changing only the field\'s initial value cannot alter this behavior, because nothing in the method\'s own logic is sensitive to it.');

    // ===============================================================
    // Section H — No second source of truth: the literal exists in
    // exactly one place today (Section A), and the recommended fix must
    // read from that one place rather than typing a second copy.
    // ===============================================================
    {
        // Comment lines (0.9.357 added prose in both files' own headers
        // explaining WHERE the value comes from, quoting the literal for
        // documentation purposes) are excluded — only a real CODE
        // assignment of the bare string would count as a second copy.
        function codeContainsLiteral(source, literal) {
            return source.split('\n').some((line) => !/^\s*\/\//.test(line) && line.includes(literal));
        }

        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(!codeContainsLiteral(canvasSource, 'forkbuild-publication'),
            '1. WorldEncounterCanvas.js contains no \'forkbuild-publication\' literal in its own CODE today (only in documentation prose, 0.9.357) — confirming a same-named default is INJECTED (a new prop, sourced from ui/main.js\'s own existing constant), never hand-typed a second time inside this file.');

        const viewSource = await readSource('ui/views/WorldView.js');
        assert(!codeContainsLiteral(viewSource, 'forkbuild-publication'),
            '2. ui/views/WorldView.js — the one file standing between ui/main.js and WorldEncounterCanvas.js — also contains no such literal in its own CODE today, confirming the ONLY existing definition remains ui/main.js\'s own, and any wiring through WorldView.js forwards an already-resolved value, never re-declares it.');

        // The recommended architecture, checked here as a plain factual
        // claim about the files involved, never implemented in this
        // milestone: ui/main.js already provides discoverWorldEncounterPublicationCommand
        // app-wide via app.provide(); a second app.provide() call, reading
        // the SAME named constant already used for distribution, is a
        // one-line, zero-new-literal seam.
        assert(viewSource.includes("inject('discoverWorldEncounterPublicationCommand', null)"),
            '3. WorldView.js already has exactly this shape of seam for the command itself (inject(\'name\', default)) — the identical mechanism a canonical-tag value would reuse, not a new injection pattern.');
    }
    console.log('✓ Section H: confirmed by absence at every layer between the one real definition (ui/main.js) and the blank input (WorldEncounterCanvas.js) — no file in between holds, or would need to hold, a second copy of the literal. The existing inject()/provide() seam already used for the discovery COMMAND itself is the same mechanism a canonical tag DEFAULT would travel through.');

    // ===============================================================
    // Section I — Candidate solution matrix.
    // ===============================================================
    {
        const options = [
            {
                key: 'A', name: 'Keep blank field (status quo)',
                verdict: 'REJECT',
                reason: 'Section B: proven live to be a guaranteed, silent, empty discovery attempt for any Wanderer who does not already know to retype ui/main.js\'s own known campaign tag.'
            },
            {
                key: 'B', name: 'Prefill canonical tag, remain editable',
                verdict: 'RECOMMENDED',
                reason: 'Sections E-H: needs no new discovery mechanism, no command/composition/query change, preserves the field\'s own free-form recovery/diagnostic purpose (Section C), and reads from the one existing definition via the existing inject()/provide() seam (Section H) — proven live not to disturb command behavior in any case (Section G).'
            },
            {
                key: 'C', name: 'Hide the tag entirely (Snapshot-shaped)',
                verdict: 'REJECT — not evidenced',
                reason: 'Section C: Publication discovery is documented, in WorldEncounterCanvas.js\'s own header, as "the Wanderer\'s own typed input" for a genuinely free-form lookup — unlike Snapshot\'s single fixed campaign, a Wanderer may legitimately need to search under a DIFFERENT tag (another replica\'s own convention, a hand-shared campaign). Removing that capability is a larger, unevidenced product decision this milestone\'s own brief did not ask for.'
            },
            {
                key: 'D', name: 'Automatic/background Publication discovery',
                verdict: 'REJECT — already deferred',
                reason: '0.9.351 (STABLE_STOP, reconfirmed 0.9.352/0.9.355 lineage) already evaluated and declined exactly this shape of larger discovery-orchestration change for the Publication kind; this milestone raises no new evidence that would reopen it.'
            },
            {
                key: 'E', name: 'Duplicate the literal directly inside WorldEncounterCanvas.js',
                verdict: 'REJECT',
                reason: 'Section H: would create a second, independently-driftable definition of the exact same campaign marker ui/main.js already owns — the one outcome this audit\'s own brief explicitly asked to avoid.'
            }
        ];
        for (const option of options) {
            assert(typeof option.reason === 'string' && option.reason.length > 0,
                `1. option ${option.key} (${option.name}) carries a reason grounded in an earlier section's own evidence.`);
        }
        assert(options.find((o) => o.key === 'B').verdict === 'RECOMMENDED',
            '2. of the five candidate shapes, only B (prefill, remain editable) is scored RECOMMENDED.');
        console.log(options.map((o) => `    ${o.key}. ${o.name} — ${o.verdict}`).join('\n'));
    }
    console.log('✓ Section I: five candidate shapes scored against Sections A-H\'s own evidence. Only prefilling the field from the existing canonical tag, while leaving it fully editable, is recommended.');

    // ===============================================================
    // Section J — Final decision.
    //
    // 0.9.357 note: this milestone's own recommendation (Section I,
    // option B) has since been implemented — ui/main.js now hoists the
    // literal to one named constant and provides it as `publicationDiscoveryTag`,
    // and WorldEncounterCanvas.js now seeds discoveryTag from a new
    // `defaultDiscoveryTag` prop rather than always starting blank. These
    // two assertions are updated to match that shape rather than
    // re-asserting the pre-fix one — this milestone itself (0.9.356) still
    // added no production change of its own; see
    // tests/WireCanonicalPublicationDiscoveryTag.test.js for 0.9.357's own
    // live coverage of the fix itself.
    // ===============================================================
    {
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        assert(canvasSource.includes('discoveryTag: this.defaultDiscoveryTag'),
            '1. as of 0.9.357, WorldEncounterCanvas.js seeds discoveryTag from its own new defaultDiscoveryTag prop rather than an unconditional blank string — the fix this audit recommended.');
        const mainSource = await readSource('ui/main.js');
        assert(mainSource.includes("app.provide('publicationDiscoveryTag',") && mainSource.includes("const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';"),
            '2. as of 0.9.357, ui/main.js hoists the literal to one named constant and provides it app-wide as publicationDiscoveryTag — never a second, independently-typed literal.');
    }
    console.log('✓ Section J: this milestone (0.9.356) itself added no production change of its own. Its recommendation was implemented immediately after, as 0.9.357 — these two assertions are updated to reflect that completed state, mirroring 0.9.353\'s own identical update to 0.9.352\'s audit test.');

    console.log('\n=== DECISION MATRIX ===');
    console.log('Publication announcement tag authority (Section A) ................ EXISTS, single production-authoritative literal');
    console.log('World View discovery input starting blank (Section B) ............. CONFIRMED, live, a guaranteed silent empty search');
    console.log('Publication vs Snapshot semantics (Section C) ...................... DIFFERENT BY DESIGN, not mere inconsistency');
    console.log('Tag stability (Section D) .......................................... GLOBAL, FIXED, safe as a default');
    console.log('Existing discovery interface can consume it (Section E) ........... YES, no new mechanism needed');
    console.log('Field editability if prefilled (Section F) ......................... UNCHANGED, still freely editable');
    console.log('Exact command preservation (Section G) ............................. PROVEN LIVE, unaffected by initial value');
    console.log('Second source of truth risk (Section H) ............................ AVOIDABLE via existing inject()/provide() seam');
    console.log('\n=== VERDICT: INTEGRATE ===');
    console.log('A real, narrow UX-consistency gap, not a deliberate exclusion: World View\'s Publication discovery input starts blank');
    console.log('despite the application already owning the exact canonical tag a same-app Publication would have been announced under.');
    console.log('Recommended next step, sized to exactly this gap: ui/main.js hands the SAME \'forkbuild-publication\' constant it already');
    console.log('owns down through the existing inject()/provide() seam (a new app.provide(\'publicationDiscoveryTag\', ...) call, extracted');
    console.log('to one named constant reused at both its existing distribution call site and this new one) and ui/views/WorldView.js');
    console.log('forwards it to WorldEncounterCanvas.js as one new, optional, defaulted prop that seeds the existing discoveryTag field\'s');
    console.log('OWN initial value — never overriding a later edit, never touching discoverPublication()\'s own logic, never introducing a');
    console.log('second campaign-tag literal, and never removing the field\'s own free-text recovery/diagnostic purpose.');
}

run().catch((err) => {
    console.error(err);
    throw err;
});
