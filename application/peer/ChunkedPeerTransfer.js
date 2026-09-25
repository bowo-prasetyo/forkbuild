import { createId } from '../../core/createId.js';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';

// Moves a text larger than one peer message (peer/PeerMessage.js's
// MAX_PEER_MESSAGE_BYTES) as numbered parts, for the protocols that carry
// content bytes (application/peer/PeerContentProtocol.js,
// application/snapshot/materialization/PeerSnapshotContentProtocol.js).
// Each protocol puts the part fields below into its own RESPONSE_PART
// message, next to the fields that name the content:
//
//     { transferId, index, count, totalLength, part }
//
// The sender splits the text so every part's JSON-escaped length fits
// MAX_PART_JSON_LENGTH, and waits while the connection's send buffer is
// full, so a large transfer never overflows the data channel. The receiver
// collects parts per (connection, transferId) with PartAssembler, which
// bounds what a peer can make it hold: MAX_TRANSFER_LENGTH per transfer,
// MAX_CONCURRENT_TRANSFERS at once, and transfers idle for
// IDLE_TIMEOUT_MS are dropped. Parts may arrive in any order. Whether the
// joined text is the content that was asked for is the protocol's own
// check (a content hash), exactly as for a single RESPONSE.
//
// Lengths are in UTF-16 code units, like the rest of the peer layer.

// A part's JSON-escaped text; the rest of the 64 KiB message is left for
// the envelope and the protocol's own fields.
export const MAX_PART_JSON_LENGTH = 60 * 1024;
export const MAX_TRANSFER_LENGTH = 64 * 1024 * 1024;
// Enough for MAX_TRANSFER_LENGTH even when escaping shrinks every part
// to a sixth of its budget.
export const MAX_PARTS = 8192;
export const MAX_CONCURRENT_TRANSFERS = 2;
export const IDLE_TIMEOUT_MS = 30000;
// The sender pauses while more than this is waiting in the send buffer.
export const SEND_BUFFER_HIGH_WATER_MARK = 1024 * 1024;
const SEND_BUFFER_POLL_MS = 10;
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Splits text into parts whose JSON.stringify() length is at most
// maxJsonLength, never between the two halves of a surrogate pair.
export function splitIntoParts(text, maxJsonLength = MAX_PART_JSON_LENGTH) {
    const parts = [];
    let start = 0;
    while (start < text.length) {
        // JSON escaping adds at least the two quotes, so no part is longer.
        let end = Math.min(text.length, start + maxJsonLength - 2);
        let encodedLength = JSON.stringify(text.slice(start, end)).length;
        while (encodedLength > maxJsonLength) {
            const shrunk = Math.floor((end - start) * (maxJsonLength / encodedLength) * 0.98);
            end = start + Math.max(1, Math.min(end - start - 1, shrunk));
            encodedLength = JSON.stringify(text.slice(start, end)).length;
        }
        if (end < text.length && end - start > 1 && isHighSurrogate(text.charCodeAt(end - 1))) {
            end -= 1;
        }
        parts.push(text.slice(start, end));
        start = end;
    }
    return parts;
}

export function createTransferId() {
    return createId().replace(/[^A-Za-z0-9_-]/g, '');
}

// Structural check of the part fields in a received message.
export function isValidTransferPart(value) {
    return Boolean(value)
        && typeof value.transferId === 'string' && TRANSFER_ID_PATTERN.test(value.transferId)
        && Number.isInteger(value.count) && value.count >= 1 && value.count <= MAX_PARTS
        && Number.isInteger(value.index) && value.index >= 0 && value.index < value.count
        && Number.isInteger(value.totalLength) && value.totalLength >= 1 && value.totalLength <= MAX_TRANSFER_LENGTH
        && typeof value.part === 'string' && value.part.length > 0 && value.part.length <= MAX_PART_JSON_LENGTH
        && value.part.length <= value.totalLength;
}

