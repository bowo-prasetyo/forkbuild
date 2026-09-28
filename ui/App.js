import { inject, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserWidget from './components/UserWidget.js';
import ExperimentalBanner from './components/ExperimentalBanner.js';
import NotificationHistoryPanel from './components/NotificationHistoryPanel.js';
import { CreatePreviewUseCase } from '../application/editor/CreatePreviewUseCase.js';

export default {
    name: 'App',
    components: { UserWidget, ExperimentalBanner, NotificationHistoryPanel },
    // 0.2.32: one app-wide PreviewService, provided here (same
    // provide/inject convention LoginModal's identityUseCase already
    // uses) so its cache and generation queue survive navigating
    // between Repository, Author, and back — see
    // application/editor/CreatePreviewUseCase.js.
    setup() {
        const { previewService } = new CreatePreviewUseCase().execute();
        provide('previewService', previewService);

        // On phone-width screens the nav folds behind a Menu button; choosing a page
        // folds it again.
        const route = useRoute();
        const router = useRouter();
        const menuOpen = ref(false);
        watch(() => route.fullPath, () => { menuOpen.value = false; });

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
            menuOpen, notificationsOpen, openNotifications,
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
                >{{ menuOpen ? 'Close' : 'Menu' }}</button>
                <div class="app-header-right">
	                <nav :class="['app-nav', { 'app-nav--open': menuOpen }]">
	                    <router-link to="/" class="app-nav-link">Home</router-link>
	                    <router-link to="/editor" class="app-nav-link">Editor</router-link>
	                    <router-link to="/repository" class="app-nav-link">Repository</router-link>
	                    <router-link to="/worlds/recent" class="app-nav-link">My Worlds</router-link>
	                    <router-link to="/avatar" class="app-nav-link">My Avatar</router-link>
	                    <router-link to="/identity" class="app-nav-link">My Identities</router-link>
	                    <router-link to="/peers" class="app-nav-link">Peers</router-link>
	                    <router-link to="/following" class="app-nav-link">Following</router-link>
	                    <router-link to="/conversations" class="app-nav-link">Conversations</router-link>
	                    <router-link to="/publications" class="app-nav-link">Publications</router-link>
	                    <router-link to="/settings" class="app-nav-link">Network Settings</router-link>
	                    <router-link to="/settings/data" class="app-nav-link">Your Data</router-link>
	                    <router-link to="/about" class="app-nav-link">About</router-link>
	                </nav>
                    <!-- Beside the account: notifications are addressed to the signed-in identity. -->
                    <button
                        type="button"
                        class="app-notifications-button"
                        title="Notifications"
                        aria-label="Notifications"
                        @click="openNotifications"
                    >🔔</button>
                    <UserWidget />
                </div>
            </header>

            <ExperimentalBanner v-if="$route.meta.experimental" />
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
