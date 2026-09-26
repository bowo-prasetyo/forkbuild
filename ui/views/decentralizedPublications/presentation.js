import { LocalSnapshotContentAvailabilityOutcome } from '../../../application/snapshot/materialization/LocalSnapshotContentAvailabilityOutcome.js';
import { SnapshotContentMaterializationUiState } from '../../../application/snapshot/materialization/SnapshotContentMaterializationUiState.js';
import { SnapshotPlacementMaterializationUiState } from '../../../application/snapshot/placement/SnapshotPlacementMaterializationUiState.js';
import { SnapshotPeerMaterializationUiState } from '../../../application/snapshot/materialization/SnapshotPeerMaterializationUiState.js';
import { SnapshotPeerPossessionUiState } from '../../../application/snapshot/possession/SnapshotPeerPossessionUiState.js';
import { SnapshotPlacementResolutionOutcome } from '../../../application/snapshot/placement/SnapshotPlacementResolutionOutcome.js';
import { PublicationEvidenceDiscoveryUiState } from '../../../application/publication/evidence/PublicationEvidenceDiscoveryUiState.js';
import { PublicationKnowledgeSynchronizationUiState } from '../../../application/publication/evidence/PublicationKnowledgeSynchronizationUiState.js';
import { PublicationResolutionOutcome } from '../../../application/publication/PublicationResolutionOutcome.js';
import { AnchorVerificationOutcome } from '../../../application/anchoring/AnchorVerificationOutcome.js';
import { ExternalAnchorCreationUiState } from '../../../application/anchoring/ExternalAnchorCreationUiState.js';
import { SnapshotPlacementCreationUiState } from '../../../application/snapshot/placement/SnapshotPlacementCreationUiState.js';
import { BitcoinAnchorConfirmationState } from '../../../application/anchoring/bitcoin/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../../../application/anchoring/bitcoin/BitcoinAnchorContentProofState.js';
import { BitcoinWalletConnectionState } from '../../../application/anchoring/bitcoin/BitcoinWalletConnectionState.js';
import { BitcoinAnchorFundingObservationState } from '../../../application/anchoring/bitcoin/BitcoinAnchorFundingObservationState.js';
import { BaseWalletConnectionState } from '../../../application/anchoring/base/BaseWalletConnectionState.js';
import { BaseNetworkObservationState } from '../../../application/anchoring/base/BaseNetworkObservationState.js';
import { BitcoinAnchorReviewedSigningState } from '../../../application/anchoring/bitcoin/BitcoinAnchorReviewedSigningState.js';
import { BitcoinAnchorSignedPsbtFinalizationState } from '../../../application/anchoring/bitcoin/BitcoinAnchorSignedPsbtFinalizationState.js';
import { BitcoinAnchorBroadcastState } from '../../../application/anchoring/bitcoin/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorTransactionConstructionState } from '../../../application/anchoring/bitcoin/BitcoinAnchorTransactionConstructionState.js';
import { BasePublicationTransactionPlanState } from '../../../application/anchoring/base/BasePublicationTransactionPlanState.js';
import { BaseReviewedSigningState } from '../../../application/anchoring/base/BaseReviewedSigningState.js';
import { BaseSignedTransactionFinalizationState } from '../../../application/anchoring/base/BaseSignedTransactionFinalizationState.js';
import { BaseTransactionBroadcastState } from '../../../application/anchoring/base/BaseTransactionBroadcastState.js';
import { BaseTransactionInclusionObservationState } from '../../../application/anchoring/base/BaseTransactionInclusionObservationState.js';
import { IpfsRemotePublicationState } from '../../../application/ipfs/IpfsRemotePublicationState.js';
import { IpfsPublicationContentVerificationCoordinatorState } from '../../../application/ipfs/IpfsPublicationContentVerificationCoordinatorState.js';

// Badge colors reuse the .peer-badge palette: green = good (an "already
// available" duplicate counts as good), amber = honestly inconclusive (nothing
// could be established), red = a definite rejection (e.g. a hash mismatch). The
// label text, never the color alone, tells outcomes apart.
export const LOCAL_SNAPSHOT_AVAILABILITY_BADGE_CLASSES = {
    [LocalSnapshotContentAvailabilityOutcome.AVAILABLE]: 'peer-badge--authenticated',
    [LocalSnapshotContentAvailabilityOutcome.NOT_AVAILABLE]: 'peer-badge--unchecked',
    [LocalSnapshotContentAvailabilityOutcome.CONTENT_HASH_MISMATCH]: 'peer-badge--failed'
};

