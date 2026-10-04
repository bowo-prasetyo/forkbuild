import { bytesToHex as hex, createGrapheneBinary } from './GrapheneBinary.js';

// Blurt's binary serialization (fc::raw::pack), as far as ForkBuild needs it
// to check a block offline and to size a transaction for its fee
// (docs/Protocol.md, "Proposed: Blurt Substrate", "Keeping evidence" and
// "Fees"). The encoding is Steem's (core/GrapheneBinary.js); what differs is
// the operation list, renumbered when Blurt left out Steem's market, SBD and
// feed operations, the `BLT` key prefix, and the `fee_info` block header
// extension. Layouts follow blurt/blurt's protocol headers, where the
// reflection order is the serialized order. Anything this file can't
// serialize throws BlurtSerializationError, never guesses.

export class BlurtSerializationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BlurtSerializationError';
    }
}

const binary = createGrapheneBinary({
    chainName: 'Blurt',
    publicKeyPrefix: 'BLT',
    SerializationError: BlurtSerializationError,
    // void, a witness's running version, its hardfork vote, or the fees the
    // block was produced under.
    headerExtensions: ({ object, time, version, int64 }) => ({
        0: () => {},
        1: version,
        2: object([['hf_version', version], ['hf_time', time]]),
        3: object([['operation_flat_fee', int64], ['bandwidth_kbytes_fee', int64]])
    }),
    defineOperations
});

