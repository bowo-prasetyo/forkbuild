import { World } from '../core/World.js';

// Reconstructs a historical world state from a CommandHistory — the
// 0.1.40 replay workflow. The history itself is the source of truth: its
// persisted baseline snapshot plus a deterministic re-execution of its
// serialized commands (see CommandHistory.replay()).
//
// Returns a STANDALONE World:
//   * never mutates the live document,
//   * never creates new history entries,
//   * reconstructed WITHOUT an eventBus by default — silent by design.
//     World View renders replay worlds imperatively via addWorld(), so
//     replay noise never flows through the shared domain event stream.
//
// endCursor selects how much of the linear timeline to apply; it defaults
// to the history's current cursor (the state presently applied). Instance
// identities are preserved exactly: baseline ids plus each serialized
// PlaceBrickCommand's executedBrickId, so a replayed document is
// byte-for-byte comparable to the live one.
export class ReplayDocumentUseCase {
    constructor(commandRegistry) {
        this._commandRegistry = commandRegistry;
    }

    execute(commandHistory, { endCursor = null, eventBus = null } = {}) {
        const baseline = commandHistory.getBaselineWorld();
        if (!baseline) {
            throw new Error('ReplayDocumentUseCase: history has no baseline world snapshot');
        }
        const target = endCursor === null ? commandHistory.getCursor() : endCursor;
        const world = World.fromJSON(baseline, eventBus);
        commandHistory.replay({ world }, {
            registry: this._commandRegistry,
            startCursor: 0,
            endCursor: target
        });
        return world;
    }
}
