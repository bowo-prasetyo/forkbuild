import { BaseAnchorPublisher } from '../anchoring/BaseAnchorPublisher.js';
import { BaseReviewedSigningCoordinator } from './BaseReviewedSigningCoordinator.js';
import { BaseSignedTransactionFinalizer } from '../base/BaseSignedTransactionFinalizer.js';
import { CreateBaseAnchorPublicationRecordUseCase } from './CreateBaseAnchorPublicationRecordUseCase.js';

// 0.9.470 — Review-Preserving Base Anchor Publisher.
//
// Mirrors `application/CreateBitcoinAnchorPublisherUseCase.js`'s own shape
// exactly, one chain over — a composition root (`ui/main.js` or `tests/`)
// uses to get a concrete `anchoring/BaseAnchorPublisher.js` without ever
// importing that file, or any of the four collaborators it composes,
// directly. Dependency construction only — no transaction logic of any
// kind lives here; see `anchoring/BaseAnchorPublisher.js`'s own header for
// what each collaborator does.
//
// Every collaborator this class does not already know how to build safely
// on its own — `baseTransactionBroadcaster` (network-specific: needs a real
// `rpcSource`) and `createPublicationAnchorUseCase` (replica-specific:
// needs a real publication catalog, identity provider, verifier, and anchor
// catalog) — is required from the caller, exactly as `application/
// CreateBitcoinAnchorPublisherUseCase.js` already requires its own
// `broadcaster`. The remaining three are stateless, network-free, and
// already safe to default: a fresh `BaseReviewedSigningCoordinator`, a
// fresh `BaseSignedTransactionFinalizer`, and a fresh
// `CreateBaseAnchorPublicationRecordUseCase` — a caller supplying its own
// is only ever substituting a test double, never changing behavior.
export class CreateBaseAnchorPublisherUseCase {
    execute({
        baseTransactionBroadcaster,
        createPublicationAnchorUseCase,
        baseReviewedSigningCoordinator = new BaseReviewedSigningCoordinator(),
        baseSignedTransactionFinalizer = new BaseSignedTransactionFinalizer(),
        createBaseAnchorPublicationRecordUseCase = new CreateBaseAnchorPublicationRecordUseCase()
    } = {}) {
        const baseAnchorPublisher = new BaseAnchorPublisher({
            baseReviewedSigningCoordinator,
            baseSignedTransactionFinalizer,
            baseTransactionBroadcaster,
            createBaseAnchorPublicationRecordUseCase,
            createPublicationAnchorUseCase
        });

        return { baseAnchorPublisher };
    }
}
