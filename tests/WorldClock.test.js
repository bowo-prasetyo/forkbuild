import {
    WORLD_CLOCK,
    clockSampleFrom,
    bestClockSample,
    agreedClockOffset,
    slewClockCorrection
} from '../core/world/WorldClockAgreement.js';
import { WorldClockUseCase } from '../application/world/WorldClockUseCase.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { assert } from './support/Assert.js';

// The World clock connected peers agree on (core/world/WorldClockAgreement.js,
// application/world/WorldClockUseCase.js).
//
//   Section A: the pure agreement — samples, the best sample, the median,
//              easing a change in
//   Section B: two devices whose clocks are seconds apart end up showing the
//              same World time, and get there without a jump
//   Section C: three devices agree on the middle clock; a far-off one
//              never drags the others
//   Section D: only answers to its own PINGs count; a peer that leaves stops
//              counting; dispose() stops asking

function near(actual, expected, tolerance, message) {
    assert(Math.abs(actual - expected) <= tolerance, `${message} (got ${actual}, expected ${expected} ± ${tolerance})`);
}

// ---------------------------------------------------------------------------
// Section A — the pure agreement
// ---------------------------------------------------------------------------
{
    const sample = clockSampleFrom({ sentAt: 1000, peerTime: 5050, receivedAt: 1100 });
    assert(sample.roundTripMs === 100, 'A1: the round trip is from PING out to PONG back');
    assert(sample.offsetMs === 4000, 'A1: the offset is measured from the middle of the round trip');
    assert(clockSampleFrom({ sentAt: 0, peerTime: 0, receivedAt: WORLD_CLOCK.maxRoundTripMs + 1 }) === null,
        'A2: a sample over a slow round trip is dropped');
    assert(clockSampleFrom({ sentAt: 100, peerTime: 0, receivedAt: 50 }) === null, 'A2: a negative round trip is dropped');
    assert(clockSampleFrom({ sentAt: 0, peerTime: WORLD_CLOCK.maxOffsetMs + 1000, receivedAt: 10 }) === null,
        'A2: a clock too far off is dropped');
    assert(clockSampleFrom({ sentAt: 0, peerTime: 'soon', receivedAt: 10 }) === null, 'A2: a time that is not a number is dropped');

    const best = bestClockSample([{ offsetMs: 10, roundTripMs: 300 }, { offsetMs: 20, roundTripMs: 40 }, null, { offsetMs: 30, roundTripMs: 90 }]);
    assert(best.offsetMs === 20, 'A3: the best sample has the shortest round trip');
    assert(bestClockSample([]) === null, 'A3: no samples, no best one');

    assert(agreedClockOffset([]) === 0, 'A4: alone, the World clock is this device\'s own');
    assert(agreedClockOffset([4000]) === 2000, 'A4: two devices meet half way');
    assert(agreedClockOffset([3000, 600000]) === 3000, 'A4: three take the middle clock');
    assert(agreedClockOffset([-500, 200, 900]) === 100, 'A4: four take the mean of the middle two');
    assert(agreedClockOffset([WORLD_CLOCK.maxOffsetMs * 2]) === 0, 'A4: a clock too far off is not followed');

    assert(slewClockCorrection(0, 1000, 400) === 100, 'A5: a change is eased in at the slew rate');
    assert(slewClockCorrection(0, -1000, 400) === -100, 'A5: in either direction');
    assert(slewClockCorrection(950, 1000, 400) === 1000, 'A5: and settles exactly on the target');
    assert(slewClockCorrection(0, WORLD_CLOCK.jumpMs + 1, 16) === WORLD_CLOCK.jumpMs + 1, 'A5: a change too large to ease is applied at once');
}

// ---------------------------------------------------------------------------
// A small simulated network: devices with their own clocks, joined by links
// with a delay each way, all on one simulated timeline.
// ---------------------------------------------------------------------------
class Simulation {
    constructor() {
        this.time = 1_760_000_000_000;
        this._events = [];
        this._order = 0;
    }
    at(delay, callback) {
        const event = { when: this.time + Math.max(0, delay), order: this._order++, callback, cancelled: false };
        this._events.push(event);
        return event;
    }
    runFor(ms) {
        const end = this.time + ms;
        for (;;) {
            this._events.sort((a, b) => (a.when - b.when) || (a.order - b.order));
            const next = this._events[0];
            if (!next || next.when > end) break;
            this._events.shift();
            this.time = next.when;
            if (!next.cancelled) next.callback();
        }
        this.time = end;
    }
    get pending() {
        return this._events.filter((event) => !event.cancelled).length;
    }
}

