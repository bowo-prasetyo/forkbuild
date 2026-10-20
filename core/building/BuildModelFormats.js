// A build as a 3D model file other programs open: glTF binary (.glb) for
// Blender, game engines and model viewers; STL (.stl) for 3D printing; and
// OBJ (.obj) for older tools. Pure writers: they take triangles already in
// place (renderer/BuildMeshExtraction.js) and return the file's bytes or
// text, and know nothing about bricks or Three.js.
//
// `meshes`: `[{ color, positions, normals }]`, one per brick color: `color`
// 0xRRGGBB (sRGB, as the Editor shows it); `positions` and `normals`
// Float32Arrays of x, y, z, three vertices per triangle, counter-clockwise
// seen from outside, Y up, in ForkBuild's units (a door is 2 high, so
// about a metre each).
//
// `metadata`: `{ title, author, license, remixedFrom }`, all optional text,
// written into each file so its credit travels with it.

export const BuildModelFormat = Object.freeze({
    GLB: 'glb',
    STL: 'stl',
    OBJ: 'obj'
});

export const BUILD_MODEL_FORMATS = Object.freeze([BuildModelFormat.GLB, BuildModelFormat.STL, BuildModelFormat.OBJ]);

export const BUILD_MODEL_MIME_TYPES = Object.freeze({
    [BuildModelFormat.GLB]: 'model/gltf-binary',
    [BuildModelFormat.STL]: 'model/stl',
    [BuildModelFormat.OBJ]: 'model/obj'
});

// For printing, one ForkBuild unit is this many millimetres: a 1:100 model,
// so a 2-unit door is 20 mm tall. A slicer can scale it further.
export const STL_MILLIMETRES_PER_UNIT = 10;

// How many triangles the meshes hold.
export function countTriangles(meshes) {
    return (Array.isArray(meshes) ? meshes : []).reduce((sum, mesh) => sum + Math.floor((mesh?.positions?.length || 0) / 9), 0);
}

// One line of credit: "Castle by alice · CC BY 4.0 · remixed from Keep".
export function describeBuildCredit({ title, author, license, remixedFrom } = {}) {
    const name = clean(title) || 'A ForkBuild build';
    const parts = [clean(author) ? `${name} by ${clean(author)}` : name];
    if (clean(license)) parts.push(clean(license));
    if (clean(remixedFrom)) parts.push(`remixed from ${clean(remixedFrom)}`);
    parts.push('made with ForkBuild');
    return parts.join(' · ');
}

// ---------------------------------------------------------------- glTF

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const ARRAY_BUFFER = 34962;
const FLOAT = 5126;
const TRIANGLES = 4;

// A .glb: one node and one mesh, one primitive per color, each with its own
// matte material. Returns an ArrayBuffer.
export function writeGlb({ meshes, metadata = {} }) {
    const parts = usable(meshes);
    const json = {
        asset: {
            version: '2.0',
            generator: 'ForkBuild',
            copyright: describeBuildCredit(metadata),
            extras: extrasOf(metadata)
        },
        scene: 0,
        scenes: [{ name: clean(metadata.title) || 'ForkBuild build', nodes: parts.length ? [0] : [] }]
    };
    let binary = new Uint8Array(0);
    if (parts.length) {
        const views = [];
        const accessors = [];
        const materials = [];
        const primitives = [];
        const chunks = [];
        let offset = 0;
        for (const part of parts) {
            const count = part.positions.length / 3;
            for (const [array, withBounds] of [[part.positions, true], [part.normals, false]]) {
                chunks.push(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
                views.push({ buffer: 0, byteOffset: offset, byteLength: array.byteLength, target: ARRAY_BUFFER });
                const accessor = { bufferView: views.length - 1, componentType: FLOAT, count, type: 'VEC3' };
                if (withBounds) Object.assign(accessor, bounds(array));
                accessors.push(accessor);
                offset += array.byteLength;
            }
            materials.push({
                name: hex(part.color),
                pbrMetallicRoughness: { baseColorFactor: [...linearRgb(part.color), 1], metallicFactor: 0, roughnessFactor: 0.85 }
            });
            primitives.push({
                attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 },
                material: materials.length - 1,
                mode: TRIANGLES
            });
        }
        binary = new Uint8Array(offset);
        let at = 0;
        for (const chunk of chunks) {
            binary.set(chunk, at);
            at += chunk.length;
        }
        Object.assign(json, {
            nodes: [{ name: clean(metadata.title) || 'ForkBuild build', mesh: 0 }],
            meshes: [{ name: clean(metadata.title) || 'ForkBuild build', primitives }],
            materials,
            accessors,
            bufferViews: views,
            buffers: [{ byteLength: binary.length }]
        });
    }

    const jsonBytes = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
    const binBytes = binary.length ? pad(binary, 0) : null;
    const length = 12 + 8 + jsonBytes.length + (binBytes ? 8 + binBytes.length : 0);
    const out = new ArrayBuffer(length);
    const view = new DataView(out);
    const bytes = new Uint8Array(out);
    view.setUint32(0, GLB_MAGIC, true);
    view.setUint32(4, GLB_VERSION, true);
    view.setUint32(8, length, true);
    view.setUint32(12, jsonBytes.length, true);
    view.setUint32(16, CHUNK_JSON, true);
    bytes.set(jsonBytes, 20);
    if (binBytes) {
        const at = 20 + jsonBytes.length;
        view.setUint32(at, binBytes.length, true);
        view.setUint32(at + 4, CHUNK_BIN, true);
        bytes.set(binBytes, at + 8);
    }
    return out;
}

// ---------------------------------------------------------------- STL

