import { usePostPublishDistribution } from '../ui/views/editorView/usePostPublishDistribution.js';
import { useStructureInspection } from '../ui/views/editorView/useStructureInspection.js';
import StructureInfoPanel from '../ui/components/StructureInfoPanel.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { assert } from './support/Assert.js';

// After an authorship claim is published from the Editor's structure panel, the
// panel offers to distribute that exact claim. Only its Signed Claim is
// offered (an attribution has no Snapshot), and the offer belongs to the
// structure it was published for.

function fakePublication(id) {
    return { id, title: null, toJSON: () => ({ id, kind: 'forkbuild.blueprint-attribution' }) };
}

function mountEditor({ publicationDistributionCommand = null, multiRelayNostrPublicationDistributionCommand = null, publish } = {}) {
    const injected = Object.fromEntries(Object.entries({
        publicationDistributionCommand,
        multiRelayNostrPublicationDistributionCommand,
        // Present so a Snapshot would be offered if includeSnapshot were ignored.
        snapshotDistributionCommand: () => Promise.resolve(null),
        publicationContentStore: { get: () => Promise.resolve(new Uint8Array([1])) }
    }).filter(([, value]) => value !== null));
    return mountComponent({
        setup() {
            const attributionDistribution = usePostPublishDistribution({ router: null, includeSnapshot: false });
            const feedbackShown = [];
            const mine = { authorIdentityId: 'did:key:alice' };
            const inspection = useStructureInspection({
                attributionDistribution,
                blueprintAttributionUseCase: { communityView: () => ({ mine }) },
                blueprintLineageUseCase: { lineageView: () => ({ derivedFrom: [] }) },
                copyStructureIntoDocument: () => {},
                exportBlueprintAttribution: () => {},
                exportStructure: () => {},
                feedback: { show: (text) => feedbackShown.push(text) },
                identityProvider: {},
                personalStructureLibraryStore: { hasStructure: () => true, listStructures: () => [] },
                publicationCatalog: { add: () => {} },
                publicationPeerExchange: { announce: () => 0 },
                publicationResolver: { publish },
                structureRegistry: { getAll: () => [] }
            });
            return { attributionDistribution, inspection, feedbackShown };
        }
    }, injected);
}

const structure = (id) => ({ id, bricks: [], name: id });

async function run() {
    // Publishing an attribution offers its Signed Claim, never a Snapshot.
    {
        const sent = [];
        const published = [fakePublication('attr-1'), fakePublication('attr-2')];
        const { attributionDistribution, inspection } = mountEditor({
            publicationDistributionCommand: (request) => { sent.push(request); return Promise.resolve({ publication: { objectId: request.publication.id } }); },
            publish: () => Promise.resolve(published.shift())
        });
        assert(attributionDistribution.canDistributeSnapshot === false, 'an attribution has no Snapshot to offer');
        assert(attributionDistribution.canDistributePublication === true, 'its Signed Claim can be distributed');

        inspection.inspectStructure(structure('tower'));
        assert(attributionDistribution.publishedPublication.value === null, 'nothing is offered before publishing');
        await inspection.publishInspectedAttributionToNetwork();
        assert(attributionDistribution.publishedPublication.value && attributionDistribution.publishedPublication.value.id === 'attr-1',
            'publishing offers to distribute the exact claim just published');
        assert(sent.length === 0, 'publishing never distributes by itself');

        attributionDistribution.selectedDiscoveryProvider.value = 'arweave';
        attributionDistribution.selectedDistributionStorage.value = 'ipfs';
        await attributionDistribution.distributePublishedDocument();
        assert(sent.length === 1 && sent[0].publication.id === 'attr-1', 'Distribute sends that claim');
        assert(sent[0].discoveryProvider === 'arweave' && sent[0].materialStorage === 'ipfs', 'on the network and storage chosen in the dialog');
        assert(sent[0].serializedMaterial === JSON.stringify({ id: 'attr-1', kind: 'forkbuild.blueprint-attribution' }), 'with the claim itself as its material');
        assert(Array.isArray(attributionDistribution.distributionResult.value) && attributionDistribution.distributionError.value === null,
            'the result is shown in the dialog');

        await inspection.publishInspectedAttributionToNetwork();
        assert(attributionDistribution.publishedPublication.value.id === 'attr-2' && attributionDistribution.distributionResult.value === null,
            'publishing again replaces the offer with the newer claim and clears the old result');
        console.log('✓ a published attribution is offered for distribution as a Signed Claim only');
    }

    // The offer belongs to the structure it was published for.
    {
        const { attributionDistribution, inspection } = mountEditor({
            publicationDistributionCommand: () => Promise.resolve({}),
            publish: () => Promise.resolve(fakePublication('attr-x'))
        });
        inspection.inspectStructure(structure('tower'));
        await inspection.publishInspectedAttributionToNetwork();
        inspection.closeStructureInspection();
        assert(attributionDistribution.publishedPublication.value === null && inspection.inspectedStructure.value === null,
            'closing the panel drops the offer');

        inspection.inspectStructure(structure('tower'));
        await inspection.publishInspectedAttributionToNetwork();
        inspection.inspectStructure(structure('bridge'));
        assert(attributionDistribution.publishedPublication.value === null, 'inspecting another structure drops the offer');

        inspection.inspectStructure(structure('tower'));
        await inspection.publishInspectedAttributionToNetwork();
        attributionDistribution.dismissPublishAction();
        assert(attributionDistribution.publishedPublication.value === null, 'Not now drops the offer');
        console.log('✓ the offer never carries over to another structure');
    }

    // A failed publish offers nothing.
    {
        const { attributionDistribution, inspection, feedbackShown } = mountEditor({
            publicationDistributionCommand: () => Promise.resolve({}),
            publish: () => Promise.reject(new Error('PublicationResolver: signed out'))
        });
        inspection.inspectStructure(structure('tower'));
        await inspection.publishInspectedAttributionToNetwork();
        assert(attributionDistribution.publishedPublication.value === null, 'nothing to distribute when publishing failed');
        assert(feedbackShown.length === 1, 'the failure is reported');
        console.log('✓ a failed publish offers nothing');
    }

    // Without any distribution command there is nothing to offer.
    {
        const { attributionDistribution } = mountEditor({ publish: () => Promise.resolve(fakePublication('attr-y')) });
        assert(attributionDistribution.canDistributePublication === false, 'no command, no Distribute button');
        console.log('✓ no distribution command means no offer');
    }

    // The panel only emits; EditorView opens the dialog.
    {
        for (const event of ['distribute-attribution', 'dismiss-distribute-attribution', 'publish-attribution']) {
            assert(StructureInfoPanel.emits.includes(event), `StructureInfoPanel declares ${event}`);
        }
        assert(StructureInfoPanel.props.attributionPublished.default === false, 'the offer is hidden until the host says a claim was published');
        console.log('✓ StructureInfoPanel offers the step and leaves distributing to the Editor');
    }

    console.log('\n✅ All attribution post-publish distribution tests passed.');
}

await run();
