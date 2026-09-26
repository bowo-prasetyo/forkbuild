import { uploadSteemImage } from '../../steem/SteemImageUpload.js';

// The image upload check behind content-check.html: whether a picture can be
// put on a Steem post from this site. Steem Keychain signs a small test image
// with the posting key, the image host (steemitimages.com by default) stores
// it, and the address it returns must load as an image. What it finds decides
// how ForkBuild adds build thumbnails to its Steem notices.

const WIDTH = 320;
const HEIGHT = 200;

// A 320×200 PNG, the size of ForkBuild's thumbnails: a small stepped pyramid
// and the time it was drawn, so each upload is different. Needs a browser
// canvas.
export async function steemImageCheckPicture({ now = new Date(), createCanvas = defaultCanvas } = {}) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext('2d');
    context.fillStyle = '#87ceeb';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#6b8e4e';
    context.fillRect(0, 150, WIDTH, 50);
    const shades = ['#c9a86a', '#d4b577', '#dfc285', '#eacf93'];
    shades.forEach((shade, level) => {
        const half = 90 - level * 22;
        context.fillStyle = shade;
        context.fillRect(160 - half, 150 - (level + 1) * 22, half * 2, 22);
    });
    context.fillStyle = '#1b1b1b';
    context.font = '14px sans-serif';
    context.fillText('ForkBuild image upload check', 12, 22);
    context.fillText(now.toISOString(), 12, 40);
    const blob = typeof canvas.convertToBlob === 'function'
        ? await canvas.convertToBlob({ type: 'image/png' })
        : await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
}

function defaultCanvas(width, height) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

// Signs, uploads and loads the image back. Resolves to `{ ok, message, rows }`
// (rows: [label, value] pairs describing each step); never rejects.
// `loadImage(url)` resolves to whether the returned address loads as an image.
export async function runSteemImageUploadCheck({ account, host, signer, bytes, loadImage, fetchImpl = globalThis.fetch, onStep = () => {} }) {
    const rows = [['Test image', `${bytes.length} bytes, PNG, ${WIDTH}×${HEIGHT}`], ['Image host', host]];
    let signature = null;
    const watchedSigner = {
        async sign(signingAccount, payload) {
            onStep('Approve signing the test image in Steem Keychain…');
            signature = await signer.sign(signingAccount, payload);
            onStep('Signed. Uploading the test image…');
            return signature;
        }
    };
    let uploaded;
    try {
        uploaded = await uploadSteemImage({ account, bytes, signer: watchedSigner, host, fetchImpl, fileName: 'forkbuild-image-check.png' });
    } catch (error) {
        if (signature !== null) rows.push(['Signature', describeSignature(signature)]);
        const stage = error.stage === 'signing' ? 'Signing' : 'Upload';
        rows.push([stage, `failed: ${error.message}`]);
        if (error.response !== null && error.response !== undefined) rows.push(['Response', typeof error.response === 'string' ? error.response : JSON.stringify(error.response)]);
        return {
            ok: false,
            rows,
            message: error.stage === 'signing'
                ? `Signing failed: ${error.message}`
                : `Signed, but the upload failed: ${error.message}`
        };
    }
    rows.push(['Signature', describeSignature(uploaded.signature)], ['Upload', 'accepted'], ['Image address', uploaded.url]);
    onStep('Uploaded. Loading the image from its new address…');
    const loads = await loadImage(uploaded.url);
    rows.push(['Loads as an image', loads ? 'yes' : 'no']);
    return {
        ok: loads,
        rows,
        message: loads
            ? `Works: the image host stored the test image at ${uploaded.url}, and it loads.`
            : `The upload was accepted (${uploaded.url}), but the image does not load from that address.`
    };
}

function describeSignature(signature) {
    return `${signature.length} hex characters (${signature.slice(0, 10)}…)`;
}
