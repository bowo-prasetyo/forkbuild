import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { ExternalAnchorCreationOutcome } from '../application/ExternalAnchorCreationOutcome.js';
import { PublicationAnchorCreationCoordinator } from '../application/PublicationAnchorCreationCoordinator.js';
import { CreatePublicationAnchorCreationCoordinatorUseCase } from '../application/CreatePublicationAnchorCreationCoordinatorUseCase.js';
import { ExternalAnchorCreationUiState } from '../application/ExternalAnchorCreationUiState.js';
import { describeCreationAttempt, describeCreationButtonLabel } from '../application/PublicationAnchorCreationView.js';
import { CreatePublicationEvidenceCoordinatorUseCase } from '../application/CreatePublicationEvidenceCoordinatorUseCase.js';
import { ExternalAnchorVerifier } from '../application/ExternalAnchorVerifier.js';
import { AnchorVerificationOutcome } from '../application/AnchorVerificationOutcome.js';
import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.8.11 — Explicit External Anchoring UX.
//
//   Section A: FLAGSHIP — Alice's Publication Center lists Bitcoin as an
//              available anchor type, she explicitly creates a Bitcoin
//              anchor, and the derived UI view reports it plainly
//              ("evidence was recorded"), never "verified"/"confirmed"/
//              "trusted". The new anchor lands in the ordinary evidence
//              list, "Not yet verified" — Bob independently discovers
//              and verifies it, PROOF_UNAVAILABLE while unconfirmed, then
//              VALID once the SAME fake network confirms the SAME
//              unchanged anchor Alice's creation click produced.
//   Section B: the three ExternalAnchorCreationOutcome values, plus a
//              local precondition failure (nobody signed in), each get
//              their own distinct, honest UI state/label/message — never
//              collapsed, and REJECTED is never confused with
//              UNAVAILABLE.
//   Section C: separation — discovering evidence, listing available
//              anchor types, and creating an anchor never verify
//              anything; creating an anchor consults its publisher
//              exactly once and the verifier not at all.
//   Section D: multiple independent anchors — creating the same
//              anchorType twice for one publication produces two
//              independent, equally discoverable anchors; neither is
//              ranked or preferred, and each verifies independently.
//   Section E: availableAnchorTypes() is what keeps the UI from ever
//              offering an anchor type nobody can create; requesting one
//              outside that list still refuses, exactly as the 0.8.10
//              orchestration underneath already does.
//   Section F: the composition root wires the SAME already-constructed
//              collaborators passed to it, never fresh disconnected ones.
//
// See docs/Principles.md, "External Anchoring Is An Explicit User Action
// (0.8.11)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectThrowsAsync(fn, message) {
    let threw = false;
    try { await fn(); } catch (e) { threw = true; }
    assert(threw, message);
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

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

// Identical fake-Bitcoin-network technique tests/
// ExternalAnchorCreationOrchestration.test.js and tests/
// BitcoinAnchorCreationAdapter.test.js already established.
function makeFakeBitcoinNetwork() {
    const chain = new Map();
    let nextTxid = 0;

    const broadcaster = {
        async broadcast(opReturnHex, { network }) {
            nextTxid += 1;
            const txid = String(nextTxid).padStart(64, '0');
            chain.set(txid, { txid, network, vout: [opReturnOutput(opReturnHex)], status: { confirmed: false } });
            return { broadcast: true, txid };
        }
    };

    async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = chain.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }

    function confirm(txid, blockHeight) {
        chain.get(txid).status = { confirmed: true, block_height: blockHeight };
    }

    return { chain, broadcaster, fetchImpl, confirm };
}

function makePublicationCenter({ publishers = [] } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
    const identityProvider = makeIdentity('Alice');
    const { createExternalPublicationAnchorUseCase, publisherRegistry } =
        new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider, publishers
        });
    const { coordinator: creationCoordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
        createExternalPublicationAnchorUseCase, publisherRegistry
    });
    const externalAnchorVerifier = new ExternalAnchorVerifier(new LocalAuthorizationVerifier());
    const { coordinator: evidenceCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
        anchorCatalog, externalAnchorVerifier
    });
    return { publicationCatalog, anchorCatalog, identityProvider, creationCoordinator, evidenceCoordinator, publisherRegistry };
}

