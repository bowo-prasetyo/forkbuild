import { createPublicationCommentaryDistributor } from '../application/publication/commentary/PublicationCommentaryDistributor.js';
import { useOwnPublicationActions } from '../ui/views/worldView/useOwnPublicationActions.js';
import CommentaryDistributionPicker, { commentaryDistributionProviderLabel } from '../ui/components/CommentaryDistributionPicker.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { assert } from './support/Assert.js';

// Comments posted in World View travel like Repository comments: saved on this
// device first, then announced to connected peers and to the one network
// chosen beside Post Comment.

async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeDistributor(calls, { announce, publish } = {}) {
    return createPublicationCommentaryDistributor({
        peerExchange: { announce: announce || ((commentary) => calls.push(`announce:${commentary.commentaryId}`)) },
        distributionExchange: { exportCommentary: (commentary) => `envelope:${commentary.commentaryId}` },
        substrateFor: (provider) => (provider === 'none' ? null : {
            publish: publish || ((json) => { calls.push(`${provider}:${json}`); return Promise.resolve(); })
        }),
        defaultProvider: () => 'nostr'
    });
}

function mountActions({ session, distributePublicationCommentaryCommand }) {
    return mountComponent({
        setup: () => useOwnPublicationActions({
            distributePublicationCommentaryCommand,
            feedback: { show: () => {} },
            guarded: (fn) => fn(),
            placementEditTarget: { value: null },
            placementOverlapWarning: { value: null },
            refreshSpatialUI: () => {},
            session,
            showPlacementEditor: { value: false }
        })
    }, {});
}

async function run() {
    // The distributor: peers first, then exactly one network, never waiting on it.
    {
        const calls = [];
        const distribute = makeDistributor(calls);
        distribute({ commentaryId: 'c1' }, 'steem');
        distribute({ commentaryId: 'c2' });
        assert(calls.join('|') === 'announce:c1|steem:envelope:c1|announce:c2|nostr:envelope:c2',
            `peers, then the chosen network, else the saved preference (got ${calls.join('|')})`);

        const noNetwork = [];
        makeDistributor(noNetwork)({ commentaryId: 'c3' }, 'none');
        assert(noNetwork.join('|') === 'announce:c3', 'a network that is not set up is skipped; peers still hear about it');

        let rejected = false;
        const failing = makeDistributor([], {
            announce: () => { throw new Error('no peers'); },
            publish: () => Promise.reject(new Error('relay down')).finally(() => { rejected = true; })
        });
        assert(failing({ commentaryId: 'c4' }, 'nostr') === undefined, 'a failing peer announce and network publish never throw');
        await settle();
        assert(rejected, 'the rejected publish was still attempted and its rejection handled');
        console.log('✓ the distributor announces to peers, then one network, and swallows every failure');
    }

    // World View saves through its session, then distributes the saved comment.
    {
        const saved = [];
        const distributed = [];
        const session = {
            addPublicationCommentary: (input) => {
                saved.push(input);
                return { commentary: { commentaryId: input.commentaryId, publicationId: input.publicationId }, isNew: true };
            }
        };
        const actions = mountActions({
            session,
            distributePublicationCommentaryCommand: (commentary, provider) => distributed.push({ commentary, provider })
        });
        const result = actions.addPublicationCommentaryCommand({ publicationId: 'pub-1', content: 'Nice tower', commentaryId: 'c-1', createdAt: new Date(0), discoveryProvider: 'arweave' });

        assert(saved.length === 1 && !('discoveryProvider' in saved[0]), 'the session saves the comment as before, without the network choice');
        assert(distributed.length === 1 && distributed[0].commentary === result.commentary && distributed[0].provider === 'arweave',
            'the saved comment is distributed on the chosen network');

        const failingActions = mountActions({
            session,
            distributePublicationCommentaryCommand: () => { throw new Error('distribution exploded'); }
        });
        const kept = failingActions.addPublicationCommentaryCommand({ publicationId: 'pub-1', content: 'Still saved', commentaryId: 'c-2', createdAt: new Date(0), discoveryProvider: 'nostr' });
        assert(kept.isNew === true && saved.length === 2, 'a distribution failure never fails or undoes the save');

        const refusing = mountActions({
            session: { addPublicationCommentary: () => { throw new Error('signed out'); } },
            distributePublicationCommentaryCommand: () => distributed.push('should not happen')
        });
        let threw = false;
        try {
            refusing.addPublicationCommentaryCommand({ publicationId: 'pub-1', content: 'x' });
        } catch {
            threw = true;
        }
        assert(threw && distributed.length === 1, 'a comment that was never saved is never distributed, and the save error still reaches the form');

        const localOnly = mountActions({ session, distributePublicationCommentaryCommand: null });
        assert(localOnly.addPublicationCommentaryCommand({ publicationId: 'pub-1', content: 'Offline', commentaryId: 'c-3', createdAt: new Date(0) }).isNew === true,
            'without a distribution command the comment is still saved');
        console.log('✓ World View comments are saved first, then distributed on the chosen network');
    }

    // The picker shared by World View's comment forms.
    {
        const emitted = [];
        const ctx = { modelValue: 'nostr', $emit: (event, value) => emitted.push({ event, value }), steemAnnouncingConfigurationStore: null };
        const model = CommentaryDistributionPicker.computed.model;
        assert(model.get.call(ctx) === 'nostr', 'the picker shows the host\'s choice');
        model.set.call(ctx, 'steem');
        assert(emitted.length === 1 && emitted[0].event === 'update:modelValue' && emitted[0].value === 'steem', 'a change goes back to the host');
        assert(CommentaryDistributionPicker.methods.steemUnreadiness.call(ctx) === null, 'no Steem hint while another network is chosen');
        assert(typeof CommentaryDistributionPicker.methods.steemUnreadiness.call({ ...ctx, modelValue: 'steem' }) === 'string',
            'choosing Steem without an account says why it would not post');
        assert(commentaryDistributionProviderLabel('arweave') === 'Arweave' && commentaryDistributionProviderLabel('steem') === 'Steem'
            && commentaryDistributionProviderLabel(undefined) === 'Nostr', 'network names for the status line');
        console.log('✓ the picker reports the choice and warns before a Steem post that cannot be signed');
    }

    console.log('\n✅ All World View comment distribution tests passed.');
}

await run();
