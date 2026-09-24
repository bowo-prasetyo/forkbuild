import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { ContentReference } from '../core/ContentReference.js';
import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleProviderResolutionStatus } from '../application/settings/RoleAwareProviderResolver.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalPublicationAnchorCatalog } from '../application/anchoring/LocalPublicationAnchorCatalog.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { CreatePublicationAnchorCreationCoordinatorUseCase } from '../application/anchoring/CreatePublicationAnchorCreationCoordinatorUseCase.js';
import { CreatePreferredPublicationAnchorCreationCoordinatorUseCase } from '../application/anchoring/CreatePreferredPublicationAnchorCreationCoordinatorUseCase.js';
import { PreferredPublicationAnchorCreationCoordinator } from '../application/anchoring/PreferredPublicationAnchorCreationCoordinator.js';
import { ExternalAnchorCreationOutcome } from '../application/anchoring/ExternalAnchorCreationOutcome.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// Preferred Proof & Anchoring Provider Creation Integration.
//
// The PROOF_AND_ANCHORING mirror of tests/
// ContentCreationProviderPreferenceIntegration.test.js (0.9.299) — proves
// application/anchoring/PreferredPublicationAnchorCreationCoordinator.js and its own
// composition root, application/
// CreatePreferredPublicationAnchorCreationCoordinatorUseCase.js, end to end
// against production-shaped composition (the SAME classes ui/main.js
// wires: application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js,
// application/anchoring/CreatePublicationAnchorCreationCoordinatorUseCase.js, and the
// wrapping preference layer), never a stand-in.
//
//   Section A — an explicit anchorType always wins; the preference store
//               is never even consulted.
//   Section B — an absent anchorType resolves through the stored
//               PROOF_AND_ANCHORING preference to a real publisher, which
//               then really publishes and catalogs a signed anchor.
//   Section C — no preference configured, and no explicit anchorType
//               either, preserves the LITERAL pre-existing "no publisher
//               registered for anchorType 'undefined'" refusal — never a
//               manufactured default.
//   Section D — a configured-but-unregistered preference (e.g. 'base',
//               which never has a publisher registered in the generic
//               registry — see anchoring/BaseAnchorPublisher.js's own
//               header) reports PROVIDER_NOT_FOUND explicitly; nothing is
//               published, no anchor is ever cataloged.
//   Section E — Content/Discovery preferences never affect Proof/Anchoring
//               creation, in either direction.
//   Section F — the real publish() operation actually runs, exactly once.
//   Section G — the composition root wires the SAME already-constructed
//               coordinator/registry passed to it, never a disconnected
//               copy — the identical production shape ui/main.js uses.
//   Section H — every existing explicit-selection behavior (CREATED,
//               independent anchors, availableAnchorTypes gating) is
//               byte-for-byte unchanged when driven through the wrapping
//               coordinator.

async function expectThrowsAsync(fn, message) {
    let threw = false;
    let errorMessage = null;
    try { await fn(); } catch (e) { threw = true; errorMessage = e.message; }
    assert(threw, message);
    return errorMessage;
}

function publishContent(publicationCatalog, { id = 'pub-1', hash = 'hash-1' } = {}) {
    const publication = new DecentralizedPublication({
        id,
        contentKind: 'forkbuild.structure',
        contentReference: new ContentReference({ hash })
    });
    publicationCatalog.add(publication);
    return publication;
}

// A minimal, honest fake publisher — never a real Bitcoin/Base/Arweave
// adapter, exactly the same restraint tests/
// ExternalAnchorCreationOrchestration.test.js's own fake publishers hold.
// `calls` lets a section assert the real publish() path actually ran,
// exactly once, mirroring the putSpy technique the Content-side suite
// already uses.
function makeFakePublisher(anchorType, { locator = `locator-${anchorType}`, published = true } = {}) {
    const spy = { calls: 0 };
    const publisher = {
        get anchorType() { return anchorType; },
        async publish(contentHash) {
            spy.calls += 1;
            if (!published) {
                return { published: false, reason: `${anchorType} publisher declined` };
            }
            return { published: true, locator, proof: { contentHash } };
        }
    };
    return { publisher, spy };
}

