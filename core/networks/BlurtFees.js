import { packBlurtSignedTransaction } from './BlurtBinary.js';

// Blurt's transaction fee (docs/Protocol.md, "Proposed: Blurt Substrate",
// "Fees"), as `process_tx_fee()` in Blurt's database.cpp charges it: a flat
// fee per operation plus a fee per KiB of the packed signed transaction,
// each at least 0.001 BLURT. Amounts here are in thousandths of a BLURT,
// the asset's smallest unit.

const AMOUNT_PATTERN = /^(\d+)\.(\d{3}) BLURT$/;
// Stand-ins for the fields a wallet fills when it signs; they pack to the
// same size whatever their values.
const SIZING_TRANSACTION = Object.freeze({ ref_block_num: 0, ref_block_prefix: 0, expiration: '2026-01-01T00:00:00', extensions: [] });
const SIGNATURE = '00'.repeat(65);

// "1.234 BLURT" → 1234, or null for anything else.
export function parseBlurtAmount(text) {
    const match = typeof text === 'string' ? AMOUNT_PATTERN.exec(text.trim()) : null;
    return match ? Number(match[1]) * 1000 + Number(match[2]) : null;
}

export function formatBlurtAmount(thousandths) {
    const whole = Math.floor(thousandths / 1000);
    return `${whole}.${String(thousandths % 1000).padStart(3, '0')} BLURT`;
}

// The packed size of a transaction of `operations` with one signature,
// which is what a single-key wallet such as Blurt Keychain broadcasts.
export function blurtSignedTransactionSize(operations) {
    return packBlurtSignedTransaction({ ...SIZING_TRANSACTION, operations, signatures: [SIGNATURE] }).length;
}

// `{ operationFlatFee, bandwidthKbytesFee }` in thousandths of a BLURT, from
// condenser_api.get_chain_properties, or null when it doesn't say.
export function blurtFeeSchedule(chainProperties) {
    const operationFlatFee = parseBlurtAmount(chainProperties?.operation_flat_fee);
    const bandwidthKbytesFee = parseBlurtAmount(chainProperties?.bandwidth_kbytes_fee);
    return operationFlatFee === null || bandwidthKbytesFee === null ? null : Object.freeze({ operationFlatFee, bandwidthKbytesFee });
}

// The fee for one transaction of `operations`, in thousandths of a BLURT.
export function blurtTransactionFee(operations, { operationFlatFee, bandwidthKbytesFee }) {
    const flat = Math.max(operationFlatFee * operations.length, 1);
    const bandwidth = Math.max(Math.floor((blurtSignedTransactionSize(operations) * bandwidthKbytesFee) / 1024), 1);
    return flat + bandwidth;
}
