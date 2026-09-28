// A publication with a legacy (FNV-1a) content hash is never anchored or
// placed: nobody else can check bytes against that hash, so a record of it
// proves nothing. Every entry point refuses before a publisher, wallet or
// store is asked, and the use case that signs anchors refuses as a backstop.
import { CreateExternalPublicationAnchorUseCase } from '../application/anchoring/CreateExternalPublicationAnchorUseCase.js';
import { CreatePublicationAnchorUseCase } from '../application/anchoring/CreatePublicationAnchorUseCase.js';
import { ExternalAnchorCreationOutcome } from '../application/anchoring/ExternalAnchorCreationOutcome.js';
import { BitcoinAnchorTransactionConstructionCoordinator } from '../application/anchoring/bitcoin/BitcoinAnchorTransactionConstructionCoordinator.js';
import { BitcoinAnchorTransactionConstructionState } from '../application/anchoring/bitcoin/BitcoinAnchorTransactionConstructionState.js';
import { BitcoinAnchorFundingObservationState } from '../application/anchoring/bitcoin/BitcoinAnchorFundingObservationState.js';
import { BitcoinAnchorPublicationCoordinator } from '../application/anchoring/bitcoin/BitcoinAnchorPublicationCoordinator.js';
import { BitcoinAnchorPublicationLifecycleState } from '../application/anchoring/bitcoin/BitcoinAnchorPublicationLifecycleState.js';
import { BasePublicationTransactionPlanCoordinator } from '../application/anchoring/base/BasePublicationTransactionPlanCoordinator.js';
import { BasePublicationTransactionPlanState } from '../application/anchoring/base/BasePublicationTransactionPlanState.js';
import { BaseNetworkObservationState } from '../application/anchoring/base/BaseNetworkObservationState.js';
import { BaseAnchorPublisher } from '../anchoring/BaseAnchorPublisher.js';
import { CreateExternalSnapshotPlacementUseCase } from '../application/snapshot/placement/CreateExternalSnapshotPlacementUseCase.js';
import { LEGACY_HASH_EXTERNAL_REASON } from '../serializer/contentHash.js';
import { assert } from './support/Assert.js';

const LEGACY = '0000000a';
const MODERN = 'a'.repeat(64);

// Any call to one of these fails the test: the refusal must come first.
function untouchable(name, methods) {
    return Object.fromEntries(methods.map((method) => [method, () => { throw new Error(`${name}.${method}() was called`); }]));
}

const catalog = {
    get: (id) => ({ id, contentReference: { hash: id === 'legacy' ? LEGACY : MODERN } })
};

// Steem, Arweave and every other registry-based publisher, one at a time
// and in a batch.
{
    const publisher = { anchorType: 'steem', ...untouchable('publisher', ['publish', 'publishBatch']) };
    const useCase = new CreateExternalPublicationAnchorUseCase(catalog, { get: () => publisher }, untouchable('createAnchor', ['execute']));
    const single = await useCase.execute('legacy', 'steem');
    assert(single.outcome === ExternalAnchorCreationOutcome.PUBLISH_REJECTED && single.reason === LEGACY_HASH_EXTERNAL_REASON && single.anchor === null,
        'a single anchor of a legacy hash is rejected, saying why');
    const batch = await useCase.executeBatch(['modern', 'legacy'], 'steem');
    assert(batch.outcome === ExternalAnchorCreationOutcome.PUBLISH_REJECTED && batch.reason === LEGACY_HASH_EXTERNAL_REASON && batch.anchors.length === 0,
        'a batch holding one legacy hash is rejected whole');
    console.log('✓ registry publishers are never asked to anchor a legacy hash');
}

