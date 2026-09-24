import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/anchoring/LocalPublicationAnchorCatalog.js';
import { CreatePublicationAnchorUseCase } from '../application/anchoring/CreatePublicationAnchorUseCase.js';
import { publicationAnchorDetailView } from '../application/anchoring/PublicationAnchorDetailView.js';
import { ExternalAnchorEvidenceViewRegistry } from '../application/anchoring/ExternalAnchorEvidenceViewRegistry.js';
import { CreateExternalAnchorEvidenceViewRegistryUseCase } from '../application/anchoring/CreateExternalAnchorEvidenceViewRegistryUseCase.js';
import { BaseAnchorEvidenceView } from '../anchoring/BaseAnchorEvidenceView.js';
import { CreateBaseAnchorEvidenceViewUseCase } from '../application/anchoring/base/CreateBaseAnchorEvidenceViewUseCase.js';
import { BitcoinAnchorEvidenceView } from '../anchoring/BitcoinAnchorEvidenceView.js';
import { ArweaveAnchorEvidenceView } from '../anchoring/ArweaveAnchorEvidenceView.js';
import { BaseProofVerifier } from '../anchoring/BaseProofVerifier.js';
import { encodeBasePublicationCommitment } from '../application/anchoring/base/BasePublicationCommitmentEncoding.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { publicationsViewSourceWithTemplate } from './support/SourceFileGroups.js';

