// A QR Code encoder (ISO/IEC 18004), enough to show a link as a code a
// phone camera can read: byte mode, one error correction level, versions
// 1 to 40, and the mask with the lowest penalty. It returns the modules
// only; drawing them is the caller's (ui/components/QrCodeImage.js).
//
// After Project Nayuki's "QR Code generator library" (MIT), reduced to the
// one segment mode the app needs.

export const QrErrorCorrection = Object.freeze({ LOW: 'L', MEDIUM: 'M', QUARTILE: 'Q', HIGH: 'H' });

const ECC_INDEX = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// Indexed [level][version]; index 0 is unused.
const ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];
const NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// { version, size, mask, modules } for `text` (UTF-8): modules[y][x] is
// true for a dark module. `mask` (0-7) forces a mask pattern instead of
// the one with the lowest penalty. Throws when the text is too long for
// any version.
export function encodeQrCode(text, { errorCorrection = QrErrorCorrection.MEDIUM, mask = null } = {}) {
    if (typeof text !== 'string') {
        throw new TypeError('encodeQrCode: text must be a string');
    }
    if (!(errorCorrection in ECC_INDEX)) {
        throw new Error(`encodeQrCode: unknown error correction level ${errorCorrection}`);
    }
    const data = new TextEncoder().encode(text);
    let version = MIN_VERSION;
    for (; ; version++) {
        if (version > MAX_VERSION) {
            throw new Error('encodeQrCode: the text is too long for a QR code');
        }
        const countBits = version <= 9 ? 8 : 16;
        if (data.length < (1 << countBits) && 4 + countBits + data.length * 8 <= numDataCodewords(version, errorCorrection) * 8) {
            break;
        }
    }

    const capacityBits = numDataCodewords(version, errorCorrection) * 8;
    const bits = [];
    appendBits(bits, 0b0100, 4);
    appendBits(bits, data.length, version <= 9 ? 8 : 16);
    for (const byte of data) {
        appendBits(bits, byte, 8);
    }
    appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
    appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
        appendBits(bits, pad, 8);
    }
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
        codewords.push(byte);
    }

    const symbol = new QrSymbol(version, errorCorrection);
    symbol.drawCodewords(addEccAndInterleave(codewords, version, errorCorrection));
    if (Number.isInteger(mask) && mask >= 0 && mask < 8) {
        symbol.applyMask(mask);
    } else {
        symbol.applyBestMask();
    }
    return { version, size: symbol.size, mask: symbol.mask, modules: symbol.modules };
}

class QrSymbol {
    constructor(version, errorCorrection) {
        this.version = version;
        this.errorCorrection = errorCorrection;
        this.size = version * 4 + 17;
        this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
        this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
        this._drawFunctionPatterns();
    }

    _set(x, y, dark) {
        this.modules[y][x] = dark;
        this.isFunction[y][x] = true;
    }

    _drawFunctionPatterns() {
        const size = this.size;
        for (let i = 0; i < size; i++) {
            this._set(6, i, i % 2 === 0);
            this._set(i, 6, i % 2 === 0);
        }
        this._drawFinder(3, 3);
        this._drawFinder(size - 4, 3);
        this._drawFinder(3, size - 4);
        const positions = alignmentPatternPositions(this.version);
        const last = positions.length - 1;
        for (let i = 0; i < positions.length; i++) {
            for (let j = 0; j < positions.length; j++) {
                const nearFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
                if (!nearFinder) this._drawAlignment(positions[i], positions[j]);
            }
        }
        this._drawFormatBits(0);
        this._drawVersion();
    }

    _drawFinder(cx, cy) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                this._set(x, y, distance !== 2 && distance !== 4);
            }
        }
    }

    _drawAlignment(cx, cy) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                this._set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }
    }

    _drawFormatBits(mask) {
        const data = (FORMAT_BITS[this.errorCorrection] << 3) | mask;
        let remainder = data;
        for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
        const bits = ((data << 10) | remainder) ^ 0x5412;
        const bit = (i) => ((bits >>> i) & 1) !== 0;
        const size = this.size;
        for (let i = 0; i <= 5; i++) this._set(8, i, bit(i));
        this._set(8, 7, bit(6));
        this._set(8, 8, bit(7));
        this._set(7, 8, bit(8));
        for (let i = 9; i < 15; i++) this._set(14 - i, 8, bit(i));
        for (let i = 0; i < 8; i++) this._set(size - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i++) this._set(8, size - 15 + i, bit(i));
        this._set(8, size - 8, true);
    }

    _drawVersion() {
        if (this.version < 7) return;
        let remainder = this.version;
        for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
        const bits = (this.version << 12) | remainder;
        for (let i = 0; i < 18; i++) {
            const dark = ((bits >>> i) & 1) !== 0;
            const a = this.size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            this._set(a, b, dark);
            this._set(b, a, dark);
        }
    }

    drawCodewords(codewords) {
        let i = 0;
        const totalBits = codewords.length * 8;
        for (let right = this.size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            const upward = ((right + 1) & 2) === 0;
            for (let vertical = 0; vertical < this.size; vertical++) {
                const y = upward ? this.size - 1 - vertical : vertical;
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    if (!this.isFunction[y][x] && i < totalBits) {
                        this.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
                        i++;
                    }
                }
            }
        }
    }

    _applyMask(mask) {
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (!this.isFunction[y][x] && maskInverts(mask, x, y)) {
                    this.modules[y][x] = !this.modules[y][x];
                }
            }
        }
    }

    applyBestMask() {
        let best = 0;
        let bestPenalty = Infinity;
        for (let mask = 0; mask < 8; mask++) {
            this._applyMask(mask);
            this._drawFormatBits(mask);
            const penalty = penaltyScore(this.modules);
            if (penalty < bestPenalty) {
                best = mask;
                bestPenalty = penalty;
            }
            this._applyMask(mask); // XOR again undoes it
        }
        this.applyMask(best);
    }

    applyMask(mask) {
        this._applyMask(mask);
        this._drawFormatBits(mask);
        this.mask = mask;
    }
}

