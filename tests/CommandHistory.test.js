import { Command } from '../application/commands/Command.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CommandRegistry } from '../application/commands/CommandRegistry.js';

// ---------------------------------------------------------------------
// Mock command for isolated history testing
// ---------------------------------------------------------------------
class IncrementCommand extends Command {
    constructor({ delta = 1, id, timestamp } = {}) {
        super({ id, timestamp });
        this._delta = delta;
        this._executed = false;
    }

    get type() { return 'increment'; }

    execute(context) {
        context.value += this._delta;
        this._executed = true;
    }

    undo(context) {
        context.value -= this._delta;
        this._executed = false;
    }

    canUndo() {
        return this._executed;
    }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            delta: this._delta,
            executed: this._executed
        };
    }

    static fromJSON(json, registry) {
        const cmd = new IncrementCommand({
            delta: json.delta,
            id: json.id,
            timestamp: new Date(json.timestamp)
        });
        cmd._executed = json.executed;
        return cmd;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// ---------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------
function runTests() {
    const registry = new CommandRegistry();
    registry.register('increment', IncrementCommand);

    // -----------------------------------------------------------------
    // 1. Basic execute / undo / redo
    // -----------------------------------------------------------------
    {
        const context = { value: 0 };
        const history = new CommandHistory(context);

        history.execute(new IncrementCommand({ delta: 5 }));
        assert(context.value === 5, 'value should be 5 after execute');
        assert(history.canUndo(), 'should be able to undo');

        history.undo();
        assert(context.value === 0, 'value should be 0 after undo');
        assert(history.canRedo(), 'should be able to redo');

        history.redo();
        assert(context.value === 5, 'value should be 5 after redo');
        console.log('✓ basic execute/undo/redo');
    }

    // -----------------------------------------------------------------
    // 2. Serialization round-trip preserves undo capability
    // -----------------------------------------------------------------
    {
        const context = { value: 5 };
        const history = new CommandHistory(context);
        history.execute(new IncrementCommand({ delta: 5 }));

        const json = history.toJSON();
        assert(json.executed.length === 1, 'should have 1 executed command');
        assert(json.redo.length === 0, 'should have 0 redo commands');

        const history2 = CommandHistory.fromJSON(json, context, registry);
        assert(history2.canUndo(), 'deserialized history should be undoable');

        history2.undo();
        assert(context.value === 0, 'undo after deserialization should work');
        console.log('✓ serialization round-trip');
    }

    // -----------------------------------------------------------------
    // 3. New command after undo clears redo branch (linear history)
    // -----------------------------------------------------------------
    {
        const context = { value: 0 };
        const history = new CommandHistory(context);

        history.execute(new IncrementCommand({ delta: 1 })); // 1
        history.execute(new IncrementCommand({ delta: 2 })); // 3
        history.undo(); // 1, redo has +2
        assert(history.canRedo(), 'should have redo after undo');

        history.execute(new IncrementCommand({ delta: 10 })); // 11
        assert(!history.canRedo(), 'redo should be cleared after new execute');
        assert(context.value === 11, 'value
