// A Publications card's Distribution section offers one button for the
// person's saved preferred provider only when that provider can be used
// there, and otherwise says why; it never picks one for them.
import { preferredDistributionChoice, WALLET_GUIDED_ANCHOR_TYPES } from '../ui/views/decentralizedPublications/presentation.js';
import { assert } from './support/Assert.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

assert(same(preferredDistributionChoice('ipfs', ['ipfs', 'ar']), { providerKey: 'ipfs', savedKey: 'ipfs', reason: null }), 'a saved, offered provider gets the button');
for (const saved of [null, undefined, '']) {
    assert(same(preferredDistributionChoice(saved, ['ipfs', 'ar']), { providerKey: null, savedKey: null, reason: 'none' }), 'nothing saved: no button, and no guess');
}
assert(same(preferredDistributionChoice('steem', ['ipfs', 'ar']), { providerKey: null, savedKey: 'steem', reason: 'unavailable' }), 'a saved provider not offered here is named, not replaced');
assert(same(preferredDistributionChoice('ipfs', null), { providerKey: null, savedKey: 'ipfs', reason: 'unavailable' }), 'nothing offered at all');
const bitcoin = preferredDistributionChoice('bitcoin-op-return', ['bitcoin-op-return', 'steem'], { walletGuidedKeys: WALLET_GUIDED_ANCHOR_TYPES });
assert(same(bitcoin, { providerKey: null, savedKey: 'bitcoin-op-return', reason: 'wallet-guided' }), 'Bitcoin is made through wallet steps, never one click');
assert(WALLET_GUIDED_ANCHOR_TYPES.includes('base'), 'and so is Base');
assert(preferredDistributionChoice('steem', ['bitcoin-op-return', 'steem'], { walletGuidedKeys: WALLET_GUIDED_ANCHOR_TYPES }).providerKey === 'steem', 'Steem is one click');
console.log('✓ the preferred-provider button appears only for a usable saved choice');
