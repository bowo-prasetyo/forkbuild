import { computed, ref } from 'vue';
import { PUBLISH_SHEET_DEFAULTS, PublishSheetRow } from '../../core/publication/PublishSheet.js';
import { t } from '../i18n/i18n.js';

// A first Publish, in one sheet (core/publication/PublishSheet.js;
// docs/Pillars.md, "Infrastructure, kept out of sight"): the name to publish
// under, with a suggestion filled in, and the two choices Publish needs,
// already made (others may remix it, everyone can find it) and changeable
// right here. One Publish button sends it; Keep building closes the sheet.
// Publishing with no name waits under Advanced. Shows only the rows in
// `rows`. Emits publish({ name, remix, everyone }),
// publish-unsigned({ remix, everyone }) or cancel; the Toolbar does the
// work and says, through `busy` and `error`, how it went.
export default {
    name: 'PublishSheet',
    props: {
        rows: { type: Array, required: true },
        suggestedName: { type: String, default: '' },
        busy: { type: Boolean, default: false },
        error: { type: String, default: '' }
    },
    emits: ['publish', 'publish-unsigned', 'cancel'],
    setup(props, { emit }) {
        const name = ref(props.suggestedName);
        const remix = ref(PUBLISH_SHEET_DEFAULTS.remix);
        const everyone = ref(PUBLISH_SHEET_DEFAULTS.everyone);
        const asksName = computed(() => props.rows.includes(PublishSheetRow.NAME));
        const asksRemix = computed(() => props.rows.includes(PublishSheetRow.REMIX));
        const asksFind = computed(() => props.rows.includes(PublishSheetRow.FIND));
        const trimmedName = computed(() => name.value.trim());
        const canPublish = computed(() => !props.busy && (!asksName.value || trimmedName.value !== ''));
        const publishText = computed(() => (asksName.value && trimmedName.value
            ? t('loginModal.quick.publishAs', { name: trimmedName.value })
            : t('toolbar.publish')));

        function publish() {
            if (!canPublish.value) return;
            emit('publish', { name: trimmedName.value, remix: remix.value, everyone: everyone.value });
        }

        function publishUnsigned() {
            if (props.busy) return;
            emit('publish-unsigned', { remix: remix.value, everyone: everyone.value });
        }

        return { t, name, remix, everyone, asksName, asksRemix, asksFind, canPublish, publishText, publish, publishUnsigned };
    },
    mounted() {
        const nameInput = this.$el.querySelector('.publish-sheet-name');
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
            return;
        }
        this.$el.querySelector('.publish-sheet-publish')?.focus();
    },
    methods: {
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-sheet-title"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel publish-sheet">
                <h3 id="publish-sheet-title">{{ t('publishSheet.title') }}</h3>
                <p class="publish-sheet-lead">{{ t('publishSheet.lead') }}</p>
                <label v-if="asksName" class="publish-sheet-field">
                    <span class="publish-sheet-label">{{ t('loginModal.quick.name') }}</span>
                    <input
                        v-model="name"
                        type="text"
                        class="modal-input publish-sheet-name"
                        maxlength="60"
                        @keydown.enter="publish"
                    />
                    <span class="publish-sheet-hint">{{ t('loginModal.quick.publishLead') }}</span>
                </label>
                <label v-if="asksRemix" class="publish-sheet-choice publish-sheet-remix">
                    <input v-model="remix" type="checkbox" />
                    <span class="publish-sheet-choice-text">
                        <span class="publish-sheet-label">{{ t('publishSheet.remix') }}</span>
                        <span class="publish-sheet-hint">{{ remix ? t('remixPermission.allowDescription') : t('remixPermission.lookOnlyDescription') }}</span>
                    </span>
                </label>
                <label v-if="asksFind" class="publish-sheet-choice publish-sheet-everyone">
                    <input v-model="everyone" type="checkbox" />
                    <span class="publish-sheet-choice-text">
                        <span class="publish-sheet-label">{{ t('publishSheet.everyone') }}</span>
                        <span class="publish-sheet-hint">{{ everyone ? t('findability.everyoneDescription') : t('findability.linkDescription') }}</span>
                    </span>
                </label>
                <p class="publish-sheet-later">{{ t('publishSheet.later') }}</p>
                <p v-if="error" class="identity-unlock-error publish-sheet-error">{{ error }}</p>
                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary publish-sheet-cancel" @click="$emit('cancel')">{{ t('toolbar.nothingAddedKeep') }}</button>
                    <button type="button" class="action-btn action-btn--primary publish-sheet-publish" :disabled="!canPublish" @click="publish">{{ busy ? t('loginModal.creating') : publishText }}</button>
                </div>
                <details v-if="asksName" class="publish-sheet-advanced">
                    <summary>{{ t('app.nav.group.advanced') }}</summary>
                    <button type="button" class="action-btn action-btn--secondary publish-sheet-unsigned" :disabled="busy" @click="publishUnsigned">{{ t('publishSheet.unsigned') }}</button>
                    <span class="publish-sheet-hint">{{ t('publishSheet.unsignedHint') }}</span>
                </details>
            </div>
        </div>
    `
};
