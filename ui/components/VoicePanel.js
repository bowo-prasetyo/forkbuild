import { byteSizeText } from '../i18n/sizeText.js';
import { t } from '../i18n/i18n.js';
import { SPEECH_DOWNLOAD_BYTES } from '../../application/voice/SpeechWorkerClient.js';

// Voice building's panel over the 3D view of the Editor or World View
// (ui/voice/useVoiceCommands.js): asking before the first download, the
// download's progress, listening, what was heard and what was done, and
// turning voice off or removing the speech model. `place` ('editor' or
// 'world') picks the examples it gives. A screen reader hears each change.
export default {
    name: 'VoicePanel',
    props: {
        voice: { type: Object, required: true },
        place: { type: String, default: 'editor' }
    },
    emits: ['turn-on', 'turn-off', 'remove', 'toggle', 'ask-guide', 'close'],
    setup() {
        return { t, downloadSize: byteSizeText(SPEECH_DOWNLOAD_BYTES) };
    },
    template: `
        <div v-if="voice.step !== 'off'" :class="['editor-voice', 'editor-voice--' + place]" role="region" :aria-label="t('voice.title')">
            <div class="editor-voice-body" aria-live="polite">
                <template v-if="voice.step === 'intro'">
                    <p>{{ place === 'world' ? t('voice.introWorld') : t('voice.intro') }}</p>
                    <p class="editor-voice-quiet">{{ t('voice.download', { size: downloadSize }) }}</p>
                </template>
                <p v-else-if="voice.step === 'loading'">{{ voice.progress > 0 ? t('voice.downloading', { percent: voice.progress }) : t('voice.loading') }}</p>
                <p v-else-if="voice.step === 'listening'" class="editor-voice-listening">{{ t('voice.listening') }}</p>
                <p v-else-if="voice.step === 'working'">{{ t('voice.working') }}</p>
                <template v-else-if="voice.step === 'result'">
                    <p v-if="voice.heard">{{ t('voice.heard', { text: voice.heard }) }}</p>
                    <p v-if="voice.outcome.kind === 'done'">{{ t('voice.did', { action: voice.outcome.label }) }}</p>
                    <p v-else-if="voice.outcome.kind === 'disabled'">{{ voice.outcome.reason }}</p>
                    <p v-else-if="voice.outcome.kind === 'question'">{{ t('voice.question') }}</p>
                    <p v-else-if="voice.outcome.kind === 'nothing'">{{ t('voice.nothingHeard') }}</p>
                    <p v-else>{{ place === 'world' ? t('voice.notUnderstoodWorld') : t('voice.notUnderstood') }}</p>
                </template>
                <p v-else-if="voice.step === 'removed'">{{ t('voice.removed') }}</p>
                <p v-else-if="voice.step === 'failed'">
                    {{ voice.reason === 'microphone' ? t('voice.micBlocked') : voice.reason === 'unsupported' ? t('voice.unsupported') : voice.reason === 'timeout' ? t('voice.timeout') : t('voice.failed', { reason: voice.reason }) }}
                </p>
            </div>
            <div class="editor-voice-actions">
                <template v-if="voice.step === 'intro'">
                    <button type="button" class="action-btn action-btn--primary" @click="$emit('turn-on')">{{ t('voice.turnOn') }}</button>
                    <button type="button" class="action-btn" @click="$emit('close')">{{ t('voice.notNow') }}</button>
                </template>
                <button v-else-if="voice.step === 'listening'" type="button" class="action-btn action-btn--primary" @click="$emit('toggle')">{{ t('voice.stop') }}</button>
                <template v-else-if="voice.step === 'result' || voice.step === 'failed'">
                    <button v-if="voice.step === 'result' && voice.outcome.kind === 'question'" type="button" class="action-btn action-btn--primary" @click="$emit('ask-guide', voice.heard)">{{ t('voice.askGuide') }}</button>
                    <button v-if="voice.reason !== 'unsupported'" type="button" class="action-btn" @click="$emit('toggle')">{{ t('voice.again') }}</button>
                    <button type="button" class="action-btn" @click="$emit('turn-off')">{{ t('voice.turnOff') }}</button>
                    <button type="button" class="action-btn" @click="$emit('remove')">{{ t('voice.remove') }}</button>
                    <button type="button" class="action-btn" @click="$emit('close')">{{ t('voice.close') }}</button>
                </template>
                <button v-else-if="voice.step === 'removed'" type="button" class="action-btn" @click="$emit('close')">{{ t('voice.close') }}</button>
            </div>
        </div>
    `
};
