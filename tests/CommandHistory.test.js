import { Command } from '../application/commands/Command.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CommandRegistry } from '../application/commands/CommandRegistry.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';

class IncrementCommand extends Command {
    constructor({ delta = 1, id, timestamp, executed = false } = {}) {
        super({ id, timestamp });
        this._delta = delta;
        this._executed = executed;
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

    canUndo() { return this._executed; }
    describe() { return `Increment ${this._delta}`; }

    toJSON() {
        return {
            type: this.type,
            id: this._id,
            timestamp: this._timestamp.toISOString(),
            delta: this._delta,
            executed: this._executed
        };
    }

    static fromJSON(json) {
        if (!Number.isFinite(json.delta)) {
            throw new Error('IncrementCommand.fromJSON(): delta must be a number');
        }
        return new IncrementCommand({
            delta: json.delta,
            id: json.id,
            timestamp: new Date(json.timestamp),
            executed: json.executed === true
        });
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, expectedMessage, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        assert(e.message.includes(expectedMessage), `${message}: ${e.message}`);
    }
}

function createRegistry() {
    const registry = new CommandRegistry();
    registry.register('increment', IncrementCommand);
    registry.register('composite', CompositeCommand);
    return registry;
}

function runTests() {
    const registry = createRegistry();

    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        assert(history.toJSON().commands.length === 0, 'empty history serializes no commands');
        assert(history.toJSON().cursor === 0, 'empty history cursor is 0');
        const restored = CommandHistory.fromJSON(history.toJSON(), context, registry);
        assert(!restored.canUndo(), 'empty restored history has no undo');
        assert(!restored.canRedo(), 'empty restored history has no redo');
        console.log('✓ empty history persistence');
    }

    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        history.execute(new IncrementCommand({ delta: 5 }));
        const json = history.toJSON();
        assert(json.schemaVersion === 1, 'schema version is written');
        assert(json.commands.length === 1, 'single command is serialized');
        assert(json.cursor === 1, 'cursor after single command is 1');
        const restored = CommandHistory.fromJSON(json, context, registry);
        assert(restored.canUndo(), 'single restored command is undoable');
        restored.undo();
        assert(context.value === 0, 'undo after restore returns to prior state');
        console.log('✓ single command persistence');
    }

    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        history.execute(new IncrementCommand({ delta: 1 }));
        history.execute(new IncrementCommand({ delta: 2 }));
        history.execute(new IncrementCommand({ delta: 4 }));
        assert(history.toJSON().cursor === 3, 'multiple command cursor at end');
        const restored = CommandHistory.fromJSON(history.toJSON(), context, registry);
        restored.undo();
        restored.undo();
        assert(context.value === 1, 'multiple restored commands undo in reverse order');
        restored.redo();
        assert(context.value === 3, 'multiple restored commands redo in original order');
        console.log('✓ multiple command persistence');
    }

    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        history.execute(new IncrementCommand({ delta: 1 }));
        history.execute(new IncrementCommand({ delta: 2 }));
        history.undo();
        const json = history.toJSON();
        assert(json.cursor === 1, 'undo position cursor preserved');
        assert(json.commands.map((cmd) => cmd.delta).join(',') === '1,2', 'linear command order preserved');
        const restored = CommandHistory.fromJSON(json, context, registry);
        assert(restored.getUndoLabel() === 'Undo Increment 1', 'undo label restored at cursor');
        assert(restored.getRedoLabel() === 'Redo Increment 2', 'redo label restored at cursor');
        restored.redo();
        assert(context.value === 3, 'redo position restored');
        console.log('✓ undo and redo cursor persistence');
     }

    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        const composite = new CompositeCommand({ description: 'Move 2 Bricks' });
        composite.add(new IncrementCommand({ delta: 3 }));
        composite.add(new IncrementCommand({ delta: 5 }));
        history.execute(composite);
        const json = history.toJSON();
        assert(json.commands[0].type === 'composite', 'composite type serialized');
        assert(json.commands[0].description === 'Move 2 Bricks', 'composite description serialized');
        assert(json.commands[0].commands.length === 2, 'composite children serialized');
        const restored = CommandHistory.fromJSON(json, context, registry);
        assert(restored.getUndoLabel() === 'Undo Move 2 Bricks', 'composite description restored');
        restored.undo();
        assert(context.value === 0, 'composite undo restored');
        console.log('✓ composite persistence with descriptions');
    }

    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        const outer = new CompositeCommand({ description: 'Nested Group Edit' });
        const inner = new CompositeCommand({ description: 'Inner Edit' });
        inner.add(new IncrementCommand({ delta: 2 }));
        inner.add(new IncrementCommand({ delta: 3 }));
        outer.add(new IncrementCommand({ delta: 1 }));
        outer.add(inner);
        history.execute(outer);
        const restored = CommandHistory.fromJSON(history.toJSON(), context, registry);
        assert(restored.getExecutedCommands()[0].commands[1].describe() === 'Inner Edit', 'nested composite description restored');
        restored.undo();
        assert(context.value === 0, 'nested composite undo restored');
        restored.redo();
        assert(context.value === 6, 'nested composite redo restored');
        console.log('✓ nested composite persistence');
     }
 
    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        history.execute(new IncrementCommand({ delta: 1 }));
        history.execute(new IncrementCommand({ delta: 2 }));
        history.undo();
        const restored = CommandHistory.fromJSON(history.toJSON(), context, registry);
        restored.execute(new IncrementCommand({ delta: 10 }));
        assert(!restored.canRedo(), 'new command after restored undo clears redo');
        assert(restored.toJSON().commands.map((cmd) => cmd.delta).join(',') === '1,10', 'redo branch removed after restored execute');
        console.log('✓ restored history followed by new command');
     }
 
    {
        const context = { value: 0 };
        const history = new CommandHistory(context);
        history.execute(new IncrementCommand({ delta: 1 }));
        history.execute(new IncrementCommand({ delta: 2 }));
        history.undo();
        const restored = CommandHistory.fromJSON(history.toJSON(), context, registry);
        restored.undo();
        assert(context.value === 0, 'restored undo works');
        restored.redo();
        restored.redo();
        assert(context.value === 3, 'restored redo works');
        console.log('✓ restored history followed by undo/redo');
    }

    {
        assertThrows(
            () => CommandHistory.fromJSON({ schemaVersion: 1, cursor: 0, commands: [{ type: 'missing' }] }, {}, registry),
            'unknown command type',
            'unknown command should be rejected'
        );
        assertThrows(
            () => CommandHistory.fromJSON({ schemaVersion: 1, cursor: 2, commands: [] }, {}, registry),
            'cursor must be within command bounds',
            'out-of-range cursor should be rejected'
        );
        assertThrows(
            () => CommandHistory.fromJSON({ schemaVersion: 1, cursor: 0, commands: [{ type: 'increment' }] }, {}, registry),
            'delta must be a number',
            'malformed command should be rejected'
        );
        assertThrows(
            () => CommandHistory.fromJSON({ schemaVersion: 999, cursor: 0, commands: [] }, {}, registry),
            'unsupported schemaVersion',
            'unknown schema should be rejected'
        );
        console.log('✓ malformed history rejection');
    }

    {
        const context = { value: 5 };
        const legacy = {
            executed: [new IncrementCommand({ delta: 1, executed: true }).toJSON()],
            redo: [new IncrementCommand({ delta: 2, executed: true }).toJSON()]
        };
        const restored = CommandHistory.fromJSON(legacy, context, registry);
        assert(restored.getCursor() === 1, 'legacy executed stack maps to cursor');
        restored.redo();
        assert(context.value === 7, 'legacy redo stack restores in executable order');
        console.log('✓ legacy stack history migration');
    }

    {
        class FailingCommand extends Command {
            get type() { return 'failing'; }
            execute() { throw new Error('intentional failure'); }
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

        assertThrows(() => history.execute(composite), 'intentional failure', 'composite execute should rethrow child failure');
        assert(context.value === 0, 'rollback should undo successfully executed children');
        assert(history.getExecutedCommands().length === 0, 'failed composite should not enter history');
        console.log('✓ CompositeCommand rollback on child failure');
    }

    console.log('\nAll CommandHistory persistence tests passed.');
}

runTests();
