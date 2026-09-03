import { readFile } from 'node:fs/promises';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { Publication } from '../publisher/Publication.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { inspectWorldEncounterMaterial } from '../application/WorldEncounterMaterialInspection.js';
import { WorldEncounterMaterialLoadStatus } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';

// 0.9.99 — Decentralized Material Verification World View Integration.
//
// 0.9.16 through 0.9.43 built a complete, independently-tested material
// inspection/verification chain — selection, resolution, loading (local/
// peer/decentralized), identity verification, signature verification, and
// an orchestration boundary (`inspectWorldEncounterMaterial()`) tying all
// of it together — and `ui/components/WorldEncounterCanvas.js` (0.9.39/
// 0.9.40) has rendered that chain's own result ("Material"/"Verification"
// panels showing `loading.status`/`verification.status`, unchanged) since
// 0.9.39. But every mount of that component in this running app left its
// `materialSources`/`materialVerifier` props at their own default of
// `null` — `ui/main.js` never once called `LocalWorldEncounterMaterialSource`
// or `composeWorldEncounterMaterialVerifier()` (0.9.43's own header named
// this gap explicitly: "wiring it into `ui/main.js`'s own dependency
// graph... remains a separate, later, unscheduled step"), so the panel
// that already existed had nothing real to show. This suite proves the one
// thing this milestone actually adds: `ui/main.js` now composes those two
// existing, unmodified roots and provides them app-wide, and
// `ui/views/WorldView.js` now hands them straight through to
// `WorldEncounterCanvas`'s own existing props — no new verification
// semantics, no new UI vocabulary, no new observation/polling mechanism,
// and no second implementation of anything the chain above already owns.
//
// Section A: FLAGSHIP — the REAL, production `LocalWorldEncounterMaterialSource`
//            + `composeWorldEncounterMaterialVerifier()` composition (not
//            fakes) carries a genuinely signed local Publication all the
//            way to VERIFIED, exactly the call `WorldEncounterCanvas.
//            refreshMaterialInspection()` already makes.
// Section B: tampering with the persisted material after signing is
//            actively REJECTED — never a false pass.
// Section C: a selection naming a Publication this replica never stored
//            resolves to UNAVAILABLE loading / UNVERIFIABLE verification —
//            never a thrown error, never a guessed result.
// Section D: repeated inspection of the same, unchanged material is
//            deterministic — polling this chain can never itself change
//            what it reports.
// Section E: architectural regression — `ui/main.js` composes the two
//            existing roots and provides them app-wide, without ever
//            constructing a concrete verifier/identity/signature class
//            itself (that stays entirely inside the composition root it
//            calls).
// Section F: architectural regression — `ui/views/WorldView.js` injects
//            both collaborators (defaulting to `null`, never throwing) and
//            forwards them verbatim to `WorldEncounterCanvas`'s own props;
//            it never calls `inspectWorldEncounterMaterial()`,
//            `verifyIdentity()`, or any verifier itself, introduces no
//            TRUSTED/UNTRUSTED/SAFE/UNSAFE/AUTHENTIC/SUSPICIOUS vocabulary,
//            and the pre-existing `registry` prop / VehicleInteractionPrompt
//            wiring stay exactly as 0.9.17/0.9.98 left them.

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

function buildRealSigner(storage, username) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(username);
    return provider;
}

