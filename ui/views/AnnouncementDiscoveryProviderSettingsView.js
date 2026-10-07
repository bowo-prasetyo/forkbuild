import { computed, inject, ref } from 'vue';
import { useRoleProviderPreferenceForm } from '../composables/useRoleProviderPreferenceForm.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { describeRoleProviderPreferenceSettings } from '../../application/settings/RoleProviderPreferenceSettingsView.js';
import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';
import { LOCAL_AND_PEERS_ONLY } from '../../core/CommentaryDistributionProvider.js';
import { commentaryDistributionProviderLabel } from '../components/CommentaryDistributionPicker.js';
import { displayText, errorText, t } from '../i18n/i18n.js';

// Mirrors ui/views/ContentProviderSettingsView.js's own shape, one role
// over — the same small, dedicated settings page, the same
// RoleProviderPreferenceStore/SetRoleProviderPreferenceUseCase pair
// (application/settings/RoleProviderPreferenceSettingsView.js's own
// describeRoleProviderPreferenceSettings() is already role-agnostic; this
// view is the first caller to pass it RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY
// rather than CONTENT).
//
// Chooses which substrate this replica's own composition roots — Publication,
// Snapshot, and Place Naming distribution, and Commentary distribution's
// own asynchronous publish — construct their announcement/discovery
// collaborator against (see application/publication/distribution/PublicationDistributionRuntimeComposition.js,
// application/snapshot/SnapshotDistributionRuntimeComposition.js, application/
// PlaceNamingPublicationRuntimeComposition.js, and ui/main.js's own
// addPublicationCommentaryCommand()). A caller that already offers its own
// explicit, per-action Nostr/Arweave choice (WorldEncounterCanvas's own
// "Announcement / Discovery substrate" control, and addPublicationCommentaryCommand's
// own input.discoveryProvider) still wins for that one call — this
// preference is read only as the DEFAULT when no explicit per-call choice
// is made. It only picks where to ANNOUNCE: discovery reads every substrate
// regardless (see ui/main/composeSnapshotDiscovery.js, ui/main/
// composeWorldDiscovery.js and ui/main.js's own refreshPublicationCommentaryCommand).
//
// UNLIKE CONTENT, THE PROVIDER LIST IS HARDCODED HERE, NOT READ FROM A
// REGISTRY. Announcement & Discovery has no keyed registry the way
// content/ContentStore.js's own SnapshotPlacementStoreRegistry does (see
// application/settings/RoleAwareProviderResolver.js's own header, "Discovery has NO
// such registry yet") — 'nostr'/'arweave' are this codebase's only two
// real Announcement/Discovery substrates today, named here the same way
// every composition root above already names them as literal strings.
//
// Both keys already title-case to "Nostr"/"Arweave" through
// describeRoleProviderPreferenceSettings()'s own label fallback, so no
// label map is needed here.
const AVAILABLE_PROVIDER_KEYS = ['nostr', 'arweave', 'steem', 'blurt'];

// The Comments section's "same as above" choice: nothing saved, so comments
// follow the Announcement / Discovery provider.
const FOLLOW_ANNOUNCEMENT_DISCOVERY = '';

