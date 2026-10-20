// 0.2.95 — World Editing Authorization Foundation.
//
// The closed, three-value vocabulary every authorization decision in
// this milestone (and every one that builds on it) is expressed in.
// Deliberately small — see docs/Roadmap.md, 0.2.95: this is NOT the
// first rung of a role system (there is no EDITOR/ADMIN/MODERATOR
// here, on purpose), it is the answer to exactly one question, asked
// about exactly one World: "given who is looking, what may they do
// with it?"
//
//   NONE — the viewer may not even look. World View has no legitimate
//          way to have loaded this Document for them at all.
//   READ — the viewer may explore: walk, look, select, inspect. Every
//          capability World View already had before this milestone
//          (0.2.76 through 0.2.94) lives here.
//   EDIT — the viewer may also mutate: everything READ grants, plus
//          whatever World View's own mutation surface allows.
//
// A closed vocabulary, not an open string — see docs/Principles.md,
// "A Template Is A Closed Vocabulary, Not An Asset Loader" (0.2.34)
// for the same instinct applied to a different concept: callers
// compare against these three exported constants, never against a
// literal string of their own.
export const WorldAccessLevel = Object.freeze({
    NONE: 'none',
    READ: 'read',
    EDIT: 'edit'
});

// Total order, worth stating once rather than re-deriving at every
// call site: NONE < READ < EDIT. atLeast(level, 'read') is what a
// caller asks when it only cares "can this viewer at least explore,"
// never caring whether that's because they can READ or because they
// can fully EDIT.
const RANK = Object.freeze({
    [WorldAccessLevel.NONE]: 0,
    [WorldAccessLevel.READ]: 1,
    [WorldAccessLevel.EDIT]: 2
});

export function isValidWorldAccessLevel(value) {
    return Object.prototype.hasOwnProperty.call(RANK, value);
}

export function worldAccessAtLeast(level, minimum) {
    if (!isValidWorldAccessLevel(level) || !isValidWorldAccessLevel(minimum)) {
        return false;
    }
    return RANK[level] >= RANK[minimum];
}
