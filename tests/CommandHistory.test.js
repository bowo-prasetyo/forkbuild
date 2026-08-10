import { Command } from '../application/commands/Command.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CommandRegistry } from '../application/commands/CommandRegistry.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';

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

    describe() {
        return `Increment ${this._delta}`;
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
    registry.register('composite', CompositeCommand);

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
        assert(context.value === 5, 'undo after deserialization should return to serialized document state');
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
        history.undo(); // back to 1, redo stack has +2
        assert(history.canRedo(), 'should have redo after undo');

        history.execute(new IncrementCommand({ delta: 10 })); // 11
        assert(!history.canRedo(), 'redo should be cleared after new execute');
        assert(context.value === 11, 'value should be 11');
        assert(history.getExecutedCommands().length === 2, 'should have 2 executed commands');
        console.log('✓ linear history invariant');
    }

    // -----------------------------------------------------------------
    // 4. Complex sequence: Place → Move → Rotate → Undo → Redo → New
    // -----------------------------------------------------------------
    {
        const context = { value: 0 };
        const history = new CommandHistory(context);

        history.execute(new IncrementCommand({ delta: 1 }));  // +1
        history.execute(new IncrementCommand({ delta: 2 }));  // +2
        history.execute(new IncrementCommand({ delta: 4 }));   // +4
        history.execute(new IncrementCommand({ delta: 8 }));   // +8
        // total = 15
        assert(context.value === 15, 'value should be 15');

        history.undo(); // -8 → 7
        history.undo(); // -4 → 3
        assert(context.value === 3, 'value should be 3 after 2 undos');
        assert(history.canRedo(), 'should be able to redo');

        history.redo(); // +4 → 7
        assert(context.value === 7, 'value should be 7 after redo');

        history.execute(new IncrementCommand({ delta: 100 })); // +100, clears redo
        assert(context.value === 107, 'value should be 107');
        assert(!history.canRedo(), 'should have no redo after new execute');
        assert(history.getExecutedCommands().length === 4, 'should have 4 executed');
        console.log('✓ complex sequence');
    }

    // -----------------------------------------------------------------
    // 5. CompositeCommand atomicity and serialization
    // -----------------------------------------------------------------
    {
        const context = { value: 0 };
        const history = new CommandHistory(context);

        const composite = new CompositeCommand();
        composite.add(new IncrementCommand({ delta: 3 }));
        composite.add(new IncrementCommand({ delta: 5 }));

        history.execute(composite); // +8
        assert(context.value === 8, 'composite should add 8');
        assert(history.getExecutedCommands().length === 1, 'history should have 1 entry');

        history.undo(); // -8 → 0
        assert(context.value === 0, 'composite undo should subtract 8');
        assert(history.canRedo(), 'should be able to redo composite');

        // Serialize history with composite in redo stack
        const json = history.toJSON();
        assert(json.executed.length === 0, '0 executed after undo');
        assert(json.redo.length === 1, '1 redo command');
        assert(json.redo[0].type === 'composite', 'redo should be composite');
        assert(json.redo[0].commands.length === 2, 'composite should have 2 children');

        const history2 = CommandHistory.fromJSON(json, context, registry);
        assert(history2.canRedo(), 'deserialized history should allow redo');
        history2.redo();
        assert(context.value === 8, 'composite redo should restore 8');
        console.log('✓ CompositeCommand atomicity and serialization');
    }

    // -----------------------------------------------------------------
    // 6. CommandRegistry error handling
    // -----------------------------------------------------------------
    {
        try {
            registry.fromJSON({ type: 'nonexistent' });
            assert(false, 'should throw for unknown command type');
        } catch (e) {
            assert(e.message.includes('unknown command type'), 'correct error for unknown type');
        }

        try {
            const badRegistry = new CommandRegistry();
            badRegistry.register('', IncrementCommand);
            assert(false, 'should throw for empty type');
        } catch (e) {
            assert(e.message.includes('type must be'), 'correct error for empty type');
        }

        try {
            const badRegistry = new CommandRegistry();
            badRegistry.register('foo', class NotACommand {});
            assert(false, 'should throw for non-Command class');
        } catch (e) {
            assert(e.message.includes('must extend Command'), 'correct error for non-Command');
        }
        console.log('✓ CommandRegistry error handling');
    }

    // -----------------------------------------------------------------
    // 7. Command metadata (id, timestamp)
    // -----------------------------------------------------------------
    {
        const cmd = new IncrementCommand({ delta: 1 });
        assert(typeof cmd.id === 'string' && cmd.id.length > 0, 'id should be a non-empty string');
        assert(cmd.timestamp instanceof Date, 'timestamp should be a Date');

        const json = cmd.toJSON();
        assert(json.id === cmd.id, 'id preserved in JSON');
        assert(json.timestamp === cmd.timestamp.toISOString(), 'timestamp preserved in JSON');

        const restored = IncrementCommand.fromJSON(json, registry);
        assert(restored.id === cmd.id, 'id round-trips');
        assert(restored.timestamp.getTime() === cmd.timestamp.getTime(), 'timestamp round-trips');
        console.log('✓ command metadata');
    }

    // -----------------------------------------------------------------
    // 8. CommandHistory labels reflect current state
    // -----------------------------------------------------------------
    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        assert(history.getUndoLabel() === null, 'no undo label initially');
        assert(history.getRedoLabel() === null, 'no redo label initially');

        history.execute(new IncrementCommand({ delta: 7 }));
        assert(history.getUndoLabel() === 'Undo Increment 7', 'undo label correct');
        assert(history.getRedoLabel() === null, 'still no redo label');

        history.undo();
        assert(history.getUndoLabel() === null, 'no undo label after undo');
        assert(history.getRedoLabel() === 'Redo Increment 7', 'redo label correct');
        console.log('✓ undo/redo labels');
    }



    // -----------------------------------------------------------------
    // 9. CompositeCommand rolls back executed children when a later child fails
    // -----------------------------------------------------------------
    {
        class FailingCommand extends Command {
            get type() { return 'failing'; }
            execute(context) { throw new Error('intentional failure'); }
            undo(context) { context.value = -999; }
            canUndo() { return false; }
            describe() { return 'Failing Command'; }
            toJSON() { return { type: this.type }; }
        }

        const context = { value: 0 };
        const history = new CommandHistory(context);
        const composite = new CompositeCommand();
        composite.add(new IncrementCommand({ delta: 3 }));
        composite.add(new IncrementCommand({ delta: 5 }));
        composite.add(new FailingCommand());

        try {
            history.execute(composite);
            assert(false, 'composite execute should throw');
        } catch (e) {
            assert(e.message.includes('intentional failure'), 'should rethrow child failure');
        }

        assert(context.value === 0, 'rollback should undo successfully executed children');
        assert(history.getExecutedCommands().length === 0, 'failed composite should not enter history');
        console.log('✓ CompositeCommand rollback on child failure');
    }

    console.log('\nAll CommandHistory persistence tests passed.');
}

runTests();
