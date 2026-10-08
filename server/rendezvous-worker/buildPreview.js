// Link previews for builds shared in a link (GET /b/<payload>, and its
// picture at /b/<payload>/preview.png). A link that carries its build
// (`#/s/<payload>` in the app; docs/Protocol.md, "Link-only shares") shows
// nothing when pasted into a chat or a post, because the build sits in the
// address's fragment, which never reaches a server. The app therefore shares
// this worker's /b/<payload> instead: link-preview crawlers get a page whose
// Open Graph tags name the build and show a picture of it, and people are
// sent straight on to the app at `#/s/<payload>`.
//
// The worker keeps nothing. A build's title and author are shown only when
// its signature checks out and the build matches the hash it signed, as the
// app checks before showing it; anything else gets a plain "A shared build"
// preview. The picture is drawn here, without a browser: each brick as flat-
// shaded boxes, wedges or pyramids seen from above at an angle, encoded as a
// PNG. Like worker.js, this file imports nothing from the app; BRICK_SHAPES
// mirrors core/library/CoreLibrary.js (tests/LinkPreview.test.js checks it).

const FORMAT_VERSION = '1';
const MAX_PAYLOAD_LENGTH = 16000;
const MAX_UNPACKED_BYTES = 4 * 1024 * 1024;
// Past this many bricks the picture is not drawn (the plain card is used),
// so one request's work stays bounded.
const MAX_DRAWN_BRICKS = 4000;
// The size link previews' large cards accept, kept small so drawing and
// encoding one stays within a few milliseconds of a worker's CPU time.
export const PREVIEW_WIDTH = 600;
export const PREVIEW_HEIGHT = 315;
export const DEFAULT_APP_URL = 'https://bowo-prasetyo.github.io/forkbuild/';

// Each core brick's size (width × height × depth), default color, and the
// shape drawn for it: a box, a wedge rising toward +x (core:slope_45, and the
// stair's outline), or a four-sided pyramid (core:roof_hip). Any other brick
// is drawn as a grey unit box.
export const BRICK_SHAPES = Object.freeze({
    'core:cube': [1, 1, 1, 0x4caf7d, 'box'],
    'core:slope_45': [1, 1, 1, 0xd08a3e, 'wedge'],
    'core:plate_2x4': [2, 0.25, 4, 0x5a8fd0, 'box'],
    'core:window_small': [1, 1, 0.25, 0x9ad0e6, 'box'],
    'core:block_2x2': [2, 2, 2, 0x7d7d7d, 'box'],
    'core:wall_1x3': [1, 3, 0.25, 0xc9b896, 'box'],
    'core:slab_4x4': [4, 0.25, 4, 0x9a9a9a, 'box'],
    'core:roof_hip': [2, 1.5, 2, 0xa63a3a, 'hip'],
    'core:stair': [1, 1, 1, 0xb0a48f, 'wedge'],
    'core:column': [0.5, 3, 0.5, 0xd8d2c0, 'box'],
    'core:beam': [4, 0.5, 0.5, 0x8b5a2b, 'box'],
    'core:arch': [2, 2, 0.5, 0xa89f8a, 'box'],
    'core:window_large': [2, 1.5, 0.25, 0x8cc8e0, 'box'],
    'core:door': [1, 2, 0.1, 0x6b4226, 'box'],
    'core:trim': [1, 0.25, 0.25, 0xe8e2d0, 'box'],
    'core:post': [0.25, 3, 0.25, 0x5a3a22, 'box'],
    'core:brace_2x2': [2, 2, 0.25, 0x5a3a22, 'box']
});
const UNKNOWN_SHAPE = [1, 1, 1, 0x9e9e9e, 'box'];

// ---------------------------------------------------------------- payload

// `{ claim, snapshotText }` from a link payload, or null for anything this
// version didn't write.
export async function decodeLinkPayload(payload) {
    if (typeof payload !== 'string' || payload.length > MAX_PAYLOAD_LENGTH || payload[0] !== FORMAT_VERSION) return null;
    const text = payload.slice(1);
    if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
    let packed;
    try {
        const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
        packed = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
        return null;
    }
    try {
        const bytes = await readAll(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')), MAX_UNPACKED_BYTES);
        const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!parsed || typeof parsed.claim !== 'object' || !parsed.claim || Array.isArray(parsed.claim) || typeof parsed.build !== 'string') return null;
        return { claim: parsed.claim, snapshotText: parsed.build };
    } catch {
        return null;
    }
}