// Sends `text` as parts: buildMessage({ transferId, index, count,
// totalLength, part }) makes each protocol message. Resolves true once
// every part is handed to the connection, false if the peer went away or a
// send failed part-way; never throws.
export async function sendInParts(bus, connectedPeer, protocol, text, buildMessage) {
    if (text.length > MAX_TRANSFER_LENGTH) {
        return false;
    }
    const parts = splitIntoParts(text);
    if (parts.length > MAX_PARTS) {
        return false;
    }
    const transferId = createTransferId();
    for (let index = 0; index < parts.length; index++) {
        const ready = await waitForSendBuffer(connectedPeer);
        if (!ready) {
            return false;
        }
        try {
            bus.send(connectedPeer, protocol, buildMessage({
                transferId, index, count: parts.length, totalLength: text.length, part: parts[index]
            }));
        } catch {
            return false;
        }
    }
    return true;
}

async function waitForSendBuffer(connectedPeer) {
    for (;;) {
        if (connectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            return false;
        }
        const buffered = connectedPeer.connection && Number(connectedPeer.connection.bufferedAmount);
        if (!(buffered > SEND_BUFFER_HIGH_WATER_MARK)) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, SEND_BUFFER_POLL_MS));
    }
}

// Collects the parts of transfers from peers. accept() returns one of
//   { status: 'progress', receivedLength, totalLength }
//   { status: 'complete', text }
//   { status: 'rejected' }   (malformed, inconsistent, or over a limit;
//                             the transfer, if any, is dropped)
export class PartAssembler {
    constructor({
        maxTransferLength = MAX_TRANSFER_LENGTH,
        maxConcurrentTransfers = MAX_CONCURRENT_TRANSFERS,
        idleTimeoutMs = IDLE_TIMEOUT_MS,
        now = () => Date.now()
    } = {}) {
        this._maxTransferLength = maxTransferLength;
        this._maxConcurrent = maxConcurrentTransfers;
        this._idleTimeoutMs = idleTimeoutMs;
        this._now = now;
        this._transfers = new Map();
    }

    get activeTransferCount() {
        return this._transfers.size;
    }

    // `senderKey` names the sender (e.g. its connection id), so two peers'
    // transfer ids never collide.
    accept(senderKey, message) {
        this._dropIdle();
        if (!isValidTransferPart(message) || message.totalLength > this._maxTransferLength) {
            return { status: 'rejected' };
        }
        const key = `${senderKey}|${message.transferId}`;
        let transfer = this._transfers.get(key);
        if (!transfer) {
            if (this._transfers.size >= this._maxConcurrent) {
                return { status: 'rejected' };
            }
            transfer = { count: message.count, totalLength: message.totalLength, parts: new Array(message.count), receivedParts: 0, receivedLength: 0, lastSeen: 0 };
            this._transfers.set(key, transfer);
        }
        if (transfer.count !== message.count || transfer.totalLength !== message.totalLength) {
            this._transfers.delete(key);
            return { status: 'rejected' };
        }
        transfer.lastSeen = this._now();
        if (transfer.parts[message.index] === undefined) {
            if (transfer.receivedLength + message.part.length > transfer.totalLength) {
                this._transfers.delete(key);
                return { status: 'rejected' };
            }
            transfer.parts[message.index] = message.part;
            transfer.receivedParts += 1;
            transfer.receivedLength += message.part.length;
        }
        if (transfer.receivedParts < transfer.count) {
            return { status: 'progress', receivedLength: transfer.receivedLength, totalLength: transfer.totalLength };
        }
        this._transfers.delete(key);
        if (transfer.receivedLength !== transfer.totalLength) {
            return { status: 'rejected' };
        }
        return { status: 'complete', text: transfer.parts.join('') };
    }

    clear() {
        this._transfers.clear();
    }

    _dropIdle() {
        const now = this._now();
        for (const [key, transfer] of this._transfers) {
            if (now - transfer.lastSeen > this._idleTimeoutMs) {
                this._transfers.delete(key);
            }
        }
    }
}

// Remembers what this side asked for, so parts are accepted only for a
// request still waiting: nobody can make a peer hold data it never
// requested.
export class OutstandingRequests {
    constructor({ ttlMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
        this._ttlMs = ttlMs;
        this._now = now;
        this._expiries = new Map();
    }

    add(key) {
        this._expiries.set(key, this._now() + this._ttlMs);
    }

    has(key) {
        const expiry = this._expiries.get(key);
        if (expiry === undefined) {
            return false;
        }
        if (expiry < this._now()) {
            this._expiries.delete(key);
            return false;
        }
        return true;
    }

    delete(key) {
        this._expiries.delete(key);
    }
}

function isHighSurrogate(code) {
    return code >= 0xd800 && code <= 0xdbff;
}
