import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { AchievementKind, describeAchievementEvents } from '../application/AchievementEvent.js';
import { describeAchievementBadges, reconstructAchievementBadges } from '../application/AchievementBadgeView.js';

// 0.8.103 — Achievement Badge Presentation.
//
// Section A: an empty archive earns no badges
// Section B: badges reuse the achievement event's own achievementKind,
//            label (as title), and sourcePublicationIdentity verbatim —
//            never a second, competing vocabulary
// Section C: every badge carries a non-empty description and icon, and
//            AchievementKind stays a closed, six-value vocabulary
// Section D: sourceAnchorId — a Bitcoin badge's own navigation
//            convenience — names the exact originating record's anchorId;
//            a Base badge's sourceAnchorId is always null
// Section E: malformed/absent inputs never throw
// Section F: FLAGSHIP — two publications sharing one contentHash across
//            two chains, deliberately out-of-order createdAt timestamps
//            and interleaved array positions; badges stay attributed
//            correctly and repeated calls are byte-identical
// Section G: reconstructAchievementBadges() over a real, persisted
//            archive — reload equivalence, zero network access
// Section H: no verdict/score/points/rank vocabulary anywhere in a badge

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy',
    'completed', 'successful', 'final', 'points', 'rank', 'level', 'tier', 'worth'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a badge presents an achievement, it does not score one`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function withoutNetworkAccess(fn) {
    let networkCallOccurred = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
    try {
        return { result: await fn(), networkCallOccurred };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

function bitcoinRecord({ anchorId, contentHash, txid, network = 'mainnet', createdAt }) {
    return new BitcoinAnchorPublicationRecord({ anchorId, contentHash, txid, network, createdAt });
}

function baseRecord({ contentHash, txid, network = 'base-mainnet', createdAt }) {
    return new BaseAnchorPublicationRecord({ contentHash, txid, network, createdAt });
}

function kindsOf(result) {
    return result.badges.map((b) => b.achievementKind);
}

function serializeBadge(badge) {
    return {
        achievementKind: badge.achievementKind,
        title: badge.title,
        description: badge.description,
        icon: badge.icon,
        earnedAt: badge.earnedAt.toISOString(),
        sourcePublicationIdentity: badge.sourcePublicationIdentity.toJSON(),
        sourceAnchorId: badge.sourceAnchorId,
        index: badge.index
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — an empty archive earns no badges.
    // ---------------------------------------------------------------
    {
        const result = describeAchievementBadges([], []);
        assert(result.count === 0, '1. an empty pair of record arrays earns zero badges');
        assert(result.badges.length === 0, '2. badges is an empty array, never null or undefined');
        assert(Object.isFrozen(result) && Object.isFrozen(result.badges), '3. the result and its badges array are frozen');
    }
    console.log('✓ Section A: an empty archive earns no badges');

    // ---------------------------------------------------------------
    // Section B — badges reuse the achievement event's own vocabulary
    // verbatim, never a second, competing one.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'anchor-1', contentHash: 'h'.repeat(64), txid: 't'.repeat(64), createdAt: new Date('2026-01-01T00:00:00Z') });
        const events = describeAchievementEvents([btc], []);
        const badges = describeAchievementBadges([btc], []);

        assert(badges.count === events.count, '4. exactly one badge per achievement event');
        for (let i = 0; i < events.events.length; i++) {
            const event = events.events[i];
            const badge = badges.badges[i];
            assert(badge.achievementKind === event.achievementKind, '5. a badge\'s achievementKind is exactly its event\'s own — never renamed');
            assert(badge.title === event.label, '6. a badge\'s title is exactly its event\'s own label, verbatim — no second wording');
            assert(badge.earnedAt.getTime() === event.observedAt.getTime(), '7. earnedAt is exactly the event\'s own observedAt');
            assert(badge.sourcePublicationIdentity.sameAs(event.sourcePublicationIdentity), '8. sourcePublicationIdentity names the exact same publication identity the event carries — never reconstructed from contentHash, timestamps, or record position');
            assert(badge.index === event.index, '9. index is exactly the event\'s own index');
        }
    }
    console.log('✓ Section B: a badge reuses its achievement event\'s own achievementKind/title/earnedAt/sourcePublicationIdentity/index verbatim');

    // ---------------------------------------------------------------
    // Section C — every badge carries a description and icon, distinct
    // per achievement kind, and AchievementKind stays closed.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'anchor-c', contentHash: 'c'.repeat(64), txid: 'c'.repeat(64), createdAt: new Date('2026-01-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'd'.repeat(64), txid: 'd'.repeat(64), createdAt: new Date('2026-01-02T00:00:00Z') });
        const smallResult = describeAchievementBadges([btc], [base]);

        assert(smallResult.count > 0, '10. at least one badge is earned in this scenario');
        for (const badge of smallResult.badges) {
            assert(typeof badge.description === 'string' && badge.description.length > 0, '11. every badge carries a non-empty description');
            assert(typeof badge.icon === 'string' && badge.icon.length > 0, '12. every badge carries a non-empty icon');
            assert(Object.isFrozen(badge), '13. every badge is frozen');
        }
        assert(Object.keys(AchievementKind).length === 6, '14. AchievementKind still names exactly six values — this milestone invents no new achievement');

        // A scenario that earns all six achievement kinds at once: Base
        // publishes first, then 99 Bitcoin publications follow — the first
        // completes MULTI_CHAIN_PUBLISHER/BITCOIN_PUBLISHER, the tenth
        // blockchain publication overall crosses PUBLICATION_10, and the
        // hundredth crosses PUBLICATION_100.
        const dayMillis = 24 * 60 * 60 * 1000;
        const scenarioStart = new Date('2026-05-01T00:00:00Z').getTime();
        const ninetyNineBitcoinRecords = [];
        for (let i = 1; i <= 99; i++) {
            ninetyNineBitcoinRecords.push(bitcoinRecord({
                anchorId: `full-anchor-${i}`,
                contentHash: `full-content-${i}`,
                txid: `${i}`.padStart(64, '0'),
                createdAt: new Date(scenarioStart + i * dayMillis)
            }));
        }
        const base1 = baseRecord({ contentHash: 'full-base', txid: 'z'.repeat(64), createdAt: new Date(scenarioStart) });
        const fullResult = describeAchievementBadges(ninetyNineBitcoinRecords, [base1]);

        assert(fullResult.count === 6, '15. this scenario earns exactly one badge per achievement kind');
        const seenKinds = new Set(fullResult.badges.map((b) => b.achievementKind));
        assert(seenKinds.size === 6, '16. every one of the six AchievementKind values earns exactly one badge here');

        // Every kind's own title and description are distinct from every
        // other kind's own — this file's own vocabulary never falls back
        // to a shared default for two different achievements.
        const titles = new Set(fullResult.badges.map((b) => b.title));
        const descriptions = new Set(fullResult.badges.map((b) => b.description));
        const icons = new Set(fullResult.badges.map((b) => b.icon));
        assert(titles.size === 6, '17. every badge\'s own title is distinct — no two achievement kinds share a title');
        assert(descriptions.size === 6, '18. every badge\'s own description is distinct — no two achievement kinds share a description');
        assert(icons.size === 6, '19. every badge\'s own icon is distinct — no two achievement kinds share an icon');
    }
    console.log('✓ Section C: every badge carries a distinct description and icon per kind, and AchievementKind stays a closed, six-value vocabulary');

    // ---------------------------------------------------------------
    // Section D — sourceAnchorId: a Bitcoin badge names its exact
    // originating record's own anchorId; a Base badge's is always null.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'the-real-anchor-id', contentHash: 'e'.repeat(64), txid: 'e'.repeat(64), createdAt: new Date('2026-02-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'f'.repeat(64), txid: 'f'.repeat(64), createdAt: new Date('2026-02-02T00:00:00Z') });
        const result = describeAchievementBadges([btc], [base]);

        const bitcoinPublisherBadge = result.badges.find((b) => b.achievementKind === AchievementKind.BITCOIN_PUBLISHER);
        assert(bitcoinPublisherBadge.sourceAnchorId === 'the-real-anchor-id', '20. a Bitcoin badge\'s sourceAnchorId names the exact originating record\'s own anchorId');

        const basePublisherBadge = result.badges.find((b) => b.achievementKind === AchievementKind.BASE_PUBLISHER);
        assert(basePublisherBadge.sourceAnchorId === null, '21. a Base badge\'s sourceAnchorId is always null');

        // MULTI_CHAIN_PUBLISHER is attributed to whichever record completed
        // the pair — here, base (chronologically second) — so its own
        // sourceAnchorId must be null too, never borrowed from the OTHER chain.
        const multiChainBadge = result.badges.find((b) => b.achievementKind === AchievementKind.MULTI_CHAIN_PUBLISHER);
        assert(multiChainBadge.sourceAnchorId === null, '22. MULTI_CHAIN_PUBLISHER here is attributed to the Base record, so sourceAnchorId is null, never the Bitcoin anchorId');

        // A Bitcoin record absent from the array passed in never yields a
        // fabricated sourceAnchorId — no match, no guess.
        const orphanBadges = describeAchievementBadges([], [base]);
        for (const badge of orphanBadges.badges) {
            assert(badge.sourceAnchorId === null, '23. with no Bitcoin records at all, every badge\'s sourceAnchorId is null');
        }
    }
    console.log('✓ Section D: sourceAnchorId names the exact originating Bitcoin record, is null for Base, and is never fabricated');

    // ---------------------------------------------------------------
    // Section E — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        assert(describeAchievementBadges().count === 0, '24. no arguments at all never throws, returns zero badges');
        assert(describeAchievementBadges(null, undefined).count === 0, '25. null/undefined arguments never throw');
        assert(describeAchievementBadges('not-an-array', 42).count === 0, '26. non-array arguments never throw');
        assert(describeAchievementBadges([{ fake: true }, null, 'x'], [{}]).count === 0, '27. arrays holding non-record garbage silently exclude the garbage rather than throwing');
        assert(reconstructAchievementBadges(null).count === 0, '28. a null archive reconstructs to zero badges, never throws');
        assert(reconstructAchievementBadges({}).count === 0, '29. a plain object masquerading as an archive reconstructs to zero badges');
    }
    console.log('✓ Section E: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: two publications, one shared contentHash,
    // two chains, deliberately out-of-order timestamps and interleaved
    // array positions.
    // ---------------------------------------------------------------
    {
        const SHARED_CONTENT_HASH = 'shared-content-hash';
        const btcLater = bitcoinRecord({ anchorId: 'flag-btc-anchor', contentHash: SHARED_CONTENT_HASH, txid: 'f'.repeat(64), createdAt: new Date('2026-02-10T00:00:00Z') });
        const baseEarlier = baseRecord({ contentHash: SHARED_CONTENT_HASH, txid: 'f'.repeat(64), createdAt: new Date('2026-02-01T00:00:00Z') });

        const result1 = describeAchievementBadges([btcLater], [baseEarlier]);

        assert(result1.badges[0].achievementKind === AchievementKind.FIRST_PUBLICATION, '30. FIRST_PUBLICATION is attributed chronologically, not by argument or array position');
        assert(result1.badges[0].sourcePublicationIdentity.sameAs(baseEarlier.toBlockchainPublicationIdentity()), '31. FIRST_PUBLICATION belongs to baseEarlier, the chronologically first record');
        assert(result1.badges[0].sourceAnchorId === null, '32. FIRST_PUBLICATION here is a Base badge, so sourceAnchorId is null');

        const multiChainBadge = result1.badges.find((b) => b.achievementKind === AchievementKind.MULTI_CHAIN_PUBLISHER);
        assert(multiChainBadge.sourcePublicationIdentity.sameAs(btcLater.toBlockchainPublicationIdentity()), '33. MULTI_CHAIN_PUBLISHER belongs to btcLater — the record that chronologically completed the pair');
        assert(multiChainBadge.sourcePublicationIdentity.blockchain === BlockchainKind.BITCOIN, '34. its identity correctly names BITCOIN, never BASE, despite the identical raw chainReference string');
        assert(multiChainBadge.sourceAnchorId === 'flag-btc-anchor', '35. its sourceAnchorId correctly names btcLater\'s own anchorId, never baseEarlier\'s (which has none)');

        const result2 = describeAchievementBadges([btcLater], [baseEarlier]);
        assert(JSON.stringify(result1.badges.map(serializeBadge)) === JSON.stringify(result2.badges.map(serializeBadge)), '36. repeated calls on identical input produce byte-identical output');

        assertNeverScored(result1, 'flagship');
    }
    console.log('✓ Section F: FLAGSHIP — chronological correctness, cross-chain identity and anchorId never conflated, deterministic repeated projection');

    // ---------------------------------------------------------------
    // Section G — reconstructAchievementBadges() over a real, persisted
    // archive.
    // ---------------------------------------------------------------
    {
        const provider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(provider);

        const btc = bitcoinRecord({ anchorId: 'g-anchor', contentHash: 'g-content', txid: 'h'.repeat(64), createdAt: new Date('2026-03-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'g-content-2', txid: 'g'.repeat(64), createdAt: new Date('2026-03-02T00:00:00Z') });

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinAnchorPublicationRecord(btc);
        archive = archive.appendBaseAnchorPublicationRecord(base);

        const { result: liveResult, networkCallOccurred } = await withoutNetworkAccess(() => reconstructAchievementBadges(archive));
        assert(networkCallOccurred === false, '37. reconstructAchievementBadges() performs zero network access');
        assert(liveResult.count === 4, '38. live archive earns FIRST_PUBLICATION, BITCOIN_PUBLISHER, BASE_PUBLISHER, and MULTI_CHAIN_PUBLISHER');

        persistence.save(archive);
        const restored = persistence.load();
        const reconstructed = reconstructAchievementBadges(restored);
        assert(JSON.stringify(reconstructed.badges.map(serializeBadge)) === JSON.stringify(liveResult.badges.map(serializeBadge)), '39. reload equivalence: a restored archive projects byte-identical badges to the live one it was saved from');

        persistence.save(restored);
        const reloadedAgain = persistence.load();
        const rereadResult = reconstructAchievementBadges(reloadedAgain);
        assert(JSON.stringify(rereadResult.badges.map(serializeBadge)) === JSON.stringify(liveResult.badges.map(serializeBadge)), '40. a second save/load cycle remains equivalent');

        assertNeverScored(liveResult, 'liveResult');
    }
    console.log('✓ Section G: reconstructAchievementBadges() — reload equivalence, zero network access');

    // ---------------------------------------------------------------
    // Section H — no verdict/score/points/rank vocabulary anywhere.
    // ---------------------------------------------------------------
    {
        const btc = bitcoinRecord({ anchorId: 'h-anchor', contentHash: 'h-content', txid: 'i'.repeat(64), createdAt: new Date('2026-04-01T00:00:00Z') });
        const base = baseRecord({ contentHash: 'h-content-2', txid: 'j'.repeat(64), createdAt: new Date('2026-04-02T00:00:00Z') });
        const result = describeAchievementBadges([btc], [base]);
        assertNeverScored(result, 'noVerdictResult');
    }
    console.log('✓ Section H: no verdict/score/points/rank vocabulary anywhere in a badge');

    console.log('\nAll AchievementBadgeView tests passed.');
}

run().catch((error) => {
    console.error('AchievementBadgeView.test.js FAILED:', error);
    process.exitCode = 1;
});
