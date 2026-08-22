import { CameraPerspective } from '../../core/CameraPerspective.js';
import { formatRelativeVisit } from '../../utils/formatRelativeVisit.js';

const PERSPECTIVE_LABELS = {
    [CameraPerspective.FIRST_PERSON]: 'First Person',
    [CameraPerspective.THIRD_PERSON]: 'Third Person',
    [CameraPerspective.BIRD_EYE]: "Bird's-Eye"
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
//     cameraPerspective) — from core/LocalWorldExperience.js, and
//     NOTHING else's.
// See docs/Principles.md, "Personal Experience Is Not Shared World
// State (0.3.10)." Deliberately excludes anything requiring a live
// connection to a World this replica isn't currently in (online
// collaborator count, who's building right now) — that data simply
// isn't honestly available for a World that isn't the active one; see
// RecentWorldsView.js's own header for why this card never fakes it.
export default {
    name: 'WorldCard',
    props: {
        world: { type: Object, required: true }
    },
    emits: ['enter'],
    computed: {
        statsParts() {
            const parts = [];
            if (typeof this.world.structureCount === 'number') {
                parts.push(`${this.world.structureCount} structure${this.world.structureCount !== 1 ? 's' : ''}`);
            }
            if (typeof this.world.landmarkCount === 'number') {
                parts.push(`${this.world.landmarkCount} landmark${this.world.landmarkCount !== 1 ? 's' : ''}`);
            }
            return parts;
        },
        lastVisitedLabel() {
            return formatRelativeVisit(this.world.lastVisitedAt);
        },
        perspectiveLabel() {
            return this.world.cameraPerspective ? (PERSPECTIVE_LABELS[this.world.cameraPerspective] || null) : null;
        }
    },
    template: `
        <li class="publication-card world-card">
            <h3>{{ world.title }}</h3>
            <p v-if="world.author" class="publication-meta">by {{ world.author }}</p>
            <p v-if="statsParts.length" class="publication-meta">{{ statsParts.join(' · ') }}</p>
            <p v-if="lastVisitedLabel || perspectiveLabel" class="publication-date world-card-visit">
                <span v-if="lastVisitedLabel">Last visited {{ lastVisitedLabel }}</span><span v-if="perspectiveLabel" class="world-card-perspective"> · left in {{ perspectiveLabel }} view</span>
            </p>
            <div class="publication-actions">
                <button class="action-btn action-btn--explore" @click="$emit('enter', world.documentId)">Continue Exploring</button>
            </div>
        </li>
    `
};
