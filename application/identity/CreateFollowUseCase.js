import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { FollowUseCase } from './FollowUseCase.js';

// Wires the concrete storage backend so ui/ never imports storage/ directly.
export class CreateFollowUseCase {
    execute(identityProvider) {
        return new FollowUseCase(new LocalStorageProvider(), identityProvider);
    }
}
