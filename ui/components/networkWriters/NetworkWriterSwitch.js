import { inject, ref } from 'vue';
import { t } from '../../i18n/i18n.js';

// One network writer's switch (core/NetworkWriters.js), on that network's own
// settings page: "Post to Steem from this device". Saved as soon as it
// changes; what the app offers follows at once (useWritableNetworks.js).
export default {
    name: 'NetworkWriterSwitch',
    props: {
        writer: { type: String, required: true },
        label: { type: String, required: true },
        hint: { type: String, default: '' }
    },
    setup(props) {
        const store = inject('networkWriterSettingsStore', null);
        const enabled = ref(store ? store.isEnabled(props.writer) : false);
        function toggle(event) {
            if (!store) return;
            enabled.value = store.setEnabled(props.writer, event.target.checked)[props.writer] === true;
        }
        return { t, enabled, toggle, available: Boolean(store) };
    },
    template: `
        <div v-if="available" class="network-writer network-writer-switch">
            <label class="your-data-checkbox">
                <input type="checkbox" :class="'network-writer-toggle network-writer-toggle--' + writer" :checked="enabled" @change="toggle">
                {{ label }}
            </label>
            <p v-if="hint" class="form-hint form-hint--neutral">{{ hint }}</p>
        </div>
    `
};
