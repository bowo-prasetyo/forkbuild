import { AnimationLoop } from '../renderer/AnimationLoop.js';
import { assert } from './support/Assert.js';

// A frame callback that throws must not stop the loop: World View froze for
// good when storing a vehicle threw once inside a frame.

function installFakeRaf() {
    const queue = [];
    let nextId = 1;
    globalThis.requestAnimationFrame = (callback) => {
        const id = nextId++;
        queue.push({ id, callback });
        return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
        const index = queue.findIndex((entry) => entry.id === id);
        if (index !== -1) {
            queue.splice(index, 1);
        }
    };
    return {
        pending: () => queue.length,
        // Runs the next queued frame; returns what it threw, if anything.
        step(timestamp) {
            const entry = queue.shift();
            try {
                entry.callback(timestamp);
                return null;
            } catch (e) {
                return e;
            }
        }
    };
}

function runTests() {
    const raf = installFakeRaf();

    {
        let frames = 0;
        const loop = new AnimationLoop(() => {
            frames++;
            if (frames === 2) {
                throw new Error('bad frame');
            }
        });
        loop.start();
        assert(raf.step(0) === null, '1. the first frame runs');
        const thrown = raf.step(16);
        assert(thrown && thrown.message === 'bad frame', '2. the throwing frame still surfaces its error');
        assert(raf.pending() === 1, '3. the next frame is scheduled despite the throw');
        assert(raf.step(32) === null && frames === 3, '4. the loop keeps running after the bad frame');
        loop.stop();
        assert(raf.pending() === 0, '5. stop() cancels the scheduled frame');
    }

    {
        let loop = null;
        loop = new AnimationLoop(() => loop.stop());
        loop.start();
        raf.step(0);
        assert(raf.pending() === 0, '6. stop() called from inside a frame is honoured');
    }

    console.log('✅ All AnimationLoop tests passed.');
}

runTests();
