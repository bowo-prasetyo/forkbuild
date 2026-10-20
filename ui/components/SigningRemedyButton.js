import { inject } from 'vue';
import { SigningRemedy } from '../../identity/SigningReadiness.js';
import { t } from '../i18n/i18n.js';

// Next to a refusal, the one thing that fixes it: Unlock, Choose a name or
// Switch name. It asks the header's UserWidget (through App.js's
// `nameRemedy`) to open the same dialog its own menu opens, so there is one
// way to unlock wherever the refusal is shown. Nothing shows where no header
// is mounted.
const LABEL_KEYS = Object.freeze({
    [SigningRemedy.UNLOCK]: 'userWidget.unlock',
    [SigningRemedy.CHOOSE_NAME]: 'userWidget.chooseName',
    [SigningRemedy.SWITCH_NAME]: 'userWidget.switchName'
});

export default {
    name: 'SigningRemedyButton',
    props: {
        remedy: { type: String, default: null }
    },
    setup(props) {
        const nameRemedy = inject('nameRemedy', null);
        function request() {
            if (nameRemedy) nameRemedy.request(props.remedy);
        }
        return { t, nameRemedy, labelKey: (remedy) => LABEL_KEYS[remedy] || null, request };
    },
    template: `
        <button
            v-if="nameRemedy && labelKey(remedy)"
            type="button"
            class="action-btn action-btn--secondary signing-remedy-button"
            @click="request"
        >{{ t(labelKey(remedy)) }}</button>
    `
};
