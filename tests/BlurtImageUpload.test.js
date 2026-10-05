import { DEFAULT_BLURT_IMAGE_HOST, DEFAULT_BLURT_IMAGE_RELAY, uploadBlurtImage } from '../blurt/BlurtKeychain.js';
import { assert } from './support/Assert.js';

const BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const SIGNATURE = '20' + 'ab'.repeat(64);

// A Blurt Keychain that signs every buffer it is asked to.
const keychain = {
    requestBroadcast() {},
    requestSignBuffer(account, message, key, callback) {
        callback({ success: true, result: SIGNATURE });
    }
};

async function rejection(promise) {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
}

// images.blurt.blog doesn't accept uploads from other sites, so when the
// browser can't reach it the same signed upload goes through the relay.
{
    const requests = [];
    const fetchImpl = async (url) => {
        requests.push(url);
        if (url.startsWith(DEFAULT_BLURT_IMAGE_HOST)) throw new TypeError('Failed to fetch');
        return new Response(JSON.stringify({ url: 'https://images.blurt.blog/DQmTest/forkbuild-build.png' }), { status: 200 });
    };
    const result = await uploadBlurtImage({ account: 'forkbuild', bytes: BYTES, keychain, fetchImpl });
    assert(result.via === 'relay' && result.url === 'https://images.blurt.blog/DQmTest/forkbuild-build.png', `stored through the relay (got ${result.via} ${result.url})`);
    assert(requests.join() === [`${DEFAULT_BLURT_IMAGE_HOST}/forkbuild/${SIGNATURE}`, `${DEFAULT_BLURT_IMAGE_RELAY}/forkbuild/${SIGNATURE}`].join(), `the host first, then the relay (got ${requests})`);
    assert(DEFAULT_BLURT_IMAGE_RELAY.endsWith('/blurt-image'), 'the relay is the worker\'s Blurt route');

    const both = await rejection(uploadBlurtImage({ account: 'forkbuild', bytes: BYTES, keychain, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }));
    assert(both?.message.includes('The ForkBuild relay failed too'), `when the relay fails too, both are named (got ${both?.message})`);
    console.log('✓ Blurt images go through the relay when the host can\'t be reached');
}
