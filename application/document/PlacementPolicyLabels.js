import { PlacementPolicy } from '../../core/PlacementPolicy.js';

// Labels for the placement setting, shared by the Document Properties editor
// and the Document Info panel so the two never describe it differently.
const PLACEMENT_POLICY_LABELS = Object.freeze({
    [PlacementPolicy.ANYONE]: 'Anyone may place it',
    [PlacementPolicy.PUBLISHER_ONLY]: 'Only I may place it'
});

export function describePlacementPolicy(policy) {
    return PLACEMENT_POLICY_LABELS[policy] || PLACEMENT_POLICY_LABELS[PlacementPolicy.PUBLISHER_ONLY];
}

export const PLACEMENT_POLICY_OPTIONS = [
    PlacementPolicy.ANYONE,
    PlacementPolicy.PUBLISHER_ONLY
].map((id) => ({ id, label: describePlacementPolicy(id) }));
