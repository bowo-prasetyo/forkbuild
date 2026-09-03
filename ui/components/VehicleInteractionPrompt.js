// 0.9.98 — Vehicle Mount/Dismount World View Integration.
//
// The smallest UI seam this milestone adds: a floating, bottom-center
// interaction affordance — "[E] Mount <Type>" while an unmounted avatar
// has a vehicle in interaction range, "[E] Dismount" while mounted, and
// nothing at all otherwise. Deliberately mirrors ActionFeedback.js's own
// tiny, one-line, inline-styled, `pointer-events: none` floating overlay
// exactly — no new UI framework, no modal, no toast queue — just anchored
// a little higher up so the two never visually collide.
//
// PRESENTATION ONLY — MAKES NO MOUNT/DISMOUNT DECISION OF ITS OWN.
// `state` is exactly whatever
// application/WorldNavigationSession.js#avatarVehicleInteractionState()
// returned (in turn
// application/AvatarVehicleInteractionController.js#vehicleInteractionState()'s
// own output) — an already-authoritative
// `{ mounted, vehicleType, targetVehicleId }` snapshot. This component
// never computes distance, never queries a vehicle list, never decides
// eligibility, and never re-derives `targetVehicleId` — it only asks "is
// there something to show," and if so, formats one of two fixed strings
// from fields the runtime already resolved. See that method's own header
// for the full observation chain.
//
// `targetVehicleId` itself is read only for `visible` — it is never
// displayed. A raw vehicle id is an internal, deterministic identity
// string (core/VehicleIdentity.js's own `vehicle:<seed>:<cellX>,<cellZ>`
// shape), never a player-facing label.
const VEHICLE_TYPE_LABEL = {
    bicycle: 'Bicycle',
    motorcycle: 'Motorcycle',
    car: 'Car',
    drone: 'Drone'
};

export default {
    name: 'VehicleInteractionPrompt',
    props: {
        // { mounted, vehicleType, targetVehicleId } from
        // WorldNavigationSession#avatarVehicleInteractionState(), or
        // null/absent (no local avatar, or the host has chosen not to
        // show this while Avatar Control Mode is off — the host decides
        // that gating; this component only ever renders nothing without
        // a usable state).
        state: {
            type: Object,
            default: null
        }
    },
    computed: {
        visible() {
            return Boolean(this.state) && (this.state.mounted || Boolean(this.state.targetVehicleId));
        },
        label() {
            if (!this.state) {
                return '';
            }
            if (this.state.mounted) {
                return '[E] Dismount';
            }
            const typeLabel = VEHICLE_TYPE_LABEL[this.state.vehicleType] || 'Vehicle';
            return `[E] Mount ${typeLabel}`;
        }
    },
    template: `
        <div
            v-if="visible"
            aria-live="polite"
            :style="{
                position: 'absolute',
                left: '50%',
                bottom: '54px',
                transform: 'translateX(-50%)',
                zIndex: 34,
                pointerEvents: 'none',
                background: 'rgba(18, 18, 18, 0.92)',
                border: '1px solid #3a3a3a',
                borderLeft: '3px solid #4caf7d',
                borderRadius: '4px',
                padding: '6px 14px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#e0e0e0',
                whiteSpace: 'nowrap'
            }"
        >{{ label }}</div>
    `
};
