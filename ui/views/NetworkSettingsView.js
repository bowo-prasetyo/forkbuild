// Hub page linking to the individual network settings pages — the three
// role provider preferences (Content, Announcement / Discovery, Proof /
// Anchoring) and the seven endpoint-server pages (Arweave Gateway, IPFS
// Gateway, Bitcoin Endpoint, Nostr Relays, STUN, TURN, Rendezvous) — so the
// top nav only needs one "Network Settings" entry instead of ten. Each
// linked page keeps its own route, component, and Save logic unchanged.
import { t } from '../i18n/i18n.js';

export default {
    name: 'NetworkSettingsView',
    methods: { t },
    template: `
        <section class="network-settings-view">
            <h1>{{ t('networkSettingsView.networkSettings') }}</h1>
            <p class="form-hint form-hint--neutral">
                {{ t('networkSettingsView.endpointServersForkbuildUsesTo') }}
            </p>

            <ul class="network-settings-list">
                <li>
                    <router-link to="/settings/content-provider" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.contentProvider') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.preferredStorageProviderForPublishing') }}</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/announcement-discovery-provider" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.announcementDiscoveryProvider') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.preferredSubstrateNostrOrArweave') }}</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/anchor-provider" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.proofAnchoringProvider') }} <span class="experimental-badge">{{ t('networkSettingsView.experimental') }}</span></span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.preferredSubstrateBitcoinOrArweave') }}</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/arweave-gateway" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.arweaveGateway') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.gatewayUsedForRetrievingArweave') }}</span>
                    </router-link>
                </li>
                <li>
                    <!-- 0.9.665 — reverses the earlier DEFER verdicts for
                         IPFS Gateway configurability (see core/
                         IpfsGatewayConfiguration.js's own header). -->
                    <router-link to="/settings/ipfs-gateway" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.ipfsGateway') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.gatewayUsedForRetrievingIpfs') }}</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/bitcoin-esplora" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.bitcoinEndpoint') }} <span class="experimental-badge">{{ t('networkSettingsView.experimental') }}</span></span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.esploraCompatibleEndpointUsedFor') }}</span>
                    </router-link>
                </li>
                <li>
                    <!-- UNIFIED — this row used to link to two separate
                         pages: "Nostr Relay" (Snapshot/Place Naming
                         discovery only) and "Nostr Publication Relays"
                         (Publication distribution/discovery only). See
                         core/NostrRelayConfiguration.js's own "unified"
                         header for the full rationale — the two relay sets
                         were merged into this one page/store, used
                         everywhere Nostr is used (Publications, Snapshots,
                         Place Naming, Commentary). -->
                    <router-link to="/settings/nostr-relay" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.nostrRelays') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.relaysUsedEverywhereThisReplica') }}</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/steem" class="network-settings-link">
                        <span class="network-settings-link-title">Steem</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.whereThisReplicaReadsSteem') }}</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/stun" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.stunServers') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.serversUsedForPeerTo') }}</span>
                    </router-link>
                </li>
                <li>
                    <!-- 0.9.456 — TURN Server Settings UI. A genuinely
                         separate page from "STUN Servers" above: that page
                         configures STUN servers only (see core/
                         IceServerConfiguration.js's own "STUN ONLY — NEVER
                         TURN" header); this one configures a user's own TURN
                         relay (core/TurnServerConfiguration.js, 0.9.454),
                         deliberately never folded into the STUN row — see
                         ui/views/TurnServerSettingsView.js's own header. -->
                    <router-link to="/settings/turn-server" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.turnServer') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.yourOwnTurnRelayFor') }}</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/rendezvous" class="network-settings-link">
                        <span class="network-settings-link-title">{{ t('networkSettingsView.rendezvousServers') }}</span>
                        <span class="form-hint form-hint--neutral">{{ t('networkSettingsView.serversUsedToHelpPeers') }}</span>
                    </router-link>
                </li>
            </ul>
        </section>
    `
};
