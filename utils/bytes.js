// Byte helpers for the Bitcoin and Base transaction codecs. They do not
// validate their input; callers check hex shape first. identity/Ed25519.js
// keeps its own stricter versions, which throw on malformed hex.

export function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

export function concatBytes(arrays) {
    const total = arrays.reduce((sum, array) => sum + array.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const array of arrays) {
        result.set(array, offset);
        offset += array.length;
    }
    return result;
}

// Bitcoin displays transaction ids byte-reversed from their wire order.
export function reverseBytes(bytes) {
    return Uint8Array.from(bytes).reverse();
}
