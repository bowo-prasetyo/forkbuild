import { PlacementPolicy } from '../../core/PlacementPolicy.js';
import { message } from '../../core/Message.js';

// Labels for the placement setting, shared by the Document Properties editor
// and the Document Info panel so the two never describe it differently. Each
// label is a message (core/Message.js).
const PLACEMENT_POLICY_KEYS = Object.freeze({
    [PlacementPolicy.ANYONE]: 'placementPolicy.anyone',
    [PlacementPolicy.PUBLISHER_ONLY]: 'placementPolicy.publisherOnly'
});

export function describePlacementPolicy(policy) {
    return message(PLACEMENT_POLICY_KEYS[policy] || PLACEMENT_POLICY_KEYS[PlacementPolicy.PUBLISHER_ONLY]);
}

export const PLACEMENT_POLICY_OPTIONS = [
    PlacementPolicy.ANYONE,
    PlacementPolicy.PUBLISHER_ONLY
].map((id) => ({ id, label: describePlacementPolicy(id) }));
