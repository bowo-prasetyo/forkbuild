// Which of two published builds came first, as far as this device can tell,
// for the look-alike hints (application/publication/SimilarBuildFinder.js).
//
// A Publication's `publishedAt` is the date its builder signed: a claim, which
// anyone can set to any day, so a copy can be dated before what it copied.
// What this device knows for itself is when it first saw each build (its
// `seen`: application/publication/PublicationFirstSeenLog.js, or the
// `publishedAt` of a build published here). A build seen here by the time
// another says it was published certainly existed by then; a date this device
// can't back that way is only what its builder says.
//
// order(subject, other), each `{ claimed, seen }` in ms (`seen` null when not
// known), says where `other` stands beside `subject`:
//
// - 'before': other's date is earlier, and this device had it by subject's.
// - 'datedBefore': other's date is earlier, but this device first saw it
//   later than subject's date, so only its builder says it came first.
// - 'seenBefore': other's date is later, but subject's earlier date can't be
//   backed against it, and this device saw other first.
// - 'after': other's date is later, and nothing says otherwise.
// - null: the same date.
//
// Unsure orders ('datedBefore', 'seenBefore') are told as they are, never
// settled one way: a copy can't put itself first by its date alone, and an
// older build found late isn't called a copy.
//
// Pure: times in, a word out.
export const PUBLICATION_ORDERS = Object.freeze(['before', 'datedBefore', 'seenBefore', 'after']);

function seenOf(build) {
    return Number.isFinite(build?.seen) ? build.seen : Infinity;
}

export function order(subject, other) {
    const subjectClaimed = Number(subject?.claimed) || 0;
    const otherClaimed = Number(other?.claimed) || 0;
    if (otherClaimed === subjectClaimed) return null;
    if (otherClaimed < subjectClaimed) {
        return seenOf(other) <= subjectClaimed ? 'before' : 'datedBefore';
    }
    const subjectBacked = seenOf(subject) <= otherClaimed;
    return !subjectBacked && seenOf(other) < seenOf(subject) ? 'seenBefore' : 'after';
}