// name → [id, fields], from blurt/blurt's operations.hpp.
function defineOperations({
    string, uint16, uint32, int16, int64, bool, time, array, noExtensions, flatMap, optional,
    binary: bytes, publicKey, asset, object, staticVariant, authority, beneficiary
}) {
    const chainProperties = object([['account_creation_fee', asset], ['maximum_block_size', uint32]]);
    const commentOptionsExtension = staticVariant({
        0: object([['beneficiaries', array(beneficiary)]]),
        1: object([['percent_blurt', uint16]])
    });
    return {
        vote: [0, [['voter', string], ['author', string], ['permlink', string], ['weight', int16]]],
        comment: [1, [['parent_author', string], ['parent_permlink', string], ['author', string], ['permlink', string], ['title', string], ['body', string], ['json_metadata', string]]],
        transfer: [2, [['from', string], ['to', string], ['amount', asset], ['memo', string]]],
        transfer_to_vesting: [3, [['from', string], ['to', string], ['amount', asset]]],
        withdraw_vesting: [4, [['account', string], ['vesting_shares', asset]]],
        account_create: [5, [['fee', asset], ['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string]]],
        account_update: [6, [['account', string], ['owner', optional(authority)], ['active', optional(authority)], ['posting', optional(authority)], ['memo_key', optional(publicKey)], ['json_metadata', string], ['posting_json_metadata', string], ['extensions', noExtensions]]],
        witness_update: [7, [['owner', string], ['url', string], ['block_signing_key', publicKey], ['props', chainProperties], ['fee', asset]]],
        account_witness_vote: [8, [['account', string], ['witness', string], ['approve', bool]]],
        account_witness_proxy: [9, [['account', string], ['proxy', string]]],
        custom: [10, [['required_auths', array(string)], ['id', uint16], ['data', bytes]]],
        delete_comment: [11, [['author', string], ['permlink', string]]],
        custom_json: [12, [['required_auths', array(string)], ['required_posting_auths', array(string)], ['id', string], ['json', string]]],
        comment_options: [13, [['author', string], ['permlink', string], ['max_accepted_payout', asset], ['allow_votes', bool], ['allow_curation_rewards', bool], ['extensions', array(commentOptionsExtension)]]],
        set_withdraw_vesting_route: [14, [['from_account', string], ['to_account', string], ['percent', uint16], ['auto_vest', bool]]],
        claim_account: [15, [['creator', string], ['fee', asset], ['extensions', noExtensions]]],
        create_claimed_account: [16, [['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string], ['extensions', noExtensions]]],
        request_account_recovery: [17, [['recovery_account', string], ['account_to_recover', string], ['new_owner_authority', authority], ['extensions', noExtensions]]],
        recover_account: [18, [['account_to_recover', string], ['new_owner_authority', authority], ['recent_owner_authority', authority], ['extensions', noExtensions]]],
        change_recovery_account: [19, [['account_to_recover', string], ['new_recovery_account', string], ['extensions', noExtensions]]],
        escrow_transfer: [20, [['from', string], ['to', string], ['blurt_amount', asset], ['escrow_id', uint32], ['agent', string], ['fee', asset], ['json_meta', string], ['ratification_deadline', time], ['escrow_expiration', time]]],
        escrow_dispute: [21, [['from', string], ['to', string], ['agent', string], ['who', string], ['escrow_id', uint32]]],
        escrow_release: [22, [['from', string], ['to', string], ['agent', string], ['who', string], ['receiver', string], ['escrow_id', uint32], ['blurt_amount', asset]]],
        escrow_approve: [23, [['from', string], ['to', string], ['agent', string], ['who', string], ['escrow_id', uint32], ['approve', bool]]],
        transfer_to_savings: [24, [['from', string], ['to', string], ['amount', asset], ['memo', string]]],
        transfer_from_savings: [25, [['from', string], ['request_id', uint32], ['to', string], ['amount', asset], ['memo', string]]],
        cancel_transfer_from_savings: [26, [['from', string], ['request_id', uint32]]],
        custom_binary: [27, [['required_owner_auths', array(string)], ['required_active_auths', array(string)], ['required_posting_auths', array(string)], ['required_auths', array(authority)], ['id', string], ['data', bytes]]],
        decline_voting_rights: [28, [['account', string], ['decline', bool]]],
        reset_account: [29, [['reset_account', string], ['account_to_reset', string], ['new_owner_authority', authority]]],
        set_reset_account: [30, [['account', string], ['current_reset_account', string], ['reset_account', string]]],
        claim_reward_balance: [31, [['account', string], ['reward_blurt', asset], ['reward_vests', asset]]],
        delegate_vesting_shares: [32, [['delegator', string], ['delegatee', string], ['vesting_shares', asset]]],
        witness_set_properties: [33, [['owner', string], ['props', flatMap(string, bytes)], ['extensions', noExtensions]]],
        create_proposal: [34, [['creator', string], ['receiver', string], ['start_date', time], ['end_date', time], ['daily_pay', asset], ['subject', string], ['permlink', string], ['extensions', noExtensions]]],
        update_proposal_votes: [35, [['voter', string], ['proposal_ids', array(int64)], ['approve', bool], ['extensions', noExtensions]]],
        remove_proposal: [36, [['proposal_owner', string], ['proposal_ids', array(int64)], ['extensions', noExtensions]]]
    };
}

export const hexToBytes = binary.hexToBytes;
export const bytesToHex = hex;
// "BLT…": the 33-byte compressed key and the first 4 bytes of its RIPEMD-160.
export const blurtPublicKeyString = binary.publicKeyString;
export const blurtPublicKeyBytes = binary.publicKeyBytes;
export const blurtTimeSeconds = binary.timeSeconds;

export const packBlurtTransaction = binary.packTransaction;
export const packBlurtSignedTransaction = binary.packSignedTransaction;
export const packBlurtBlockHeader = binary.packBlockHeader;
export const packBlurtSignedBlockHeader = binary.packSignedBlockHeader;
export const blurtTransactionId = binary.transactionId;
export const blurtTransactionMerkleDigest = binary.transactionMerkleDigest;
export const blurtBlockHeaderDigest = binary.blockHeaderDigest;
export const blurtBlockId = binary.blockId;
export const blurtMerkleTree = binary.merkleTree;
export const blurtMerkleRootFromPath = binary.merkleRootFromPath;
