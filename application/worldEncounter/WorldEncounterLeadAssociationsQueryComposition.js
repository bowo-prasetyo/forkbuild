import { deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry } from './DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js';

// composeWorldEncounterLeadAssociationsQuery({ runtime, discoveryProvider })
//   -> () -> associations[].
//
// The SAME association evidence
// application/worldEncounter/DiscoverWorldEncounterPublicationCommandComposition.js's
// command hands its runtime —
// `deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry()`
// over `discoveryProvider.list()` and `runtime.registry` — exposed on its
// own, so ui/components/WorldEncounterCanvas.js (via its
// `leadAssociationsQuery` prop) resolves a selected encounter's leads from
// exactly the evidence discovery itself used. Without it the canvas only
// ever saw an empty `decentralizedLeadAssociations`, so its "Location" /
// "Choose Location" panel never appeared, and an AMBIGUOUS encounter
// (several leads for one Publication) had no way to be resolved at all.
//
// Takes the SAME two composition-time arguments as that command, so the
// two can never drift onto different registries or publication sources.
// Reads both fresh on every call, exactly like the command: nothing is
// cached. Pure evidence derivation — no discovery query, no I/O beyond
// `discoveryProvider.list()`'s own local read.
export function composeWorldEncounterLeadAssociationsQuery({ runtime, discoveryProvider } = {}) {
    return () => deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromRegistry({
        publications: discoveryProvider ? discoveryProvider.list() : [],
        registry: runtime ? runtime.registry : null
    });
}