function maskInverts(mask, x, y) {
    switch (mask) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
        case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
        default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
}

// The four penalty rules of ISO/IEC 18004 section 7.8.3.
function penaltyScore(modules) {
    const size = modules.length;
    let penalty = 0;
    const lines = [];
    for (let i = 0; i < size; i++) {
        lines.push(modules[i]);
        lines.push(modules.map((row) => row[i]));
    }
    const finderLike = [true, false, true, true, true, false, true];
    for (const line of lines) {
        let run = 1;
        for (let i = 1; i <= size; i++) {
            if (i < size && line[i] === line[i - 1]) {
                run++;
            } else {
                if (run >= 5) penalty += 3 + (run - 5);
                run = 1;
            }
        }
        for (let i = 0; i + 7 <= size; i++) {
            if (!finderLike.every((dark, k) => line[i + k] === dark)) continue;
            const lightBefore = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k]);
            const lightAfter = i + 11 <= size && [7, 8, 9, 10].every((k) => !line[i + k]);
            if (lightBefore) penalty += 40;
            if (lightAfter) penalty += 40;
        }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (modules[y][x]) dark++;
            if (x + 1 < size && y + 1 < size) {
                const color = modules[y][x];
                if (modules[y][x + 1] === color && modules[y + 1][x] === color && modules[y + 1][x + 1] === color) {
                    penalty += 3;
                }
            }
        }
    }
    const total = size * size;
    penalty += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return penalty;
}

function alignmentPatternPositions(version) {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const positions = [6];
    for (let position = version * 4 + 10; positions.length < count; position -= step) {
        positions.splice(1, 0, position);
    }
    return positions;
}

function numRawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const alignments = Math.floor(version / 7) + 2;
        result -= (25 * alignments - 10) * alignments - 55;
        if (version >= 7) result -= 36;
    }
    return result;
}

function numDataCodewords(version, errorCorrection) {
    const level = ECC_INDEX[errorCorrection];
    return Math.floor(numRawDataModules(version) / 8)
        - ECC_CODEWORDS_PER_BLOCK[level][version] * NUM_ERROR_CORRECTION_BLOCKS[level][version];
}

function addEccAndInterleave(data, version, errorCorrection) {
    const level = ECC_INDEX[errorCorrection];
    const blockCount = NUM_ERROR_CORRECTION_BLOCKS[level][version];
    const eccLength = ECC_CODEWORDS_PER_BLOCK[level][version];
    const rawCodewords = Math.floor(numRawDataModules(version) / 8);
    const shortBlockCount = blockCount - (rawCodewords % blockCount);
    const shortBlockLength = Math.floor(rawCodewords / blockCount);
    const divisor = reedSolomonDivisor(eccLength);
    const blocks = [];
    for (let i = 0, k = 0; i < blockCount; i++) {
        const block = data.slice(k, k + shortBlockLength - eccLength + (i < shortBlockCount ? 0 : 1));
        k += block.length;
        const ecc = reedSolomonRemainder(block, divisor);
        if (i < shortBlockCount) block.push(0);
        blocks.push(block.concat(ecc));
    }
    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
        for (let j = 0; j < blocks.length; j++) {
            if (i !== shortBlockLength - eccLength || j >= shortBlockCount) {
                result.push(blocks[j][i]);
            }
        }
    }
    return result;
}

function reedSolomonDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) {
            result[j] = gfMultiply(result[j], root);
            if (j + 1 < degree) result[j] ^= result[j + 1];
        }
        root = gfMultiply(root, 0x02);
    }
    return result;
}

function reedSolomonRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const byte of data) {
        const factor = byte ^ result.shift();
        result.push(0);
        for (let i = 0; i < divisor.length; i++) {
            result[i] ^= gfMultiply(divisor[i], factor);
        }
    }
    return result;
}

function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
}

function appendBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i--) {
        bits.push((value >>> i) & 1);
    }
}