class FakePeer {
    constructor(connectionId) {
        this.connectionId = connectionId;
        this.state = PeerLifecycleState.AUTHENTICATED;
        this.connection = {};
    }
    getLifecycleState() { return this.state; }
}

class FakeRegistry {
    constructor() { this._peers = []; this._listeners = new Set(); }
    list() { return this._peers.slice(); }
    onChange(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }
    add(peer) { this._peers.push(peer); this._changed(); }
    remove(peer) { this._peers = this._peers.filter((p) => p !== peer); this._changed(); }
    _changed() { for (const listener of this._listeners) listener(this.list()); }
}

class FakeBus {
    constructor() { this._handlers = new Map(); this.routes = new Map(); this.sent = []; }
    attach() {}
    subscribe(protocol, handler) {
        this._handlers.set(protocol, handler);
        return () => this._handlers.delete(protocol);
    }
    send(peer, protocol, payload, { version } = {}) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) throw new Error('not authenticated');
        this.sent.push({ peer, protocol, payload });
        const route = this.routes.get(peer);
        if (route) route(protocol, payload, version);
    }
    deliver(protocol, payload, meta) {
        const handler = this._handlers.get(protocol);
        if (handler) handler(payload, meta);
    }
}

function device(sim, skewMs) {
    const bus = new FakeBus();
    const registry = new FakeRegistry();
    const clock = new WorldClockUseCase({
        peerMessageBus: bus,
        connectedPeerRegistry: registry,
        now: () => sim.time + skewMs,
        setTimer: (callback, ms) => sim.at(ms, callback),
        clearTimer: (event) => { event.cancelled = true; }
    });
    return { bus, registry, clock, skewMs };
}

// Connects `a` and `b`, a message taking `aToB` ms one way and `bToA` back.
function link(sim, a, b, { aToB = 40, bToA = 40 } = {}) {
    const bAsSeenByA = new FakePeer(`to-${b.skewMs}`);
    const aAsSeenByB = new FakePeer(`to-${a.skewMs}`);
    a.bus.routes.set(bAsSeenByA, (protocol, payload, version) => sim.at(aToB, () => b.bus.deliver(protocol, payload, { protocol, version, connectedPeer: aAsSeenByB })));
    b.bus.routes.set(aAsSeenByB, (protocol, payload, version) => sim.at(bToA, () => a.bus.deliver(protocol, payload, { protocol, version, connectedPeer: bAsSeenByA })));
    a.registry.add(bAsSeenByA);
    b.registry.add(aAsSeenByB);
    return { bAsSeenByA, aAsSeenByB };
}

// ---------------------------------------------------------------------------
// Section B — two devices seconds apart agree
// ---------------------------------------------------------------------------
{
    const sim = new Simulation();
    const a = device(sim, 0);
    const b = device(sim, 4000);
    near(b.clock.nowMs() - a.clock.nowMs(), 4000, 1, 'B1: before they connect, each shows its own clock');

    link(sim, a, b);
    let previousA = a.clock.nowMs();
    let previousB = b.clock.nowMs();
    let largestStep = 0;
    // A 30 fps view, watching both clocks for 20 seconds.
    for (let frame = 0; frame < 600; frame++) {
        sim.runFor(1000 / 30);
        const nowA = a.clock.nowMs();
        const nowB = b.clock.nowMs();
        largestStep = Math.max(largestStep, Math.abs(nowA - previousA - 1000 / 30), Math.abs(nowB - previousB - 1000 / 30));
        assert(nowA > previousA && nowB > previousB, 'B2: World time never runs backwards while easing in');
        previousA = nowA;
        previousB = nowB;
    }
    near(b.clock.nowMs() - a.clock.nowMs(), 0, 1, 'B3: after 20 seconds both show the same World time');
    near(a.clock.targetCorrectionMs(), 2000, 1, 'B3: they meet half way');
    near(b.clock.targetCorrectionMs(), -2000, 1, 'B3: from both sides');
    assert(largestStep <= (1000 / 30) * WORLD_CLOCK.slewRate + 1, `B4: no frame jumps more than the slew allows (largest ${largestStep} ms)`);
}
{
    // Uneven links: the error is at most half the difference between the two ways.
    const sim = new Simulation();
    const a = device(sim, -2500);
    const b = device(sim, 0);
    link(sim, a, b, { aToB: 30, bToA: 230 });
    sim.runFor(30_000);
    const gap = Math.abs(b.clock.nowMs() - a.clock.nowMs());
    assert(gap <= (230 - 30) / 2 + 1, `B5: an uneven link leaves at most half its difference (got ${gap} ms)`);
}