// Snapshot package import outcomes.
export const MATERIALIZATION_BADGE_CLASSES = {
    [SnapshotContentMaterializationUiState.IMPORTING]: 'peer-badge--pending',
    [SnapshotContentMaterializationUiState.IMPORTED]: 'peer-badge--authenticated',
    [SnapshotContentMaterializationUiState.ALREADY_AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotContentMaterializationUiState.UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotContentMaterializationUiState.REJECTED]: 'peer-badge--failed'
};

// Placement-backed materialization outcomes.
export const PLACEMENT_MATERIALIZATION_BADGE_CLASSES = {
    [SnapshotPlacementMaterializationUiState.MATERIALIZING]: 'peer-badge--pending',
    [SnapshotPlacementMaterializationUiState.STORED]: 'peer-badge--authenticated',
    [SnapshotPlacementMaterializationUiState.ALREADY_AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotPlacementMaterializationUiState.UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPlacementMaterializationUiState.HASH_MISMATCH]: 'peer-badge--failed',
    [SnapshotPlacementMaterializationUiState.INVALID_PLACEMENT]: 'peer-badge--failed'
};

// Peer-backed materialization outcomes. UNAVAILABLE is amber: a peer that
// doesn't answer can't be told apart from one that lacks the bytes.
export const PEER_MATERIALIZATION_BADGE_CLASSES = {
    [SnapshotPeerMaterializationUiState.REQUESTING]: 'peer-badge--pending',
    [SnapshotPeerMaterializationUiState.STORED]: 'peer-badge--authenticated',
    [SnapshotPeerMaterializationUiState.ALREADY_AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotPeerMaterializationUiState.UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPeerMaterializationUiState.HASH_MISMATCH]: 'peer-badge--failed'
};

// AVAILABLE and NOT_AVAILABLE are both ordinary answers, not success/failure;
// only CHECKING and UNAVAILABLE (no answer) are styled.
export const PEER_POSSESSION_BADGE_CLASSES = {
    [SnapshotPeerPossessionUiState.CHECKING]: 'peer-badge--pending',
    [SnapshotPeerPossessionUiState.AVAILABLE]: 'peer-badge--authenticated',
    [SnapshotPeerPossessionUiState.NOT_AVAILABLE]: 'peer-badge--pending',
    [SnapshotPeerPossessionUiState.UNAVAILABLE]: 'peer-badge--pending'
};

export const PLACEMENT_BADGE_CLASSES = {
    [SnapshotPlacementResolutionOutcome.RESOLVED]: 'peer-badge--authenticated',
    [SnapshotPlacementResolutionOutcome.STORE_UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPlacementResolutionOutcome.CONTENT_UNAVAILABLE]: 'peer-badge--pending',
    [SnapshotPlacementResolutionOutcome.INVALID_ENVELOPE]: 'peer-badge--failed',
    [SnapshotPlacementResolutionOutcome.INVALID_SIGNATURE]: 'peer-badge--failed',
    [SnapshotPlacementResolutionOutcome.CONTENT_HASH_MISMATCH]: 'peer-badge--failed'
};

export const DISCOVERY_BADGE_CLASSES = {
    [PublicationEvidenceDiscoveryUiState.DISCOVERING]: 'peer-badge--pending',
    [PublicationEvidenceDiscoveryUiState.DISCOVERED]: 'peer-badge--authenticated',
    [PublicationEvidenceDiscoveryUiState.NO_NEW_EVIDENCE]: 'peer-badge--unchecked',
    [PublicationEvidenceDiscoveryUiState.UNAVAILABLE]: 'peer-badge--pending'
};

export const SYNCHRONIZATION_BADGE_CLASSES = {
    [PublicationKnowledgeSynchronizationUiState.SYNCHRONIZING]: 'peer-badge--pending',
    [PublicationKnowledgeSynchronizationUiState.SYNCHRONIZED]: 'peer-badge--authenticated',
    [PublicationKnowledgeSynchronizationUiState.NO_NEW_CLAIMS]: 'peer-badge--unchecked',
    [PublicationKnowledgeSynchronizationUiState.UNAVAILABLE]: 'peer-badge--pending'
};

