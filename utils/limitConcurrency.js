// Wraps an async function so at most `max` calls run at once; the rest wait
// in call order. Each call settles like `fn` would have.
export function limitConcurrency(fn, max) {
    if (typeof fn !== 'function') throw new Error('limitConcurrency: a function is required');
    if (!Number.isInteger(max) || max < 1) throw new Error('limitConcurrency: max must be a positive integer');
    let running = 0;
    const waiting = [];
    const next = () => {
        if (running >= max || waiting.length === 0) return;
        running += 1;
        const { args, resolve, reject } = waiting.shift();
        Promise.resolve()
            .then(() => fn(...args))
            .then(resolve, reject)
            .finally(() => {
                running -= 1;
                next();
            });
    };
    return (...args) => new Promise((resolve, reject) => {
        waiting.push({ args, resolve, reject });
        next();
    });
}