// Mirrors the real ui/main.js composition root exactly — a
// LocalPublicationCatalog/LocalPublicationAnchorCatalog, application/
// CreateExternalPublicationAnchorOrchestratorUseCase.js/application/
// CreatePublicationAnchorCreationCoordinatorUseCase.js, and NOW
// application/anchoring/CreatePreferredPublicationAnchorCreationCoordinatorUseCase.js
// wired together, exactly as ui/main.js now wires them.
function makePublicationCenter({ publishers = [], identityProvider = makeIdentity('Alice'), preferenceStore = new RoleProviderPreferenceStore(new InMemoryStorageProvider()) } = {}) {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());

    const { createExternalPublicationAnchorUseCase, publisherRegistry } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog, anchorCatalog, identityProvider, publishers
    });
    const { coordinator: creationCoordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
        createExternalPublicationAnchorUseCase, publisherRegistry
    });
    const {
        coordinator: preferredCreationCoordinator, resolver, resolvePreferredRoleProviderUseCase
    } = new CreatePreferredPublicationAnchorCreationCoordinatorUseCase().execute({
        publicationAnchorCreationCoordinator: creationCoordinator,
        proofRegistry: publisherRegistry,
        preferenceStore
    });

    return {
        publicationCatalog, anchorCatalog, identityProvider,
        creationCoordinator, preferredCreationCoordinator, publisherRegistry,
        preferenceStore, resolver, resolvePreferredRoleProviderUseCase
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — an explicit anchorType always wins
    // ---------------------------------------------------------------
    {
        const { publisher: bitcoin } = makeFakePublisher('bitcoin-op-return');
        const { publisher: arweave } = makeFakePublisher('arweave');
        const { publicationCatalog, preferredCreationCoordinator, preferenceStore } = makePublicationCenter({ publishers: [bitcoin, arweave] });

        // A stored preference names 'bitcoin-op-return' — but the click
        // explicitly asked for 'arweave'.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin-op-return' }));

        const publication = publishContent(publicationCatalog, { id: 'pub-a', hash: 'hash-a' });
        const result = await preferredCreationCoordinator.create(publication.id, 'arweave');

        assert(result.outcome === ExternalAnchorCreationOutcome.CREATED, '1. an explicit anchorType still succeeds');
        assert(result.anchor.anchorType === 'arweave', '2. the EXPLICIT anchorType was used, never the stored preference');
    }
    console.log('✓ Section A: an explicit per-action anchorType choice always wins — a stored preference is never even consulted for it');

    // ---------------------------------------------------------------
    // Section B — an absent anchorType resolves through the preference
    // ---------------------------------------------------------------
    {
        const { publisher: bitcoin } = makeFakePublisher('bitcoin-op-return');
        const { publisher: arweave } = makeFakePublisher('arweave');
        const { publicationCatalog, preferredCreationCoordinator, preferenceStore, anchorCatalog } = makePublicationCenter({ publishers: [bitcoin, arweave] });

        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'arweave' }));

        const publication = publishContent(publicationCatalog, { id: 'pub-b', hash: 'hash-b' });
        const result = await preferredCreationCoordinator.create(publication.id);

        assert(result.outcome === ExternalAnchorCreationOutcome.CREATED, '3. no explicit anchorType, but a preference is configured — creation still succeeds');
        assert(result.anchor.anchorType === 'arweave', '4. the PREFERRED provider was used');
        assert(anchorCatalog.findByPublicationId(publication.id).length === 1, '5. a real anchor was cataloged, not merely reported');

        // Passing '' or null behaves identically to omitting the argument.
        const resultEmptyString = await preferredCreationCoordinator.create(publication.id, '');
        assert(resultEmptyString.outcome === ExternalAnchorCreationOutcome.CREATED && resultEmptyString.anchor.anchorType === 'arweave',
            '6. an empty-string anchorType is treated as absent, exactly like omitting the argument');
    }
    console.log('✓ Section B: an absent anchorType resolves through the stored PROOF_AND_ANCHORING preference to a real, working publisher');

    // ---------------------------------------------------------------
    // Section C — no preference preserves existing behavior, literally
    // ---------------------------------------------------------------
    {
        const { publisher: bitcoin } = makeFakePublisher('bitcoin-op-return');
        const { publicationCatalog, creationCoordinator, preferredCreationCoordinator } = makePublicationCenter({ publishers: [bitcoin] });
        const publication = publishContent(publicationCatalog, { id: 'pub-c', hash: 'hash-c' });

        // No preference was ever saved for PROOF_AND_ANCHORING.
        const preExistingError = await expectThrowsAsync(() => creationCoordinator.create(publication.id, undefined),
            '7. (baseline) the UNWRAPPED coordinator itself already refuses an absent anchorType today');
        const wrappedError = await expectThrowsAsync(() => preferredCreationCoordinator.create(publication.id),
            '8. the preference-aware coordinator refuses identically when nothing is configured');
        assert(wrappedError === preExistingError, '9. the refusal message is LITERALLY the same pre-existing error, never a new one');
    }
    console.log('✓ Section C: with no preference configured, an absent anchorType produces the exact pre-existing refusal — never a manufactured default');

    // ---------------------------------------------------------------
    // Section D — an unresolvable preference is an explicit failure
    // ---------------------------------------------------------------
    {
        const { publisher: bitcoin, spy: bitcoinSpy } = makeFakePublisher('bitcoin-op-return');
        const { publicationCatalog, preferredCreationCoordinator, preferenceStore, anchorCatalog } = makePublicationCenter({ publishers: [bitcoin] });

        // 'base' has no registered publisher in the generic registry today
        // — see anchoring/BaseAnchorPublisher.js's own header.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'base' }));

        const publication = publishContent(publicationCatalog, { id: 'pub-d', hash: 'hash-d' });
        const result = await preferredCreationCoordinator.create(publication.id);

        assert(result.outcome === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND, '10. a configured-but-unregistered preference reports PROVIDER_NOT_FOUND explicitly');
        assert(result.anchor === null, '11. no anchor is ever fabricated for an unresolvable preference');
        assert(result.preference.providerKey === 'base', '12. the unresolvable preference itself is carried on the result, so a caller can explain what was configured');
        assert(bitcoinSpy.calls === 0, '13. the registered bitcoin publisher is never touched — no fallback of any kind, and Base is never silently substituted for its own separate wallet flow');
        assert(anchorCatalog.findByPublicationId(publication.id).length === 0, '14. nothing was ever cataloged');
    }
    console.log('✓ Section D: an unresolvable PROOF_AND_ANCHORING preference reports PROVIDER_NOT_FOUND explicitly — never a fallback, never CREATED');

    // ---------------------------------------------------------------
    // Section E — Content/Discovery preferences never affect Proof/Anchoring
    // ---------------------------------------------------------------
    {
        const { publisher: bitcoin } = makeFakePublisher('bitcoin-op-return');
        const { publicationCatalog, preferredCreationCoordinator, preferenceStore } = makePublicationCenter({ publishers: [bitcoin] });

        // Content/Discovery preferences exist, but nothing is configured
        // for PROOF_AND_ANCHORING.
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'bitcoin-op-return' }));
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'bitcoin-op-return' }));

        const publication = publishContent(publicationCatalog, { id: 'pub-e', hash: 'hash-e' });
        const error = await expectThrowsAsync(() => preferredCreationCoordinator.create(publication.id),
            '15. with Content/Discovery preferences configured but no PROOF_AND_ANCHORING preference, the absent-anchorType refusal still fires — Content/Discovery never substitute for it');
        assert(error.includes('anchorType'), '16. the refusal is the ordinary anchorType-required error, not something Content/Discovery produced');
    }
    console.log('✓ Section E: Content and Discovery preferences have no effect on Proof/Anchoring creation, in either direction');

    // ---------------------------------------------------------------
    // Section F — the real publish() operation actually runs
    // ---------------------------------------------------------------
    {
        const { publisher: arweave, spy: arweaveSpy } = makeFakePublisher('arweave', { locator: 'ar://tx-real-op' });
        const { publicationCatalog, preferredCreationCoordinator, preferenceStore, anchorCatalog } = makePublicationCenter({ publishers: [arweave] });
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'arweave' }));

        const publication = publishContent(publicationCatalog, { id: 'pub-f', hash: 'hash-f' });
        const result = await preferredCreationCoordinator.create(publication.id);

        assert(arweaveSpy.calls === 1, '17. the preferred publisher\'s own publish() really runs, exactly once');
        assert(result.anchor instanceof PublicationAnchor, '18. a real, signed PublicationAnchor is returned');
        assert(result.anchor.locator === 'ar://tx-real-op', '19. the anchor carries the publisher\'s own real locator');
        assert(anchorCatalog.findByPublicationId(publication.id)[0].id === result.anchor.id, '20. the SAME anchor is the one actually cataloged');
    }
    console.log('✓ Section F: the selected preferred provider actually executes the real Proof/Anchoring operation — this is a live integration, not a selection-only check');

    // ---------------------------------------------------------------
    // Section G — composition root wiring
    // ---------------------------------------------------------------
    {
        const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
        const anchorCatalog = new LocalPublicationAnchorCatalog(new InMemoryStorageProvider());
        const identityProvider = makeIdentity('Alice');
        const { publisher: arweave } = makeFakePublisher('arweave', { locator: 'ar://tx-wired' });
        const { createExternalPublicationAnchorUseCase, publisherRegistry } = new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
            publicationCatalog, anchorCatalog, identityProvider, publishers: [arweave]
        });
        const { coordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
            createExternalPublicationAnchorUseCase, publisherRegistry
        });
        const preferenceStore = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
        preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'arweave' }));
        const { coordinator: preferredCoordinator } = new CreatePreferredPublicationAnchorCreationCoordinatorUseCase().execute({
            publicationAnchorCreationCoordinator: coordinator, proofRegistry: publisherRegistry, preferenceStore
        });

        assert(preferredCoordinator instanceof PreferredPublicationAnchorCreationCoordinator, '21. the composition root returns a real PreferredPublicationAnchorCreationCoordinator');
        const publication = publishContent(publicationCatalog, { id: 'pub-g', hash: 'hash-g' });
        const result = await preferredCoordinator.create(publication.id);
        assert(result.outcome === ExternalAnchorCreationOutcome.CREATED && result.anchor.locator === 'ar://tx-wired',
            '22. the composition root wires the SAME already-constructed coordinator/registry passed in, never a disconnected copy');
        assert(preferredCoordinator.availableAnchorTypes().includes('arweave'), '23. availableAnchorTypes() passes straight through to the wrapped coordinator, unchanged');

        // Constructor validation — a caller contract violation, never a
        // degraded outcome.
        let threw = false;
        try { new CreatePreferredPublicationAnchorCreationCoordinatorUseCase().execute({ publicationAnchorCreationCoordinator: null, proofRegistry: publisherRegistry }); } catch (e) { threw = true; }
        assert(threw, '24. the composition root requires a PublicationAnchorCreationCoordinator');
        threw = false;
        try { new CreatePreferredPublicationAnchorCreationCoordinatorUseCase().execute({ publicationAnchorCreationCoordinator: coordinator, proofRegistry: null }); } catch (e) { threw = true; }
        assert(threw, '25. the composition root requires an ExternalAnchorPublisherRegistry');
        threw = false;
        try { new PreferredPublicationAnchorCreationCoordinator(coordinator, null); } catch (e) { threw = true; }
        assert(threw, '26. PreferredPublicationAnchorCreationCoordinator requires a real ResolvePreferredRoleProviderUseCase');
    }
    console.log('✓ Section G: the composition root wires the SAME already-constructed coordinator/registry passed to it — the identical production shape ui/main.js uses');

    // ---------------------------------------------------------------
    // Section H — existing explicit-selection workflows are unchanged
    // ---------------------------------------------------------------
    {
        // H1 — CREATED, driven through the wrapping coordinator.
        const { publisher: bitcoin } = makeFakePublisher('bitcoin-op-return');
        const { publicationCatalog, preferredCreationCoordinator } = makePublicationCenter({ publishers: [bitcoin] });
        const publication = publishContent(publicationCatalog, { id: 'pub-h1', hash: 'hash-h1' });
        const created = await preferredCreationCoordinator.create(publication.id, 'bitcoin-op-return');
        assert(created.outcome === ExternalAnchorCreationOutcome.CREATED, '27. CREATED is unchanged for an explicit anchorType choice');
    }
    {
        // H2 — two independent anchors for the same anchorType, unchanged.
        const { publisher: bitcoin } = makeFakePublisher('bitcoin-op-return');
        const { publicationCatalog, preferredCreationCoordinator } = makePublicationCenter({ publishers: [bitcoin] });
        const publication = publishContent(publicationCatalog, { id: 'pub-h2', hash: 'hash-h2' });
        const first = await preferredCreationCoordinator.create(publication.id, 'bitcoin-op-return');
        const second = await preferredCreationCoordinator.create(publication.id, 'bitcoin-op-return');
        assert(first.anchor.id !== second.anchor.id, '28. two independent, explicit-anchorType anchors are still produced — never collapsed or deduplicated');
    }
    {
        // H3 — availableAnchorTypes() still gates what an explicit choice
        // may name, unchanged.
        const { preferredCreationCoordinator, publicationCatalog } = makePublicationCenter({ publishers: [] });
        assert(preferredCreationCoordinator.availableAnchorTypes().length === 0, '29. no registered publisher -> no available anchorTypes, unchanged');
        const publication = publishContent(publicationCatalog, { id: 'pub-h3', hash: 'hash-h3' });
        await expectThrowsAsync(() => preferredCreationCoordinator.create(publication.id, 'bitcoin-op-return'),
            '30. requesting an unregistered explicit anchorType still refuses exactly as before this milestone');
    }
    console.log('✓ Section H: every existing explicit-selection workflow (CREATED/independent anchors/availableAnchorTypes gating) is unchanged when driven through the preference-aware coordinator');

    console.log('\nAll Proof/Anchoring Creation Provider Preference Integration tests passed.');
}

run().catch((error) => {
    console.error('ProofAnchoringCreationProviderPreferenceIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
