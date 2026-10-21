// Records what a player says for voice building: the microphone, from a
// start to a stop (or `maxSeconds`), as mono 16 kHz samples, which is what
// the speech model (application/voice/SpeechRuntime.js) hears. The sound
// stays in memory on this device and the microphone is let go as soon as
// recording stops.
const SAMPLE_RATE = 16000;

// Starts recording; resolves to `{ stop, cancel }` once the microphone is
// on. `stop()` resolves to the samples (empty when nothing was recorded);
// `cancel()` throws them away. Rejects when the microphone can't be used
// (the browser asks the player first).
export async function startRecording({ maxSeconds = 8, onAutoStop = () => {} } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
    const release = () => stream.getTracks().forEach((track) => track.stop());
    recorder.start();
    let finished = false;
    const finish = () => {
        if (finished) return stopped;
        finished = true;
        clearTimeout(timer);
        if (recorder.state !== 'inactive') recorder.stop();
        return stopped.finally(release);
    };
    const timer = setTimeout(() => {
        if (!finished) onAutoStop();
    }, maxSeconds * 1000);
    return {
        async stop() {
            await finish();
            if (chunks.length === 0) return new Float32Array(0);
            return toSpeechSamples(await new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }).arrayBuffer());
        },
        async cancel() {
            await finish();
            chunks.length = 0;
        }
    };
}

// Recorded sound (any format the browser can decode) as mono 16 kHz samples.
export async function toSpeechSamples(encoded) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    const context = new AudioContextClass();
    let decoded;
    try {
        decoded = await context.decodeAudioData(encoded);
    } finally {
        context.close?.();
    }
    const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
}
