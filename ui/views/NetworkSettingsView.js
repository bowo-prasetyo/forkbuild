// Hub page linking to the individual endpoint-server settings pages
// (Content Provider, Arweave Gateway, Nostr Relay, STUN, Rendezvous) so the
// top nav only needs one "Network Settings" entry instead of five. Each
// linked page keeps its own route, component, and Save logic unchanged.
export default {
    name: 'NetworkSettingsView',
    template: `
        <section class="network-settings-view">
            <h1>Network Settings</h1>
            <p class="form-hint form-hint--neutral">
                Endpoint servers ForkBuild uses to publish, retrieve, and discover content across decentralized substrates.
            </p>

            <ul class="network-settings-list">
                <li>
                    <router-link to="/settings/content-provider" class="network-settings-link">
                        <span class="network-settings-link-title">Content Provider</span>
                        <span class="form-hint form-hint--neutral">Preferred storage provider for publishing content.</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/arweave-gateway" class="network-settings-link">
                        <span class="network-settings-link-title">Arweave Gateway</span>
                        <span class="form-hint form-hint--neutral">Gateway used for retrieving Arweave content.</span>
                    </router-link>
                </li>
                <li>
                    <!-- AMENDED BY 0.9.452 — this row previously read "Relay
                         used for Nostr-based discovery and publishing,"
                         contradicting this same page's own "discovery only"
                         text (named as a known, open defect by 0.9.446/
                         0.9.448/0.9.449). It was also stale about scope:
                         since 0.9.451, Publication discovery no longer even
                         reads this relay (see the Nostr Publication Relays
                         row below) — this preference now covers Snapshot
                         and Place Naming discovery only. -->
                    <router-link to="/settings/nostr-relay" class="network-settings-link">
                        <span class="network-settings-link-title">Nostr Relay</span>
                        <span class="form-hint form-hint--neutral">Relay used for Nostr-based Snapshot and Place Naming discovery.</span>
                    </router-link>
                </li>
                <li>
                    <!-- 0.9.447 — Nostr Publication Relay Set Configuration.
                         A genuinely separate page from "Nostr Relay" above:
                         that page configures Snapshot/Place Naming discovery
                         only (see its own template text); this one
                         configures the relay SET a signed Publication
                         announcement fans out to, and the relay SET
                         Publication discovery queries (0.9.451). AMENDED BY
                         0.9.452 — this row previously also claimed Snapshot
                         distribution, which this relay set has never
                         governed (Snapshot distribution has no multi-relay
                         seam of any kind — see application/
                         SnapshotDistributionRuntimeComposition.js). -->
                    <router-link to="/settings/nostr-publication-relays" class="network-settings-link">
                        <span class="network-settings-link-title">Nostr Publication Relays</span>
                        <span class="form-hint form-hint--neutral">Relays used to publish and discover Publications over Nostr.</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/stun" class="network-settings-link">
                        <span class="network-settings-link-title">STUN Servers</span>
                        <span class="form-hint form-hint--neutral">Servers used for peer-to-peer connection negotiation.</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/rendezvous" class="network-settings-link">
                        <span class="network-settings-link-title">Rendezvous Servers</span>
                        <span class="form-hint form-hint--neutral">Servers used to help peers find each other.</span>
                    </router-link>
                </li>
            </ul>
        </section>
    `
};
