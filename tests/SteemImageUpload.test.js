import {
    DEFAULT_STEEM_IMAGE_HOST, STEEM_IMAGE_SIGNING_PREFIX, SteemImageUploadError,
    createSteemKeychainImageSigner, steemImageSigningPayload, uploadSteemImage
} from '../steem/SteemImageUpload.js';
import { runSteemImageUploadCheck } from '../scripts/steem-threads/SteemImageUploadCheck.js';
import { assert } from './support/Assert.js';

// Uploading an image to a Steem image host (steem/SteemImageUpload.js) and the
// image upload check built on it, over a fake Steem Keychain and a fake host.

const SIGNATURE = '1f' + 'ab'.repeat(64);
const BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

// A host that records the request and answers with `answer(request)`.
function fakeHost(answer) {
    const requests = [];
    const fetchImpl = async (url, options) => {
        const file = options.body.get('file');
        const request = { url, method: options.method, file, bytes: new Uint8Array(await file.arrayBuffer()) };
        requests.push(request);
        return answer(request);
    };
    return { fetchImpl, requests };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// What Keychain signs.
{
    const payload = JSON.parse(steemImageSigningPayload(BYTES));
    const prefix = [...new TextEncoder().encode(STEEM_IMAGE_SIGNING_PREFIX)];
    assert(payload.type === 'Buffer' && JSON.stringify(payload.data) === JSON.stringify([...prefix, ...BYTES]),
        'the payload is the challenge prefix then the image bytes, as a Buffer in JSON');
    console.log('✓ what Keychain signs');
}

// The Keychain signer.
{
    assert(createSteemKeychainImageSigner({ keychain: undefined }) === undefined && createSteemKeychainImageSigner({ keychain: {} }) === undefined, 'no Keychain, no signer');
    const calls = [];
    const signer = createSteemKeychainImageSigner({
        keychain: { requestSignBuffer: (account, payload, keyType, done) => { calls.push({ account, payload, keyType }); done({ success: true, result: SIGNATURE }); } }
    });
    assert(await signer.sign('alice', 'payload') === SIGNATURE && calls[0].account === 'alice' && calls[0].keyType === 'Posting', 'it asks Keychain to sign with the posting key');
    const declined = createSteemKeychainImageSigner({ keychain: { requestSignBuffer: (a, p, k, done) => done({ success: false, message: 'Request was canceled by the user.' }) } });
    const error = await rejection(declined.sign('alice', 'payload'));
    assert(error instanceof SteemImageUploadError && error.stage === 'signing' && error.message === 'Request was canceled by the user.', `a declined request says so (got ${error?.message})`);
    const silent = createSteemKeychainImageSigner({ keychain: { requestSignBuffer: () => {} }, signingTimeoutMs: 10 });
    assert((await rejection(silent.sign('alice', 'payload')))?.message.includes('did not answer'), 'a Keychain that never answers times out');
    console.log('✓ the Keychain signer');
}

// Uploading.
{
    const signer = { sign: async () => SIGNATURE };
    const host = fakeHost(() => json({ url: 'https://steemitimages.com/DQmTest/forkbuild.png' }));
    const result = await uploadSteemImage({ account: 'alice', bytes: BYTES, signer, fetchImpl: host.fetchImpl });
    const [request] = host.requests;
    assert(request.url === `${DEFAULT_STEEM_IMAGE_HOST}/alice/${SIGNATURE}` && request.method === 'POST', `it posts to <host>/<account>/<signature> (got ${request.url})`);
    assert(request.file.type === 'image/png' && request.file.name === 'forkbuild.png' && JSON.stringify([...request.bytes]) === JSON.stringify([...BYTES]), 'the image goes as the "file" field, unchanged');
    assert(result.url === 'https://steemitimages.com/DQmTest/forkbuild.png' && result.signature === SIGNATURE, 'it resolves to the address the host returns');

    const cases = [
        [fakeHost(() => json({ error: 'Signature did not verify' }, 400)), 'refused the upload: Signature did not verify'],
        [fakeHost(() => new Response('<html>Bad Gateway</html>', { status: 502 })), 'refused the upload: <html>Bad Gateway</html>'],
        [fakeHost(() => json({ url: 'javascript:alert(1)' })), 'refused the upload'],
        [{ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }, 'does not accept uploads from this site (Failed to fetch)']
    ];
    for (const [fake, expected] of cases) {
        const error = await rejection(uploadSteemImage({ account: 'alice', bytes: BYTES, signer, fetchImpl: fake.fetchImpl }));
        assert(error instanceof SteemImageUploadError && error.stage === 'upload' && error.message.includes(expected), `"${expected}" (got ${error?.message})`);
    }
    const odd = await rejection(uploadSteemImage({ account: 'alice', bytes: BYTES, signer: { sign: async () => 'not/hex' }, fetchImpl: host.fetchImpl }));
    assert(odd?.stage === 'signing' && host.requests.length === 1, 'a signature that isn\'t hex never reaches the host');
    assert((await rejection(uploadSteemImage({ account: 'alice', bytes: BYTES, signer: null })))?.stage === 'signing', 'no signer, no upload');
    console.log('✓ uploading');
}

// The check.
{
    const steps = [];
    const signer = { sign: async () => SIGNATURE };
    const ok = await runSteemImageUploadCheck({
        account: 'alice', host: DEFAULT_STEEM_IMAGE_HOST, signer, bytes: BYTES,
        fetchImpl: fakeHost(() => json({ url: 'https://steemitimages.com/DQmTest/x.png' })).fetchImpl,
        loadImage: async () => true, onStep: (text) => steps.push(text)
    });
    assert(ok.ok && ok.message.startsWith('Works:') && ok.rows.some(([label, value]) => label === 'Image address' && value === 'https://steemitimages.com/DQmTest/x.png'), `a working upload says so (got ${ok.message})`);
    assert(ok.rows.some(([label, value]) => label === 'Signature' && value.startsWith('130 hex characters')), 'the signature is described');
    assert(steps[0].includes('Approve signing') && steps.at(-1).includes('Loading the image'), 'each step is reported');

    const broken = await runSteemImageUploadCheck({
        account: 'alice', host: DEFAULT_STEEM_IMAGE_HOST, signer, bytes: BYTES,
        fetchImpl: fakeHost(() => json({ url: 'https://steemitimages.com/DQmTest/x.png' })).fetchImpl, loadImage: async () => false
    });
    assert(!broken.ok && broken.message.includes('does not load'), 'an address that doesn\'t load fails the check');

    const refused = await runSteemImageUploadCheck({
        account: 'alice', host: DEFAULT_STEEM_IMAGE_HOST, signer, bytes: BYTES,
        fetchImpl: fakeHost(() => json({ error: 'Signature did not verify' }, 400)).fetchImpl, loadImage: async () => true
    });
    assert(!refused.ok && refused.message.startsWith('Signed, but the upload failed') && refused.rows.some(([label, value]) => label === 'Response' && value.includes('did not verify')),
        `a refused upload shows the host's answer (got ${refused.message})`);

    const declined = await runSteemImageUploadCheck({
        account: 'alice', host: DEFAULT_STEEM_IMAGE_HOST, bytes: BYTES, loadImage: async () => true,
        signer: { sign: async () => { throw new SteemImageUploadError('Request was canceled by the user.', { stage: 'signing' }); } }
    });
    assert(!declined.ok && declined.message === 'Signing failed: Request was canceled by the user.', `declining in Keychain says so (got ${declined.message})`);
    console.log('✓ the check');
}

console.log('\n✅ All SteemImageUpload tests passed.');