export default {
    name: 'AnnouncementDiscoveryProviderSettingsView',
    setup() {
        const preferenceStore = inject('roleProviderPreferenceStore', null);
        const setRoleProviderPreferenceUseCase = inject('setRoleProviderPreferenceUseCase', null);

        const form = useRoleProviderPreferenceForm({
            role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY,
            preferenceStore,
            setUseCase: setRoleProviderPreferenceUseCase
        });

        const settings = computed(() => sortOptionsByLabel(describeRoleProviderPreferenceSettings({
            availableProviderKeys: AVAILABLE_PROVIDER_KEYS
        }).options));

        // Comments: their own default, saved apart from the role preference
        // because "Local & peers only" is a choice only comments have.
        // Nothing saved means comments follow the choice above.
        const commentaryPreferenceStore = inject('commentaryDistributionPreferenceStore', null);
        const commentaryOptions = [
            { providerKey: FOLLOW_ANNOUNCEMENT_DISCOVERY, label: t('announcementDiscoveryProviderSettingsView.commentsFollow') },
            ...sortOptionsByLabel(AVAILABLE_PROVIDER_KEYS.map((providerKey) => ({ providerKey, label: commentaryDistributionProviderLabel(providerKey) }))),
            { providerKey: LOCAL_AND_PEERS_ONLY, label: commentaryDistributionProviderLabel(LOCAL_AND_PEERS_ONLY) }
        ];
        const selectedCommentaryProviderKey = ref((commentaryPreferenceStore && commentaryPreferenceStore.get()) || FOLLOW_ANNOUNCEMENT_DISCOVERY);
        const commentarySaveError = ref(null);
        const commentarySaveStatus = ref('idle'); // 'idle' | 'saved'
        function saveCommentary() {
            if (!commentaryPreferenceStore) return;
            commentarySaveError.value = null;
            try {
                commentaryPreferenceStore.save(selectedCommentaryProviderKey.value || null);
                commentarySaveStatus.value = 'saved';
            } catch (error) {
                commentarySaveStatus.value = 'idle';
                commentarySaveError.value = errorText(error);
            }
        }

        return {
            t,
            displayText,
            settings, selectedProviderKey: form.selectedProviderKey,
            saveError: form.saveError, saveStatus: form.saveStatus, save: form.save,
            commentaryOptions, selectedCommentaryProviderKey, commentarySaveError, commentarySaveStatus, saveCommentary,
            hasCommentaryPreferenceStore: !!commentaryPreferenceStore
        };
    },
    template: `
        <section class="announcement-discovery-provider-settings-view">
            <h1>{{ t('announcementDiscoveryProviderSettingsView.announcementDiscoveryProvider') }}</h1>
            <p class="form-hint form-hint--neutral">
                {{ t('announcementDiscoveryProviderSettingsView.chooseTheDefaultDecentralizedSubstrate') }}
            </p>
            <p class="form-hint form-hint--neutral">
                {{ t('announcementDiscoveryProviderSettingsView.thisChoiceNeverNarrowsDiscovery') }}
            </p>
            <p class="form-hint form-hint--neutral">
                {{ t('announcementDiscoveryProviderSettingsView.savingHereTakesEffectThe') }}
            </p>

            <div class="announcement-discovery-provider-settings-form">
                <label v-for="opt in settings" :key="opt.providerKey" class="announcement-discovery-provider-option">
                    <input type="radio" name="announcement-discovery-provider-preference" :value="opt.providerKey" v-model="selectedProviderKey" />
                    {{ displayText(opt.label) }}
                </label>

                <p v-if="saveError" class="form-hint">{{ saveError }}</p>
                <p v-if="saveStatus === 'saved'" class="form-hint form-hint--neutral">{{ t('announcementDiscoveryProviderSettingsView.saved') }}</p>

                <button class="action-btn action-btn--primary" @click="save" :disabled="!selectedProviderKey">{{ t('announcementDiscoveryProviderSettingsView.save') }}</button>
            </div>

            <template v-if="hasCommentaryPreferenceStore">
                <h2>{{ t('announcementDiscoveryProviderSettingsView.comments') }}</h2>
                <p class="form-hint form-hint--neutral">
                    {{ t('announcementDiscoveryProviderSettingsView.commentsHint') }}
                </p>

                <div class="announcement-discovery-provider-settings-form commentary-distribution-preference-form">
                    <label v-for="opt in commentaryOptions" :key="opt.providerKey" class="announcement-discovery-provider-option">
                        <input type="radio" name="commentary-distribution-preference" :value="opt.providerKey" v-model="selectedCommentaryProviderKey" />
                        {{ opt.label }}
                    </label>

                    <p v-if="commentarySaveError" class="form-hint">{{ commentarySaveError }}</p>
                    <p v-if="commentarySaveStatus === 'saved'" class="form-hint form-hint--neutral">{{ t('announcementDiscoveryProviderSettingsView.saved') }}</p>

                    <button class="action-btn action-btn--primary commentary-distribution-preference-save" @click="saveCommentary">{{ t('announcementDiscoveryProviderSettingsView.save') }}</button>
                </div>
            </template>
        </section>
    `
};