// A binary .stl for 3D printing: Z up, as slicers expect, in millimetres
// (STL_MILLIMETRES_PER_UNIT), centred over the origin and standing on the
// bed (z = 0). STL has no color; overlapping bricks are separate shells,
// which slicers merge. Returns an ArrayBuffer.
export function writeStl({ meshes, metadata = {}, millimetresPerUnit = STL_MILLIMETRES_PER_UNIT }) {
    const parts = usable(meshes);
    const count = countTriangles(parts);
    const out = new ArrayBuffer(84 + count * 50);
    const view = new DataView(out);
    const header = ascii(`ForkBuild model: ${describeBuildCredit(metadata)}`).slice(0, 80);
    for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
    view.setUint32(80, count, true);

    // Y up to Z up, a right-handed turn about X: (x, y, z) -> (x, -z, y).
    const box = zUpBounds(parts);
    const cx = (box.min[0] + box.max[0]) / 2;
    const cy = (box.min[1] + box.max[1]) / 2;
    const s = millimetresPerUnit;
    let at = 84;
    for (const part of parts) {
        const p = part.positions;
        for (let t = 0; t < p.length; t += 9) {
            const a = [(p[t] - cx) * s, (-p[t + 2] - cy) * s, (p[t + 1] - box.min[2]) * s];
            const b = [(p[t + 3] - cx) * s, (-p[t + 5] - cy) * s, (p[t + 4] - box.min[2]) * s];
            const c = [(p[t + 6] - cx) * s, (-p[t + 8] - cy) * s, (p[t + 7] - box.min[2]) * s];
            for (const value of faceNormal(a, b, c)) {
                view.setFloat32(at, value, true);
                at += 4;
            }
            for (const vertex of [a, b, c]) {
                for (const value of vertex) {
                    view.setFloat32(at, value, true);
                    at += 4;
                }
            }
            view.setUint16(at, 0, true);
            at += 2;
        }
    }
    return out;
}

// ---------------------------------------------------------------- OBJ

// A .obj, as text: one group per color, each vertex carrying its color
// ("v x y z r g b", read by Blender, MeshLab and most current tools), and
// the credit as comments. Y up, ForkBuild's units.
export function writeObj({ meshes, metadata = {} }) {
    const parts = usable(meshes);
    const lines = [
        '# ForkBuild model',
        `# ${describeBuildCredit(metadata)}`,
        ...Object.entries(extrasOf(metadata)).map(([key, value]) => `# ${key}: ${value}`),
        `o ${objName(metadata.title)}`
    ];
    let vertexBase = 1;
    for (const part of parts) {
        const [r, g, b] = srgb(part.color).map(number);
        const p = part.positions;
        const n = part.normals;
        lines.push(`g color_${hex(part.color).slice(1)}`);
        for (let i = 0; i < p.length; i += 3) lines.push(`v ${number(p[i])} ${number(p[i + 1])} ${number(p[i + 2])} ${r} ${g} ${b}`);
        for (let i = 0; i < n.length; i += 3) lines.push(`vn ${number(n[i])} ${number(n[i + 1])} ${number(n[i + 2])}`);
        for (let v = 0; v < p.length / 3; v += 3) {
            const [a, bb, c] = [vertexBase + v, vertexBase + v + 1, vertexBase + v + 2];
            lines.push(`f ${a}//${a} ${bb}//${bb} ${c}//${c}`);
        }
        vertexBase += p.length / 3;
    }
    return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- shared

function usable(meshes) {
    return (Array.isArray(meshes) ? meshes : []).filter((mesh) => mesh
        && mesh.positions instanceof Float32Array && mesh.normals instanceof Float32Array
        && mesh.positions.length > 0 && mesh.positions.length % 9 === 0 && mesh.normals.length === mesh.positions.length);
}

function extrasOf({ title, author, license, remixedFrom } = {}) {
    const extras = {};
    if (clean(title)) extras.title = clean(title);
    if (clean(author)) extras.author = clean(author);
    if (clean(license)) extras.license = clean(license);
    if (clean(remixedFrom)) extras.remixedFrom = clean(remixedFrom);
    extras.madeWith = 'ForkBuild';
    return extras;
}

// One line of plain text: no control characters, at most 200 characters.
function clean(value) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 200) : '';
}

function ascii(text) {
    return text.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?');
}

function objName(title) {
    return (clean(title) || 'ForkBuild build').replace(/\s+/g, '_');
}

function bounds(array) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < array.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], array[i + k]);
            max[k] = Math.max(max[k], array[i + k]);
        }
    }
    return { min: min.map(Math.fround), max: max.map(Math.fround) };
}

// Bounds after turning Y up into Z up.
function zUpBounds(parts) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const part of parts) {
        const p = part.positions;
        for (let i = 0; i < p.length; i += 3) {
            const v = [p[i], -p[i + 2], p[i + 1]];
            for (let k = 0; k < 3; k++) {
                min[k] = Math.min(min[k], v[k]);
                max[k] = Math.max(max[k], v[k]);
            }
        }
    }
    return min[0] === Infinity ? { min: [0, 0, 0], max: [0, 0, 0] } : { min, max };
}

function faceNormal(a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(n[0], n[1], n[2]);
    return length > 0 ? n.map((value) => value / length) : [0, 0, 0];
}

function pad(bytes, fill) {
    const length = Math.ceil(bytes.length / 4) * 4;
    if (length === bytes.length) return bytes;
    const out = new Uint8Array(length).fill(fill);
    out.set(bytes);
    return out;
}

function srgb(color) {
    const value = Number.isInteger(color) ? color : 0x808080;
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((c) => c / 255);
}

function linearRgb(color) {
    return srgb(color).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

function hex(color) {
    return `#${(Number.isInteger(color) ? color : 0x808080).toString(16).padStart(6, '0')}`;
}

function number(value) {
    return Number(value.toFixed(4)).toString();
}
