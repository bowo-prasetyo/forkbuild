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
                    <router-link to="/settings/nostr-relay" class="network-settings-link">
                        <span class="network-settings-link-title">Nostr Relay</span>
                        <span class="form-hint form-hint--neutral">Relay used for Nostr-based discovery and publishing.</span>
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