// Builds a genuinely, cryptographically signed Publication — the exact
// sequence `publisher/LocalPublisherProvider.js` already uses in
// production — and persists it under the SAME `forkbuild-publications`
// storage key `discovery/LocalDiscoveryProvider.js` (and therefore
// `LocalWorldEncounterMaterialSource`) already reads.
function signAndPersistPublication(storage, identityProvider, overrides = {}) {
    const publisherIdentity = identityProvider.getSigningIdentity().toJSON();
    let publication = new Publication({
        id: 'pub-material-verification-1',
        documentId: 'doc-1',
        title: 'A Locally Published World Encounter',
        author: 'alice',
        publisherIdentity,
        signature: null,
        ...overrides
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    storage.save('forkbuild-publications', [publication.toJSON()]);
    return publication;
}

function selectionOf(objectId) {
    return Object.freeze({ kind: WorldEncounterKind.PUBLICATION, objectId, origin: LOCAL_WORLD_DISCOVERY_ORIGIN });
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A — FLAGSHIP: real production composition, end to end
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'material-ui-alice-a');
        const publication = signAndPersistPublication(storage, alice);

        const materialSources = { local: new LocalWorldEncounterMaterialSource(storage) };
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const result = await inspectWorldEncounterMaterial({
            resolvedSelection: selectionOf(publication.id),
            materialSources,
            verifier
        });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '1. FLAGSHIP: a locally published, signed Publication loads AVAILABLE through the real LocalWorldEncounterMaterialSource');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '2. FLAGSHIP: the real composed identity+signature verifier reports VERIFIED for its own genuine signature');
        assert(Object.isFrozen(result) && Object.isFrozen(result.loading) && Object.isFrozen(result.verification),
            '3. the orchestration result and its nested loading/verification are frozen');

        console.log('✓ Flagship: real local material source + real composed verifier carry a genuine signature to VERIFIED');
    }

    // -------------------------------------------------------------
    // Section B — tampering is actively rejected
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'material-ui-alice-b');
        const publication = signAndPersistPublication(storage, alice);

        // Tamper with the persisted record after signing — the exact
        // "content changed after the signature was produced" scenario.
        const records = storage.load('forkbuild-publications');
        records[0].title = 'A Different Title Entirely';
        storage.save('forkbuild-publications', records);

        const materialSources = { local: new LocalWorldEncounterMaterialSource(storage) };
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const result = await inspectWorldEncounterMaterial({
            resolvedSelection: selectionOf(publication.id),
            materialSources,
            verifier
        });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE,
            '4. tampered material still LOADS (retrieval and verification are separate questions)');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '5. tampering with signed content after signing is actively REJECTED, never a false pass');

        console.log('✓ Tampering with a locally stored, signed publication is actively rejected');
    }

    // -------------------------------------------------------------
    // Section C — an unknown selection degrades honestly, never throws
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const materialSources = { local: new LocalWorldEncounterMaterialSource(storage) };
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const result = await inspectWorldEncounterMaterial({
            resolvedSelection: selectionOf('pub-never-published'),
            materialSources,
            verifier
        });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE,
            '6. a Publication this replica never stored loads UNAVAILABLE, never a thrown error');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE,
            '7. with nothing loaded there is nothing to judge — UNVERIFIABLE, never REJECTED and never a guess');

        console.log('✓ An unknown local selection degrades honestly to UNAVAILABLE/UNVERIFIABLE');
    }

    // -------------------------------------------------------------
    // Section D — repeated inspection is deterministic
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const alice = buildRealSigner(storage, 'material-ui-alice-d');
        const publication = signAndPersistPublication(storage, alice);

        const materialSources = { local: new LocalWorldEncounterMaterialSource(storage) };
        const { verifier } = composeWorldEncounterMaterialVerifier();

        const first = await inspectWorldEncounterMaterial({
            resolvedSelection: selectionOf(publication.id),
            materialSources,
            verifier
        });
        for (let i = 0; i < 3; i++) {
            const again = await inspectWorldEncounterMaterial({
                resolvedSelection: selectionOf(publication.id),
                materialSources,
                verifier
            });
            assert(again.loading.status === first.loading.status && again.verification.status === first.verification.status,
                '8. repeated inspection of unchanged material reports the identical status, every time');
        }

        console.log('✓ Repeated inspection of unchanged material is deterministic');
    }

    // -------------------------------------------------------------
    // Section E — architectural regression: ui/main.js
    // -------------------------------------------------------------
    {
        const mainSourceUrl = new URL('../ui/main.js', import.meta.url);
        const mainSource = await readFile(mainSourceUrl, 'utf8');
        const mainCodeOnly = mainSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(mainCodeOnly.includes("import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';"),
            '9. ui/main.js imports the existing, unmodified LocalWorldEncounterMaterialSource — never a second local loader');
        assert(mainCodeOnly.includes("import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';"),
            '10. ui/main.js imports the existing, unmodified composeWorldEncounterMaterialVerifier() composition root');
        assert(mainCodeOnly.includes('new LocalWorldEncounterMaterialSource(') && mainCodeOnly.includes('composeWorldEncounterMaterialVerifier('),
            '11. ui/main.js actually calls both — not merely importing them unused');
        assert(mainCodeOnly.includes("app.provide('worldEncounterMaterialSources'") && mainCodeOnly.includes("app.provide('worldEncounterMaterialVerifier'"),
            '12. ui/main.js provides both app-wide, the same convention every other collaborator in this file already uses');

        // ui/main.js never reaches past the composition root to construct a
        // concrete verifier/identity/signature class itself — that stays
        // entirely inside composeWorldEncounterMaterialVerifier(), never
        // duplicated here.
        assert(!/WorldEncounterMaterialIdentityVerifier|WorldEncounterMaterialSignatureVerifier|WorldEncounterMaterialVerificationComposition/.test(mainCodeOnly),
            '13. ui/main.js never imports or names a concrete verifier class directly — only the composition root that already builds them');
        assert(!/PeerWorldEncounterMaterialSource|DecentralizedWorldEncounterMaterialSource|ArweaveWorldEncounterMaterialResolver|DecentralizedWorldDiscoveryLeadRegistry/.test(mainCodeOnly),
            '14. peer/decentralized material sources and decentralized lead resolution stay deliberately unwired this milestone');

        console.log('✓ ui/main.js composes the two existing roots verbatim and provides them app-wide');
    }

    // -------------------------------------------------------------
    // Section F — architectural regression: ui/views/WorldView.js
    // -------------------------------------------------------------
    {
        const viewSourceUrl = new URL('../ui/views/WorldView.js', import.meta.url);
        const viewSource = await readFile(viewSourceUrl, 'utf8');
        const viewCodeOnly = viewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(viewCodeOnly.includes("inject('worldEncounterMaterialSources', null)"),
            "15. WorldView.js injects worldEncounterMaterialSources, defaulting to null — never throwing when ui/main.js's provider is absent");
        assert(viewCodeOnly.includes("inject('worldEncounterMaterialVerifier', null)"),
            '16. WorldView.js injects worldEncounterMaterialVerifier the same way');
        assert(/<WorldEncounterCanvas[\s\S]*?:materialSources="worldEncounterMaterialSources"[\s\S]*?\/>/.test(viewCodeOnly)
            || /<WorldEncounterCanvas[\s\S]{0,300}materialSources="worldEncounterMaterialSources"/.test(viewCodeOnly),
            '17. WorldView.js forwards worldEncounterMaterialSources to WorldEncounterCanvas as its own existing prop');
        assert(/<WorldEncounterCanvas[\s\S]{0,300}materialVerifier="worldEncounterMaterialVerifier"/.test(viewCodeOnly),
            '18. WorldView.js forwards worldEncounterMaterialVerifier to WorldEncounterCanvas as its own existing prop');
        assert(viewCodeOnly.includes(':registry="worldDiscoverySourceRegistry"'),
            '19. the pre-existing (0.9.17) registry binding is unchanged');
        assert(viewCodeOnly.includes('<VehicleInteractionPrompt :state="vehicleInteractionState" />'),
            '20. the pre-existing (0.9.98) VehicleInteractionPrompt wiring is unaffected by this milestone');

        // WorldView.js never reconstructs the inspection/verification
        // pipeline itself — it only forwards already-composed collaborators.
        assert(!/inspectWorldEncounterMaterial|verifyIdentity|verifyWorldEncounterMaterial/.test(viewCodeOnly),
            '21. WorldView.js never calls the inspection/verification chain itself — that stays entirely inside WorldEncounterCanvas');

        // The new material-verification wiring itself — bounded to the
        // two spots this milestone actually touches (the setup()-level
        // inject block and the WorldEncounterCanvas mount) — introduces no
        // trust vocabulary of its own. Deliberately narrower than a
        // whole-file scan: WorldView.js already carries an UNRELATED,
        // pre-existing "trusted" concept (remoteAvatarDiagnostics, 0.4.x)
        // this milestone neither touches nor should flag.
        const materialWiringSnippet = [
            viewCodeOnly.slice(viewCodeOnly.indexOf("inject('worldEncounterMaterialSources'"), viewCodeOnly.indexOf("inject('worldEncounterMaterialSources'") + 400),
            viewCodeOnly.slice(viewCodeOnly.indexOf('<WorldEncounterCanvas'), viewCodeOnly.indexOf('<WorldEncounterCanvas') + 400)
        ].join('\n');
        assert(!/TRUSTED|UNTRUSTED|\bSAFE\b|UNSAFE|AUTHENTIC|SUSPICIOUS/i.test(materialWiringSnippet),
            '22. the new material-verification wiring introduces no TRUSTED/UNTRUSTED/SAFE/UNSAFE/AUTHENTIC/SUSPICIOUS vocabulary of its own');

        console.log('✓ WorldView.js forwards the two existing collaborators verbatim, with no new pipeline or vocabulary of its own');
    }

    console.log('✅ All World View Material Verification Integration tests passed.');
}

await runTests();