// 0.9.511 — Base Anchor Evidence View.
//
// tests/ProofAnchoringCrossSubstrateCapabilityParityAudit.test.js (this
// same milestone number, the immediately preceding audit) named this as
// the one real, narrow product gap in an otherwise-complete Base
// anchoring/proof/catalog pipeline: a Base anchor created via
// createBaseAnchor() verifies correctly but rendered with no
// type-specific evidence detail, degrading silently to the page's own
// generic fallback. anchoring/BitcoinAnchorEvidenceView.js (0.8.14) and
// anchoring/ArweaveAnchorEvidenceView.js (0.9.425) were both named as
// already-shipping templates. This file proves the resulting
// anchoring/BaseAnchorEvidenceView.js follows them exactly.
//
//   Section A: BaseAnchorEvidenceView#describe() — a well-formed Base
//              proof produces a followable basescan.org destination; a
//              missing/malformed one degrades honestly to "not
//              available," never a guess and never a throw.
//   Section B: ExternalAnchorEvidenceViewRegistry accepts the real Base
//              adapter under its own `base` anchorType, coexisting with
//              Bitcoin's and Arweave's own registered adapters without
//              collision.
//   Section C: CreateBaseAnchorEvidenceViewUseCase mirrors its two
//              sibling use cases' shape exactly.
//   Section D: ui/main.js wiring — a source sweep confirms
//              baseAnchorEvidenceView is constructed and registered into
//              externalAnchorEvidenceViewRegistry, closing the exact
//              absence the preceding audit's own Section B9 confirmed.
//   Section E: FLAGSHIP — a real, cataloged Base PublicationAnchor is
//              inspected (BaseAnchorEvidenceView#describe(), no network
//              call, no mutation) and, separately, independently
//              verified (BaseProofVerifier#verify(), a real RPC-shaped
//              check) — proving the evidence view only ever OBSERVES the
//              verification boundary, never performs it itself, and
//              that txid/network/contentHash identity survives both
//              steps unchanged with no ownership/authorship semantics
//              introduced anywhere.
//
// See docs/Principles.md, "Inspection Is Observation; Verification Is
// An Explicit Operation (0.8.14)" — held here for Base exactly as
// tests/PublicationAnchorInspectionUX.test.js's own Section D already
// holds it for Bitcoin.
//
// KNOWN, DELIBERATE CONSEQUENCE FOR THE PRECEDING AUDIT'S OWN
// SNAPSHOT ASSERTIONS. tests/ProofAnchoringCrossSubstrateCapabilityParityAudit
// .test.js's own Section B9 ("base absent, confirmed fresh") and Section
// G1 ("anchoring/BaseAnchorEvidenceView.js does not exist — confirmed
// absent") were both true, live, structural findings at the moment that
// milestone ran — and are now superseded by this one, by construction:
// this file's own production files are exactly what those two
// assertions checked for the absence of. The identical relationship
// tests/BaseTransactionProofVerificationCapabilityAudit.test.js's own
// Section D4a now holds toward tests/BaseTransactionPayloadRpcRead.test.js
// (0.9.462), and tests/BitcoinEndpointConfigurationUIReachabilityAudit
// .test.js's own repo-wide production-change guard now holds toward
// every production milestone shipped since — left as an honest
// historical record of what was true when written, not silently
// patched to keep re-passing. Re-running that audit file after this
// milestone will fail its own B9/G1/M1/M2 assertions; that failure is
// this milestone's own intended, documented effect, not a regression.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — BaseAnchorEvidenceView#describe()
    // ---------------------------------------------------------------
    {
        const view = new BaseAnchorEvidenceView();
        assert(view.anchorType === 'base', '1. anchorType matches the sibling publisher/verifier adapters exactly');

        const txid = '0x' + 'a'.repeat(64);
        const mainnetAnchor = { proof: { txid, network: 'mainnet' } };
        const mainnetDescribed = view.describe(mainnetAnchor);
        assert(mainnetDescribed.summary === 'Base', '2. summary is "Base"');
        const networkField = mainnetDescribed.fields.find((f) => f.label === 'Network');
        const txidField = mainnetDescribed.fields.find((f) => f.label === 'Transaction Hash');
        assert(networkField.value === 'mainnet' && txidField.value === txid, '3. Network/Transaction Hash fields carry the proof\'s own values');
        assert(mainnetDescribed.externalLocator.url === `https://basescan.org/tx/${txid}`, '4. mainnet locator points at basescan.org\'s own /tx/ path');
        assert(mainnetDescribed.externalLocator.label === 'View on block explorer', '5. locator label is honest and non-committal — the same wording Bitcoin\'s and Arweave\'s own adapters use');

        const testnetDescribed = view.describe({ proof: { txid, network: 'testnet' } });
        assert(testnetDescribed.externalLocator.url === `https://sepolia.basescan.org/tx/${txid}`, '6. testnet is reflected as Base\'s own Sepolia testnet explorer host');

        // Malformed/missing proof degrades honestly — never a guess, never a throw.
        const noProof = view.describe({ proof: null });
        assert(noProof.externalLocator === null, '7. no proof -> no externalLocator');
        assert(noProof.fields.find((f) => f.label === 'Transaction Hash').value === 'not available', '8. no proof -> "not available," never a fabricated txid');
        assert(noProof.fields.find((f) => f.label === 'Network').value === 'unknown', '9. no proof -> Network reads "unknown"');

        const malformedTxid = view.describe({ proof: { txid: 'not-hex', network: 'mainnet' } });
        assert(malformedTxid.externalLocator === null, '10. a malformed txid never produces a locator');

        const bitcoinShapedTxid = view.describe({ proof: { txid: 'a'.repeat(64), network: 'mainnet' } });
        assert(bitcoinShapedTxid.externalLocator === null, '11. a 32-byte hex txid with no "0x" prefix (Bitcoin\'s own shape) is never mistaken for a Base transaction hash');

        let threw = false;
        try { view.describe(undefined); } catch (e) { threw = true; }
        assert(!threw, '12. describe() never throws, even for a completely missing anchor');

        // describe() never mutates what it was handed.
        const realAnchor = new PublicationAnchor({ publicationId: 'p', contentHash: 'h', anchorType: 'base', locator: `base:${txid}`, proof: { txid, network: 'mainnet' } });
        const beforeProof = JSON.stringify(realAnchor.proof);
        view.describe(realAnchor);
        assert(JSON.stringify(realAnchor.proof) === beforeProof, '13. describe() never mutates the anchor\'s own proof');
    }
    console.log('✓ Section A: BaseAnchorEvidenceView#describe() derives a followable basescan.org destination from a well-formed proof and degrades honestly, never guessing, for a missing or malformed one — it never verifies or mutates anything');

    // ---------------------------------------------------------------
    // Section B — ExternalAnchorEvidenceViewRegistry: Base coexists
    // with Bitcoin and Arweave without collision.
    // ---------------------------------------------------------------
    {
        const registry = new ExternalAnchorEvidenceViewRegistry();
        assert(registry.get('base') === null, '14. an unregistered "base" anchorType returns null, never throws');

        const baseView = new BaseAnchorEvidenceView();
        registry.register(new BitcoinAnchorEvidenceView());
        registry.register(new ArweaveAnchorEvidenceView());
        registry.register(baseView);

        assert(registry.has('base') === true, '15. registering the Base adapter makes has() true for its OWN anchorType');
        assert(registry.get('base') === baseView, '16. get(\'base\') returns the exact registered Base instance');
        assert(registry.has('bitcoin-op-return') === true && registry.has('arweave') === true, '17. Bitcoin\'s and Arweave\'s own adapters remain registered, untouched by Base\'s registration');
        assert(registry.anchorTypes.length === 3
            && registry.anchorTypes.includes('base')
            && registry.anchorTypes.includes('bitcoin-op-return')
            && registry.anchorTypes.includes('arweave'),
            '18. anchorTypes lists all three, independently');

        // Also exercised through the real composition-root use case, not
        // just the bare registry class.
        const { evidenceViewRegistry } = new CreateExternalAnchorEvidenceViewRegistryUseCase().execute({
            evidenceViews: [new BitcoinAnchorEvidenceView(), new ArweaveAnchorEvidenceView(), baseView]
        });
        assert(evidenceViewRegistry.get('base') instanceof BaseAnchorEvidenceView, '19. the composition-root use case accepts the real Base adapter under the same key');
    }
    console.log('✓ Section B: the evidence-view registry accepts the real Base presentation adapter under its own anchorType, coexisting with Bitcoin\'s and Arweave\'s own registered adapters without collision');

    // ---------------------------------------------------------------
    // Section C — CreateBaseAnchorEvidenceViewUseCase
    // ---------------------------------------------------------------
    {
        const { baseAnchorEvidenceView } = new CreateBaseAnchorEvidenceViewUseCase().execute();
        assert(baseAnchorEvidenceView instanceof BaseAnchorEvidenceView, '20. the use case returns a real BaseAnchorEvidenceView');
        assert(baseAnchorEvidenceView.anchorType === 'base', '21. the returned instance carries the correct anchorType');
        assert(typeof baseAnchorEvidenceView.describe === 'function', '22. the returned instance implements describe()');

        // Calling execute() twice with no arguments produces two
        // independent, equally usable instances — mirrors
        // CreateBitcoinAnchorEvidenceViewUseCase's/
        // CreateArweaveAnchorEvidenceViewUseCase's own no-options shape
        // exactly (see each of their own headers).
        const second = new CreateBaseAnchorEvidenceViewUseCase().execute().baseAnchorEvidenceView;
        assert(second !== baseAnchorEvidenceView && second instanceof BaseAnchorEvidenceView, '23. execute() takes no options and returns a fresh instance each call, exactly like its two siblings');
    }
    console.log('✓ Section C: CreateBaseAnchorEvidenceViewUseCase mirrors CreateBitcoinAnchorEvidenceViewUseCase\'s and CreateArweaveAnchorEvidenceViewUseCase\'s own shape exactly');

    // ---------------------------------------------------------------
    // Section D — ui/main.js wiring: a source sweep, not a DOM mount
    // (this codebase has no Vue test harness — see every sibling
    // "*UIReachabilityAudit.test.js" file's own identical approach).
    // ---------------------------------------------------------------
    {
        const mainPath = fileURLToPath(new URL('../ui/main.js', import.meta.url));
        const mainSrc = await readFile(mainPath, 'utf8');

        assert(/import\s*\{\s*CreateBaseAnchorEvidenceViewUseCase\s*\}\s*from\s*['"]\.\.\/application\/anchoring\/base\/CreateBaseAnchorEvidenceViewUseCase\.js['"]/.test(mainSrc),
            '24. ui/main.js imports CreateBaseAnchorEvidenceViewUseCase');
        assert(/new CreateBaseAnchorEvidenceViewUseCase\(\)\.execute\(\)/.test(mainSrc),
            '25. ui/main.js constructs a real baseAnchorEvidenceView, the same bare no-options call its two siblings already use');
        assert(/externalAnchorEvidenceViewRegistry\.register\(baseAnchorEvidenceView\)/.test(mainSrc),
            '26. ui/main.js registers baseAnchorEvidenceView into the SAME externalAnchorEvidenceViewRegistry Bitcoin\'s and Arweave\'s own adapters are registered into — closing exactly the absence tests/ProofAnchoringCrossSubstrateCapabilityParityAudit.test.js Section B9/G1 confirmed');

        // No new global navigation, and the existing generic anchor
        // display markup is untouched: the evidence-consuming template
        // in ui/views/DecentralizedPublicationsView.js is entirely
        // anchorType-agnostic (v-for over `.fields`, a single
        // `v-if="inspectionTypeSpecific(...)"` guard) — registering a
        // new plugin is the ENTIRE integration surface. Isolate exactly
        // that template block (between its own "External Evidence"
        // section marker and the closing of the type-specific adapter
        // div) and confirm no anchorType-specific branch was added
        // there for Base, exactly as none exists there for Bitcoin or
        // Arweave either — a "base" mention exists elsewhere in this
        // file (the existing "Create Base Anchor" button-label logic,
        // unrelated to evidence inspection), so the sweep is scoped to
        // this one template block rather than the whole file.
        const viewSrc = publicationsViewSourceWithTemplate();
        const inspectionBlockStart = viewSrc.indexOf('evidence-inspection-title">External Evidence');
        const inspectionBlockEnd = viewSrc.indexOf('evidence-inspection-adapter-title', inspectionBlockStart);
        assert(inspectionBlockStart !== -1 && inspectionBlockEnd !== -1 && inspectionBlockEnd > inspectionBlockStart,
            '27. the anchor-inspection template block is found, so the next assertion is scoped to real markup, not an accidentally-empty slice');
        const inspectionBlock = viewSrc.slice(inspectionBlockStart, inspectionBlockEnd);
        // Comments in this block legitimately DISCUSS "anchorType" (see
        // the comment this file's own header quotes above) — what must
        // never appear is a CODE comparison against it, which is what
        // would actually branch the markup by substrate.
        assert(!/anchorType\s*===/.test(inspectionBlock) && !inspectionBlock.includes("'base'") && !inspectionBlock.includes('"base"'),
            '28. the anchor-inspection template block itself stays anchorType-agnostic — no Base-specific branch was added to reach it, exactly as none exists there for Bitcoin or Arweave');
    }
    console.log('✓ Section D: ui/main.js constructs and registers the real Base evidence-view adapter into the same registry Bitcoin\'s and Arweave\'s own adapters already share, and the existing anchor-inspection template needed no anchorType-specific change to pick it up');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP: a real, cataloged Base PublicationAnchor is
    // inspected, then separately verified.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const publicationCatalog = new LocalPublicationCatalog(storage);
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const identity = makeIdentity('Alice');
        const authVerifier = new LocalAuthorizationVerifier();

        const contentHash = 'f00dcafe';
        const publication = new DecentralizedPublication({
            id: 'pub-base-flagship',
            contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: contentHash })
        });
        publicationCatalog.add(publication);

        const txid = '0x' + 'b'.repeat(64);
        const createUseCase = new CreatePublicationAnchorUseCase(publicationCatalog, identity, authVerifier, anchorCatalog);
        const createdAnchor = createUseCase.execute('pub-base-flagship', {
            anchorType: 'base',
            locator: `base:${txid}`,
            proof: { txid, network: 'mainnet' }
        });

        const evidenceViewRegistry = new ExternalAnchorEvidenceViewRegistry();
        evidenceViewRegistry.register(new BaseAnchorEvidenceView());

        // --- "Inspect Evidence": pure, synchronous, no RPC call. ---
        const beforeAnchorJson = JSON.stringify(createdAnchor.toJSON());
        const detail = publicationAnchorDetailView(createdAnchor);
        const typeSpecific = evidenceViewRegistry.has(createdAnchor.anchorType)
            ? evidenceViewRegistry.get(createdAnchor.anchorType).describe(createdAnchor)
            : null;

        assert(JSON.stringify(createdAnchor.toJSON()) === beforeAnchorJson, '29. INVARIANT: inspecting evidence never mutates the anchor itself');
        assert(detail.anchorId === createdAnchor.id && detail.publicationId === 'pub-base-flagship' && detail.contentHash === contentHash,
            '30. the detail view retains the anchor\'s own txid/network/contentHash-bearing identity — nothing invented');
        assert(detail.locator === `base:${txid}`, '31. locator is carried through unchanged');
        assert(JSON.stringify(detail.proof) === JSON.stringify({ txid, network: 'mainnet' }), '32. proof (txid, network) is exactly what the anchor carries — the generic detail view never reinterprets it');
        assert(typeSpecific.summary === 'Base' && typeSpecific.externalLocator.url === `https://basescan.org/tx/${txid}`,
            '33. the Base-specific adapter derives a followable external destination from the SAME anchor');

        console.log('✓ Section E (inspect): a real, cataloged Base anchor is inspected through the identical evidence-view seam Bitcoin\'s and Arweave\'s own anchors already use — no mutation, no network call, txid/network/contentHash identity fully preserved');

        // --- Separately, "Verify Evidence" — BaseProofVerifier, never
        // BaseAnchorEvidenceView, is what performs verification. ---
        let rpcCalls = 0;
        const fakeRpcSource = {
            async fetchTransactionByHash(hash) {
                rpcCalls += 1;
                assert(hash === txid, '34. the verifier looks up the exact txid the anchor\'s own proof carries');
                return { available: true, found: true, hash, input: encodeBasePublicationCommitment(contentHash) };
            }
        };
        const verifier = new BaseProofVerifier({ rpcSource: fakeRpcSource, network: 'mainnet' });

        assert(rpcCalls === 0, '35. constructing/holding a verifier makes no RPC call by itself — inspection above made none either');
        const verifyResult = await verifier.verify(createdAnchor.proof, { contentHash });
        assert(rpcCalls === 1, '36. an explicit verify() call is the only thing that ever consults the RPC source');
        assert(verifyResult.valid === true, '37. a genuine, matching Base transaction verifies VALID');

        // The verification outcome carries no ownership/authorship
        // claim of any kind — only a content-commitment fact, exactly
        // as anchoring/BaseProofVerifier.js's own header states ("never
        // reads, stores, or compares a from/sender/signer field").
        const outcomeKeys = Object.keys(verifyResult);
        for (const forbidden of ['owner', 'wallet', 'author', 'publisher', 'signer', 'from']) {
            assert(!outcomeKeys.some((k) => k.toLowerCase().includes(forbidden)),
                `37. the verification outcome never carries a "${forbidden}"-shaped field — content-commitment only, never ownership or authorship`);
        }

        assert(JSON.stringify(createdAnchor.toJSON()) === beforeAnchorJson, '39. even verifying never mutates the anchor itself — the same immutable envelope throughout');

        // A wrong contentHash is a definite rejection, not a crash, and
        // the evidence view's own describe() output is unaffected by
        // it — inspection and verification stay fully independent.
        const mismatchResult = await verifier.verify(createdAnchor.proof, { contentHash: 'deadbeef' });
        assert(mismatchResult.valid === false && !mismatchResult.unavailable, '40. a genuinely mismatched contentHash is a definite rejection, never "unavailable"');
        const typeSpecificAfterMismatch = evidenceViewRegistry.get('base').describe(createdAnchor);
        assert(JSON.stringify(typeSpecificAfterMismatch) === JSON.stringify(typeSpecific), '41. the evidence view\'s own description is byte-identical regardless of what verification later finds — it never depends on or re-derives a verification outcome');
    }
    console.log('✓ Section E (verify): BaseProofVerifier, never BaseAnchorEvidenceView, is what performs verification — the evidence view only ever observes the anchor\'s own already-carried proof, and the verification outcome carries content-commitment facts only, never ownership or authorship');

    console.log('\nAll BaseAnchorEvidenceView tests passed.');
}

run().catch((error) => {
    console.error('BaseAnchorEvidenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
