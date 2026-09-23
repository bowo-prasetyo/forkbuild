// Hub page linking to the individual network settings pages — the three
// role provider preferences (Content, Announcement / Discovery, Proof /
// Anchoring) and the seven endpoint-server pages (Arweave Gateway, IPFS
// Gateway, Bitcoin Endpoint, Nostr Relays, STUN, TURN, Rendezvous) — so the
// top nav only needs one "Network Settings" entry instead of ten. Each
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
                    <router-link to="/settings/announcement-discovery-provider" class="network-settings-link">
                        <span class="network-settings-link-title">Announcement / Discovery Provider</span>
                        <span class="form-hint form-hint--neutral">Preferred substrate — Nostr or Arweave — for announcing and discovering Publications, Snapshots, Place Naming, and Commentary.</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/anchor-provider" class="network-settings-link">
                        <span class="network-settings-link-title">Proof / Anchoring Provider</span>
                        <span class="form-hint form-hint--neutral">Preferred substrate — Bitcoin or Arweave — "Use Preferred Provider" anchors new evidence onto. Base keeps its own separate wallet-guided anchoring flow.</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/arweave-gateway" class="network-settings-link">
                        <span class="network-settings-link-title">Arweave Gateway</span>
                        <span class="form-hint form-hint--neutral">Gateway used for retrieving Arweave content.</span>
                    </router-link>
                </li>
                <li>
                    <!-- 0.9.665 — reverses the earlier DEFER verdicts for
                         IPFS Gateway configurability (see core/
                         IpfsGatewayConfiguration.js's own header). -->
                    <router-link to="/settings/ipfs-gateway" class="network-settings-link">
                        <span class="network-settings-link-title">IPFS Gateway</span>
                        <span class="form-hint form-hint--neutral">Gateway used for retrieving IPFS content.</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/bitcoin-esplora" class="network-settings-link">
                        <span class="network-settings-link-title">Bitcoin Endpoint</span>
                        <span class="form-hint form-hint--neutral">Esplora-compatible endpoint used for Bitcoin anchor broadcasting, confirmation, funding lookups, and proof verification.</span>
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
                        <span class="network-settings-link-title">Nostr Relays</span>
                        <span class="form-hint form-hint--neutral">Relays used everywhere this replica publishes and discovers over Nostr — Publications, Snapshots, Place Naming, and Commentary.</span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/settings/stun" class="network-settings-link">
                        <span class="network-settings-link-title">STUN Servers</span>
                        <span class="form-hint form-hint--neutral">Servers used for peer-to-peer connection negotiation.</span>
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
                        <span class="network-settings-link-title">TURN Server</span>
                        <span class="form-hint form-hint--neutral">Your own TURN relay for peer connections that need one.</span>
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
