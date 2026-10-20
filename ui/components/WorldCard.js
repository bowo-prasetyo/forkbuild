import PublicationPreview from './PublicationPreview.js';
import { CameraPerspective } from '../../core/avatar/CameraPerspective.js';
import { relativeVisitText } from '../i18n/dateText.js';
import { t } from '../i18n/i18n.js';

const PERSPECTIVE_KEYS = {
    [CameraPerspective.FIRST_PERSON]: 'worldCard.perspective.firstPerson',
    [CameraPerspective.THIRD_PERSON]: 'worldCard.perspective.thirdPerson',
    [CameraPerspective.BIRD_EYE]: 'worldCard.perspective.birdEye'
};

// 0.3.10 — World Persistence & Return Experience.
//
// One previously-visited World, in card form — the "World Card" concept
// from the milestone's own design conversation. Pure presentation, the
// same "host resolves, component renders/emits" split
// ui/components/PublicationCard.js already established for the
// Repository catalog: every field on `world` is resolved by the host
// (ui/views/RecentWorldsView.js) BEFORE this component ever sees it —
// this file never calls a use case, a discovery provider, or
// WorldNavigationSession itself.
//
// `world` is deliberately NOT a Publication (core/... has no "recently
// visited" concept at all) — it's a plain summary object combining two
// things that must never be confused with each other:
//   - CURRENT World content (title, author, structureCount,
//     landmarkCount) — freshly re-derived from the document every time
//     this card renders, never cached beyond that.
//   - THIS replica's own local visit history (lastVisitedAt,
//     cameraPerspective) — from core/world/LocalWorldExperience.js, and
//     NOTHING else's.
// See docs/Principles.md, "Personal Experience Is Not Shared World
// State (0.3.10)." Deliberately excludes anything requiring a live
// connection to a World this replica isn't currently in (online
// collaborator count, who's building right now) — that data simply
// isn't honestly available for a World that isn't the active one; see
// RecentWorldsView.js's own header for why this card never fakes it.
//
// It shows the World's content as a Publication Card does: its thumbnail
// (`world.preview`, the Publication it was found as, or just its id and
// title for a World never published, which PublicationPreview draws as
// its placeholder) and the start of its description, from the same local
// copy as the counts. The visit line is set apart below them, as the one thing
// here that is about this replica rather than the World. `featured` is
// My Worlds' "Pick up where you left off": the same card, laid out wider.
export default {
    name: 'WorldCard',
    components: { PublicationPreview },
    props: {
        world: { type: Object, required: true },
        featured: { type: Boolean, default: false }
    },
    emits: ['enter', 'open'],
    computed: {
        statsParts() {
            const parts = [];
            if (typeof this.world.structureCount === 'number') {
                parts.push(t('worldCard.structures', { count: this.world.structureCount }));
            }
            if (typeof this.world.landmarkCount === 'number') {
                parts.push(t('worldCard.landmarks', { count: this.world.landmarkCount }));
            }
            return parts;
        },
        lastVisitedLabel() {
            return relativeVisitText(this.world.lastVisitedAt);
        },
        perspectiveLabel() {
            return PERSPECTIVE_KEYS[this.world.cameraPerspective] ? t(PERSPECTIVE_KEYS[this.world.cameraPerspective]) : null;
        }
    },
    methods: { t },
    // The thumbnail enters the World too, as a pointer shortcut only: the
    // Continue Exploring button is the one way in for keyboards and
    // screen readers, so it is left out of both.
    template: `
        <li :class="['publication-card', 'world-card', { 'world-card--featured': featured }]">
            <router-link
                class="world-card-thumbnail"
                :to="'/world/' + world.documentId"
                tabindex="-1"
                aria-hidden="true"
            ><PublicationPreview :publication="world.preview" size="card" /></router-link>
            <div class="world-card-body">
                <h3>{{ world.title }}</h3>
                <p v-if="world.author" class="publication-meta">{{ t('forkTree.byAuthor', { author: world.author }) }}</p>
                <p v-if="world.description" class="publication-description">{{ world.description }}</p>
                <p v-if="statsParts.length" class="publication-meta">{{ statsParts.join(' · ') }}</p>
                <p v-if="lastVisitedLabel || perspectiveLabel" class="publication-date world-card-visit">
                    <svg class="world-card-visit-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <span><span v-if="lastVisitedLabel">{{ t('worldCard.lastVisited', { when: lastVisitedLabel }) }}</span><span v-if="perspectiveLabel" class="world-card-perspective"><template v-if="lastVisitedLabel"> · </template>{{ t('worldCard.leftInView', { perspective: perspectiveLabel }) }}</span></span>
                </p>
                <div class="publication-actions">
                    <button class="action-btn action-btn--explore" @click="$emit('enter', world.documentId)">{{ t('worldCard.continueExploring') }}</button>
                    <button v-if="world.hasLocalCopy" class="action-btn action-btn--secondary world-card-open" :title="t('worldCard.openInEditor')" @click="$emit('open', world.documentId)">{{ t('worldCard.open') }}</button>
                </div>
            </div>
        </li>
    `
};
