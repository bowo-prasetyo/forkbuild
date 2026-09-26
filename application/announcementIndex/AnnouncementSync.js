import { syncNostrTag } from './NostrTagSync.js';
import { syncArweaveTag } from './ArweaveTagSync.js';

// Brings one sync target up to date on every substrate at once: each Nostr
// relay and the Arweave gateway page with their own cursor, and Steem, whose
// reader already reads every month back to its configured start, is read
// whole (docs/AnnouncementIndex.md, "Phase 3"). One substrate failing never
// stops the others; each reports its own outcome.
export class AnnouncementSync {
    // nostr: { queryImpl, relayUrls } or null. arweave: { fetchImpl?,
    // graphqlUrl?, gatewayUrl? } or null. pageSize/maxPages apply per
    // endpoint and run.
    constructor({ cursorStore, nostr = null, arweave = null, pageSize, maxPages, timeoutMs } = {}) {
        if (!cursorStore) throw new Error('AnnouncementSync: a cursor store is required');
        this._cursorStore = cursorStore;
        this._nostr = nostr && typeof nostr.queryImpl === 'function' && Array.isArray(nostr.relayUrls) ? nostr : null;
        this._arweave = arweave;
        this._limits = Object.fromEntries(Object.entries({ pageSize, maxPages, timeoutMs }).filter(([, value]) => value !== undefined));
    }

    async sync(target) {
        const runs = [];
        if (this._nostr) {
            for (const relayUrl of this._nostr.relayUrls) {
                runs.push(['nostr', relayUrl, () => syncNostrTag({
                    queryImpl: this._nostr.queryImpl, relayUrl, target, cursorStore: this._cursorStore, ...this._limits
                })]);
            }
        }
        if (this._arweave) {
            runs.push(['arweave', this._arweave.gatewayUrl || null, () => syncArweaveTag({
                ...this._arweave, target, cursorStore: this._cursorStore, ...this._limits
            })]);
        }
        if (typeof target.steem === 'function') {
            runs.push(['steem', null, async () => {
                const results = await target.steem();
                const list = Array.isArray(results) ? results : [];
                if (list.length > 0) target.consume(list, 'steem');
                return { pages: 1, received: list.length, caughtUp: true, backfillDone: true };
            }]);
        }

        const settled = await Promise.allSettled(runs.map(([, , run]) => Promise.resolve().then(run)));
        return {
            target: target.id,
            substrates: settled.map((outcome, i) => ({
                substrate: runs[i][0],
                endpoint: runs[i][1],
                ...(outcome.status === 'fulfilled'
                    ? { ok: true, ...outcome.value }
                    : { ok: false, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) })
            }))
        };
    }
}
