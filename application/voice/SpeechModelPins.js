// Exactly which speech model voice building downloads
// (application/voice/SpeechRuntime.js): one commit of the model's repository
// on Hugging Face, and the SHA-256 of every file transformers.js reads from it.
// A file whose bytes are not these is refused, whether it comes from Hugging
// Face or from this browser's own cache, so a changed or tampered model never
// runs, just as the engine is held to SPEECH_ENGINE.sha256.
//
// Written by scripts/pin-speech-model.mjs, which downloads each file at the
// commit and hashes it; to move to a newer model, run it again and test voice
// by hand. Until it has been run, SPEECH_MODEL_REVISION is null and the
// model is not pinned: SpeechRuntime then loads it as before, unchecked.
export const SPEECH_MODEL_REVISION = null;

// The files transformers.js 4 reads for Whisper speech recognition at dtype
// q8, by their path in the repository, with their SHA-256 (hex). Any other
// file it asks for (an optional one such as processor_config.json) is
// answered as missing, never fetched.
export const SPEECH_MODEL_FILES = Object.freeze({});
