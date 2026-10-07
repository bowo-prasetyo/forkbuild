import { register } from 'node:module';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { isUserFacingError } from '../core/UserFacingError.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { PublicationCommentaryDistributionLog, OWN_COMMENTARY_DISTRIBUTIONS_KEY } from '../application/publication/commentary/PublicationCommentaryDistributionLog.js';
import {
    createPublicationCommentaryDistributor, createSavedPublicationCommentaryDistributor, LOCAL_AND_PEERS_ONLY
} from '../application/publication/commentary/PublicationCommentaryDistributor.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// Distribute, on a saved comment: a comment posted to connected peers only (or
// to one network) can be sent to a network later, by its author, and this
// device remembers where each of its comments went.

async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeLog() {
    const storage = new InMemoryStorageProvider();
    let tick = 0;
    return { storage, log: new PublicationCommentaryDistributionLog(storage, { now: () => new Date(Date.UTC(2026, 9, 7, 0, 0, tick++)) }) };
}

function makeComment(provider, id = 'c-1') {
    return new PublicationCommentary({
        commentaryId: id,
        publicationId: 'pub-1',
        authorIdentityId: provider.getSigningIdentity().id,
        content: 'Nice tower'
    });
}

async function rejectionOf(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

async function run() {
    // The log.
    {
        const { storage, log } = makeLog();
        const comment = { commentaryId: 'c-1', publicationId: 'pub-1' };
        const heard = [];
        const unsubscribe = log.subscribe((entry) => heard.push(entry.substrate));

        assert(log.record({ commentary: comment, substrate: 'nostr', result: null }) === null, 'a declined publish records nothing');
        assert(log.record({ commentary: comment, substrate: 'nostr', result: { published: false } }) === null, 'only a published result is recorded');
        const entry = log.record({ commentary: comment, substrate: 'nostr', result: { published: true, locator: 'ev-1' } });
        assert(entry.commentaryId === 'c-1' && entry.publicationId === 'pub-1' && entry.substrate === 'nostr' && entry.locator === 'ev-1'
            && entry.url === null && entry.at === '2026-10-07T00:00:00.000Z', 'an accepted publish is recorded with where and when');
        log.record({ commentary: comment, substrate: 'steem', result: { published: true, locator: 'st-1', url: 'https://steemit.example/@a/b' } });
        log.record({ commentary: comment, substrate: 'nostr', result: { published: true, locator: 'ev-2' } });
        const forComment = log.findByCommentaryId('c-1');
        assert(forComment.length === 2 && forComment.map((e) => e.substrate).join() === 'steem,nostr' && forComment[1].locator === 'ev-2',
            'one entry per comment and network, the newest kept');
        assert(log.findByCommentaryId('c-2').length === 0, 'another comment has no entries');
        assert(heard.join() === 'nostr,steem,nostr', 'listeners hear each record');
        unsubscribe();
        log.record({ commentary: { commentaryId: 'c-3' }, substrate: 'arweave', result: { published: true, locator: 'tx' } });
        assert(heard.length === 3, 'an unsubscribed listener hears nothing more');

        storage.save(OWN_COMMENTARY_DISTRIBUTIONS_KEY, [null, { commentaryId: 'x' }, { commentaryId: 'c-9', substrate: 'blurt' }]);
        assert(log.list().length === 1 && log.list()[0].commentaryId === 'c-9', 'malformed stored entries are skipped');
        assert(backupEntryGroupOf(OWN_COMMENTARY_DISTRIBUTIONS_KEY) === BackupEntryGroup.PUBLICATIONS,
            'device backups restore it with your publications and evidence');
        console.log('✓ the log keeps one entry per comment and network, and tells listeners');
    }

    // Posting records the network once it accepts the comment.
    {
        const { log } = makeLog();
        let publishResult = { published: true, locator: 'ev-9' };
        const distribute = createPublicationCommentaryDistributor({
            peerExchange: { announce: () => {} },
            distributionExchange: { exportCommentary: () => '{}' },
            substrateFor: (provider) => (provider === 'steem' ? null : { publish: () => (publishResult instanceof Error ? Promise.reject(publishResult) : Promise.resolve(publishResult)) }),
            defaultProvider: () => 'nostr',
            distributionLog: log
        });
        distribute({ commentaryId: 'p-1', publicationId: 'pub-1' }, 'arweave');
        await settle();
        assert(log.findByCommentaryId('p-1').map((e) => e.substrate).join() === 'arweave', 'an accepted post is recorded under the network asked');

        publishResult = null;
        distribute({ commentaryId: 'p-2' }, 'nostr');
        publishResult = new Error('relay down');
        distribute({ commentaryId: 'p-3' }, 'nostr');
        distribute({ commentaryId: 'p-4' }, 'steem');
        distribute({ commentaryId: 'p-5' }, LOCAL_AND_PEERS_ONLY);
        await settle();
        assert(['p-2', 'p-3', 'p-4', 'p-5'].every((id) => log.findByCommentaryId(id).length === 0),
            'a declined, failed, unavailable or peers-only post records nothing');
        console.log('✓ posting records the network that accepted the comment');
    }

    // Distribute on a saved comment, with the real exchange signing it.
    {
        const author = makeIdentity('commentary-network-distribution');
        const exchange = new PublicationCommentaryDistributionExchange(new PublicationCommentaryStore(new InMemoryStorageProvider()), author, new LocalAuthorizationVerifier());
        const comment = makeComment(author);
        const published = [];
        const substrates = {
            nostr: { publish: async (envelope) => { published.push(['nostr', envelope]); return { published: true, locator: 'ev-1' }; } },
            arweave: { publish: async () => null },
            steem: null,
            blurt: { publish: async () => { throw new Error('Blurt Keychain was closed'); } }
        };
        const { log } = makeLog();
        const distributeSaved = createSavedPublicationCommentaryDistributor({
            distributionExchange: exchange,
            substrateFor: (provider) => substrates[provider],
            distributionLog: log
        });

        const entry = await distributeSaved(comment, 'nostr');
        assert(entry.substrate === 'nostr' && entry.locator === 'ev-1', 'it resolves the logged entry');
        assert(published.length === 1 && published[0][1].commentaryId === comment.commentaryId && published[0][1].signature,
            'the network receives the comment\'s signed envelope');
        assert(log.findByCommentaryId(comment.commentaryId).map((e) => e.substrate).join() === 'nostr', 'and the log remembers it');

        const declined = await rejectionOf(distributeSaved(comment, 'arweave'));
        assert(isUserFacingError(declined) && declined.userMessage.key === 'commentaryNetworkDistribution.declined'
            && declined.userMessage.params.network === 'Arweave', 'a network that declines is reported by name');
        const unavailable = await rejectionOf(distributeSaved(comment, 'steem'));
        assert(isUserFacingError(unavailable) && unavailable.userMessage.key === 'commentaryNetworkDistribution.networkUnavailable'
            && unavailable.userMessage.params.network === 'Steem', 'a network not set up on this device is reported by name');
        const peers = await rejectionOf(distributeSaved(comment, LOCAL_AND_PEERS_ONLY));
        assert(isUserFacingError(peers) && peers.userMessage.key === 'commentaryNetworkDistribution.chooseANetwork', 'Local & peers only is not a network to send to');
        const failed = await rejectionOf(distributeSaved(comment, 'blurt'));
        assert(failed && failed.message === 'Blurt Keychain was closed', 'a network failure reaches the caller');
        assert(log.findByCommentaryId(comment.commentaryId).length === 1, 'none of the failures is recorded');

        const someoneElse = makeIdentity('commentary-network-distribution-other');
        const theirs = makeComment(someoneElse, 'c-theirs');
        const notAuthor = await rejectionOf(distributeSaved(theirs, 'nostr'));
        assert(notAuthor && /only the commentary's own author/.test(notAuthor.message) && published.length === 1,
            'only the comment\'s author can send it to a network');
        console.log('✓ Distribute sends a saved comment to one network, by its author, and reports the outcome');
    }

    register(new URL('./support/VueShimLoader.mjs', import.meta.url));
    const { default: CommentaryNetworkDistribution } = await import('../ui/components/CommentaryNetworkDistribution.js');
    const { default: CommentaryDistributionPicker } = await import('../ui/components/CommentaryDistributionPicker.js');

    // The component under each comment.
    {
        const author = makeIdentity('commentary-network-distribution-ui');
        const comment = makeComment(author, 'c-ui');
        const { log } = makeLog();
        const calls = [];
        let outcome = 'ok';
        const command = async (commentary, provider) => {
            calls.push(provider);
            if (outcome === 'ok') return log.record({ commentary, substrate: provider, result: { published: true, locator: 'x' } });
            throw outcome;
        };
        const makeCtx = (overrides = {}) => {
            const ctx = {
                commentary: comment,
                distributeSavedPublicationCommentaryCommand: command,
                publicationCommentaryDistributionLog: log,
                identityUseCase: { provider: author },
                defaultCommentaryDistributionProvider: LOCAL_AND_PEERS_ONLY,
                defaultAnnouncementDiscoveryProvider: 'arweave',
                ...overrides
            };
            for (const [name, fn] of Object.entries(CommentaryNetworkDistribution.methods)) ctx[name] = fn.bind(ctx);
            Object.assign(ctx, CommentaryNetworkDistribution.data.call(ctx));
            return ctx;
        };

        const ctx = makeCtx();
        assert(ctx.selectedProvider === 'arweave', 'with a peers-only comment default, Distribute starts on the Announcement / Discovery network');
        assert(makeCtx({ defaultCommentaryDistributionProvider: 'steem' }).selectedProvider === 'steem', 'a network comment default is used');
        assert(ctx.isOwn() === true, 'it shows under the signed-in author\'s comment');
        assert(makeCtx({ identityUseCase: { provider: makeIdentity('someone-else') } }).isOwn() === false, 'never under someone else\'s');
        assert(makeCtx({ identityUseCase: { provider: null } }).isOwn() === false, 'nor when signed out');
        assert(makeCtx({ distributeSavedPublicationCommentaryCommand: null }).isOwn() === false, 'nor without the command');
        assert(ctx.statusText() === 'Not sent to any network from this device yet.', 'a comment with no record says so');

        ctx.openForm();
        await ctx.send();
        assert(calls.join() === 'arweave' && ctx.sentProvider === 'arweave' && ctx.open === false && ctx.error === null, 'Send sends to the chosen network and says so');
        assert(ctx.statusText() === 'Sent to Arweave from this device.', 'the status line lists it');
        ctx.openForm();
        assert(ctx.alreadySent() === true, 'a network it was already sent to is marked');
        await ctx.send();
        assert(calls.length === 1, 'and not sent to again');

        ctx.selectedProvider = 'nostr';
        await ctx.send();
        assert(ctx.statusText() === 'Sent to Nostr, Arweave from this device.', 'several networks are listed in a fixed order');

        outcome = new Error('relay https://relay.example.com refused');
        ctx.selectedProvider = 'blurt';
        await ctx.send();
        assert(ctx.error === 'Couldn\'t send the comment to Blurt: relay [redacted] refused' && ctx.sentProvider === null && ctx.sending === false,
            `a failure is shown with its reason, server names removed (got ${ctx.error})`);
        const { UserFacingError } = await import('../core/UserFacingError.js');
        const { message } = await import('../core/Message.js');
        outcome = new UserFacingError(message('commentaryNetworkDistribution.networkUnavailable', { network: 'Steem' }));
        ctx.selectedProvider = 'steem';
        await ctx.send();
        assert(ctx.error === 'Steem isn\'t set up on this device.', 'a refusal is shown in the app\'s words');

        const listened = makeCtx();
        CommentaryNetworkDistribution.mounted.call(listened);
        const before = listened.logVersion;
        log.record({ commentary: { commentaryId: 'other' }, substrate: 'nostr', result: { published: true } });
        log.record({ commentary: comment, substrate: 'steem', result: { published: true } });
        assert(listened.logVersion === before + 1, 'a late answer for this comment refreshes the status line; others don\'t');
        CommentaryNetworkDistribution.beforeUnmount.call(listened);
        log.record({ commentary: comment, substrate: 'blurt', result: { published: true } });
        assert(listened.logVersion === before + 1, 'an unmounted component stops listening');
        console.log('✓ the component shows where your comment went and sends it to a network on Send');
    }

    // The picker without Local & peers only.
    {
        const props = CommentaryDistributionPicker.props;
        assert(props.networksOnly && props.networksOnly.default === false, 'the picker offers Local & peers only unless told not to');
        console.log('✓ the picker has a networks-only mode for Distribute');
    }

    console.log('\n✅ All comment Distribute tests passed.');
}

await run();