// The build a payload carries, when its claim is a Publication signed by the
// identity it names (`verifySignature(descriptor, signature, signer)`, the
// worker's Ed25519 check) and the build matches the hash it signed:
// `{ title, author, bricks }`; otherwise null.
export async function checkSharedBuild(decoded, verifySignature) {
    const claim = decoded?.claim;
    if (!claim || typeof claim.id !== 'string' || !claim.signature || !claim.publisherIdentity) return null;
    const signer = claim.publisherIdentity.id;
    if (typeof signer !== 'string' || claim.signature.signer !== signer) return null;
    if (!(await verifySignature(publicationDescriptor(claim), claim.signature, signer))) return null;
    const hash = claim.contentReference?.hash ?? claim.contentHash;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || (await sha256Hex(decoded.snapshotText)) !== hash) return null;
    return {
        title: typeof claim.title === 'string' && claim.title.trim() ? claim.title.trim().slice(0, 120) : null,
        author: typeof claim.author === 'string' && claim.author.trim() ? claim.author.trim().slice(0, 60) : null,
        bricks: bricksOf(decoded.snapshotText)
    };
}

// Mirrors publisher/Publication.js#getSigningDescriptor(): the same fields,
// in the same order, as the claim's own JSON carries them.
function publicationDescriptor(claim) {
    return {
        type: 'publication',
        id: claim.id,
        revision: 1,
        payload: {
            id: claim.id,
            documentId: claim.documentId,
            title: claim.title,
            author: claim.author,
            providerId: claim.providerId,
            publishedAt: claim.publishedAt,
            url: claim.url,
            parentDocumentId: claim.parentDocumentId,
            snapshotId: claim.snapshotId,
            contentHash: claim.contentHash,
            schemaVersion: claim.schemaVersion,
            license: claim.license,
            contentReference: claim.contentReference,
            publisherIdentity: claim.publisherIdentity,
            ...(claim.placementPolicy ? { placementPolicy: claim.placementPolicy } : {})
        }
    };
}

// Every brick of every building in a published document, as
// { definitionId, x, y, z, rotation, color }: schema 2's brick tables
// (core/BrickTable.js) or schema 1's brick objects.
export function bricksOf(snapshotText) {
    let document;
    try {
        document = JSON.parse(snapshotText);
    } catch {
        return [];
    }
    const bricks = [];
    for (const building of Array.isArray(document?.world?.buildings) ? document.world.buildings : []) {
        const table = building?.brickTable;
        if (table && Array.isArray(table.values) && Array.isArray(table.definitions)) {
            const colors = Array.isArray(table.colors) ? table.colors : [];
            for (let i = 0; i + 5 < table.values.length; i += 6) {
                const v = table.values;
                bricks.push({ definitionId: table.definitions[v[i]], x: v[i + 1], y: v[i + 2], z: v[i + 3], rotation: v[i + 4], color: v[i + 5] ? colors[v[i + 5] - 1] : null });
            }
        } else if (Array.isArray(building?.bricks)) {
            for (const brick of building.bricks) {
                const p = brick?.position ?? {};
                bricks.push({ definitionId: brick?.definitionId, x: p.x, y: p.y, z: p.z, rotation: brick?.rotation ?? 0, color: brick?.color ?? null });
            }
        }
    }
    return bricks.filter((b) => [b.x, b.y, b.z].every(Number.isFinite));
}

// ---------------------------------------------------------------- picture

const SKY = [0x87, 0xce, 0xeb];
const SKY_BANDS = 8;
const GROUND = [0xb9, 0xd8, 0xa8];
// Seen from the front right, above: azimuth 45°, elevation 30°.
const VIEW = normalize([1, 0.75, 1.15]);
const RIGHT = normalize([VIEW[2], 0, -VIEW[0]]);
const UP = cross(VIEW, RIGHT);
const LIGHT = normalize([0.45, 1, 0.3]);

