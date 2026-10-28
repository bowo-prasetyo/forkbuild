// Exactly which speech model voice building downloads
// (application/voice/SpeechRuntime.js): one commit of the model's repository
// on Hugging Face, and the SHA-256 of every file transformers.js reads from it.
// A file whose bytes are not these is refused, whether it comes from Hugging
// Face or from this browser's own cache, so a changed or tampered model never
// runs, just as the engine is held to SPEECH_ENGINE.sha256.
//
// Written by scripts/pin-speech-model.mjs, which hashes each small file it
// downloads at the commit and takes each weights file's hash from its Git LFS
// object id in the commit (the SHA-256 of its bytes); to move to a newer
// model, run it again and test voice by hand. With SPEECH_MODEL_REVISION null,
// the model would not be pinned, and SpeechRuntime would load it unchecked.
// The speech model: Whisper base, which scripts/evaluate-voice-commands.mjs
// measured hearing 49% of commands right across the app's eight languages
// (English 93%) where Whisper tiny heard 37% (English 68%), at about twice
// the time a command and twice the download.
export const SPEECH_MODEL = 'onnx-community/whisper-base';

// How many bytes the files below come to: what turning voice on downloads,
// with the engine (application/voice/SpeechRuntime.js, SPEECH_ENGINE).
export const SPEECH_MODEL_BYTES = 79664191;

export const SPEECH_MODEL_REVISION = '1846881b6b3a3024392c1eea3ad983695bc23925';

// The files transformers.js 4 reads for Whisper speech recognition at dtype
// q8, by their path in the repository, with their SHA-256 (hex). Any other
// file it asks for (an optional one such as processor_config.json) is
// answered as missing, never fetched.
export const SPEECH_MODEL_FILES = Object.freeze({
    'config.json': 'f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b',
    'generation_config.json': '61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0',
    'preprocessor_config.json': 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d',
    'tokenizer.json': '27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566',
    'tokenizer_config.json': '2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573',
    'onnx/encoder_model_quantized.onnx': '5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46',
    'onnx/decoder_model_merged_quantized.onnx': 'fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b'
});
