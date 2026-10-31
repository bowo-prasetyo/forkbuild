// The speech worker's side of voice building (application/voice/
// speechWorker.js): it answers the page's requests (application/voice/
// SpeechWorkerClient.js) with one SpeechRuntime, made on the first request,
// so the model is loaded once and stays loaded however many views ask.
//
// A request is `{ id, type, engineLoaderUrl, ... }`, `type` one of 'load',
// 'transcribe' and 'hear' (with `samples` and `language`), 'downloaded' and
// 'remove'.
// Each gets one `{ id, done: true, value }` or `{ id, done: true, error }`;
// 'load' first sends `{ id, progress }` while it downloads.
export function serveSpeech(scope, createRuntime) {
    let runtime = null;

    async function answer(request, reply) {
        runtime ??= createRuntime(request.engineLoaderUrl);
        switch (request.type) {
            case 'load':
                await runtime.load((progress) => reply({ progress }));
                return undefined;
            case 'transcribe':
                return runtime.transcribe(request.samples, request.language);
            case 'hear':
                return runtime.hear(request.samples, request.language);
            case 'downloaded':
                return runtime.downloaded();
            case 'remove':
                return runtime.remove();
            default:
                throw new Error(`speech worker: no request called ${request.type}`);
        }
    }

    scope.addEventListener('message', async ({ data }) => {
        const request = data || {};
        const reply = (message) => scope.postMessage({ id: request.id, ...message });
        try {
            reply({ done: true, value: await answer(request, reply) });
        } catch (error) {
            reply({ done: true, error: error?.message || String(error) });
        }
    });
}
