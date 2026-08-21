// 0.2.99 — World Collaboration UX.
//
// The Members panel the design conversation asked for: a read-only
// reflection of 0.2.98's own membership + presence model, joined by
// ui/components/WorldCollaborationRoster.js#buildWorldCollaborationRoster()
// into one row per participating identity — never a second,
// independent accounting of who may edit this World. See that file's
// own header for the full application-to-UI composition story, and
// docs/Principles.md, "The UI Displays Authorization; It Never Decides
// It (0.2.99)."
//
// Grant/Revoke here are pure AFFORDANCES: this component itself never
// decides whether a click is allowed — `row.canManage` (already
// computed by buildWorldCollaborationRoster() from `isWorldOwner()`)
// only controls whether the BUTTON is offered at all. The real gate is
// application/WorldMembershipUseCase.js#grantEdit()/revokeEdit(),
// re-verified fresh the moment the host view's own handler calls it —
// exactly the same "UI affordance -> application authorization ->
// signed membership operation" chain 0.2.95 through 0.2.98 already
// established for every OTHER World mutation. A UI-level attempt that
// somehow bypassed `canManage` entirely (a forged click, a direct call)
// would still be refused there, unchanged.
//
// Presence is rendered exactly the way 0.2.98's own header insists on:
// online/offline and access level are two INDEPENDENT facts, never
// merged into one — "Bob · Editor · Online" and "Bob · Editor ·
// Offline" both are perfectly sensible states, and revoking Bob never
// touches his online/device-count badge (see WorldCollaborationRoster's
// own header on why a row's `online`/`deviceCount` and `access` are
// computed from two completely separate sources).
//
// Device aggregation matches the design conversation's own example
// directly: `deviceCount` is per ROW (one identity), never one row per
// device — "Bob · 2 devices," never "Bob's Laptop"/"Bob's Tablet" as
// two independent people. That aggregation already happened one layer
// down, in application/WorldPresenceUseCase.js#getRoster() (0.2.98);
// this component only ever renders the number it's handed.
import { WorldCollaborationAccess } from './WorldCollaborationRoster.js';

export default {
    name: 'WorldMembersPanel',
    props: {
        // Array<{ identityId, displayName, access, online, deviceCount,
        // activity, canManage }> — buildWorldCollaborationRoster()'s
        // own rows, each enriched with a `displayName` the host view
        // resolves (alias, then a short identityId — a presentation
        // concern, never this component's own to decide; see
        // ui/views/WorldView.js's own resolveIdentityDisplayName()).
        roster: {
            type: Array,
            default: () => []
        },
        // Whether the CURRENT viewer may grant a NEW identity at all —
        // mirrors `row.canManage` but for the "Grant Edit to..." form,
        // which has no existing row to attach a per-row flag to.
        isOwner: {
            type: Boolean,
            default: false
        },
        // identityId currently mid-grant/mid-revoke, or null — drives
        // the transient "Granting…"/"Revoking…" row state the design
        // conversation asked for (see docs/Roadmap.md, 0.2.99, "Give
        // Membership Changes Visible Feedback"). Purely presentational:
        // the host view sets/clears this around its own grant/revoke
        // call, this component never mutates it.
        pendingIdentityId: {
            type: String,
            default: null
        }
    },
    emits: ['grant', 'revoke', 'cancel'],
    data() {
        return {
            newSubjectId: ''
        };
    },
    methods: {
        accessLabel(access) {
            if (access === WorldCollaborationAccess.OWNER) return 'Owner';
            if (access === WorldCollaborationAccess.EDITOR) return 'Editor';
            return 'Read only';
        },
        activityLabel(activity) {
            return activity === 'editing' ? 'Editing' : 'Exploring';
        },
        submitGrant() {
            const identityId = this.newSubjectId.trim();
            if (!identityId) return;
            this.$emit('grant', identityId);
            this.newSubjectId = '';
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="World Members"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-members-panel">
                <h3>World Members</h3>
                <p class="world-members-panel-hint">
                    Presence and access are shown here — never decided here. Granting or revoking Edit is verified fresh by this World's own owner-only membership authority.
                </p>

                <p v-if="roster.length === 0" class="world-members-panel-empty">
                    No members known yet.
                </p>
                <ul v-else class="world-members-panel-list">
                    <li
                        v-for="row in roster"
                        :key="row.identityId"
                        class="world-members-panel-item"
                        :class="'world-members-panel-item--' + row.access"
                    >
                        <div class="world-members-panel-item-info">
                            <span class="world-members-panel-item-name">{{ row.displayName }}</span>
                            <span class="world-members-panel-item-meta">
                                {{ accessLabel(row.access) }}
                                <template v-if="row.online"> · <span class="world-members-panel-online">● Online</span></template>
                                <template v-else> · <span class="world-members-panel-offline">○ Offline</span></template>
                                <template v-if="row.deviceCount">
                                    · {{ row.deviceCount }} device<template v-if="row.deviceCount !== 1">s</template>
                                </template>
                                <template v-if="row.online && row.activity"> · {{ activityLabel(row.activity) }}</template>
                            </span>
                        </div>
                        <div v-if="row.canManage" class="world-members-panel-item-actions">
                            <span v-if="pendingIdentityId === row.identityId" class="world-members-panel-pending">
                                {{ row.access === 'editor' ? 'Revoking…' : 'Granting…' }}
                            </span>
                            <template v-else>
                                <button
                                    v-if="row.access === 'editor'"
                                    class="action-btn"
                                    @click="$emit('revoke', row.identityId)"
                                >Revoke Edit</button>
                                <button
                                    v-else
                                    class="action-btn"
                                    @click="$emit('grant', row.identityId)"
                                >Grant Edit</button>
                            </template>
                        </div>
                    </li>
                </ul>

                <form v-if="isOwner" class="world-members-panel-grant-form" @submit.prevent="submitGrant">
                    <label for="world-members-grant-input">Grant Edit to a new identity</label>
                    <div class="world-members-panel-grant-row">
                        <input
                            id="world-members-grant-input"
                            v-model="newSubjectId"
                            type="text"
                            placeholder="did:key:..."
                            :disabled="Boolean(pendingIdentityId)"
                        />
                        <button class="action-btn action-btn--primary" type="submit" :disabled="!newSubjectId.trim() || Boolean(pendingIdentityId)">Grant Edit</button>
                    </div>
                </form>

                <div class="modal-actions">
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
