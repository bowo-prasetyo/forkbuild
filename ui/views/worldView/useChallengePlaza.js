import { computed, inject, ref } from 'vue';
import { challengeById } from '../../../core/BuildChallenge.js';
import { PLAZA_CENTER, PLAZA_MAX_EXHIBITS, layoutPlazaExhibits, plazaEntryOrder } from '../../../core/ChallengePlaza.js';
import { CreateChallengeEntriesUseCase } from '../../../application/challenge/CreateChallengeEntriesUseCase.js';
import { OpenPublicationLinkOutcome } from '../../../application/publication/OpenPublicationLink.js';
import { readSharedBuildDocument } from '../../../application/publication/sharing/ReadSharedBuild.js';
import { exploreRouteFor } from '../../components/publicationCatalog/useRepositoryNetworkDiscovery.js';
import { challengeThemeTitle } from '../../components/challenge/challengeText.js';
import { t } from '../../i18n/i18n.js';

// The challenge plaza (core/ChallengePlaza.js), when World View opens on
// `/plaza/<week>`: takes the visitor there, and stands the week's entries
// round it as exhibits. An entry's build is read from this device, or
// fetched and checked the way opening its link would
// (application/publication/OpenPublicationLink.js); an entry whose publisher
// chose "Only I may place it" is left to the challenge page, since standing
// it here would be placing it. Exhibits are never placements: they are gone
// when the visitor leaves.
export function useChallengePlaza({ route, router, session, refreshSpatialUI }) {
    const challengeId = route.name === 'plaza' ? String(route.params.challengeId || '') : null;
    const challenge = challengeId ? challengeById(challengeId) : null;
    const contentStore = inject('publicationContentStore', null);
    const openLink = inject('openPublicationLink', null);
    const entryDiscovery = inject('challengeEntryDiscovery', null);
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

    // Redraws the exhibits from what is read so far, in plaza order.
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
        const footprints = ready.map((build) => ({ key: build.publication.documentId, footprint: session.measurePlazaFootprint(build.world) }));
        const positions = new Map(layoutPlazaExhibits(footprints).map(({ key, position }) => [key, position]));
        const footprintOf = new Map(footprints.map(({ key, footprint }) => [key, footprint]));

        for (const [key, position] of Array.from(shown.entries())) {
            const next = positions.get(key);
            if (!next || next.x !== position.x || next.z !== position.z) {
                session.hidePlazaExhibit(key);
                shown.delete(key);
            }
        }
        const exhibits = [];
        for (const build of ready) {
            const key = build.publication.documentId;
            const position = positions.get(key);
            if (!shown.has(key)) {
                session.showPlazaExhibit(key, build.world, position);
                shown.set(key, position);
            }
            const footprint = footprintOf.get(key);
            exhibits.push(Object.freeze({
                key,
                publication: build.publication,
                title: build.title,
                author: build.author,
                middle: Object.freeze({
                    x: position.x + (footprint.minX + footprint.maxX) / 2,
                    y: position.y,
                    z: position.z + (footprint.minZ + footprint.maxZ) / 2
                })
            }));
        }
        const beyond = Math.max(0, candidates.length - ready.length - unavailable - fetching);
        plaza.value = { ...plaza.value, loading: !settled, exhibits, fetching: settled ? 0 : fetching, unavailable, beyond };
        refreshSpatialUI();
    }

    // Reads every entry not read yet, one at a time, redrawing as each arrives.
    async function load() {
        const ordered = plazaEntryOrder(listEntries(challenge.tag));
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
        session.visitPosition(PLAZA_CENTER);
        funnel?.visitedPlaza();
        await load();
        if (!active || !entryDiscovery) return true;
        const result = await entryDiscovery.run(challenge.tag);
        if (active && result.found > 0) await load();
        return true;
    }

    function leavePlaza() {
        active = false;
        for (const key of Array.from(shown.keys())) session.hidePlazaExhibit(key);
        shown.clear();
    }

    function backToPlaza() {
        if (challenge) session.visitPosition(PLAZA_CENTER);
        refreshSpatialUI();
    }

    function focusExhibit(exhibit) {
        if (exhibit && session.focusPosition(exhibit.middle)) refreshSpatialUI();
    }

    function openExhibit(exhibit) {
        if (exhibit) router.push(exploreRouteFor(exhibit.publication, networkPublicationLocatorStore));
    }

    function remixExhibit(exhibit) {
        if (exhibit) router.push({ path: '/editor', query: { fork: exhibit.publication.documentId, publication: exhibit.publication.id } });
    }

    return { plaza, inPlaza, enterPlaza, leavePlaza, backToPlaza, focusExhibit, openExhibit, remixExhibit };
}
