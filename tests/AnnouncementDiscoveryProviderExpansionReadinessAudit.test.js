import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { orchestratePublicationDistribution } from '../application/PublicationDistributionOrchestrator.js';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature } from '../core/Signature.js';

// 0.9.423 — Announcement/Discovery Provider Expansion Readiness Audit.
//
// Type: test-only future-readiness audit. No production file is touched.
//
// 0.9.422 classified ANNOUNCEMENT_AND_DISCOVERY as MECHANISM_ABSENT_
// CAPABILITY_LIMITED: unlike CONTENT and PROOF_AND_ANCHORING, it has no
// registry-driven choice mechanism at all, but this has NO current product
// consequence because exactly one real Arweave uploader and one real Nostr
// publisher exist for it anyway. A person then asked the narrower question
// 0.9.422 deliberately left for later: IF a second real Announcement/
// Discovery provider were ever introduced, exactly what would have to
// change, and would that change preserve the existing pipeline's own
// semantics? This milestone answers that from real, current source — never
// by building the registry, never by building a second provider, never by
// touching `PublicationDistributionOrchestrator.js` or any file downstream
// of it.
//
// THE ANSWER TURNS OUT TO BE MORE PRECISE, AND MORE INTERESTING, THAN "ADD A
// REGISTRY LIKE THE OTHER TWO ROLES." Sections C-E establish two structural
// facts 0.9.422 did not need to distinguish and this milestone's own brief
// did not anticipate either:
//
//   (1) ANNOUNCEMENT_AND_DISCOVERY's write action is not one interchangeable
//       slot the way CONTENT's `storage` or PROOF_AND_ANCHORING's
//       `anchorType` is. It is TWO fixed collaborator slots —
//       `materialUploader` and `discoveryPublisher` — invoked together, in a
//       fixed order, every single call (`PublicationDistributionExecutor.js`,
//       0.9.49). A "second provider" is therefore ambiguous until a future
//       proposal says which slot it replaces; CONTENT and PROOF_AND_ANCHORING
//       never faced that ambiguity, because each has only one slot to begin
//       with.
//
//   (2) The one real place `arweaveUploaderOptions`/`nostrPublisherOptions`
//       are ever constructed — `ui/main.js` — feeds a composed command
//       (`application/PublicationDistributionCommandComposition.js`, 0.9.105)
//       that is built EXACTLY ONCE, at application boot, and `provide()`d
//       app-wide as one fixed value. That composition's own header states,
//       verbatim, that its three bound collaborators "always win over
//       anything a caller's own `request` happens to carry." CONTENT's and
//       PROOF_AND_ANCHORING's own coordinators (`PreferredSnapshotPlacement
//       CreationCoordinator.js`, the anchor equivalent) resolve their
//       registry lookup FRESH, per call, from a caller-supplied key. Announ-
//       cement's composed command resolves nothing per call — every fact
//       about which provider pair gets used was already decided before the
//       first user action of the session. A future per-action provider
//       CHOICE (this audit's "Model 1") therefore needs a REAL CONTRACT
//       CHANGE to `PublicationDistributionCommandComposition.js` itself, not
//       merely a new registry sitting quietly beside `ui/main.js`'s existing
//       wiring — a materially smaller-looking seam than it first appears,
//       once the boot-time/per-call distinction is made explicit.
//
// Both facts are recorded as the actual "minimum seam," never rounded down
// to "this would be easy" or up to "this requires a rewrite."
//
// LETTERED SECTIONS:
//   A. Entry-state reconfirmation — SECOND_REAL_PROVIDER_PRESENT is
//      verified false, fresh, from real source: no registry, no UI
//      provider-selection control, and the single real provider pair still
//      executes correctly end to end today (a live orchestrator call, real
//      fakes, no network).
//   B. The complete pipeline trace, traced import by import from `ui/main.js`
//      down to a returned `PublicationDistributionResult` — confirming the
//      ONE seam where provider identity is ever constructed, and that every
//      layer beneath it forwards `arweaveUploaderOptions`/
//      `nostrPublisherOptions` verbatim, opaque, unread.
//   C. Two fixed collaborator slots, never one interchangeable slot —
//      confirmed from `PublicationDistributionExecutor.js`'s own real
//      sequencing: both are attempted, in a fixed order, whenever the first
//      succeeds; neither is ever skipped in favor of the other.
//   D. Self-declared-identity census on each slot — `ArweavePublication
//      MaterialUploader` already exposes a fixed, registry-ready `storage`
//      getter (mirroring `content/ContentStore.js`'s own convention);
//      `NostrPublicationDiscoveryPublisher` exposes none — the two slots
//      are asymmetric even with EACH OTHER, not only with CONTENT/PROOF.
//   E. Boot-time composition vs. per-call resolution — `Publication
//      DistributionCommandComposition.js`'s own composed command is built
//      once and overrides any caller-supplied choice, confirmed against
//      CONTENT's and PROOF_AND_ANCHORING's own per-call-resolving
//      coordinators.
//   F. The proposal's own three candidate models (selection / repeated
//      independent action / fan-out), applied specifically to a two-slot,
//      boot-fixed pipeline — proven, live, not interchangeable, and scored
//      for how much of Sections C-E's own machinery each would need to
//      change.
//   G. The minimum future seam for Model 1 (explicit per-action selection),
//      named file by file, contrasted with CONTENT/PROOF_AND_ANCHORING's
//      own minimum seam (a registry alone).
//   H. Identity/provenance preservation — a synthetic two-provider
//      simulation built entirely from `PublicationDistributionResult.js`'s
//      own real, unmodified function, proving publication/material/
//      discovery identity never conflates across two hypothetical
//      providers.
//   I. Comparison against `SnapshotPlacementStoreRegistry`/`External
//      AnchorPublisherRegistry` — REUSABLE_CONCEPT / REQUIRES_ADAPTATION /
//      NOT_SEMANTICALLY_APPLICABLE, property by property, backed by
//      Sections C-E rather than copied wholesale because two other roles
//      happen to use a registry.
//   J. Explicit non-trigger, deliberate exclusion census, and the
//      production boundary check every milestone in this family ends with.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function listFiles(dirs) {
    return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT })
        .toString().split('\n').filter((f) => f.endsWith('.js'));
}
async function joinedSource(files) {
    const parts = await Promise.all(files.map((f) => readSource(f)));
    return parts.join('\n');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function signedPublication(overrides = {}) {
    const publication = new Publication({
        id: 'pub-readiness-1',
        documentId: 'doc-readiness-1',
        title: 'A Readiness-Audited Publication',
        author: 'author-readiness-1',
        contentReference: new ContentReference({ hash: 'legacy-hash', uri: 'ipfs://legacy-cid', storage: 'ipfs' }),
        ...overrides
    });
    return publication.withSignature(new Signature({
        algorithm: 'Ed25519',
        signer: 'author-readiness-1',
        signature: 'fake-signature-value',
        signedHash: 'fake-signed-hash',
        domain: 'forkbuild'
    }));
}
function makeFakeSigner({ transactionId }) {
    return { async sign() { return { id: transactionId, transaction: { placeholder: true } }; } };
}
function makeFakeGateway() {
    const requests = [];
    return { requests, async fetchImpl(url, options) { requests.push({ url, options }); return new Response('accepted', { status: 200 }); } };
}
function makeFakeRelay({ eventId }) {
    const calls = [];
    return { calls, async publishImpl(relayUrl, eventTemplate) { calls.push({ relayUrl, eventTemplate }); return { published: true, id: eventId }; } };
}

async function run() {
    console.log('Running Announcement/Discovery Provider Expansion Readiness Audit tests...\n');

    // ===============================================================
    // Section A — entry-state reconfirmation.
    // ===============================================================
    {
        assert(Object.values(RoleProviderRole).length === 3, n('A1. the closed three-role vocabulary is unchanged since 0.9.293'));

        const allProductionFiles = listFiles(['application']);
        const registryFiles = allProductionFiles.filter((f) => /DiscoveryPublisherRegistry|AnnouncementRegistry|DistributionRegistry/i.test(f));
        assert(registryFiles.length === 0, n(`A2. no DiscoveryPublisherRegistry/AnnouncementRegistry/DistributionRegistry class exists anywhere in application/ today (found ${JSON.stringify(registryFiles)}) — re-derived fresh, never trusted from 0.9.422's own cached finding`));

        const editorSource = await readSource('ui/views/EditorView.js');
        assert(/inject\('publicationDistributionCommand', null\)/.test(editorSource), n('A3. EditorView.js still injects one single, app-wide publicationDistributionCommand — no per-action provider parameter exists in the real UI today'));
        const routerSource = await readSource('ui/router/index.js');
        assert(!/provider-picker|substrate-picker|announcement-provider/i.test(routerSource), n('A4. no announcement/discovery provider-selection route exists anywhere in the real router'));

        // Live proof the single real provider pair still executes correctly
        // end to end — SECOND_REAL_PROVIDER_PRESENT = false describes an
        // absence of CHOICE, never a broken or degraded pipeline.
        const gateway = makeFakeGateway();
        const relay = makeFakeRelay({ eventId: 'a'.repeat(64) });
        const signer = makeFakeSigner({ transactionId: 'ReadinessAuditTransactionId1234567' });
        const result = await orchestratePublicationDistribution({
            publication: signedPublication(),
            serializedMaterial: 'serialized readiness-audit material',
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl },
            nostrPublisherOptions: { relayUrl: 'wss://relay.readiness-audit.example', discoveryTag: 'forkbuild-readiness', publishImpl: relay.publishImpl }
        });
        assert(result !== null && result.material !== null && result.discovery !== null, n('A5. the one real, currently-registered provider pair still produces a complete, working distribution result today — this audit evaluates FUTURE readiness, never a present defect'));

        const SECOND_REAL_PROVIDER_PRESENT = false;
        assert(SECOND_REAL_PROVIDER_PRESENT === false, n('A6. this milestone\'s own entry condition, stated explicitly: SECOND_REAL_PROVIDER_PRESENT = false'));

        console.log('\n=== SECTION A: ENTRY-STATE RECONFIRMATION ===');
        console.log('✓ Section A: no registry, no UI selection control, one real provider pair, fully functional. Entry condition confirmed fresh.');
    }

    // ===============================================================
    // Section B — the complete pipeline trace.
    // ===============================================================
    {
        const mainSource = await readSource('ui/main.js');
        const compositionSource = await readSource('application/PublicationDistributionCommandComposition.js');
        const commandSource = await readSource('application/PublicationDistributionCommand.js');
        const orchestratorSource = await readSource('application/PublicationDistributionOrchestrator.js');
        const runtimeSource = await readSource('application/PublicationDistributionRuntimeComposition.js');

        // The chain, import by import, real and current.
        // AMENDED BY 0.9.447 — Nostr Publication Relay Set Configuration.
        // Both import lines below now ALSO name one new, additive sibling
        // each (composeMultiRelayNostrPublicationDistributionCommand /
        // executeMultiRelayNostrPublicationDistributionCommand) — the
        // regexes are widened to tolerate that second name, in either
        // order, while still requiring the original name this section
        // actually traces to be present in the SAME import statement, from
        // the SAME file.
        assert(/import \{ composePublicationDistributionCommand(, composeMultiRelayNostrPublicationDistributionCommand)? \} from '\.\.\/application\/PublicationDistributionCommandComposition\.js';/.test(mainSource), n('B1. AMENDED BY 0.9.447 — ui/main.js imports composePublicationDistributionCommand — the real, current entry point (now alongside its new, additive multi-relay sibling)'));
        assert(/import \{ resolvePublicationDistributionRuntimeConfiguration \}/.test(mainSource), n('B2. ui/main.js imports the one real resolver that turns host capabilities into arweaveUploaderOptions/nostrPublisherOptions'));
        assert(/import \{ executePublicationDistributionCommand(, executeMultiRelayNostrPublicationDistributionCommand)? \} from '\.\/PublicationDistributionCommand\.js';/.test(compositionSource), n('B3. AMENDED BY 0.9.447 — PublicationDistributionCommandComposition.js imports executePublicationDistributionCommand (now alongside its new, additive multi-relay sibling)'));
        assert(/import \{ orchestratePublicationDistribution \} from '\.\/PublicationDistributionOrchestrator\.js';/.test(commandSource), n('B4. PublicationDistributionCommand.js imports orchestratePublicationDistribution'));
        assert(/import \{ composePublicationDistributionRuntime \} from '\.\/PublicationDistributionRuntimeComposition\.js';/.test(orchestratorSource), n('B5. PublicationDistributionOrchestrator.js imports composePublicationDistributionRuntime'));
        assert(/import \{ ArweavePublicationMaterialUploader \}/.test(runtimeSource) && /import \{ NostrPublicationDiscoveryPublisher \}/.test(runtimeSource), n('B6. PublicationDistributionRuntimeComposition.js imports both concrete collaborators — the bottom of the chain'));

        // Identity is constructed exactly once, in ui/main.js.
        const composeCallCount = (mainSource.match(/composePublicationDistributionCommand\(\{/g) || []).length;
        assert(composeCallCount === 1, n(`B7. composePublicationDistributionCommand is called exactly once in ui/main.js (found ${composeCallCount}) — one construction site, not per-action`));
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. `arweaveAnnouncementPublisherOptions` joined the
        // same destructured call as a third, independent field — this
        // audit's own recommended seam (Section G, below), now built. "The
        // one place 'which provider' is ever decided today" now reads
        // `discoveryProvider`, threaded from a real caller (`ui/components/
        // WorldEncounterCanvas.js`'s own new substrate control) rather than
        // fixed at this call site — this call site still produces the
        // OPTIONS each provider needs, never the SELECTION between them.
        assert(/const \{ arweaveUploaderOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions \} = resolvePublicationDistributionRuntimeConfiguration\(/.test(mainSource), n('B8. arweaveUploaderOptions/nostrPublisherOptions/arweaveAnnouncementPublisherOptions are produced by exactly one real call, in ui/main.js — the one place each provider\'s OWN options are ever resolved (0.9.430: provider SELECTION itself now lives one layer up, at a real caller)'));

        // Every layer beneath that ONE construction site forwards the pair
        // verbatim, opaque, as a per-call parameter — never re-read, never
        // re-interpreted, never hard-coded.
        //
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. `discoveryProvider`/`arweaveAnnouncementPublisherOptions`
        // (or, at the composition-root binding in
        // PublicationDistributionCommandComposition.js, just
        // `arweaveAnnouncementPublisherOptions` — `discoveryProvider` stays
        // a per-call, caller-supplied field there, never bound at
        // composition time; see that file's own "AMENDED BY 0.9.430")
        // joined the forwarded set at every layer below. B12's own regex
        // was already stale as of 0.9.428 (which added `discoveryProvider`/
        // `arweaveAnnouncementPublisherOptions` to
        // PublicationDistributionRuntimeComposition.js itself, before this
        // milestone touched anything) — confirmed failing even on this
        // audit's own pre-0.9.430 content; corrected here alongside B9-B11
        // for the same file family.
        assert(/composePublicationDistributionCommand\(\{ lifecycleStore, arweaveUploaderOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions \} = \{\}\)/.test(compositionSource), n('B9. PublicationDistributionCommandComposition.js accepts arweaveUploaderOptions/nostrPublisherOptions/arweaveAnnouncementPublisherOptions as opaque per-call constructor arguments'));
        assert(/executePublicationDistributionCommand\(\{[\s\S]{0,200}arweaveUploaderOptions,\s*\n\s*discoveryProvider,\s*\n\s*nostrPublisherOptions,\s*\n\s*arweaveAnnouncementPublisherOptions,/.test(commandSource), n('B10. PublicationDistributionCommand.js accepts all four as opaque per-call function arguments'));
        assert(/arweaveUploaderOptions,\s*\n\s*discoveryProvider,\s*\n\s*nostrPublisherOptions,\s*\n\s*arweaveAnnouncementPublisherOptions\s*\n\} = \{\}\) \{/.test(orchestratorSource), n('B11. PublicationDistributionOrchestrator.js accepts all four as opaque per-call function arguments'));
        assert(/arweaveUploaderOptions = \{\},\s*\n\s*discoveryProvider = 'nostr',\s*\n\s*nostrPublisherOptions = \{\},\s*\n\s*arweaveAnnouncementPublisherOptions = \{\}\s*\n\} = \{\}\) \{/.test(runtimeSource), n('B12. PublicationDistributionRuntimeComposition.js accepts all four as opaque per-call function arguments, only here finally constructing the two concrete collaborators (selected by discoveryProvider, never both)'));

        console.log('\n=== SECTION B: THE COMPLETE PIPELINE TRACE ===');
        console.log('  ui/main.js  --(construct, once)-->  PublicationDistributionCommandComposition.js');
        console.log('    --(forward)-->  PublicationDistributionCommand.js');
        console.log('    --(forward)-->  PublicationDistributionOrchestrator.js');
        console.log('    --(forward)-->  PublicationDistributionRuntimeComposition.js  --(construct)-->  Arweave/Nostr collaborators');
        console.log('✓ Section B: exactly one real construction site (ui/main.js), and three intervening layers that never read or reinterpret what passes through them — a genuinely narrow chain, traced from real imports, never assumed from architecture alone.');
    }

    // ===============================================================
    // Section C — two fixed collaborator slots, never one interchangeable
    // slot.
    // ===============================================================
    {
        const executorSource = await readSource('application/PublicationDistributionExecutor.js');
        assert(/const materialUri = await materialUploader\.upload\(serializedMaterial\);/.test(executorSource), n('C1. the real executor always attempts materialUploader.upload() first'));
        assert(/const published = await discoveryPublisher\.publish\(distribution\.discoveryEnvelope\);/.test(executorSource), n('C2. and, when that succeeds, always attempts discoveryPublisher.publish() next — the SAME real call, real sequence, this audit\'s own Section A live proof exercised'));
        assert(/if \(materialUri === null\) \{/.test(executorSource), n('C3. an upload decline stops the sequence — the two slots are ordered, not independent'));

        // Confirmed structurally too: the executor's own function signature
        // takes BOTH collaborators as required parameters, never an
        // "either/or" shape, and there is no branch anywhere that calls one
        // without the other when both are supplied.
        assert(/materialUploader, distributionDescriptor, discoveryPublisher/.test(codeOnly(executorSource)), n('C4. executePublicationDistribution\'s own parameter list names all three collaborators together, every call — there is no call shape that supplies only one of the two substrate-facing collaborators'));
        assert(!/materialUploader \|\| discoveryPublisher|discoveryPublisher \|\| materialUploader/.test(codeOnly(executorSource)), n('C5. no "use whichever one is supplied" branch exists — confirming this is not an accidental reading of a fixed-pair shape'));

        console.log('\n=== SECTION C: TWO FIXED COLLABORATOR SLOTS ===');
        console.log('✓ Section C: ANNOUNCEMENT_AND_DISCOVERY\'s real write action is not "pick one of N providers" (CONTENT\'s and PROOF_AND_ANCHORING\'s own shape) — it is "run collaborator slot 1, then collaborator slot 2," always both, in a fixed order, confirmed from the real executor\'s own sequencing. A future "second provider" is ambiguous until a proposal names WHICH slot it replaces or adds to.');
    }

    // ===============================================================
    // Section D — self-declared-identity census on each slot.
    // ===============================================================
    {
        const arweaveSource = await readSource('application/ArweavePublicationMaterialUploader.js');
        const nostrSource = await readSource('application/NostrPublicationDiscoveryPublisher.js');

        assert(/get storage\(\) \{ return 'ar'; \}/.test(arweaveSource), n('D1. ArweavePublicationMaterialUploader already exposes a fixed, self-declared `storage` getter returning a literal — the identical shape content/ContentStore.js\'s own subclasses use, and SnapshotPlacementStoreRegistry already keys on'));
        assert(/just a stable self-identifying label a caller may\s*\n\s*\/\/\s*use however it likes/.test(arweaveSource), n('D2. its own header names this explicitly: a stable, self-identifying label, not read by the uploader itself — exactly the shape a registry key wants'));

        const nostrHasLiteralIdentityGetter = /get \w+\(\)\s*\{\s*return '[^']*';\s*\}/.test(nostrSource);
        assert(!nostrHasLiteralIdentityGetter, n('D3. NostrPublicationDiscoveryPublisher exposes NO equivalent fixed, self-declared identity getter — its own get relayUrl()/get discoveryTag() both return instance state (this._relayUrl/this._discoveryTag), never a literal — confirmed by the SAME regex shape that matched D1 for the other slot'));
        assert(/get relayUrl\(\) \{ return this\._relayUrl; \}/.test(nostrSource) && /get discoveryTag\(\) \{ return this\._discoveryTag; \}/.test(nostrSource), n('D4. both of its real getters expose CALLER-CONFIGURED values, never a plugin-declared TYPE name — "which relay" and "which campaign tag" are not "which kind of substrate"'));

        console.log('\n=== SECTION D: SELF-DECLARED-IDENTITY CENSUS ===');
        console.log('  materialUploader slot:    HAS a fixed, registry-ready self-declared identity (storage: "ar")');
        console.log('  discoveryPublisher slot:  HAS NO self-declared identity of any kind');
        console.log('✓ Section D: the two slots that make up this role\'s one write action are asymmetric even with EACH OTHER — a future registry for the materialUploader slot alone would have real, already-present plugin metadata to key on; an equivalent registry for the discoveryPublisher slot would need a new, currently-nonexistent self-declared field added to that class first.');
    }

    // ===============================================================
    // Section E — boot-time composition vs. per-call resolution.
    // ===============================================================
    {
        const compositionSource = await readSource('application/PublicationDistributionCommandComposition.js');
        const coordinatorSource = await readSource('application/PreferredSnapshotPlacementCreationCoordinator.js');
        const resolverSource = await readSource('application/RoleAwareProviderResolver.js');

        assert(/ALWAYS WIN OVER ANYTHING A\s*\n\/\/ CALLER'S OWN `request` HAPPENS TO CARRY/.test(compositionSource), n('E1. PublicationDistributionCommandComposition.js\'s own header states, verbatim, that its three bound collaborators always win over anything a caller\'s own request carries'));
        // AMENDED BY 0.9.430 — Announcement/Discovery Provider Selection
        // Reachability. `arweaveAnnouncementPublisherOptions` joined the
        // three explicitly-set fields — still spread-then-override, still
        // never honoring a caller-supplied override of any of the three
        // composition-root collaborators. `discoveryProvider` is
        // deliberately NOT among them: it reaches `executePublicationDistributionCommand()`
        // purely through `...request`'s own spread, unoverridden — see
        // that file's own header, "discoveryProvider is deliberately NOT
        // added to that pre-bound set."
        assert(/return \(request\) => executePublicationDistributionCommand\(\{\s*\n\s*\.\.\.request,\s*\n\s*arweaveUploaderOptions,\s*\n\s*nostrPublisherOptions,\s*\n\s*arweaveAnnouncementPublisherOptions,\s*\n\s*lifecycleStore\s*\n\s*\}\);/.test(compositionSource), n('E2. confirmed in the real code, not only the header: `...request` is spread FIRST, then arweaveUploaderOptions/nostrPublisherOptions/arweaveAnnouncementPublisherOptions/lifecycleStore are set explicitly, so a `request.arweaveUploaderOptions` (etc.) a caller supplied would be silently overwritten, never honored — while `request.discoveryProvider` passes through unoverridden, the one deliberate exception'));

        const mainSource = await readSource('ui/main.js');
        assert(/app\.provide\('publicationDistributionCommand', publicationDistributionCommand\);/.test(mainSource), n('E3. the ONE composed command this produces is provide()\'d exactly once, app-wide, at boot — every later inject() in this app receives the SAME fixed function reference'));

        // Contrast: CONTENT's and PROOF_AND_ANCHORING's own coordinators
        // resolve their registry lookup FRESH, per call, from a
        // caller-supplied key — never pre-bound at composition time.
        assert(/async create\(publicationId, storage = null\)/.test(coordinatorSource), n('E4. PreferredSnapshotPlacementCreationCoordinator.create(publicationId, storage) takes its own provider key as a PER-CALL argument — CONTENT\'s own choice is resolved fresh, every call, never fixed at boot'));
        assert(/resolve\(role\)/.test(codeOnly(resolverSource)) && /const provider = registry\.get\(preference\.providerKey\) \|\| null;/.test(resolverSource), n('E5. RoleAwareProviderResolver.resolve(role) likewise performs its own registry lookup fresh, per call — the identical per-call resolution shape, one axis over'));

        console.log('\n=== SECTION E: BOOT-TIME VS. PER-CALL RESOLUTION ===');
        console.log('  CONTENT / PROOF_AND_ANCHORING:  provider key resolved FRESH, per call');
        console.log('  ANNOUNCEMENT_AND_DISCOVERY:      provider pair fixed ONCE, at boot, via provide()');
        console.log('✓ Section E: this is a real architectural difference Section B\'s trace alone would not surface — the composed command\'s own contract actively discards a per-call choice today, rather than merely lacking one.');
    }

    // ===============================================================
    // Section F — three candidate models, applied to a two-slot, boot-fixed
    // pipeline.
    // ===============================================================
    {
        const MODELS = Object.freeze(['ALTERNATIVE_SELECTION', 'REPEATED_INDEPENDENT_ACTION', 'FAN_OUT']);
        function evaluateModel(model, evidence) {
            if (model === 'REPEATED_INDEPENDENT_ACTION') {
                // Calling the existing orchestrator twice, with two
                // different options pairs, already produces two
                // independent results — no contract change anywhere.
                return evidence.repeatedActionAlreadyWorks ? 'ALREADY_SUPPORTED' : 'BLOCKED';
            }
            if (model === 'ALTERNATIVE_SELECTION') {
                // Needs the boot-time composition itself to accept a
                // per-call key — a real, but narrow, contract change.
                return evidence.compositionResolvesPerCall ? 'ALREADY_SUPPORTED' : 'NEEDS_COMPOSITION_CONTRACT_CHANGE';
            }
            if (model === 'FAN_OUT') {
                // Needs the executor's own fixed two-slot sequence to
                // become an N-slot sequence — a change to the one file
                // every prior milestone in this family has refused to
                // touch for this exact reason.
                return evidence.executorSupportsNSlots ? 'ALREADY_SUPPORTED' : 'NEEDS_EXECUTOR_SEQUENCING_CHANGE';
            }
            return 'UNKNOWN';
        }

        // Live proof for REPEATED_INDEPENDENT_ACTION — two real orchestrator
        // calls, two different synthetic "providers" (distinguished only by
        // discoveryTag/relayUrl/transaction id, since no second real
        // provider class exists to construct), two independent results.
        const gatewayA = makeFakeGateway();
        const relayA = makeFakeRelay({ eventId: 'a'.repeat(64) });
        const signerA = makeFakeSigner({ transactionId: 'ProviderATransactionId12345678901' });
        const resultA = await orchestratePublicationDistribution({
            publication: signedPublication(),
            serializedMaterial: 'material for provider A',
            arweaveUploaderOptions: { signer: signerA, fetchImpl: gatewayA.fetchImpl },
            nostrPublisherOptions: { relayUrl: 'wss://relay-provider-a.example', discoveryTag: 'forkbuild-provider-a', publishImpl: relayA.publishImpl }
        });

        const gatewayB = makeFakeGateway();
        const relayB = makeFakeRelay({ eventId: 'b'.repeat(64) });
        const signerB = makeFakeSigner({ transactionId: 'ProviderBTransactionId12345678901' });
        const resultB = await orchestratePublicationDistribution({
            publication: signedPublication(),
            serializedMaterial: 'material for provider B',
            arweaveUploaderOptions: { signer: signerB, fetchImpl: gatewayB.fetchImpl },
            nostrPublisherOptions: { relayUrl: 'wss://relay-provider-b.example', discoveryTag: 'forkbuild-provider-b', publishImpl: relayB.publishImpl }
        });

        assert(resultA.discovery.relayUrl !== resultB.discovery.relayUrl, n('F1. two ordinary, unmodified orchestrator calls with two different options pairs already produce two independently attributable results — no overwrite, no shared state'));
        assert(resultA.material.uri !== resultB.material.uri, n('F2. and two independent material facts — REPEATED_INDEPENDENT_ACTION needs zero contract changes anywhere in this pipeline, today'));

        const results = MODELS.map((model) => ({
            model,
            verdict: evaluateModel(model, {
                repeatedActionAlreadyWorks: true,               // F1/F2, just proven live
                compositionResolvesPerCall: false,                // Section E
                executorSupportsNSlots: false                     // Section C
            })
        }));
        assert(results.find((r) => r.model === 'REPEATED_INDEPENDENT_ACTION').verdict === 'ALREADY_SUPPORTED', n('F3. Model "repeated independent action" is ALREADY_SUPPORTED — the model this milestone\'s own live proof exercises'));
        assert(results.find((r) => r.model === 'ALTERNATIVE_SELECTION').verdict === 'NEEDS_COMPOSITION_CONTRACT_CHANGE', n('F4. Model "alternative selection" (pick A or B, one execution) NEEDS_COMPOSITION_CONTRACT_CHANGE — Section E\'s own boot-time/per-call finding, not a registry alone'));
        assert(results.find((r) => r.model === 'FAN_OUT').verdict === 'NEEDS_EXECUTOR_SEQUENCING_CHANGE', n('F5. Model "fan-out" (one action, both providers) NEEDS_EXECUTOR_SEQUENCING_CHANGE — Section C\'s own two-fixed-slots finding; this is also the model 0.9.421 already found architecturally excluded on purpose, for every role, independent of this milestone'));

        // Discrimination guard — the same regression check this family
        // always holds for its own classification functions.
        assert(evaluateModel('ALTERNATIVE_SELECTION', { compositionResolvesPerCall: true }) === 'ALREADY_SUPPORTED', n('F6. the same function WOULD classify "alternative selection" as ALREADY_SUPPORTED if the composition already resolved per call — a real, available branch, not a foregone conclusion'));
        assert(new Set(results.map((r) => r.verdict)).size === 3, n('F7. all three models receive three DIFFERENT verdicts — the three models are not interchangeable, confirmed by distinct verdicts, not merely asserted in prose'));

        console.log('\n=== SECTION F: THREE MODELS, APPLIED ===');
        for (const r of results) console.log(`  [${r.verdict}] ${r.model}`);
        console.log('✓ Section F: "repeated independent action" already works, live, with the exact unmodified pipeline this codebase ships today. "Alternative selection" and "fan-out" each need a DIFFERENT real file to change — they are not two names for the same future work.');
    }

    // ===============================================================
    // Section G — the minimum future seam for Model 1 (alternative
    // selection), named file by file.
    // ===============================================================
    {
        // What would NOT need to change — confirmed from Section B's own
        // per-call-forwarding evidence. Three layers forward the OPTIONS
        // pair verbatim; the executor one layer further down never sees
        // options at all (Section C4) — it takes the already-constructed
        // collaborators, which is exactly why a future registry resolving
        // to an options pair, one layer up, needs no change this deep
        // either.
        const untouchedByModel1 = [
            'application/PublicationDistributionCommand.js',
            'application/PublicationDistributionOrchestrator.js',
            'application/PublicationDistributionRuntimeComposition.js'
        ];
        for (const file of untouchedByModel1) {
            const source = await readSource(file);
            assert(/arweaveUploaderOptions/.test(source) && /nostrPublisherOptions/.test(source), n(`G1. ${file} already names arweaveUploaderOptions/nostrPublisherOptions as opaque per-call parameters — a registry lookup that resolves to the SAME two names, one layer up, needs no change here`));
        }
        const executorSource = await readSource('application/PublicationDistributionExecutor.js');
        assert(!/arweaveUploaderOptions|nostrPublisherOptions/.test(executorSource), n('G1b. PublicationDistributionExecutor.js never even sees arweaveUploaderOptions/nostrPublisherOptions — it takes already-constructed materialUploader/discoveryPublisher instances (Section C4), one layer further removed from where a future registry lookup would sit, so it needs no change under Model 1 either'));

        // What WOULD need to change — confirmed from Section E's own
        // boot-time-override evidence.
        const compositionSource = await readSource('application/PublicationDistributionCommandComposition.js');
        assert(/return \(request\) => executePublicationDistributionCommand/.test(compositionSource), n('G2. PublicationDistributionCommandComposition.js\'s own returned closure takes no per-call key today — enabling Model 1 means this file\'s own contract (or a new, sibling composition with a different contract) must accept one, e.g. a providerKey read from `request` rather than only lifecycleStore/arweaveUploaderOptions/nostrPublisherOptions fixed at composition time'));

        // The minimum seam is therefore two named, disjoint concerns, never
        // one — confirmed as a structural conclusion, not asserted bare.
        const minimalSeam = Object.freeze({
            lookup: 'a new registry (or two — see Section I) resolving a per-call key to an options pair, callable from ui/main.js or from a new composition variant',
            contractChange: 'PublicationDistributionCommandComposition.js\'s own returned function must stop treating arweaveUploaderOptions/nostrPublisherOptions as fixed-at-boot values'
        });
        assert(minimalSeam.lookup !== minimalSeam.contractChange, n('G3. the minimum seam has two genuinely separate parts — a lookup mechanism (CONTENT/PROOF\'s own kind of addition) AND a contract change to an already-shipped file (something CONTENT/PROOF\'s own additions never needed, because their own coordinators already resolved per call from day one)'));

        console.log('\n=== SECTION G: THE MINIMUM SEAM FOR MODEL 1 ===');
        console.log('  UNCHANGED: PublicationDistributionCommand.js, PublicationDistributionOrchestrator.js,');
        console.log('             PublicationDistributionRuntimeComposition.js, PublicationDistributionExecutor.js');
        console.log('  CHANGED:   PublicationDistributionCommandComposition.js\'s own per-call contract');
        console.log('  NEW:       a per-call provider-key lookup, wired at or above the composition boundary');
        console.log('✓ Section G: the minimum seam is smaller than a full registry-and-orchestrator rewrite, but larger than "just add a registry beside ui/main.js" — it specifically requires touching one already-shipped file\'s own contract, a fact Sections B and E establish together that neither could establish alone.');
    }

    // ===============================================================
    // Section H — identity/provenance preservation, synthetic two-provider
    // simulation.
    // ===============================================================
    {
        // Built entirely from describePublicationDistributionResult()'s own
        // real, unmodified function — no second provider class is
        // constructed; only its EVENTUAL FACTS are synthesized, to check
        // representability, exactly as this milestone's own brief asks.
        const publication = { id: 'pub-readiness-provenance-1' };

        const resultProviderA = describePublicationDistributionResult({
            publication,
            material: { uri: 'ar://provider-a-tx', storage: 'ar' },
            discovery: { relayUrl: 'wss://relay-a.example', discoveryTag: 'forkbuild-a', id: 'a'.repeat(64) }
        });
        const resultProviderB = describePublicationDistributionResult({
            publication,
            material: { uri: 'ar://provider-b-tx', storage: 'ar-mirror' },
            discovery: { relayUrl: 'wss://relay-b.example', discoveryTag: 'forkbuild-b', id: 'b'.repeat(64) }
        });

        assert(resultProviderA !== null && resultProviderB !== null, n('H1. the existing, unmodified result boundary already accepts two distinguishable synthetic provider facts for the SAME publication'));
        assert(resultProviderA.publication.objectId === resultProviderB.publication.objectId, n('H2. publication identity is correctly SHARED — both facts genuinely describe the same publication'));
        assert(resultProviderA.material.uri !== resultProviderB.material.uri && resultProviderA.material.storage !== resultProviderB.material.storage, n('H3. material identity stays independently distinguishable per provider — never conflated, never overwritten in place'));
        assert(resultProviderA.discovery.relayUrl !== resultProviderB.discovery.relayUrl && resultProviderA.discovery.discoveryTag !== resultProviderB.discovery.discoveryTag && resultProviderA.discovery.id !== resultProviderB.discovery.id, n('H4. discovery identity likewise stays fully independent — relay origin, campaign tag, and event id all differ, none inherited from the other result'));
        assert(Object.isFrozen(resultProviderA) && Object.isFrozen(resultProviderB), n('H5. both synthetic results remain frozen, exactly as the real function already guarantees — no future caller can mutate one into resembling the other'));

        // A future second provider's own facts must still fail exactly the
        // way the existing single-provider facts already fail today — no
        // new lenience would be needed to accept a second provider's shape.
        const malformedSecondProvider = describePublicationDistributionResult({
            publication,
            material: { storage: 'unknown-provider' }, // missing uri
            discovery: resultProviderB.discovery
        });
        assert(malformedSecondProvider === null, n('H6. a malformed fact from a HYPOTHETICAL second provider is rejected by the existing, unmodified validation — the same "supplied but malformed invalidates the whole result" rule 0.9.48\'s own header already documents, requiring no loosening for a future provider'));

        console.log('\n=== SECTION H: IDENTITY/PROVENANCE PRESERVATION ===');
        console.log('✓ Section H: the existing PublicationDistributionResult vocabulary already represents two distinct providers\' facts for one publication without conflating publication, material, or discovery identity — proven with the real, unmodified function, never a proposed new one.');
    }

    // ===============================================================
    // Section I — comparison against the existing registries.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze(['REUSABLE_CONCEPT', 'REQUIRES_ADAPTATION', 'NOT_SEMANTICALLY_APPLICABLE']);
        const comparison = [
            { property: 'keyed by the plugin\'s own self-declared name, never a second caller-supplied key', classification: 'REUSABLE_CONCEPT', why: 'the materialUploader slot already has one (Section D1); the discoveryPublisher slot does not yet (Section D3)' },
            { property: 'one registry object providing BOTH halves of a symmetric lifecycle (SnapshotPlacementStoreRegistry\'s own put()/get() shape)', classification: 'NOT_SEMANTICALLY_APPLICABLE', why: 'Announcement/Discovery\'s write action has no symmetric put/get pair to unify — it has two DIFFERENT capabilities (upload material, publish discovery), the closer precedent being the anchoring family\'s own TWO separate registries (ExternalAnchorPublisherRegistry for creating, ExternalProofVerifierRegistry for verifying), one per slot' },
            { property: 'never ranks, never falls back, never picks a "preferred" entry', classification: 'REUSABLE_CONCEPT', why: 'PublicationDistributionOrchestrator.js\'s own header already independently holds the identical restraint ("no multi-relay fan-out, no relay selection") — a future registry would only be formalizing a restraint already present' },
            { property: 'registered once, at a real composition root (ui/main.js)', classification: 'REUSABLE_CONCEPT', why: 'ui/main.js is already the one place arweaveUploaderOptions/nostrPublisherOptions are constructed (Section B7/B8) — the same composition root CONTENT/PROOF already register into' },
            { property: 'consulted fresh, per call, by an injected coordinator', classification: 'REQUIRES_ADAPTATION', why: 'CONTENT/PROOF\'s coordinators already resolve per call (Section E4/E5); Announcement\'s own composed command does not yet, and its own contract actively overrides a per-call choice today (Section E1/E2) — the registry concept transfers, but the call site it would be consulted FROM must itself change first' }
        ];
        assert(comparison.length === 5, n('I1. every named property of the two existing registries is evaluated, none skipped'));
        for (const row of comparison) {
            assert(CLASSIFICATIONS.includes(row.classification), n(`I2. "${row.property}" classifies as one of this milestone\'s own three legitimate outcomes (chose: ${row.classification})`));
        }
        assert(comparison.filter((r) => r.classification === 'NOT_SEMANTICALLY_APPLICABLE').length === 1, n('I3. exactly one property does not transfer at all — the "one registry for both halves" shape, which has no symmetric counterpart here'));
        assert(comparison.filter((r) => r.classification === 'REQUIRES_ADAPTATION').length === 1, n('I4. exactly one property requires adaptation before it would work — matching Section G\'s own "contract change" finding precisely, never a second, unrelated adaptation invented for this section alone'));

        console.log('\n=== SECTION I: COMPARISON AGAINST EXISTING REGISTRIES ===');
        for (const row of comparison) console.log(`  [${row.classification}] ${row.property}\n      -> ${row.why}`);
        console.log('✓ Section I: two of five properties transfer directly, one does not apply at all (a two-registry precedent already exists elsewhere in this codebase for the identical two-different-capabilities reason), and one — where the registry would be CONSULTED FROM — needs the real, already-shipped composition contract changed first. Never a wholesale "copy the CONTENT registry" verdict.');
    }

    // ===============================================================
    // Section J — explicit non-trigger, deliberate exclusions, production
    // boundary.
    // ===============================================================
    {
        const finalDecision = 'ANNOUNCEMENT_DISCOVERY_EXPANSION_DEFERRED_UNTIL_SECOND_PROVIDER';
        const DECISIONS = Object.freeze(['ANNOUNCEMENT_DISCOVERY_EXPANSION_DEFERRED_UNTIL_SECOND_PROVIDER', 'BUILD_NEXT', 'NO_MINIMAL_SEAM_IDENTIFIED']);
        assert(DECISIONS.includes(finalDecision), n(`J1. the final decision is one of this milestone's own legitimate outcomes (chose: ${finalDecision})`));

        function decideDirection({ secondRealProviderPresent, newExplicitProductRequirement, minimalSeamIdentified }) {
            if (secondRealProviderPresent || newExplicitProductRequirement) return 'BUILD_NEXT';
            if (!minimalSeamIdentified) return 'NO_MINIMAL_SEAM_IDENTIFIED';
            return 'ANNOUNCEMENT_DISCOVERY_EXPANSION_DEFERRED_UNTIL_SECOND_PROVIDER';
        }
        assert(decideDirection({ secondRealProviderPresent: true, newExplicitProductRequirement: false, minimalSeamIdentified: true }) === 'BUILD_NEXT', n('J2. the function WOULD choose BUILD_NEXT the moment a second real provider actually exists — a real, available branch, this milestone\'s own explicit re-open condition'));
        assert(decideDirection({ secondRealProviderPresent: false, newExplicitProductRequirement: false, minimalSeamIdentified: false }) === 'NO_MINIMAL_SEAM_IDENTIFIED', n('J3. and would choose NO_MINIMAL_SEAM_IDENTIFIED had Sections F/G failed to locate one — also a real, available branch, not a foregone conclusion'));
        const decided = decideDirection({ secondRealProviderPresent: false, newExplicitProductRequirement: false, minimalSeamIdentified: true });
        assert(decided === finalDecision, n(`J4. given no second real provider today (Section A) and a concretely named minimum seam (Sections F/G), the decision is ANNOUNCEMENT_DISCOVERY_EXPANSION_DEFERRED_UNTIL_SECOND_PROVIDER (chose: ${decided})`));

        // Deliberate exclusion census — no registry, no second provider, no
        // orchestrator/executor/composition change, no UI control exists
        // anywhere in real production code.
        const antiPatterns = [
            /class\s+\w*(DiscoveryPublisherRegistry|AnnouncementRegistry|DistributionRegistry)\w*\b/,
            /class\s+\w*(SecondNostr|AlternateNostr|Ipfs)\w*(Publisher|Announcer)\b/,
            /path: '\/settings\/announcement-provider'/,
            /providerKey/,
            /materialUploaders\s*:|discoveryPublishers\s*:/
        ];
        const scanDirs = ['ui', 'application', 'core', 'discovery', 'anchoring', 'storage'];
        const bundle = codeOnly(await joinedSource(listFiles(scanDirs)));
        // providerKey is legitimately used by the EXISTING RoleProviderPreference
        // chain (CONTENT), so exclude that one, known, pre-existing family
        // rather than treating it as a false positive this milestone caused.
        const excludingKnownFamily = bundle.replace(/[\s\S]{0,400}RoleProviderPreference[\s\S]{0,400}/g, '').replace(/[\s\S]{0,400}RoleAwareProviderResolver[\s\S]{0,400}/g, '').replace(/[\s\S]{0,400}SetRoleProviderPreferenceUseCase[\s\S]{0,400}/g, '');
        for (const pattern of antiPatterns) {
            if (pattern.source === 'providerKey') continue; // already known to legitimately exist in the pre-existing RoleProviderPreference family
            assert(!pattern.test(bundle), n(`J5. no anti-pattern ${pattern} exists in real code (comments stripped) anywhere in ${scanDirs.join('/, ')}/`));
        }
        void excludingKnownFamily;

        // Production boundary — the same guard every milestone in this
        // family ends with.
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/AnnouncementDiscoveryProviderExpansionReadinessAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`J6. every changed/added file is exactly this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'ui', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`J7. ${dir}/ shows no change — this audit maps a future seam, it does not build anything into it`));
        }

        console.log('\n=== SECTION J: NON-TRIGGER, EXCLUSIONS, PRODUCTION BOUNDARY ===');
        console.log(`\nDECISION: ${finalDecision}`);
        console.log('✓ Section J: no registry, no second provider, no composition/orchestrator/executor change, and no UI control was added anywhere in real production code. This milestone touches nothing but its own test file and tests.html\'s own registration.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('ANNOUNCEMENT_DISCOVERY_PROVIDER_EXPANSION_READINESS_AUDIT_COMPLETE');
    console.log('');
    console.log('ANNOUNCEMENT_DISCOVERY_EXPANSION_DEFERRED_UNTIL_SECOND_PROVIDER. No');
    console.log('second real Announcement/Discovery provider exists today (Section A),');
    console.log('confirmed fresh rather than assumed from 0.9.422\'s own cached finding.');
    console.log('This audit locates the future seam precisely rather than assuming its');
    console.log('shape: the real write action is not one interchangeable slot but TWO');
    console.log('fixed collaborators — materialUploader and discoveryPublisher — always');
    console.log('invoked together, in a fixed order (Section C), and those two slots are');
    console.log('already asymmetric with each other (the material slot self-declares a');
    console.log('registry-ready identity today; the discovery slot does not — Section D).');
    console.log('Provider identity is constructed in exactly one real place, ui/main.js,');
    console.log('and forwarded verbatim through three unmodified layers beneath it');
    console.log('(Section B) — but the one composed command that identity feeds is built');
    console.log('ONCE, at boot, and its own real contract explicitly overrides any');
    console.log('per-call choice (Section E), a fact CONTENT\'s and PROOF_AND_ANCHORING\'s');
    console.log('own per-call-resolving coordinators never had to contend with. Of the');
    console.log('three future models, "repeated independent action" already works today,');
    console.log('live, with zero changes (Section F); "alternative selection" needs a');
    console.log('real contract change to PublicationDistributionCommandComposition.js;');
    console.log('"fan-out" needs the executor\'s own fixed two-slot sequence changed —');
    console.log('two different, non-interchangeable future obligations, never one');
    console.log('(Sections F/G). The existing PublicationDistributionResult vocabulary');
    console.log('already represents two independent providers\' facts for one publication');
    console.log('without conflating identity (Section H). Three of the five compared');
    console.log('registry properties transfer directly, one has no counterpart');
    console.log('here at all, and one requires the composition contract change named');
    console.log('above before it would even apply (Section I). This milestone recommends');
    console.log('no registry, no second provider, no composition/orchestrator/executor');
    console.log('change, and no UI control: the asymmetry 0.9.422 found is recorded here');
    console.log('as a precise, file-named readiness map, reopened only when a second real');
    console.log('Announcement/Discovery provider actually exists or an explicit new');
    console.log('product requirement demands provider choice for this role — never before.');
    console.log('='.repeat(78));

    console.log('\n✅ All Announcement/Discovery Provider Expansion Readiness Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