// A PNG of `bricks`, framed to fill the picture.
export async function renderPreviewPng(bricks, { width = PREVIEW_WIDTH, height = PREVIEW_HEIGHT } = {}) {
    const triangles = [];
    for (const brick of bricks.slice(0, MAX_DRAWN_BRICKS)) addBrick(triangles, brick);
    // One 0xRRGGBB per pixel. The sky lightens toward the horizon in a few
    // bands, so the picture keeps few enough colors for a small PNG.
    const pixels = new Uint32Array(width * height);
    for (let band = 0; band < SKY_BANDS; band++) {
        const [r, g, b] = SKY.map((c) => Math.round(c + (255 - c) * 0.35 * (band / SKY_BANDS)));
        const top = Math.ceil((band * height) / SKY_BANDS);
        const bottom = Math.ceil(((band + 1) * height) / SKY_BANDS);
        pixels.fill((r << 16) | (g << 8) | b, top * width, bottom * width);
    }
    if (triangles.length > 0) {
        const frame = framing(triangles, width, height);
        const depth = new Float32Array(width * height).fill(Infinity);
        const ground = groundTriangles(triangles);
        for (const triangle of [...ground, ...triangles]) fill(triangle, frame, pixels, depth, width, height);
    }
    return encodePng(pixels, width, height);
}

function addBrick(triangles, brick) {
    const shape = BRICK_SHAPES[brick.definitionId] ?? UNKNOWN_SHAPE;
    const [w, h, d, defaultColor, kind] = shape;
    const color = rgbOf(brick.color, defaultColor);
    const angle = (Number(brick.rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Three.js's rotation about +y, then the brick's position.
    const place = ([x, y, z]) => [brick.x + x * cos + z * sin, brick.y + y, brick.z - x * sin + z * cos];
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const faces = [];
    if (kind === 'wedge') {
        const a = [-hw, -hh, -hd], b = [hw, -hh, -hd], c = [hw, hh, -hd];
        const a2 = [-hw, -hh, hd], b2 = [hw, -hh, hd], c2 = [hw, hh, hd];
        faces.push([a, c, b], [a2, b2, c2], [a, a2, c2, c], [b, c, c2, b2], [a, b, b2, a2]);
    } else if (kind === 'hip') {
        const apex = [0, hh, 0];
        const p = [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]];
        for (let i = 0; i < 4; i++) faces.push([p[(i + 1) % 4], p[i], apex]);
        faces.push([p[0], p[1], p[2], p[3]]);
    } else {
        const v = (x, y, z) => [x * hw, y * hh, z * hd];
        faces.push(
            [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)],
            [v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)],
            [v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1)],
            [v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)],
            [v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)],
            [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)]
        );
    }
    for (const face of faces) {
        const points = face.map(place);
        const normal = normalize(cross(sub(points[1], points[0]), sub(points[2], points[0])));
        // Faces turned away from the viewer are never seen.
        if (dot(normal, VIEW) <= 0) continue;
        const light = 0.55 + 0.45 * Math.max(0, dot(normal, LIGHT));
        const shade = color.map((c) => Math.min(255, Math.round(c * light)));
        for (let i = 1; i + 1 < points.length; i++) triangles.push({ points: [points[0], points[i], points[i + 1]], color: shade });
    }
}

// A ground square under the build, a little larger than its footprint.
function groundTriangles(triangles) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    for (const { points } of triangles) {
        for (const [x, y, z] of points) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            minY = Math.min(minY, y);
        }
    }
    const margin = Math.max(maxX - minX, maxZ - minZ) * 0.25 + 1;
    const y = Math.min(0, minY) - 0.01;
    const a = [minX - margin, y, minZ - margin], b = [maxX + margin, y, minZ - margin];
    const c = [maxX + margin, y, maxZ + margin], e = [minX - margin, y, maxZ + margin];
    return [{ points: [a, e, c], color: GROUND }, { points: [a, c, b], color: GROUND }];
}

function framing(triangles, width, height) {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const { points } of triangles) {
        for (const p of points) {
            const u = dot(p, RIGHT);
            const v = dot(p, UP);
            minU = Math.min(minU, u); maxU = Math.max(maxU, u);
            minV = Math.min(minV, v); maxV = Math.max(maxV, v);
        }
    }
    const scale = Math.min((width * 0.8) / Math.max(maxU - minU, 0.001), (height * 0.8) / Math.max(maxV - minV, 0.001));
    return { scale, cu: (minU + maxU) / 2, cv: (minV + maxV) / 2 };
}