// ---------------------------------------------------------------------------
// Section C — three devices, one of them far off
// ---------------------------------------------------------------------------
{
    const sim = new Simulation();
    const a = device(sim, 0);
    const b = device(sim, 3000);
    const c = device(sim, 600_000);
    link(sim, a, b);
    link(sim, b, c);
    link(sim, a, c);
    sim.runFor(30_000);
    const reference = sim.time + 3000;
    near(a.clock.nowMs(), reference, 2, 'C1: all three agree on the middle clock (a)');
    near(b.clock.nowMs(), reference, 2, 'C1: all three agree on the middle clock (b)');
    near(c.clock.nowMs(), reference, 2, 'C1: all three agree on the middle clock (c)');
    near(b.clock.correctionMs(), 0, 1, 'C2: the clock ten minutes out never moves the middle one');
}
{
    const sim = new Simulation();
    const a = device(sim, 0);
    const b = device(sim, WORLD_CLOCK.maxOffsetMs + 60_000);
    link(sim, a, b);
    sim.runFor(10_000);
    assert(a.clock.correctionMs() === 0 && b.clock.correctionMs() === 0, 'C3: a clock past the limit is ignored by both sides');
}

// ---------------------------------------------------------------------------
// Section D — only its own answers count; leaving; dispose
// ---------------------------------------------------------------------------
{
    const sim = new Simulation();
    const a = device(sim, 0);
    const stranger = new FakePeer('stranger');
    a.registry.add(stranger);
    a.bus.deliver(WorldClockUseCase.DEFAULT_PROTOCOL, { type: 'PONG', nonce: 'made-up', time: sim.time + 60_000 }, { version: 1, connectedPeer: stranger });
    sim.runFor(100);
    assert(a.clock.targetCorrectionMs() === 0, 'D1: a PONG answering no PING is ignored');

    const pings = a.bus.sent.filter((m) => m.payload.type === 'PING');
    assert(pings.length >= 1, 'D2: a newly connected peer is asked at once');
    const other = new FakePeer('other');
    a.registry.add(other);
    a.bus.deliver(WorldClockUseCase.DEFAULT_PROTOCOL, { type: 'PONG', nonce: pings[0].payload.nonce, time: sim.time + 60_000 }, { version: 1, connectedPeer: other });
    assert(a.clock.targetCorrectionMs() === 0, 'D2: nor does an answer to a PING sent to someone else');
    a.bus.deliver(WorldClockUseCase.DEFAULT_PROTOCOL, { type: 'PONG', nonce: pings[0].payload.nonce, time: sim.time + 60_000 }, { version: 2, connectedPeer: stranger });
    assert(a.clock.targetCorrectionMs() === 0, 'D2: nor one in a version it does not speak');
    a.bus.deliver(WorldClockUseCase.DEFAULT_PROTOCOL, { type: 'PONG', nonce: pings[0].payload.nonce, time: sim.time + 60_000 }, { version: 1, connectedPeer: stranger });
    assert(a.clock.targetCorrectionMs() > 0, 'D3: its own answer counts');

    a.bus.deliver(WorldClockUseCase.DEFAULT_PROTOCOL, { type: 'PING', nonce: 'theirs' }, { version: 1, connectedPeer: stranger });
    const pong = a.bus.sent.find((m) => m.payload.type === 'PONG');
    assert(pong && pong.payload.nonce === 'theirs' && pong.payload.time === sim.time, 'D4: a PING is answered with this device\'s own, uncorrected clock');

    a.registry.remove(stranger);
    assert(a.clock.targetCorrectionMs() === 0, 'D5: a peer that leaves stops counting');

    a.clock.dispose();
    assert(sim.pending === 0, 'D6: dispose() cancels every scheduled PING');
}
{
    const alone = new WorldClockUseCase();
    const before = Date.now();
    const seconds = alone.seconds();
    assert(seconds * 1000 >= before && seconds * 1000 <= Date.now(), 'D7: with no peer bus, World time is this device\'s clock');
}

console.log('WorldClock tests passed');