export function humanizeContentKind(contentKind) {
    if (!contentKind) return 'Unknown content';
    return contentKind
        .replace(/^forkbuild\./, '')
        .replace(/[-.]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A storage code ('local'/'ipfs'/'ar') is not a word: title-casing gives
// 'Ar'/'Ipfs'. Known codes get their real name; unknown ones fall back to
// humanizeContentKind(), never hidden.
export const STORAGE_TYPE_LABELS = {
    local: 'Local',
    ipfs: 'IPFS',
    ar: 'Arweave',
    steem: 'Steem'
};

export function humanizeStorageType(storage) {
    return STORAGE_TYPE_LABELS[storage] || humanizeContentKind(storage);
}

// Same for anchorType: 'bitcoin-op-return' names a script opcode, not a
// network. Known types get their network name; unknown ones fall back to
// humanizeContentKind().
export const ANCHOR_TYPE_LABELS = {
    'bitcoin-op-return': 'Bitcoin',
    base: 'Base',
    arweave: 'Arweave'
};

export function humanizeAnchorType(anchorType) {
    return ANCHOR_TYPE_LABELS[anchorType] || humanizeContentKind(anchorType);
}

export function shortId(identityId) {
    return identityId ? identityId.slice(-14) : 'an unknown identity';
}

// Display-only: the full hash is shown on each anchor card; this just tells
// content-hash groups apart at a glance.
export function shortHash(contentHash) {
    if (!contentHash) return 'an unknown hash';
    return contentHash.length > 18 ? `${contentHash.slice(0, 10)}…${contentHash.slice(-6)}` : contentHash;
}

export const OUTCOME_BADGE_CLASSES = {
    [PublicationResolutionOutcome.RESOLVED]: 'peer-badge--authenticated',
    [PublicationResolutionOutcome.CONTENT_UNAVAILABLE]: 'peer-badge--pending'
};

// Only VALID is green. VALID_PROOF_UNVERIFIED and PROOF_UNAVAILABLE are amber
// (inconclusive, never a rejection); every other outcome is red.
export const EVIDENCE_BADGE_CLASSES = {
    [AnchorVerificationOutcome.VALID]: 'peer-badge--authenticated',
    [AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED]: 'peer-badge--pending',
    [AnchorVerificationOutcome.PROOF_UNAVAILABLE]: 'peer-badge--pending',
    [AnchorVerificationOutcome.INVALID_ENVELOPE]: 'peer-badge--failed',
    [AnchorVerificationOutcome.INVALID_SIGNATURE]: 'peer-badge--failed',
    [AnchorVerificationOutcome.CONTENT_MISMATCH]: 'peer-badge--failed',
    [AnchorVerificationOutcome.INVALID_PROOF]: 'peer-badge--failed'
};

export const CREATION_BADGE_CLASSES = {
    [ExternalAnchorCreationUiState.CREATING]: 'peer-badge--pending',
    [ExternalAnchorCreationUiState.CREATED]: 'peer-badge--authenticated',
    [ExternalAnchorCreationUiState.REJECTED]: 'peer-badge--failed',
    [ExternalAnchorCreationUiState.UNAVAILABLE]: 'peer-badge--pending',
    // An unresolvable provider preference is inconclusive, not a rejection.
    [ExternalAnchorCreationUiState.PROVIDER_NOT_FOUND]: 'peer-badge--pending'
};

// The placement side has no REJECTED state (see
// application/snapshot/placement/SnapshotPlacementCreationUiState.js).
export const PLACEMENT_CREATION_BADGE_CLASSES = {
    [SnapshotPlacementCreationUiState.CREATING]: 'peer-badge--pending',
    [SnapshotPlacementCreationUiState.CREATED]: 'peer-badge--authenticated',
    [SnapshotPlacementCreationUiState.UNAVAILABLE]: 'peer-badge--pending',
    // An unresolvable provider preference is inconclusive, not a rejection.
    [SnapshotPlacementCreationUiState.PROVIDER_NOT_FOUND]: 'peer-badge--pending'
};

// Confirmation and content proof are independent observations, so they get
// separate maps. Only HASH_MISMATCH is red.
export const BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES = {
    [BitcoinAnchorConfirmationState.CONFIRMED]: 'peer-badge--authenticated',
    [BitcoinAnchorConfirmationState.NOT_CONFIRMED]: 'peer-badge--pending',
    [BitcoinAnchorConfirmationState.UNAVAILABLE]: 'peer-badge--pending'
};
export const BITCOIN_ANCHOR_CONTENT_PROOF_BADGE_CLASSES = {
    [BitcoinAnchorContentProofState.HASH_MATCH]: 'peer-badge--authenticated',
    [BitcoinAnchorContentProofState.HASH_MISMATCH]: 'peer-badge--failed',
    [BitcoinAnchorContentProofState.UNAVAILABLE]: 'peer-badge--pending'
};

// Wallet UNAVAILABLE is red (unlike confirmation's amber UNAVAILABLE): a
// missing or locked wallet extension is something the person can fix right now.
export const BITCOIN_WALLET_CONNECTION_BADGE_CLASSES = {
    [BitcoinWalletConnectionState.CONNECTED]: 'peer-badge--authenticated',
    [BitcoinWalletConnectionState.CONNECTING]: 'peer-badge--pending',
    [BitcoinWalletConnectionState.DISCONNECTED]: 'peer-badge--pending',
    [BitcoinWalletConnectionState.UNAVAILABLE]: 'peer-badge--failed'
};

// UNSUPPORTED is amber: a valid address this code can't estimate a fee for is
// not an actionable failure.
export const BITCOIN_ANCHOR_FUNDING_BADGE_CLASSES = {
    [BitcoinAnchorFundingObservationState.OBSERVED]: 'peer-badge--authenticated',
    [BitcoinAnchorFundingObservationState.UNSUPPORTED]: 'peer-badge--pending',
    [BitcoinAnchorFundingObservationState.UNAVAILABLE]: 'peer-badge--failed'
};

// UNAVAILABLE is red for the same reason as the Bitcoin wallet map.
export const BASE_WALLET_CONNECTION_BADGE_CLASSES = {
    [BaseWalletConnectionState.CONNECTED]: 'peer-badge--authenticated',
    [BaseWalletConnectionState.CONNECTING]: 'peer-badge--pending',
    [BaseWalletConnectionState.DISCONNECTED]: 'peer-badge--pending',
    [BaseWalletConnectionState.UNAVAILABLE]: 'peer-badge--failed'
};

// CHAIN_MISMATCH is amber: a reachable EVM network that isn't Base is not an
// actionable failure.
export const BASE_ACCOUNT_OBSERVATION_BADGE_CLASSES = {
    [BaseNetworkObservationState.OBSERVED]: 'peer-badge--authenticated',
    [BaseNetworkObservationState.CHAIN_MISMATCH]: 'peer-badge--pending',
    [BaseNetworkObservationState.UNAVAILABLE]: 'peer-badge--failed'
};

// Wallet pipeline stages (construction, signing, finalization, broadcast):
// in-flight states are amber, success is green, and failures are red because
// the step can be retried.
export const BITCOIN_ANCHOR_REVIEWED_SIGNING_BADGE_CLASSES = {
    [BitcoinAnchorReviewedSigningState.SIGNING]: 'peer-badge--pending',
    [BitcoinAnchorReviewedSigningState.SIGNED]: 'peer-badge--authenticated',
    [BitcoinAnchorReviewedSigningState.DECLINED]: 'peer-badge--failed',
    [BitcoinAnchorReviewedSigningState.UNAVAILABLE]: 'peer-badge--failed',
    [BitcoinAnchorReviewedSigningState.FAILED]: 'peer-badge--failed'
};

export const BITCOIN_ANCHOR_SIGNED_PSBT_FINALIZATION_BADGE_CLASSES = {
    [BitcoinAnchorSignedPsbtFinalizationState.FINALIZING]: 'peer-badge--pending',
    [BitcoinAnchorSignedPsbtFinalizationState.FINALIZED]: 'peer-badge--authenticated',
    [BitcoinAnchorSignedPsbtFinalizationState.INVALID_SIGNATURE]: 'peer-badge--failed',
    [BitcoinAnchorSignedPsbtFinalizationState.UNAVAILABLE]: 'peer-badge--failed',
    [BitcoinAnchorSignedPsbtFinalizationState.FAILED]: 'peer-badge--failed'
};

// BROADCASTED only means the network accepted the transaction, not that it
// confirmed.
export const BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES = {
    [BitcoinAnchorBroadcastState.BROADCASTING]: 'peer-badge--pending',
    [BitcoinAnchorBroadcastState.BROADCASTED]: 'peer-badge--authenticated',
    [BitcoinAnchorBroadcastState.REJECTED]: 'peer-badge--failed',
    [BitcoinAnchorBroadcastState.UNAVAILABLE]: 'peer-badge--failed',
    [BitcoinAnchorBroadcastState.FAILED]: 'peer-badge--failed'
};

export const BITCOIN_ANCHOR_TRANSACTION_CONSTRUCTION_BADGE_CLASSES = {
    [BitcoinAnchorTransactionConstructionState.CONSTRUCTING]: 'peer-badge--pending',
    [BitcoinAnchorTransactionConstructionState.CONSTRUCTED]: 'peer-badge--authenticated',
    [BitcoinAnchorTransactionConstructionState.FAILED]: 'peer-badge--failed'
};

// UNAVAILABLE is red here: an unreachable RPC endpoint while pricing a plan is
// a retry-now failure.
export const BASE_PUBLICATION_TRANSACTION_PLAN_BADGE_CLASSES = {
    [BasePublicationTransactionPlanState.CONSTRUCTING]: 'peer-badge--pending',
    [BasePublicationTransactionPlanState.CONSTRUCTED]: 'peer-badge--authenticated',
    [BasePublicationTransactionPlanState.UNAVAILABLE]: 'peer-badge--failed',
    [BasePublicationTransactionPlanState.FAILED]: 'peer-badge--failed'
};

export const BASE_REVIEWED_SIGNING_BADGE_CLASSES = {
    [BaseReviewedSigningState.SIGNING]: 'peer-badge--pending',
    [BaseReviewedSigningState.SIGNED]: 'peer-badge--authenticated',
    [BaseReviewedSigningState.DECLINED]: 'peer-badge--failed',
    [BaseReviewedSigningState.UNAVAILABLE]: 'peer-badge--failed',
    [BaseReviewedSigningState.FAILED]: 'peer-badge--failed'
};

export const BASE_SIGNED_TRANSACTION_FINALIZATION_BADGE_CLASSES = {
    [BaseSignedTransactionFinalizationState.FINALIZING]: 'peer-badge--pending',
    [BaseSignedTransactionFinalizationState.FINALIZED]: 'peer-badge--authenticated',
    [BaseSignedTransactionFinalizationState.INVALID_SIGNATURE]: 'peer-badge--failed',
    [BaseSignedTransactionFinalizationState.UNAVAILABLE]: 'peer-badge--failed',
    [BaseSignedTransactionFinalizationState.FAILED]: 'peer-badge--failed'
};

export const BASE_TRANSACTION_BROADCAST_BADGE_CLASSES = {
    [BaseTransactionBroadcastState.BROADCASTING]: 'peer-badge--pending',
    [BaseTransactionBroadcastState.BROADCASTED]: 'peer-badge--authenticated',
    [BaseTransactionBroadcastState.REJECTED]: 'peer-badge--failed',
    [BaseTransactionBroadcastState.UNAVAILABLE]: 'peer-badge--failed',
    [BaseTransactionBroadcastState.FAILED]: 'peer-badge--failed'
};

// NOT_INCLUDED and UNAVAILABLE are amber: not final yet, but not failures.
export const BASE_TRANSACTION_INCLUSION_BADGE_CLASSES = {
    [BaseTransactionInclusionObservationState.INCLUDED]: 'peer-badge--authenticated',
    [BaseTransactionInclusionObservationState.NOT_INCLUDED]: 'peer-badge--pending',
    [BaseTransactionInclusionObservationState.UNAVAILABLE]: 'peer-badge--pending'
};

// PUBLISHED names one fact (the service accepted the bytes), not a trust
// verdict.
export const IPFS_REMOTE_PUBLICATION_BADGE_CLASSES = {
    [IpfsRemotePublicationState.PUBLISHING]: 'peer-badge--pending',
    [IpfsRemotePublicationState.PUBLISHED]: 'peer-badge--authenticated',
    [IpfsRemotePublicationState.REJECTED]: 'peer-badge--failed',
    [IpfsRemotePublicationState.UNAVAILABLE]: 'peer-badge--failed',
    [IpfsRemotePublicationState.FAILED]: 'peer-badge--failed'
};

export const IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES = {
    [IpfsPublicationContentVerificationCoordinatorState.VERIFYING]: 'peer-badge--pending',
    [IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH]: 'peer-badge--authenticated',
    [IpfsPublicationContentVerificationCoordinatorState.HASH_MISMATCH]: 'peer-badge--failed',
    [IpfsPublicationContentVerificationCoordinatorState.UNAVAILABLE]: 'peer-badge--failed',
    [IpfsPublicationContentVerificationCoordinatorState.FAILED]: 'peer-badge--failed'
};
