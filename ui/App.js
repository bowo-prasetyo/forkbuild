import { computed, inject, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserWidget from './components/UserWidget.js';
import ExperimentalBanner from './components/ExperimentalBanner.js';
import BackupReminderBanner from './components/BackupReminderBanner.js';
import NotificationHistoryPanel from './components/NotificationHistoryPanel.js';
import PageLoadFailureNotice from './components/PageLoadFailureNotice.js';
import { CreatePreviewUseCase } from '../application/editor/CreatePreviewUseCase.js';
import { t } from './i18n/i18n.js';

export default {
    name: 'App',
    components: { UserWidget, ExperimentalBanner, BackupReminderBanner, NotificationHistoryPanel, PageLoadFailureNotice },
    // 0.2.32: one app-wide PreviewService, provided here (same
    // provide/inject convention LoginModal's identityUseCase already
    // uses) so its cache and generation queue survive navigating
    // between Repository, Author, and back — see
    // application/editor/CreatePreviewUseCase.js.
    setup() {
        const { previewService } = new CreatePreviewUseCase().execute();
        provide('previewService', previewService);

        // On phone-width screens the nav folds behind a Menu button; choosing a page
        // folds it again. The pages a newcomer needs are always in the nav; the
        // rest are grouped under More, which a phone's Menu shows open.
        const route = useRoute();
        const router = useRouter();
        const menuOpen = ref(false);
        const moreOpen = ref(false);
        const moreMenu = ref(null);
        watch(() => route.fullPath, () => {
            menuOpen.value = false;
            moreOpen.value = false;
        });
        const PRIMARY_PATHS = ['/', '/editor', '/repository', '/worlds/recent'];
        const inMore = computed(() => !PRIMARY_PATHS.includes(route.path)
            && !route.path.startsWith('/world/') && !route.path.startsWith('/view/') && !route.path.startsWith('/s/'));
        function closeMoreOnOutsideClick(event) {
            if (moreOpen.value && moreMenu.value && !moreMenu.value.contains(event.target)) {
                moreOpen.value = false;
            }
        }
        function closeMoreOnEscape(event) {
            if (event.key === 'Escape' && moreOpen.value) {
                moreOpen.value = false;
            }
        }
        onMounted(() => {
            document.addEventListener('click', closeMoreOnOutsideClick);
            document.addEventListener('keydown', closeMoreOnEscape);
        });
        onBeforeUnmount(() => {
            document.removeEventListener('click', closeMoreOnOutsideClick);
            document.removeEventListener('keydown', closeMoreOnEscape);
        });

        // Notifications, in the header on every page: a read-only history of what
        // was addressed to the signed-in identity (NotificationHistoryPanel).
        const notificationHistoryAccess = inject('notificationHistoryAccess', null);
        const notificationsOpen = ref(false);
        const getRecipientNotificationEventsCommand = notificationHistoryAccess
            ? () => notificationHistoryAccess.getRecipientNotificationEvents()
            : null;

        // A mounted World View registers its focusWorld() here: inside a live World
        // View, changing the route alone does not change the World it shows (its
        // route follows its session, not the reverse). Elsewhere, Explore routes.
        let worldFocusHandler = null;
        provide('notificationWorldNavigation', {
            register(handler) {
                worldFocusHandler = handler;
                return () => {
                    if (worldFocusHandler === handler) {
                        worldFocusHandler = null;
                    }
                };
            }
        });

        function openNotifications() {
            menuOpen.value = false;
            notificationsOpen.value = true;
        }

        // `(publicationId) -> boolean`: false leaves the panel open and marks the
        // entry "No longer available".
        function viewNotificationPublication(publicationId) {
            const documentId = notificationHistoryAccess
                ? notificationHistoryAccess.findPublicationDocumentId(publicationId)
                : null;
            if (!documentId) {
                return false;
            }
            notificationsOpen.value = false;
            if (worldFocusHandler) {
                worldFocusHandler(documentId);
            } else {
                router.push({ path: `/world/${documentId}` });
            }
            return true;
        }

        return {
            t, menuOpen, moreOpen, moreMenu, inMore, notificationsOpen, openNotifications,
            getRecipientNotificationEventsCommand, viewNotificationPublication
        };
    },
    template: `
        <div class="app-shell">
            <header class="app-header">
                <span class="app-title">ForkBuild</span>
                <button
                    type="button"
                    class="app-menu-toggle"
                    :aria-expanded="menuOpen ? 'true' : 'false'"
                    @click="menuOpen = !menuOpen"
                >{{ menuOpen ? t('app.menu.close') : t('app.menu.open') }}</button>
                <div class="app-header-right">
                    <nav :class="['app-nav', { 'app-nav--open': menuOpen }]" :aria-label="t('app.nav.label')">
                        <router-link to="/" class="app-nav-link">{{ t('app.nav.home') }}</router-link>
                        <router-link to="/editor" class="app-nav-link">{{ t('app.nav.editor') }}</router-link>
                        <router-link to="/repository" class="app-nav-link">{{ t('app.nav.repository') }}</router-link>
                        <router-link to="/worlds/recent" class="app-nav-link">{{ t('app.nav.myWorlds') }}</router-link>
                        <div ref="moreMenu" :class="['app-nav-more', { 'app-nav-more--open': moreOpen }]">
                            <button
                                type="button"
                                :class="['app-nav-link', 'app-nav-more-toggle', { 'app-nav-more-toggle--active': inMore }]"
                                aria-haspopup="true"
                                :aria-expanded="moreOpen ? 'true' : 'false'"
                                @click="moreOpen = !moreOpen"
                            >{{ t('app.nav.more') }}</button>
                            <div class="app-nav-more-panel">
                                <div class="app-nav-group" role="group" :aria-label="t('app.nav.group.you')">
                                    <span class="app-nav-group-label" aria-hidden="true">{{ t('app.nav.group.you') }}</span>
                                    <router-link to="/avatar" class="app-nav-link">{{ t('app.nav.myAvatar') }}</router-link>
                                    <router-link to="/identity" class="app-nav-link">{{ t('app.nav.myIdentities') }}</router-link>
                                    <router-link to="/settings/data" class="app-nav-link">{{ t('app.nav.yourData') }}</router-link>
                                </div>
                                <div class="app-nav-group" role="group" :aria-label="t('app.nav.group.people')">
                                    <span class="app-nav-group-label" aria-hidden="true">{{ t('app.nav.group.people') }}</span>
                                    <router-link to="/peers" class="app-nav-link">{{ t('app.nav.peers') }}</router-link>
                                    <router-link to="/following" class="app-nav-link">{{ t('app.nav.following') }}</router-link>
                                    <router-link to="/conversations" class="app-nav-link">{{ t('app.nav.conversations') }}</router-link>
                                </div>
                                <div class="app-nav-group" role="group" :aria-label="t('app.nav.group.network')">
                                    <span class="app-nav-group-label" aria-hidden="true">{{ t('app.nav.group.network') }}</span>
                                    <router-link to="/publications" class="app-nav-link">{{ t('app.nav.publications') }}</router-link>
                                    <router-link to="/settings" class="app-nav-link">{{ t('app.nav.networkSettings') }}</router-link>
                                </div>
                                <div class="app-nav-group" role="group" :aria-label="t('app.nav.group.app')">
                                    <span class="app-nav-group-label" aria-hidden="true">{{ t('app.nav.group.app') }}</span>
                                    <router-link to="/settings/language" class="app-nav-link">{{ t('app.nav.language') }}</router-link>
                                    <router-link to="/about" class="app-nav-link">{{ t('app.nav.about') }}</router-link>
                                </div>
                            </div>
                        </div>
                    </nav>
                    <!-- Beside the account: notifications are addressed to the signed-in identity. -->
                    <button
                        type="button"
                        class="app-notifications-button"
                        :title="t('app.notifications')"
                        :aria-label="t('app.notifications')"
                        @click="openNotifications"
                    >🔔</button>
                    <UserWidget />
                </div>
            </header>

            <BackupReminderBanner :path="$route.path" @open-your-data="$router.push('/settings/data')" />
            <ExperimentalBanner v-if="$route.meta.experimental" />
            <PageLoadFailureNotice />
            <main class="app-content">
                <router-view />
            </main>
            <NotificationHistoryPanel
                v-if="notificationsOpen"
                :getRecipientNotificationEventsCommand="getRecipientNotificationEventsCommand"
                :viewPublicationCommand="viewNotificationPublication"
                @cancel="notificationsOpen = false"
            />
        </div>
    `
};