// Fills one triangle into `pixels`, nearest first by `depth`. Edge functions
// and the depth plane are stepped pixel by pixel, so the inner loop does no
// division (the picture is orthographic, so depth is linear on screen).
function fill({ points, color }, frame, pixels, depth, width, height) {
    const [p0, p1, p2] = points.map((p) => [
        width / 2 + (dot(p, RIGHT) - frame.cu) * frame.scale,
        height / 2 - (dot(p, UP) - frame.cv) * frame.scale,
        -dot(p, VIEW)
    ]);
    let area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(area) < 1e-9) return;
    // Wound one way on screen, so all three edge values are positive inside.
    const [a, b, c] = area > 0 ? [p0, p1, p2] : [p0, p2, p1];
    area = Math.abs(area);
    const rgb = (color[0] << 16) | (color[1] << 8) | color[2];
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    if (minX > maxX || minY > maxY) return;
    // edge(u, v)(x, y) = (v.x - u.x)(y - u.y) - (v.y - u.y)(x - u.x)
    const e0dx = -(c[1] - b[1]), e0dy = c[0] - b[0];
    const e1dx = -(a[1] - c[1]), e1dy = a[0] - c[0];
    const e2dx = -(b[1] - a[1]), e2dy = b[0] - a[0];
    const x0 = minX + 0.5, y0 = minY + 0.5;
    let e0row = e0dy * (y0 - b[1]) + e0dx * (x0 - b[0]);
    let e1row = e1dy * (y0 - c[1]) + e1dx * (x0 - c[0]);
    let e2row = e2dy * (y0 - a[1]) + e2dx * (x0 - a[0]);
    // z = (e0·a.z + e1·b.z + e2·c.z) / area, stepped the same way.
    const zdx = (e0dx * a[2] + e1dx * b[2] + e2dx * c[2]) / area;
    const zdy = (e0dy * a[2] + e1dy * b[2] + e2dy * c[2]) / area;
    let zrow = (e0row * a[2] + e1row * b[2] + e2row * c[2]) / area;
    const epsilon = 1e-6 * area;
    for (let y = minY; y <= maxY; y++) {
        // The row's span inside all three edges, solved from where each edge
        // value crosses zero, so no pixel outside the triangle is visited.
        const span = { from: minX, to: maxX };
        clip(span, minX, e0row, e0dx, epsilon);
        clip(span, minX, e1row, e1dx, epsilon);
        clip(span, minX, e2row, e2dx, epsilon);
        const { from, to } = span;
        let z = zrow + zdx * (from - minX);
        for (let i = y * width + from, end = y * width + to; i <= end; i++, z += zdx) {
            if (z < depth[i]) {
                depth[i] = z;
                pixels[i] = rgb;
            }
        }
        e0row += e0dy; e1row += e1dy; e2row += e2dy; zrow += zdy;
    }
}

// Narrows `span` to the pixels where an edge value (`value` at `minX`,
// changing by `step` per pixel) stays at or above zero.
function clip(span, minX, value, step, epsilon) {
    if (step > 0) span.from = Math.max(span.from, minX + Math.ceil((-epsilon - value) / step));
    else if (step < 0) span.to = Math.min(span.to, minX + Math.floor((value + epsilon) / -step));
    else if (value < -epsilon) span.to = -1;
}

function rgbOf(color, fallback) {
    let value = fallback;
    if (Number.isInteger(color) && color >= 0 && color <= 0xffffff) value = color;
    else if (typeof color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(color)) value = parseInt(color.replace('#', ''), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// ---------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}

// An indexed-color PNG when the picture has at most 256 colors (it nearly
// always does: each brick color in a few shades, and the sky's bands), so
// there is a third as much to compress; truecolor otherwise.
async function encodePng(pixels, width, height) {
    const palette = new Map();
    let previous = -1;
    for (let i = 0; i < pixels.length && palette.size <= 256; i++) {
        if (pixels[i] !== previous) {
            previous = pixels[i];
            if (!palette.has(previous)) palette.set(previous, palette.size);
        }
    }
    const indexed = palette.size <= 256;
    const channels = indexed ? 1 : 3;
    const rowLength = width * channels + 1;
    const raw = new Uint8Array(rowLength * height);
    for (let y = 0; y < height; y++) {
        let o = y * rowLength + 1;
        let last = -1, lastIndex = 0;
        for (let x = 0; x < width; x++) {
            const value = pixels[y * width + x];
            if (indexed) {
                if (value !== last) {
                    last = value;
                    lastIndex = palette.get(value);
                }
                raw[o++] = lastIndex;
            } else {
                raw[o++] = value >>> 16; raw[o++] = (value >>> 8) & 255; raw[o++] = value & 255;
            }
        }
    }
    const compressed = await readAll(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')), Infinity);
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8; // bit depth
    header[9] = indexed ? 3 : 2; // palette, or truecolor
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header)];
    if (indexed) {
        const plte = new Uint8Array(palette.size * 3);
        for (const [value, index] of palette) {
            plte[index * 3] = value >>> 16; plte[index * 3 + 1] = (value >>> 8) & 255; plte[index * 3 + 2] = value & 255;
        }
        parts.push(chunk('PLTE', plte));
    }
    parts.push(chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0)));
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

