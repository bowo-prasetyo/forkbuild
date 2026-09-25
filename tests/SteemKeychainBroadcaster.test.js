import { SteemBroadcastError, createSteemKeychainBroadcaster } from '../steem/SteemKeychainBroadcaster.js';
import { assert } from './support/Assert.js';

// No Keychain means no broadcaster.
{
    assert(createSteemKeychainBroadcaster({ keychain: undefined }) === undefined, 'no keychain, no broadcaster');
    assert(createSteemKeychainBroadcaster({ keychain: {} }) === undefined, 'a keychain without requestBroadcast is not usable');
    console.log('✓ no Keychain, no broadcaster');
}

// A successful broadcast passes the operations through and returns the transaction.
{
    const calls = [];
    const keychain = {
        requestBroadcast(account, operations, keyType, callback) {
            calls.push({ account, operations, keyType });
            callback({ success: true, result: { id: 'abc123', block_num: 42 } });
        }
    };
    const ops = [['comment', { author: 'forkbuild' }]];
    const result = await createSteemKeychainBroadcaster({ keychain }).broadcast('forkbuild', ops);
    assert(calls.length === 1 && calls[0].account === 'forkbuild' && calls[0].operations === ops, 'account and operations reach Keychain');
    assert(calls[0].keyType === 'Posting', 'the posting key is asked for by default');
    assert(result.transactionId === 'abc123' && result.blockNum === 42, 'the transaction id and block are returned');
    console.log('✓ a broadcast returns its transaction');
}

// A refusal rejects with Keychain's message.
{
    const keychain = { requestBroadcast: (a, o, k, callback) => callback({ success: false, message: 'Request was canceled by the user.' }) };
    let caught = null;
    try {
        await createSteemKeychainBroadcaster({ keychain }).broadcast('forkbuild', []);
    } catch (error) {
        caught = error;
    }
    assert(caught instanceof SteemBroadcastError && caught.message === 'Request was canceled by the user.', `refusal carries the message (got ${caught?.message})`);
    console.log('✓ a refusal rejects');
}

// No answer at all times out.
{
    const keychain = { requestBroadcast() {} };
    let caught = null;
    try {
        await createSteemKeychainBroadcaster({ keychain, signingTimeoutMs: 20 }).broadcast('forkbuild', []);
    } catch (error) {
        caught = error;
    }
    assert(caught instanceof SteemBroadcastError && caught.message.includes('did not answer'), 'a silent Keychain times out');
    console.log('✓ a silent Keychain times out');
}
