import { computed, inject, ref } from 'vue';
import { challengeById } from '../../../core/BuildChallenge.js';
import { PLAZA_CENTER, PLAZA_MAX_EXHIBITS, plazaEntryOrder } from '../../../core/ChallengePlaza.js';
import { PLAZA_QUIET_RADIUS, plazaEntrySpots } from '../../../core/PlazaEntrySpots.js';
import { CreateChallengeEntriesUseCase } from '../../../application/challenge/CreateChallengeEntriesUseCase.js';
import { OpenPublicationLinkOutcome } from '../../../application/publication/OpenPublicationLink.js';
import { readSharedBuildDocument } from '../../../application/publication/sharing/ReadSharedBuild.js';
import { exploreRouteFor } from '../../components/publicationCatalog/useRepositoryNetworkDiscovery.js';
import { challengeThemeTitle } from '../../components/challenge/challengeText.js';
import { t } from '../../i18n/i18n.js';

// The challenge plaza (core/ChallengePlaza.js), when World View opens on
// `/plaza/<week>`: takes the visitor to the village square
// (useStarterVillage.js, standing in every World View), and lists the
// week's entries and the village's ready-made builds. Only that week's
// entries stand round the square (core/PlazaEntrySpots.js): where it is
// placed, for one placed there while builds still settled round the plaza;
// otherwise, placed elsewhere (published builds take their spot on the
// id-keyed grid) or not at all, it is shown, as an exhibit, on the spot it
// would settle on round the square (core/BuildSettlement.js). Other placed
// builds near the square are left out of World View while the plaza is
// visited (session.setPlazaQuiet()), so the square shows its week alone. An
// entry's build is read from this device, or fetched and checked the way
// opening its link would (application/publication/OpenPublicationLink.js);
// an entry whose publisher chose "Only I may place it" is left to the
// challenge page, since standing it here would be placing it. Exhibits are
// never placements, and nothing left out is touched: all is as before when
// the visitor leaves.
export function useChallengePlaza({ route, router, session, refreshSpatialUI, village = null }) {
    const challengeId = route.name === 'plaza' ? String(route.params.challengeId || '') : null;
    const challenge = challengeId ? challengeById(challengeId) : null;
    const contentStore = inject('publicationContentStore', null);
    const openLink = inject('openPublicationLink', null);
    const entryDiscovery = inject('challengeEntryDiscovery', null);
    const neighbourDiscovery = inject('repositoryNetworkDiscovery', null);
    const funnel = inject('funnelEventCounter', null);
    const networkPublicationLocatorStore = inject('networkPublicationLocatorStore', null);
    const { listEntries } = new CreateChallengeEntriesUseCase().execute({
        decentralizedDiscoveryProvider: inject('decentralizedPublicationDiscoveryProvider', null),
        entryLog: inject('challengeEntryLog', null)
    });

    // null outside a plaza; otherwise what its panel shows.
    const plaza = ref(challengeId === null ? null : {
        found: Boolean(challenge),
        title: challenge ? challengeThemeTitle(challenge) : '',
        tag: challenge ? challenge.tag : '',
        challengeRoute: challenge ? { path: `/challenge/${challenge.id}` } : { path: '/challenge' },
        loading: Boolean(challenge),
        exhibits: [],
        readyMades: [],
        fetching: 0,
        unavailable: 0,
        notPlaceable: 0,
        beyond: 0,
        max: PLAZA_MAX_EXHIBITS
    });
    const inPlaza = computed(() => plaza.value !== null);

    // documentId -> { publication, world, title, author } once read; null when it can't be.
    const builds = new Map();
    const shown = new Map();
    let active = false;

    // Where each of the week's entries this device knows a placement for
    // stands: publication id -> position. Other builds are left out of the
    // square, so they take no spot in it.
    function knownPlacements(entryIds) {
        const byPublication = new Map();
        try {
            for (const placement of session.listKnownPlacements() || []) {
                if (entryIds.has(placement.publicationId) && !byPublication.has(placement.publicationId)) byPublication.set(placement.publicationId, placement.position);
            }
        } catch {
            // Every entry is then shown where it would settle.
        }
        return byPublication;
    }

    function isPlaceable(publication) {
        try {
            return session.getPublicationPlacementPermission(publication).allowed !== false;
        } catch {
            return true;
        }
    }

    async function readBuild(publication) {
        let document = await readSharedBuildDocument({ publication, contentStore });
        if (!document && openLink && networkPublicationLocatorStore) {
            const locator = networkPublicationLocatorStore.get(publication.id);
            if (locator) {
                try {
                    const result = await openLink({ locator });
                    if (result?.outcome === OpenPublicationLinkOutcome.OPENED) {
                        document = await readSharedBuildDocument({ publication, contentStore });
                    }
                } catch {
                    document = null;
                }
            }
        }
        return document ? {
            publication,
            world: document.world,
            title: document.metadata.title || t('worldView.untitled'),
            author: document.metadata.author || publication.author || null
        } : null;
    }

    // Redraws the entries from what is read so far, in plaza order: one this
    // device knows a placement for stands there already; any other is shown
    // on the spot it would settle on, clear of the placements and of the
    // entries shown before it.
    function arrange(candidates, { settled }) {
        const ready = [];
        let unavailable = 0;
        let fetching = 0;
        for (const publication of candidates) {
            if (ready.length >= PLAZA_MAX_EXHIBITS) break;
            if (!builds.has(publication.documentId)) {
                fetching += 1;
                continue;
            }
            const build = builds.get(publication.documentId);
            if (build) ready.push(build);
            else unavailable += 1;
        }
        const spots = new Map(plazaEntrySpots(
            ready.map((build) => ({ key: build.publication.documentId, publicationId: build.publication.id })),
            { placedAt: knownPlacements(new Set(candidates.map((publication) => publication.id))), seed: session.getWorldSeed?.() }
        ).map((spot) => [spot.key, spot]));

        for (const [key, position] of Array.from(shown.entries())) {
            const next = spots.get(key);
            if (!next || next.placed || next.position.x !== position.x || next.position.z !== position.z) {
                session.hidePlazaExhibit(key);
                shown.delete(key);
            }
        }
        const exhibits = [];
        for (const build of ready) {
            const key = build.publication.documentId;
            const spot = spots.get(key);
            if (!spot) continue;
            if (!spot.placed && !shown.has(key)) {
                session.showPlazaExhibit(key, build.world, spot.position);
                shown.set(key, spot.position);
            }
            const footprint = session.measurePlazaFootprint(build.world);
            exhibits.push(Object.freeze({
                key,
                publication: build.publication,
                title: build.title,
                author: build.author,
                middle: Object.freeze({
                    x: spot.position.x + (footprint.minX + footprint.maxX) / 2,
                    y: spot.position.y || 0,
                    z: spot.position.z + (footprint.minZ + footprint.maxZ) / 2
                })
            }));
        }
        const beyond = Math.max(0, candidates.length - ready.length - unavailable - fetching);
        const readyMades = village ? village.villageReadyMades() : [];
        plaza.value = { ...plaza.value, loading: !settled, exhibits, readyMades, fetching: settled ? 0 : fetching, unavailable, beyond };
        refreshSpatialUI();
    }

    // Leaves out of World View the placed builds near the square that aren't
    // among `entries`, the week's (all of them: one asking not to be placed
    // by others still stands where its publisher put it).
    function quietSquare(entries) {
        session.setPlazaQuiet({ center: PLAZA_CENTER, radius: PLAZA_QUIET_RADIUS, keep: entries.map((publication) => publication.documentId) });
        session.updateSpatialView();
    }

    // Reads every entry not read yet, one at a time, redrawing as each arrives.
    async function load() {
        const ordered = plazaEntryOrder(listEntries(challenge.tag));
        quietSquare(ordered);
        const candidates = ordered.filter(isPlaceable);
        plaza.value = { ...plaza.value, notPlaceable: ordered.length - candidates.length };
        arrange(candidates, { settled: false });
        let standing = candidates.filter((publication) => builds.get(publication.documentId)).length;
        for (const publication of candidates) {
            if (!active || standing >= PLAZA_MAX_EXHIBITS) break;
            if (builds.has(publication.documentId)) continue;
            const build = await readBuild(publication);
            if (!active) return;
            builds.set(publication.documentId, build);
            if (build) standing += 1;
            arrange(candidates, { settled: false });
        }
        if (active) arrange(candidates, { settled: true });
    }

    // Called once World View has started: goes to the plaza, stands what this
    // device knows, then asks the networks for more and stands those too.
    async function enterPlaza() {
        if (!challenge) return false;
        active = true;
        quietSquare([]);
        session.visitPosition(PLAZA_CENTER);
        funnel?.visitedPlaza();
        await load();
        if (!active || !entryDiscovery) return true;
        const result = await entryDiscovery.run(challenge.tag);
        if (active && result.found > 0) await load();
        // The builds others sent to everyone, so they stand where their
        // builders put them (those near the square are still left out).
        if (active && neighbourDiscovery) {
            try {
                const found = await neighbourDiscovery.run();
                if (active && found.admitted.length > 0) refreshSpatialUI();
            } catch {
                // The village fills in on a later visit.
            }
        }
        return true;
    }

    function leavePlaza() {
        active = false;
        for (const key of Array.from(shown.keys())) session.hidePlazaExhibit(key);
        shown.clear();
        session.setPlazaQuiet(null);
    }

    function backToPlaza() {
        if (challenge) session.visitPosition(PLAZA_CENTER);
        refreshSpatialUI();
    }

    function focusExhibit(exhibit) {
        if (exhibit && session.focusPosition(exhibit.middle)) refreshSpatialUI();
    }

    function openExhibit(exhibit) {
        if (exhibit?.publication) router.push(exploreRouteFor(exhibit.publication, networkPublicationLocatorStore));
    }

    function remixExhibit(exhibit) {
        if (!exhibit) return;
        if (exhibit.readyMadeId) {
            router.push({ path: '/editor', query: { start: exhibit.readyMadeId } });
            return;
        }
        router.push({ path: '/editor', query: { fork: exhibit.publication.documentId, publication: exhibit.publication.id } });
    }

    return { plaza, inPlaza, enterPlaza, leavePlaza, backToPlaza, focusExhibit, openExhibit, remixExhibit };
}