// ---------------------------------------------------------------- page

const PATH = /^\/b\/([A-Za-z0-9_-]{2,16000})(\/preview\.png)?$/;

export function isBuildPreviewPath(pathname) {
    return PATH.test(pathname);
}

// GET /b/<payload>: the preview page, which sends people on to the app.
// GET /b/<payload>/preview.png: the build's picture. `verifySignature` is
// the worker's Ed25519 check.
export async function handleBuildPreview(request, env, { verifySignature }) {
    const url = new URL(request.url);
    const match = PATH.exec(url.pathname);
    if (!match || (request.method !== 'GET' && request.method !== 'HEAD')) {
        return new Response('Not found', { status: 404 });
    }
    const payload = match[1];
    const appUrl = typeof env?.APP_URL === 'string' && /^https?:\/\//.test(env.APP_URL) ? env.APP_URL : DEFAULT_APP_URL;
    const decoded = await decodeLinkPayload(payload);
    const build = decoded ? await checkSharedBuild(decoded, verifySignature) : null;
    if (match[2]) {
        if (!build || build.bricks.length === 0 || build.bricks.length > MAX_DRAWN_BRICKS) {
            return Response.redirect(new URL('assets/social/forkbuild-card.png', appUrl).href, 302);
        }
        // Drawn once per edge location: the payload is the build, so its
        // picture never changes.
        const cache = globalThis.caches?.default ?? null;
        const cacheKey = new Request(url.href, { method: 'GET' });
        let response = cache ? await cache.match(cacheKey) : null;
        if (!response) {
            response = new Response(await renderPreviewPng(build.bricks), {
                headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' }
            });
            if (cache) await cache.put(cacheKey, response.clone());
        }
        return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
    }
    const page = previewPage({ build, appLink: `${appUrl}#/s/${payload}`, selfUrl: `${url.origin}/b/${payload}`, appUrl });
    return new Response(request.method === 'HEAD' ? null : page, {
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, max-age=86400',
            'content-security-policy': "default-src 'none'; img-src https:; style-src 'unsafe-inline'",
            'referrer-policy': 'no-referrer'
        }
    });
}

export function previewPage({ build, appLink, selfUrl, appUrl }) {
    const drawn = build && build.bricks.length > 0 && build.bricks.length <= MAX_DRAWN_BRICKS;
    const title = build?.title ? `${build.title}` : 'A shared build';
    const description = build
        ? `${build.author ? `A build by ${build.author}` : 'A build'} on ForkBuild, ${build.bricks.length} ${build.bricks.length === 1 ? 'brick' : 'bricks'}. Open it in 3D in your browser and make your own copy. No account needed.`
        : 'A build shared from ForkBuild. Open it in 3D in your browser and make your own copy. No account needed.';
    const image = drawn ? `${selfUrl}/preview.png` : new URL('assets/social/forkbuild-card.png', appUrl).href;
    const e = escapeHtml;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} · ForkBuild</title>
<meta name="description" content="${e(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ForkBuild">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(selfUrl)}">
<meta property="og:image" content="${e(image)}">
<meta property="og:image:width" content="${drawn ? PREVIEW_WIDTH : 1200}">
<meta property="og:image:height" content="${drawn ? PREVIEW_HEIGHT : 630}">
<meta property="og:image:alt" content="${e(drawn ? `A picture of ${title}` : 'ForkBuild')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
<meta name="twitter:image" content="${e(image)}">
<meta http-equiv="refresh" content="0; url=${e(appLink)}">
<style>body{font-family:system-ui,sans-serif;background:#121212;color:#e0e0e0;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#4caf7d}</style>
</head>
<body>
<p>Opening <strong>${e(title)}</strong> in ForkBuild… <a href="${e(appLink)}">Open it</a></p>
</body>
</html>
`;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- helpers

async function readAll(stream, limit) {
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > limit) {
            await reader.cancel().catch(() => {});
            throw new RangeError('too large');
        }
        chunks.push(value);
    }
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of chunks) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(a) {
    const length = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / length, a[1] / length, a[2] / length];
}
