import { BuildNoteDiscovery } from '../../application/buildNotes/BuildNoteDiscovery.js';
import { PublishBuildNoteUseCase } from '../../application/buildNotes/PublishBuildNoteUseCase.js';
import { CarrierKeyStore } from '../../application/buildNotes/CarrierKeyStore.js';
import { FindabilityStore } from '../../application/settings/FindabilityStore.js';
import { FindableBuildsStore } from '../../application/buildNotes/FindableBuildsStore.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../../discovery/LocalDiscoveryProvider.js';

// Composition root for build notes (core/BuildNote.js): sending a published
// build to everyone with this device's carrier key, and finding the builds
// others sent. The signer, the link opener and the payload codec load the
// first time a note is sent or opened, never with the first screen
// (docs/Pillars.md, "Networks: readers and writers").
export function composeBuildNotes({
    relayUrls, queryRelay, publicationContentStore, verifier, storeSnapshotContentUseCase,
    decentralizedPublicationDiscoveryProvider, admissionLog, isKnown, entryLog, placementClaimLookup
}) {
    const storageProvider = new LocalStorageProvider();
    const findabilityStore = new FindabilityStore({ storageProvider });
    // The builds known to be on the relays, which get a short link.
    const findableBuildsStore = new FindableBuildsStore({ storageProvider });

    let modules = null;
    function loadModules() {
        if (!modules) {
            modules = Promise.all([
                import('../../nostr/AppNostrSigner.js'),
                import('../../nostr/NostrInjectedProviderPublisher.js'),
                import('../../application/publication/sharing/PublicationLinkPayload.js'),
                import('../../application/publication/PublicationShareLink.js'),
                import('../../application/publication/OpenPublicationLink.js'),
                import('../../application/placement/LinkedPublisherPlacement.js')
            ]).then(([signer, publisher, payload, shareLink, openLink, linkedPlacement]) => ({
                signer, publisher, payload, shareLink, openLink, linkedPlacement
            }));
            modules.catch(() => { modules = null; });
        }
        return modules;
    }

    let publishWithCarrierKey = null;
    async function carrierPublisher() {
        if (!publishWithCarrierKey) {
            const { signer, publisher } = await loadModules();
            const carrierKeyStore = new CarrierKeyStore({
                storageProvider, generate: signer.generateNostrSecretKey, isValid: signer.isNostrSecretKey
            });
            publishWithCarrierKey = publisher.createNostrInjectedProviderPublisher({
                injectedProvider: signer.createAppNostrSigner({ secretKey: carrierKeyStore.secretKey() })
            });
        }
        return publishWithCarrierKey;
    }

    const publishBuildNoteUseCase = new PublishBuildNoteUseCase({
        readBuildText: async (claim) => (await loadModules()).shareLink.readPublishedBuildText({ publication: claim, contentStore: publicationContentStore }),
        encodePayload: async (request) => (await loadModules()).payload.encodePublicationLinkPayload(request),
        publishToRelay: async (relayUrl, template) => (await carrierPublisher())(relayUrl, template),
        relayUrls: () => relayUrls,
        placementClaimFor: (publication) => (placementClaimLookup ? placementClaimLookup.claimFor(publication) : {}),
        onSent: (publicationId) => findableBuildsStore.add(publicationId)
    });

    let linkedPlacement = null;
    async function publisherPlacement() {
        const { linkedPlacement: module } = await loadModules();
        if (!linkedPlacement) {
            linkedPlacement = module.createLinkedPublisherPlacement({
                storageProvider: new LocalStorageProvider(),
                findPublicationById: (id) => decentralizedPublicationDiscoveryProvider.findById(id)
                    || new LocalDiscoveryProvider(new LocalStorageProvider()).findById(id)
            });
        }
        return linkedPlacement;
    }

    const buildNoteDiscovery = new BuildNoteDiscovery({
        queryRelay,
        relayUrls: () => relayUrls,
        verifyEvent: async (event) => (await loadModules()).signer.verifyNostrEvent(event),
        decodePayload: async (payload) => (await loadModules()).payload.decodePublicationLinkPayload(payload),
        openLinkOnly: async (linkOnly) => {
            const { openLink } = await loadModules();
            return openLink.openPublicationLink({
                linkOnly,
                verifier,
                hasLocalContent: async (reference) => publicationContentStore.has(reference),
                storeSnapshotContent: (request) => storeSnapshotContentUseCase.execute(request),
                discoveryProvider: {
                    add: (publication) => {
                        if (!decentralizedPublicationDiscoveryProvider.findById(publication.id)) decentralizedPublicationDiscoveryProvider.add(publication);
                    }
                },
                admissionLog
            });
        },
        openedOutcome: 'opened',
        adoptPlacement: async (record) => (await publisherPlacement()).adopt(record),
        isKnown,
        entryLog,
        onOpened: (publicationId) => findableBuildsStore.add(publicationId)
    });

    return { findabilityStore, findableBuildsStore, publishBuildNoteUseCase, buildNoteDiscovery };
}