function publishContent(publicationCatalog, { id, hash }) {
    const publication = new DecentralizedPublication({
        id, contentKind: 'forkbuild.structure', contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

// Mirrors ui/views/DecentralizedPublicationsView.js#createAnchor() exactly
// — a caller-supplied try/catch around the coordinator, since
// application/PublicationAnchorCreationCoordinator.js never catches a
// signing failure itself (see that class's own header).
async function clickCreate(creationCoordinator, publicationId, anchorType) {
    try {
        const result = await creationCoordinator.create(publicationId, anchorType);
        return { creating: false, outcome: result.outcome, anchor: result.anchor, reason: result.reason, error: null };
    } catch (error) {
        return { creating: false, outcome: null, anchor: null, reason: null, error: error.message };
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP
    // ---------------------------------------------------------------
    let sharedAnchorJson, sharedTxid, network;
    {
        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        const { publicationCatalog, creationCoordinator, evidenceCoordinator } = makePublicationCenter({ publishers: [publisher] });

        assert(creationCoordinator.availableAnchorTypes().includes('bitcoin-op-return'),
            '1. Alice\'s Publication Center lists Bitcoin as an available anchor type');

        const contentHash = 'f00dcafe';
        publishContent(publicationCatalog, { id: 'pub-flagship', hash: contentHash });

        // Before any click, this publication has no known evidence and no
        // creation attempt has ever been made.
        assert(evidenceCoordinator.discover('pub-flagship').length === 0, '2. no evidence known before any anchor is created');
        const idleView = describeCreationAttempt(null);
        assert(idleView.state === ExternalAnchorCreationUiState.IDLE, '3. before any click, the derived view reports IDLE');
        assert(describeCreationButtonLabel('Bitcoin', { hasExisting: false }) === 'Create Bitcoin Anchor', '4. the initial button reads "Create <type> Anchor"');

        // Alice clicks "Create Bitcoin Anchor."
        const attempt = await clickCreate(creationCoordinator, 'pub-flagship', 'bitcoin-op-return');
        assert(attempt.error === null && attempt.outcome === ExternalAnchorCreationOutcome.CREATED, '5. a healthy publisher produces CREATED');
        assert(attempt.anchor instanceof PublicationAnchor, '6. the CREATED outcome carries a real PublicationAnchor');

        const createdView = describeCreationAttempt(attempt);
        assert(createdView.state === ExternalAnchorCreationUiState.CREATED, '7. the derived view reports CREATED');
        assert(createdView.message.includes('evidence was recorded for this content hash'), '8. the UI makes exactly the strongest permitted statement');
        const forbiddenWords = ['verified', 'confirmed', 'trusted', 'authoritative'];
        for (const word of forbiddenWords) {
            assert(!createdView.message.toLowerCase().includes(word), `9. the creation message never uses the word "${word}"`);
        }

        // The new anchor immediately shows up in the ordinary,
        // never-auto-verified evidence list — the identical purely local
        // catalog read application/PublicationEvidenceCoordinator.js#
        // discover() already provides, completely unchanged by this
        // milestone.
        const discovered = evidenceCoordinator.discover('pub-flagship');
        assert(discovered.length === 1 && discovered[0].id === attempt.anchor.id, '10. the created anchor is discoverable through the SAME evidence coordinator, unchanged');

        // Bob — none of Alice's state — independently verifies it.
        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl: net.fetchImpl });
        const anchorJson = attempt.anchor.toJSON();

        const stillUnconfirmed = await bobAnchorVerifier.verify(anchorJson, { expectedContentHash: contentHash, proofVerifier: bobProofVerifier });
        assert(stillUnconfirmed.outcome === AnchorVerificationOutcome.PROOF_UNAVAILABLE,
            '11. Bob\'s independent verification reports PROOF_UNAVAILABLE immediately after creation — broadcast acceptance is not confirmation');

        sharedAnchorJson = anchorJson;
        sharedTxid = attempt.anchor.proof.txid;
        network = net;
    }
    console.log('✓ Section A (creation): Alice explicitly creates a Bitcoin anchor; the UI states exactly "evidence was recorded," never more; Bob independently discovers it and verifies PROOF_UNAVAILABLE while unconfirmed');

    {
        network.confirm(sharedTxid, 900001);
        const bobAuthVerifier = new LocalAuthorizationVerifier();
        const bobAnchorVerifier = new ExternalAnchorVerifier(bobAuthVerifier);
        const bobProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://bob-explorer.test/api', fetchImpl: network.fetchImpl });
        const nowConfirmed = await bobAnchorVerifier.verify(sharedAnchorJson, { expectedContentHash: sharedAnchorJson.contentHash, proofVerifier: bobProofVerifier });
        assert(nowConfirmed.outcome === AnchorVerificationOutcome.VALID,
            '12. the SAME anchor Alice\'s creation click produced, completely unchanged, verifies VALID once the external network confirms the transaction it already named');
    }
    console.log('✓ Section A (lifecycle): external state changes; the anchor Alice\'s click created never does — PROOF_UNAVAILABLE becomes VALID purely because Bitcoin confirmed');

    // ---------------------------------------------------------------
    // Section B — every creation outcome gets its own honest UI state
    // ---------------------------------------------------------------
    {
        const rejectingPublisher = {
            anchorType: 'bitcoin-op-return',
            async publish() { return { published: false, reason: 'transaction rejected as non-standard' }; }
        };
        const { publicationCatalog, creationCoordinator } = makePublicationCenter({ publishers: [rejectingPublisher] });
        publishContent(publicationCatalog, { id: 'pub-rejected', hash: 'aaaa' });
        const attempt = await clickCreate(creationCoordinator, 'pub-rejected', 'bitcoin-op-return');
        const view = describeCreationAttempt(attempt);
        assert(view.state === ExternalAnchorCreationUiState.REJECTED, '13. a definite publisher rejection reports the REJECTED UI state');
        assert(view.message.toLowerCase().includes('rejected') && view.reason === 'transaction rejected as non-standard',
            '14. the rejection reason is shown, plainly, as the external system\'s own words');
    }
    {
        const unavailablePublisher = {
            anchorType: 'bitcoin-op-return',
            async publish() { return { published: false, unavailable: true, reason: 'no funds currently available to spend' }; }
        };
        const { publicationCatalog, creationCoordinator } = makePublicationCenter({ publishers: [unavailablePublisher] });
        publishContent(publicationCatalog, { id: 'pub-unavailable', hash: 'bbbb' });
        const attempt = await clickCreate(creationCoordinator, 'pub-unavailable', 'bitcoin-op-return');
        const view = describeCreationAttempt(attempt);
        assert(view.state === ExternalAnchorCreationUiState.UNAVAILABLE, '15. an explicit "cannot presently tell" reports the UNAVAILABLE UI state');
        assert(view.reason === 'no funds currently available to spend', '16. its own real reason is preserved, never replaced with a generic one');
    }
    {
        // Nobody is signed in on THIS identityProvider — a genuine local
        // precondition failure application/
        // CreateExternalPublicationAnchorUseCase.js itself declines to
        // catch (see that class's own header); ui/views/
        // DecentralizedPublicationsView.js#createAnchor() catches it at
        // the UI boundary instead — clickCreate() above mirrors that
        // exactly.
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const unauthenticatedIdentityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        const { createExternalPublicationAnchorUseCase, publisherRegistry } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider: unauthenticatedIdentityProvider, publishers: [publisher]
        });
        const { coordinator: creationCoordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
            createExternalPublicationAnchorUseCase, publisherRegistry
        });
        publishContent(publicationCatalog, { id: 'pub-signedout', hash: 'cccc' });

        const attempt = await clickCreate(creationCoordinator, 'pub-signedout', 'bitcoin-op-return');
        assert(attempt.error && attempt.error.includes('sign in'), '17. a local precondition failure (nobody signed in) is caught, never left to crash the page');
        const view = describeCreationAttempt(attempt);
        assert(view.state === ExternalAnchorCreationUiState.UNAVAILABLE,
            '18. to a person looking at the button, "nobody signed in" reads exactly like "external system unreachable" — no anchor was created either way');
        assert(view.reason.includes('sign in'), '19. but the SPECIFIC reason is preserved, never replaced with a generic message');
        assert(anchorCatalog.findByPublicationId('pub-signedout').length === 0, '20. nothing was ever cataloged — the broadcaster was never even reached');
    }

    // No two of REJECTED/UNAVAILABLE/CREATED/IDLE/CREATING ever collapse
    // onto the same UI state or the same label.
    {
        const states = [
            describeCreationAttempt(null),
            describeCreationAttempt({ creating: true }),
            describeCreationAttempt({ outcome: ExternalAnchorCreationOutcome.CREATED, anchor: new PublicationAnchor({ publicationId: 'p', contentHash: 'h', anchorType: 'bitcoin-op-return', locator: 'bitcoin:tx' }) }),
            describeCreationAttempt({ outcome: ExternalAnchorCreationOutcome.PUBLISH_REJECTED, reason: 'x' }),
            describeCreationAttempt({ outcome: ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE, reason: 'y' })
        ];
        const uniqueStates = new Set(states.map((s) => s.state));
        assert(uniqueStates.size === 5, '21. IDLE/CREATING/CREATED/REJECTED/UNAVAILABLE are five genuinely distinct UI states');
    }
    console.log('✓ Section B: CREATED/REJECTED/UNAVAILABLE, plus a caught local precondition failure, each get their own honest, non-collapsing UI state');

    // ---------------------------------------------------------------
    // Section C — separation: discovery/listing/creation never verify
    // ---------------------------------------------------------------
    {
        let verifyCalls = 0;
        const publishSpy = { calls: 0 };
        const net = makeFakeBitcoinNetwork();
        const realPublisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        const spyPublisher = {
            anchorType: realPublisher.anchorType,
            async publish(hash) { publishSpy.calls += 1; return realPublisher.publish(hash); }
        };
        const { publicationCatalog, anchorCatalog, creationCoordinator } = makePublicationCenter({ publishers: [spyPublisher] });
        const authVerifier = new LocalAuthorizationVerifier();
        const realVerifier = new ExternalAnchorVerifier(authVerifier);
        const verifierSpy = { verify: (...args) => { verifyCalls += 1; return realVerifier.verify(...args); } };
        const { coordinator: evidenceCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
            anchorCatalog, externalAnchorVerifier: verifierSpy
        });
        publishContent(publicationCatalog, { id: 'pub-sep', hash: 'dddd' });

        // Listing available anchor types and discovering evidence never
        // touch the publisher OR the verifier.
        creationCoordinator.availableAnchorTypes();
        creationCoordinator.availableAnchorTypes();
        evidenceCoordinator.discover('pub-sep');
        assert(publishSpy.calls === 0, '22. listing available anchor types and discovering evidence never consult the publisher');
        assert(verifyCalls === 0, '23. listing available anchor types and discovering evidence never consult the verifier either');

        // Creating consults the publisher exactly once, and the verifier
        // not at all — the identical "no automatic verification"
        // invariant this milestone's own design conversation named as
        // its most important rule.
        const attempt = await clickCreate(creationCoordinator, 'pub-sep', 'bitcoin-op-return');
        assert(attempt.outcome === ExternalAnchorCreationOutcome.CREATED, '24. the flagship-shaped creation still succeeds');
        assert(publishSpy.calls === 1, '25. create() consults its publisher exactly once');
        assert(verifyCalls === 0, '26. create() NEVER consults the verifier — no automatic verification after creation');

        // Only an explicit, separate verify() call ever does.
        await evidenceCoordinator.verify(attempt.anchor, { expectedContentHash: 'dddd', expectedPublicationId: 'pub-sep' });
        assert(verifyCalls === 1, '27. an explicit "Verify Evidence" click is the only thing that ever consults the verifier');
    }
    console.log('✓ Section C: discovering evidence and listing available anchor types never verify or publish anything; creating consults its publisher exactly once and the verifier not at all');

    // ---------------------------------------------------------------
    // Section D — multiple independent anchors
    // ---------------------------------------------------------------
    {
        let nextTxid = 100;
        const publisher = {
            anchorType: 'bitcoin-op-return',
            async publish(contentHash) {
                nextTxid += 1;
                return { published: true, locator: `bitcoin:${nextTxid}`, proof: { txid: String(nextTxid).padStart(64, '0'), network: 'mainnet' } };
            }
        };
        const { publicationCatalog, creationCoordinator, evidenceCoordinator } = makePublicationCenter({ publishers: [publisher] });
        publishContent(publicationCatalog, { id: 'pub-multi', hash: 'eeee' });

        const first = await clickCreate(creationCoordinator, 'pub-multi', 'bitcoin-op-return');
        const second = await clickCreate(creationCoordinator, 'pub-multi', 'bitcoin-op-return');
        assert(first.outcome === ExternalAnchorCreationOutcome.CREATED && second.outcome === ExternalAnchorCreationOutcome.CREATED,
            '28. creating the same anchorType twice for the same publication succeeds both times');
        assert(first.anchor.id !== second.anchor.id, '29. the two anchors are independent records');

        const discovered = evidenceCoordinator.discover('pub-multi');
        assert(discovered.length === 2, '30. both independent anchors are discoverable — neither replaces the other');
        assert(describeCreationButtonLabel('Bitcoin', { hasExisting: true }) === 'Create Another Bitcoin Anchor',
            '31. once at least one anchor of a type exists, the button makes clear a SECOND, independent one is what clicking again produces');

        // Each verifies independently — one confirmed via a bad proof
        // (INVALID_PROOF), the other with no proof verifier configured
        // (VALID_PROOF_UNVERIFIED) — proving neither is silently ranked
        // above or preferred over the other.
        const rejectingPlugin = { anchorType: 'bitcoin-op-return', verify: () => ({ valid: false, reason: 'hash not found in any output' }) };
        const firstResult = await evidenceCoordinator.verify(first.anchor, {
            expectedContentHash: 'eeee', expectedPublicationId: 'pub-multi',
            proofVerifierRegistry: { get: () => rejectingPlugin }
        });
        const secondResult = await evidenceCoordinator.verify(second.anchor, { expectedContentHash: 'eeee', expectedPublicationId: 'pub-multi' });
        assert(firstResult.outcome === AnchorVerificationOutcome.INVALID_PROOF, '32. the first anchor verifies on its own merits');
        assert(secondResult.outcome === AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, '33. the second, independently, on its own — one\'s outcome never affects the other\'s');
    }
    console.log('✓ Section D: creating the same anchorType twice produces two independent, equally discoverable, independently verifiable anchors — never ranked or collapsed');

    // ---------------------------------------------------------------
    // Section E — availableAnchorTypes() gates what the UI may ever offer
    // ---------------------------------------------------------------
    {
        const { creationCoordinator: emptyCoordinator, publicationCatalog } = makePublicationCenter({ publishers: [] });
        assert(emptyCoordinator.availableAnchorTypes().length === 0, '34. no publisher configured -> no available anchor types -> nothing for the UI to offer');
        publishContent(publicationCatalog, { id: 'pub-none', hash: 'ffff' });
        await expectThrowsAsync(() => emptyCoordinator.create('pub-none', 'bitcoin-op-return'),
            '35. requesting an anchorType outside availableAnchorTypes() still refuses, exactly as the underlying 0.8.10 orchestration already does');

        const bitcoinPublisher = { anchorType: 'bitcoin-op-return', async publish() { return { published: true, locator: 'bitcoin:x', proof: { txid: '9'.repeat(64), network: 'mainnet' } }; } };
        const otherPublisher = { anchorType: 'other-chain', async publish() { return { published: true, locator: 'other:x', proof: { ref: 'x' } }; } };
        const { creationCoordinator: twoCoordinator } = makePublicationCenter({ publishers: [bitcoinPublisher, otherPublisher] });
        assert(twoCoordinator.availableAnchorTypes().length === 2
            && twoCoordinator.availableAnchorTypes().includes('bitcoin-op-return')
            && twoCoordinator.availableAnchorTypes().includes('other-chain'),
            '36. every registered anchorType is listed, none preferred or hidden');
    }
    console.log('✓ Section E: availableAnchorTypes() is exactly what keeps the UI from ever offering an anchor type with no registered publisher');

    // ---------------------------------------------------------------
    // Section F — composition root wiring
    // ---------------------------------------------------------------
    {
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const identityProvider = makeIdentity('Alice');
        const net = makeFakeBitcoinNetwork();
        const publisher = new BitcoinAnchorPublisher({ network: 'mainnet', broadcaster: net.broadcaster });
        const { createExternalPublicationAnchorUseCase, publisherRegistry } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider, publishers: [publisher]
        });
        const { coordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
            createExternalPublicationAnchorUseCase, publisherRegistry
        });
        assert(coordinator instanceof PublicationAnchorCreationCoordinator, '37. the composition root returns a real PublicationAnchorCreationCoordinator');
        publishContent(publicationCatalog, { id: 'pub-wired', hash: 'aabb' });
        const result = await coordinator.create('pub-wired', 'bitcoin-op-return');
        assert(result.outcome === ExternalAnchorCreationOutcome.CREATED
            && anchorCatalog.findByPublicationId('pub-wired').length === 1,
            '38. the composition root wires the SAME already-constructed orchestration/registry passed in, never a disconnected copy');

        // Constructor validation — a caller contract violation, never a
        // degraded outcome.
        let threw = false;
        try { new PublicationAnchorCreationCoordinator(null, publisherRegistry); } catch (e) { threw = true; }
        assert(threw, '39. constructor requires a CreateExternalPublicationAnchorUseCase');
        threw = false;
        try { new PublicationAnchorCreationCoordinator(createExternalPublicationAnchorUseCase, null); } catch (e) { threw = true; }
        assert(threw, '40. constructor requires an ExternalAnchorPublisherRegistry');
    }
    console.log('✓ Section F: the composition root wires the SAME already-constructed collaborators passed to it, never fresh disconnected ones');

    console.log('\nAll Explicit External Anchoring UX tests passed.');
}

run().catch((error) => {
    console.error('PublicationAnchorCreationUX.test.js FAILED:', error);
    process.exitCode = 1;
});
