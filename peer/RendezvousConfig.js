// 0.2.66 — "which rendezvous nodes does this device ask by default?"
// made an explicit, inspectable, and CHANGEABLE list — exactly the
// question peer/DiscoveryBootstrap.js's own header already answers
// architecturally ("A Bootstrap List Is Configuration, Never An
// Authority," 0.2.65); this module is where that configuration actually
// lives for the live app (see ui/main.js).
//
// Deliberately EMPTY by default. Shipping even one hard-coded rendezvous
// URL here would make THIS codebase the one thing every deployment
// depends on to find anyone at all — precisely the "accidentally turns
// identityId -> endpoint into a permanent centralized identity registry"
// outcome docs/Principles.md explicitly rejects for this milestone. An
// empty list means peer/DiscoveryBootstrap.js's own `bootstrapProviders`
// stays empty too, so a fresh checkout behaves EXACTLY as every prior
// milestone already did — out-of-band invitations only — until an
// operator deliberately configures one or more real
// peer/WebSocketRendezvousTransport.js URLs here (or wires their own
// list straight into ui/main.js without touching this file at all; this
// module is a convenience default, never a required seam).
export const DEFAULT_RENDEZVOUS_URLS = [];
