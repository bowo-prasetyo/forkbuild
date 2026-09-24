import { ref } from 'vue';
import { BLUEPRINT_ATTRIBUTION_KIND } from '../../../core/BlueprintAttribution.js';
import { compareBlueprintSimilarity, isPossibleLineageCandidate } from '../../../core/BlueprintSimilarity.js';

// The structure inspection panel: what a Structure is and where it came from (attribution,
// lineage, similar designs), plus claiming, publishing and exporting that evidence.
export function useStructureInspection({
    blueprintAttributionUseCase, blueprintLineageUseCase, copyStructureIntoDocument, exportBlueprintAttribution,
    exportStructure, feedback, identityProvider, personalStructureLibraryStore, publicationCatalog,
    publicationPeerExchange, publicationResolver, structureRegistry
}) {
    // The source ('built-in' | 'personal') is derived here, so the panel never
    // reaches into the libraries.
    const inspectedStructure = ref(null);
    const inspectedStructureSource = ref('built-in');
    // Recomputed each time the panel opens: fingerprints stay valid across new
    // Structure instances with new ids.
    const inspectedStructureAttribution = ref(null);
    const inspectedStructureLineage = ref(null);
    // Unsigned evidence only, never persisted and never a claim. Most similar first.
    const inspectedStructureSimilarityCandidates = ref([]);
    // Built-in plus personal designs, excluding the inspected one and any already
    // named as a source by a lineage claim.
    function computeSimilarityCandidates(structure, lineage) {
        const alreadyClaimed = new Set((lineage && lineage.derivedFrom || []).map((claim) => claim.sourceFingerprint));
        const known = [...structureRegistry.getAll(), ...personalStructureLibraryStore.listStructures()];
        const candidates = [];
        for (const candidate of known) {
            if (candidate.id === structure.id) {
                continue;
            }
            const evidence = compareBlueprintSimilarity(candidate, structure);
            if (!isPossibleLineageCandidate(evidence) || alreadyClaimed.has(evidence.sourceFingerprint)) {
                continue;
            }
            candidates.push({ structure: candidate, evidence });
        }
        candidates.sort((a, b) => b.evidence.similarity - a.evidence.similarity);
        return candidates.slice(0, 3);
    }
    function inspectStructure(structure) {
        inspectedStructure.value = structure;
        inspectedStructureSource.value = personalStructureLibraryStore.hasStructure(structure.id) ? 'personal' : 'built-in';
        inspectedStructureAttribution.value = blueprintAttributionUseCase.communityView(structure);
        inspectedStructureLineage.value = blueprintLineageUseCase.lineageView(structure);
        inspectedStructureSimilarityCandidates.value = computeSimilarityCandidates(structure, inspectedStructureLineage.value);
    }
    // Inspect only offers another way to reach Place/Export, never another way to
    // do them.
    function placeInspectedStructure() {
        const structure = inspectedStructure.value;
        inspectedStructure.value = null;
        copyStructureIntoDocument(structure);
    }
    function exportInspectedStructure() {
        const structure = inspectedStructure.value;
        inspectedStructure.value = null;
        exportStructure(structure);
    }
    // Refreshes the attribution afterwards so the panel shows "You" immediately.
    function claimAuthorship() {
        const structure = inspectedStructure.value;
        if (!structure) {
            return;
        }
        try {
            blueprintAttributionUseCase.publish(structure);
            inspectedStructureAttribution.value = blueprintAttributionUseCase.communityView(structure);
            feedback.show(`You are now credited as an author of "${structure.name}"`);
        } catch (e) {
            feedback.show(e.message.replace(/^BlueprintAttributionUseCase:\s*/, ''));
        }
    }

    function exportInspectedAttribution() {
        const attribution = inspectedStructureAttribution.value && inspectedStructureAttribution.value.mine;
        if (!attribution) {
            return;
        }
        exportBlueprintAttribution(attribution);
    }

    // Wraps the signed attribution in a signed DecentralizedPublication, catalogs
    // it and announces it to connected peers. No peers is not an error: it stays
    // cataloged. Announcing again is always a deliberate act.
    async function publishInspectedAttributionToNetwork() {
        const attribution = inspectedStructureAttribution.value && inspectedStructureAttribution.value.mine;
        if (!attribution) {
            return;
        }
        try {
            const publication = await publicationResolver.publish({
                content: attribution,
                contentKind: BLUEPRINT_ATTRIBUTION_KIND,
                identityProvider
            });
            publicationCatalog.add(publication);
            const peerCount = publicationPeerExchange.announce(publication);
            feedback.show(peerCount > 0
                ? `Published to the network — announced to ${peerCount} connected ${peerCount === 1 ? 'peer' : 'peers'}.`
                : 'Published to the network — cataloged locally; no peers are connected to announce to right now.');
        } catch (e) {
            feedback.show(e.message.replace(/^PublicationResolver:\s*/, ''));
        }
    }

    // Publishes a lineage claim for a candidate a person chose. The similarity
    // score is never consulted here: it is evidence for a person, never a
    // threshold.
    function claimLineage(sourceStructure) {
        const structure = inspectedStructure.value;
        if (!structure) {
            return;
        }
        try {
            blueprintLineageUseCase.publish(structure, sourceStructure);
            inspectedStructureLineage.value = blueprintLineageUseCase.lineageView(structure);
            inspectedStructureSimilarityCandidates.value = computeSimilarityCandidates(structure, inspectedStructureLineage.value);
            feedback.show(`Recorded "${structure.name}" as derived from "${sourceStructure.name}"`);
        } catch (e) {
            feedback.show(e.message.replace(/^BlueprintLineageUseCase:\s*/, ''));
        }
    }

    return {
        claimAuthorship, claimLineage, exportInspectedAttribution, exportInspectedStructure, inspectStructure,
        inspectedStructure, inspectedStructureAttribution, inspectedStructureLineage,
        inspectedStructureSimilarityCandidates, inspectedStructureSource, placeInspectedStructure,
        publishInspectedAttributionToNetwork
    };
}
