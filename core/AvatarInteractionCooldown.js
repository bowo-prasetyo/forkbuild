// 0.2.44 — a small, pure rate-limit predicate for local avatar
// gestures (GREET/WAVE/POINT — see core/AvatarInteractionKind.js).
// Given when a gesture was last performed and the current time, is
// another one currently allowed?
//
//   interaction requested
//          |
//       allowed?
//      /        \
//    yes         no
//     |           |
//  execute      ignore
//
// Established now, entirely locally, precisely so 0.2.45's networked
// version of interactions inherits an already-tested invariant
// ("a user cannot flood the system by holding a button") instead of
// inventing rate-limiting for the first time under the harder
// constraints of a shared transport, replay, and multiple senders.
//
// One shared cooldown across the whole small vocabulary, deliberately
// not a separate timer per kind — waving immediately after pointing
// is still "another gesture right away," which is exactly the thing
// this exists to slow down. Pure function: identical inputs always
// produce identical outputs, no hidden clock.
export const INTERACTION_COOLDOWN_MS = 1500;

export function canPerformInteraction(lastPerformedAt, now, cooldownMs = INTERACTION_COOLDOWN_MS) {
    if (!Number.isFinite(lastPerformedAt) || lastPerformedAt <= 0) {
        return true;
    }
    return now - lastPerformedAt >= cooldownMs;
}