// Bitcoin: the granular flow builds no transaction; the one-call flow stops
// before its plan.
{
    const coordinator = new BitcoinAnchorTransactionConstructionCoordinator({ bitcoinAnchorTransactionBuilder: untouchable('builder', ['build']) });
    const result = coordinator.construct({
        publicationId: 'legacy', contentHash: LEGACY,
        fundingObservation: { state: BitcoinAnchorFundingObservationState.OBSERVED, utxos: [], changeAccount: 'bc1q' }
    });
    assert(result.state === BitcoinAnchorTransactionConstructionState.FAILED && result.reason === LEGACY_HASH_EXTERNAL_REASON && result.construction === null,
        'no Bitcoin transaction is constructed for a legacy hash');

    const oneCall = new BitcoinAnchorPublicationCoordinator({
        publicationCatalog: catalog,
        createPublicationAnchorUseCase: untouchable('createAnchor', ['execute']),
        bitcoinAnchorTransactionBuilder: untouchable('builder', ['build']),
        bitcoinAnchorPsbtBuilder: untouchable('psbtBuilder', ['build']),
        bitcoinAnchorPsbtSerializer: untouchable('serializer', ['serialize']),
        bitcoinAnchorWalletSigner: untouchable('wallet', ['requestSignature']),
        bitcoinAnchorSignedPsbtFinalizer: untouchable('finalizer', ['finalize']),
        bitcoinAnchorTransactionBroadcaster: untouchable('broadcaster', ['broadcast'])
    });
    const published = await oneCall.publishAnchor('legacy', {});
    assert(published.state === BitcoinAnchorPublicationLifecycleState.PLAN_FAILED && published.reason === LEGACY_HASH_EXTERNAL_REASON,
        'the one-call Bitcoin pipeline stops before planning');
    console.log('✓ Bitcoin never plans a transaction for a legacy hash');
}

// Base: no plan, and the publisher never asks the wallet.
{
    const coordinator = new BasePublicationTransactionPlanCoordinator({ basePublicationTransactionPlanner: untouchable('planner', ['plan']) });
    const result = await coordinator.construct({
        publicationId: 'legacy', contentHash: LEGACY,
        accountObservation: { state: BaseNetworkObservationState.OBSERVED, address: '0x1', network: 'base', chainId: 8453, nativeBalanceWei: '1' }
    });
    assert(result.state === BasePublicationTransactionPlanState.FAILED && result.reason === LEGACY_HASH_EXTERNAL_REASON,
        'no Base plan is made for a legacy hash');

    const publisher = new BaseAnchorPublisher({
        baseReviewedSigningCoordinator: untouchable('signing', ['sign']),
        baseSignedTransactionFinalizer: untouchable('finalizer', ['finalize']),
        baseTransactionBroadcaster: untouchable('broadcaster', ['broadcast']),
        createBaseAnchorPublicationRecordUseCase: untouchable('record', ['execute']),
        createPublicationAnchorUseCase: untouchable('createAnchor', ['execute'])
    });
    const published = await publisher.publish('legacy', { contentHash: LEGACY, reviewedTransaction: { contentHash: LEGACY } });
    assert(published.published === false && published.reason === LEGACY_HASH_EXTERNAL_REASON, 'the Base publisher refuses before signing');
    console.log('✓ Base never plans or signs for a legacy hash');
}

// The backstop: no anchor naming a legacy hash is ever signed.
{
    const useCase = new CreatePublicationAnchorUseCase(catalog, untouchable('identity', ['signCanonical', 'getCurrentUser']), {}, untouchable('anchorCatalog', ['add']));
    let message = null;
    try {
        useCase.execute('legacy', { anchorType: 'steem', locator: 'steem:x' });
    } catch (error) {
        message = error.message;
    }
    assert(message && message.includes(LEGACY_HASH_EXTERNAL_REASON), 'signing an anchor of a legacy hash throws, saying why');
    console.log('✓ no anchor of a legacy hash is ever signed');
}

// Placement: this device can read its own legacy content, but it is never
// placed where others would fetch it.
{
    const useCase = new CreateExternalSnapshotPlacementUseCase(
        { findById: (id) => catalog.get(id) },
        untouchable('resolver', ['verify', 'resolve']),
        { get: () => untouchable('store', ['put']) },
        untouchable('createPlacement', ['execute'])
    );
    let message = null;
    try {
        await useCase.execute('legacy', 'ipfs');
    } catch (error) {
        message = error.message;
    }
    assert(message && message.includes(LEGACY_HASH_EXTERNAL_REASON), 'placing legacy content throws before any store is asked');
    console.log('✓ legacy content is never placed');
}
