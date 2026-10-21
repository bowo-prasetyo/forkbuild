// How connected peers agree on one World clock, so that everything sampled
// from time (wild animals, core/nature/WildlifeMotion.js; residents,
// core/world/ResidentMotion.js; the seasons) is in the same place on every
// screen. Device clocks are often a few seconds apart, and a resident walks
// over a metre a second, so two friends standing side by side would
// otherwise see the same deer in two places.
//
// HOW. Each peer asks each connected peer what its clock says (a PING
// answered by a PONG with the answerer's own, uncorrected clock). From when
// the PING left and the PONG came back, the classic estimate is
//
//   offset    = peerTime - (sentAt + receivedAt) / 2
//   roundTrip = receivedAt - sentAt
//
// and the sample with the shortest round trip is the most trustworthy one.
// Every peer then moves its own World clock to the MEDIAN of its own clock
// and every peer's (agreedClockOffset()). Clocks are always exchanged
// uncorrected, so there is no feedback: peers that all see each other
// compute the median of the same set of clocks and land on the same time
// (two peers meet half way); peers that only partly see each other land
// close to it.
//
// Bounded on purpose: a sample over a slow round trip says little and is
// dropped, and a peer whose clock is more than WORLD_CLOCK.maxOffsetMs away
// is ignored rather than followed, so nobody can pull anyone else's World
// far from their own clock. The median means one wrong clock among three or
// more never moves the agreed time at all.
//
// A change in the agreed time is eased in (slewClockCorrection()): time runs
// a little faster or slower until it has caught up, so animals never jump,
// unless the change is too large to ease, which happens at most once, when
// a peer first connects.
//
// Pure: numbers in, numbers out. The exchange itself is
// application/world/WorldClockUseCase.js.

export const WORLD_CLOCK = Object.freeze({
    // A sample over a slower round trip than this is too uncertain to use.
    maxRoundTripMs: 2000,
    // A peer whose clock is further off than this is ignored.
    maxOffsetMs: 15 * 60 * 1000,
    // How many recent samples are kept per peer, the best one used.
    samplesKept: 5,
    // While catching up, World time runs this much faster or slower than
    // real time (0.25: 1.25 or 0.75 seconds per second).
    slewRate: 0.25,
    // A change larger than this is applied at once rather than eased.
    jumpMs: 5000
});

// One sample from a PING sent at `sentAt`, answered with `peerTime`, and
// whose PONG came back at `receivedAt` (all milliseconds):
// { offsetMs, roundTripMs }, or null when it can't be trusted.
export function clockSampleFrom({ sentAt, peerTime, receivedAt } = {}) {
    if (![sentAt, peerTime, receivedAt].every(Number.isFinite)) return null;
    const roundTripMs = receivedAt - sentAt;
    if (roundTripMs < 0 || roundTripMs > WORLD_CLOCK.maxRoundTripMs) return null;
    const offsetMs = peerTime - (sentAt + receivedAt) / 2;
    if (Math.abs(offsetMs) > WORLD_CLOCK.maxOffsetMs) return null;
    return { offsetMs, roundTripMs };
}

// The most trustworthy of `samples` (the shortest round trip), or null.
export function bestClockSample(samples) {
    let best = null;
    for (const sample of samples || []) {
        if (!sample || !Number.isFinite(sample.offsetMs) || !Number.isFinite(sample.roundTripMs)) continue;
        if (!best || sample.roundTripMs < best.roundTripMs) best = sample;
    }
    return best;
}

// How far to move this peer's clock, in milliseconds, given each connected
// peer's offset from it: the median of this peer's own clock (offset 0) and
// all of theirs, the mean of the middle two for an even count. 0 alone.
export function agreedClockOffset(peerOffsets) {
    const offsets = [0, ...(peerOffsets || []).filter((offset) => Number.isFinite(offset)
        && Math.abs(offset) <= WORLD_CLOCK.maxOffsetMs)];
    offsets.sort((a, b) => a - b);
    const middle = Math.floor(offsets.length / 2);
    return offsets.length % 2 === 1 ? offsets[middle] : (offsets[middle - 1] + offsets[middle]) / 2;
}

// The correction to apply after `elapsedMs` of real time, moving from
// `applied` toward `target` at WORLD_CLOCK.slewRate, or straight to it when
// they are more than WORLD_CLOCK.jumpMs apart.
export function slewClockCorrection(applied, target, elapsedMs) {
    if (!Number.isFinite(applied)) return Number.isFinite(target) ? target : 0;
    if (!Number.isFinite(target)) return applied;
    const gap = target - applied;
    if (Math.abs(gap) > WORLD_CLOCK.jumpMs) return target;
    const step = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) * WORLD_CLOCK.slewRate;
    return Math.abs(gap) <= step ? target : applied + Math.sign(gap) * step;
}
