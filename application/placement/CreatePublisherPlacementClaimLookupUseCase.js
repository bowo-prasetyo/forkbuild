import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { LocalPlacementRegistry } from '../../placement/LocalPlacementRegistry.js';
import { PublisherPlacementClaimLookup } from './PublisherPlacementClaim.js';

// Wires PublisherPlacementClaimLookup to this device's placement records (the
// same storage World View's placement registry reads), so ui/ never imports
// placement/ or storage/ directly. Read-only: nothing here writes a record.
export class CreatePublisherPlacementClaimLookupUseCase {
    execute() {
        return new PublisherPlacementClaimLookup(new LocalPlacementRegistry(new LocalStorageProvider()));
    }
}
