import { bytesToHex as hex, createGrapheneBinary } from './GrapheneBinary.js';

// Steem's binary serialization (fc::raw::pack), as far as ForkBuild needs it
// to check a block offline: transactions and every operation a current
// Steem block carries, the signed block header, transaction ids, the
// transaction Merkle root and the block id. The operation layouts follow
// steemit/steem's protocol headers, as dsteem (which signs real Steem
// transactions) serializes them; the encoding they share with Blurt is
// core/GrapheneBinary.js. Anything this file can't serialize (an operation
// it doesn't know, an asset or key it can't read) throws
// SteemSerializationError, never guesses.

export class SteemSerializationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SteemSerializationError';
    }
}

const binary = createGrapheneBinary({
    chainName: 'Steem',
    publicKeyPrefix: 'STM',
    SerializationError: SteemSerializationError,
    // A block header extension: void, a witness's running version, or its
    // hardfork vote.
    headerExtensions: ({ object, time, version }) => ({
        0: () => {},
        1: version,
        2: object([['hf_version', version], ['hf_time', time]])
    }),
    defineOperations
});

// name → [id, fields], from steemit/steem's operations.hpp.
function defineOperations({
    string, uint16, uint32, int16, int64, bool, time, array, noExtensions, flatMap, optional,
    binary, publicKey, asset, object, staticVariant, authority, price, beneficiary, signedBlockHeader
}) {
    const chainProperties = object([['account_creation_fee', asset], ['maximum_block_size', uint32], ['sbd_interest_rate', uint16]]);
    return {
        vote: [0, [['voter', string], ['author', string], ['permlink', string], ['weight', int16]]],
        comment: [1, [['parent_author', string], ['parent_permlink', string], ['author', string], ['permlink', string], ['title', string], ['body', string], ['json_metadata', string]]],
        transfer: [2, [['from', string], ['to', string], ['amount', asset], ['memo', string]]],
        transfer_to_vesting: [3, [['from', string], ['to', string], ['amount', asset]]],
        withdraw_vesting: [4, [['account', string], ['vesting_shares', asset]]],
        limit_order_create: [5, [['owner', string], ['orderid', uint32], ['amount_to_sell', asset], ['min_to_receive', asset], ['fill_or_kill', bool], ['expiration', time]]],
        limit_order_cancel: [6, [['owner', string], ['orderid', uint32]]],
        feed_publish: [7, [['publisher', string], ['exchange_rate', price]]],
        convert: [8, [['owner', string], ['requestid', uint32], ['amount', asset]]],
        account_create: [9, [['fee', asset], ['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string]]],
        account_update: [10, [['account', string], ['owner', optional(authority)], ['active', optional(authority)], ['posting', optional(authority)], ['memo_key', publicKey], ['json_metadata', string]]],
        witness_update: [11, [['owner', string], ['url', string], ['block_signing_key', publicKey], ['props', chainProperties], ['fee', asset]]],
        account_witness_vote: [12, [['account', string], ['witness', string], ['approve', bool]]],
        account_witness_proxy: [13, [['account', string], ['proxy', string]]],
        custom: [15, [['required_auths', array(string)], ['id', uint16], ['data', binary]]],
        report_over_production: [16, [['reporter', string], ['first_block', signedBlockHeader], ['second_block', signedBlockHeader]]],
        delete_comment: [17, [['author', string], ['permlink', string]]],
        custom_json: [18, [['required_auths', array(string)], ['required_posting_auths', array(string)], ['id', string], ['json', string]]],
        comment_options: [19, [['author', string], ['permlink', string], ['max_accepted_payout', asset], ['percent_steem_dollars', uint16], ['allow_votes', bool], ['allow_curation_rewards', bool], ['extensions', array(staticVariant({ 0: object([['beneficiaries', array(beneficiary)]]) }))]]],
        set_withdraw_vesting_route: [20, [['from_account', string], ['to_account', string], ['percent', uint16], ['auto_vest', bool]]],
        limit_order_create2: [21, [['owner', string], ['orderid', uint32], ['amount_to_sell', asset], ['fill_or_kill', bool], ['exchange_rate', price], ['expiration', time]]],
        claim_account: [22, [['creator', string], ['fee', asset], ['extensions', noExtensions]]],
        create_claimed_account: [23, [['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string], ['extensions', noExtensions]]],
        request_account_recovery: [24, [['recovery_account', string], ['account_to_recover', string], ['new_owner_authority', authority], ['extensions', noExtensions]]],
        recover_account: [25, [['account_to_recover', string], ['new_owner_authority', authority], ['recent_owner_authority', authority], ['extensions', noExtensions]]],
        change_recovery_account: [26, [['account_to_recover', string], ['new_recovery_account', string], ['extensions', noExtensions]]],
        escrow_transfer: [27, [['from', string], ['to', string], ['agent', string], ['escrow_id', uint32], ['sbd_amount', asset], ['steem_amount', asset], ['fee', asset], ['ratification_deadline', time], ['escrow_expiration', time], ['json_meta', string]]],
        escrow_dispute: [28, [['from', string], ['to', string], ['agent', string], ['who', string], ['escrow_id', uint32]]],
        escrow_release: [29, [['from', string], ['to', string], ['agent', string], ['who', string], ['receiver', string], ['escrow_id', uint32], ['sbd_amount', asset], ['steem_amount', asset]]],
        escrow_approve: [31, [['from', string], ['to', string], ['agent', string], ['who', string], ['escrow_id', uint32], ['approve', bool]]],
        transfer_to_savings: [32, [['from', string], ['to', string], ['amount', asset], ['memo', string]]],
        transfer_from_savings: [33, [['from', string], ['request_id', uint32], ['to', string], ['amount', asset], ['memo', string]]],
        cancel_transfer_from_savings: [34, [['from', string], ['request_id', uint32]]],
        custom_binary: [35, [['required_owner_auths', array(string)], ['required_active_auths', array(string)], ['required_posting_auths', array(string)], ['required_auths', array(authority)], ['id', string], ['data', binary]]],
        decline_voting_rights: [36, [['account', string], ['decline', bool]]],
        reset_account: [37, [['reset_account', string], ['account_to_reset', string], ['new_owner_authority', authority]]],
        set_reset_account: [38, [['account', string], ['current_reset_account', string], ['reset_account', string]]],
        claim_reward_balance: [39, [['account', string], ['reward_steem', asset], ['reward_sbd', asset], ['reward_vests', asset]]],
        delegate_vesting_shares: [40, [['delegator', string], ['delegatee', string], ['vesting_shares', asset]]],
        account_create_with_delegation: [41, [['fee', asset], ['delegation', asset], ['creator', string], ['new_account_name', string], ['owner', authority], ['active', authority], ['posting', authority], ['memo_key', publicKey], ['json_metadata', string], ['extensions', noExtensions]]],
        witness_set_properties: [42, [['owner', string], ['props', flatMap(string, binary)], ['extensions', noExtensions]]],
        account_update2: [43, [['account', string], ['owner', optional(authority)], ['active', optional(authority)], ['posting', optional(authority)], ['memo_key', optional(publicKey)], ['json_metadata', string], ['posting_json_metadata', string], ['extensions', noExtensions]]],
        create_proposal: [44, [['creator', string], ['receiver', string], ['start_date', time], ['end_date', time], ['daily_pay', asset], ['subject', string], ['permlink', string], ['extensions', noExtensions]]],
        update_proposal_votes: [45, [['voter', string], ['proposal_ids', array(int64)], ['approve', bool], ['extensions', noExtensions]]],
        remove_proposal: [46, [['proposal_owner', string], ['proposal_ids', array(int64)], ['extensions', noExtensions]]]
    };
}

export const hexToBytes = binary.hexToBytes;
export const bytesToHex = hex;
// "STM…": the 33-byte compressed key and the first 4 bytes of its RIPEMD-160.
export const steemPublicKeyString = binary.publicKeyString;
export const steemPublicKeyBytes = binary.publicKeyBytes;
// Steem times are UTC without a zone ("2026-09-26T10:00:00").
export const steemTimeSeconds = binary.timeSeconds;

// --- What a block check needs -------------------------------------------

export const packSteemTransaction = binary.packTransaction;
export const packSteemSignedTransaction = binary.packSignedTransaction;
export const packSteemBlockHeader = binary.packBlockHeader;
export const packSteemSignedBlockHeader = binary.packSignedBlockHeader;
export const steemTransactionId = binary.transactionId;
export const steemTransactionMerkleDigest = binary.transactionMerkleDigest;
export const steemBlockHeaderDigest = binary.blockHeaderDigest;
export const steemBlockId = binary.blockId;
export const steemMerkleTree = binary.merkleTree;
export const steemMerkleRootFromPath = binary.merkleRootFromPath;
