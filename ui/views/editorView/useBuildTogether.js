import { computed, inject, onBeforeUnmount, ref, shallowRef } from 'vue';
import { WalkTogetherGuestStatus, WalkTogetherStatus } from '../../../application/walkTogether/WalkTogether.js';
import { BuildTogetherOutcome, BuildTogetherRole } from '../../../application/buildTogether/BuildTogetherSession.js';
import { buildTogetherLink } from '../../../core/WalkTogetherCode.js';
import { resolveSigningIdentityId } from '../../../identity/resolveSigningIdentityId.js';
import { EditorEvent } from '../../../core/events/EditorEvent.js';
import { displayText, t } from '../../i18n/i18n.js';

// The Editor's "Build with me" (docs/reviews/CreativeDirection-2026-10-11.md,
// finding 3). The host makes a link (application/walkTogether/WalkTogether.js,
// createBuildHost) for the build open here, which must be their own; each
// friend who joins through it may edit this build while it stays open here
// and until Stop (application/buildTogether/BuildTogetherSession.js). A
// friend's Editor opens with `?together=<build>&host=<identity>` (from
// ui/views/WalkTogetherJoinView.js) and asks the host for the build.
//
// While building together, each Editor shares where its pointer is and what
// it has selected, drawn in the other Editors in that person's colour, and
// Undo is paused (EditorSession#setSharedEditing). Leaving the Editor, or
// opening another build, ends it.

const PRESENCE_INTERVAL_MS = 150;
// Presence is sent again now and then while nothing moves, so a co-builder
// who is only looking stays shown.
const PRESENCE_HEARTBEAT_MS = 20 * 1000;

const OUTCOME_KEYS = Object.freeze({
    [BuildTogetherOutcome.REFUSED]: 'buildTogether.refused',
    [BuildTogetherOutcome.NOT_CONNECTED]: 'buildTogether.notConnected',
    [BuildTogetherOutcome.TIMED_OUT]: 'buildTogether.timedOut',
    [BuildTogetherOutcome.NOT_VERIFIED]: 'buildTogether.notVerified'
});

export function useBuildTogether({ session, editorSession, editorContext, documentManager, identityProvider, feedback }) {
    const walkTogether = inject('walkTogether', null);
    const identityUseCase = inject('identityUseCase', null);
    const funnel = inject('funnelEventCounter', null);
    const appUrl = inject('appUrl', () => window.location.href);

    const buildAvailable = Boolean(walkTogether && walkTogether.available && session);
    const showBuildDialog = ref(false);
    const signInToBuild = ref(false);
    const buildState = ref(null);
    const buildRole = ref(null);
    const buildSharing = ref(false);
    const coBuilders = shallowRef([]);
    const joinedTitle = ref(null);
    // The session's joined build, as the strip shows it.
    const joinedState = shallowRef(null);
    const buildLink = computed(() => (buildState.value && buildState.value.code ? buildTogetherLink(buildState.value.code, appUrl()) : ''));
    // Revalidated when the dialog opens: the open build must be this
    // identity's own.
    const buildNeedsOwner = ref(false);
    let host = null;
    let unsubscribeHost = null;
    let lastPresenceAt = 0;
    let presenceTimer = null;
    let heartbeat = null;
    let pointer = null;
    let announcedGuests = new Set();

    function ownsOpenBuild() {
        const document = documentManager.document;
        const me = resolveSigningIdentityId(identityProvider);
        return Boolean(document && me && document.metadata.authorIdentityId === me);
    }

    // A build begun here before logging in has no owner yet: sharing it
    // makes it this identity's (DocumentMetadata#claimOwner), saved with
    // the next autosave.
    function claimUnownedBuild() {
        const document = documentManager.document;
        const me = resolveSigningIdentityId(identityProvider);
        if (!document || !me) return;
        const user = identityProvider && typeof identityProvider.currentUser === 'function' ? identityProvider.currentUser() : null;
        if (document.metadata.claimOwner({ author: user ? user.username : null, authorIdentityId: me })) documentManager.markDirty();
    }

    function refresh() {
        if (!session) return;
        buildRole.value = session.role;
        joinedState.value = session.joined;
        const sharing = session.isSharing();
        buildSharing.value = sharing;
        editorSession.setSharedEditing(sharing);
        const people = session.coBuilders();
        coBuilders.value = people;
        editorSession.showCoBuilders(people);
        if (sharing && !heartbeat) {
            heartbeat = setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
        } else if (!sharing && heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
    }

    let joinedEnded = false;
    const unsubscribeSession = session ? session.onChange(() => {
        const wasEnded = joinedEnded;
        const joined = session.joined;
        joinedEnded = Boolean(joined && joined.ended);
        if (joinedEnded && !wasEnded) feedback.show(t('buildTogether.ended', { name: joined.hostName || t('walkTogether.someone') }), { durationMs: 10000 });
        refresh();
    }) : null;

    // ------------------------------------------------------------- hosting

    function stopHostLink() {
        if (unsubscribeHost) unsubscribeHost();
        unsubscribeHost = null;
        if (host) host.close();
        host = null;
        buildState.value = null;
    }

    function onHostState(state) {
        buildState.value = state;
        for (const guest of state.guests || []) {
            if (guest.status !== WalkTogetherGuestStatus.JOINED || !guest.identityId || announcedGuests.has(guest.identityId)) continue;
            announcedGuests.add(guest.identityId);
            session.allow(guest.identityId, guest.name);
            feedback.show(t('buildTogether.joined', { name: guest.name || t('walkTogether.someone') }));
        }
    }

    async function startBuild() {
        if (!buildAvailable) return;
        if (!walkTogether.canWalk()) {
            signInToBuild.value = true;
            return;
        }
        claimUnownedBuild();
        buildNeedsOwner.value = !ownsOpenBuild();
        if (buildNeedsOwner.value) return;
        const document = documentManager.document;
        stopHostLink();
        session.host(document.world.id);
        const user = identityUseCase ? identityUseCase.currentUser() : null;
        const next = walkTogether.createBuildHost({
            build: { documentId: document.world.id, title: displayText(document.metadata.title) || null },
            hostName: user ? user.displayName : null
        });
        host = next;
        buildState.value = next.state;
        unsubscribeHost = next.onChange(onHostState);
        await next.start();
        if (host === next && next.state.status === WalkTogetherStatus.WAITING && funnel && typeof funnel.madeBuildLink === 'function') funnel.madeBuildLink();
    }

    function openBuildDialog() {
        showBuildDialog.value = true;
        claimUnownedBuild();
        buildNeedsOwner.value = buildAvailable && Boolean(resolveSigningIdentityId(identityProvider)) && !ownsOpenBuild();
        if (buildNeedsOwner.value) return;
        if (!buildState.value || buildState.value.status !== WalkTogetherStatus.WAITING) startBuild();
    }

    function closeBuildDialog() {
        showBuildDialog.value = false;
    }

    // Stop: the link stops working, and nobody else may edit this build.
    function stopBuild() {
        stopHostLink();
        announcedGuests = new Set();
        if (session) session.stopHosting();
        showBuildDialog.value = false;
        refresh();
    }

    function buildSignedIn() {
        signInToBuild.value = false;
        startBuild();
    }

    // -------------------------------------------------------------- joined

    // `query`: the Editor's route query from a build link. True when it
    // names one (the Editor then shows nothing else on arrival).
    function joinFromRoute(query) {
        if (!session || typeof query.together !== 'string' || !query.together) return false;
        const hostName = typeof query.hostName === 'string' ? query.hostName : null;
        const title = typeof query.title === 'string' ? query.title : null;
        joinedTitle.value = title;
        const name = hostName || t('walkTogether.someone');
        feedback.show(t('buildTogether.opening', { name }));
        session.join({ documentId: query.together, hostIdentityId: typeof query.host === 'string' ? query.host : '', hostName }).then((outcome) => {
            if (outcome === BuildTogetherOutcome.OPENED) {
                editorSession.frameDocument();
                feedback.show(t('buildTogether.opened', { name, title: title || displayText(documentManager.document?.metadata.title) || t('buildTogether.theirBuild') }));
            } else {
                feedback.show(t(OUTCOME_KEYS[outcome] || 'buildTogether.notConnected', { name }), { durationMs: 10000 });
            }
            refresh();
        });
        return true;
    }

    function leaveBuild() {
        if (session) session.leave();
        refresh();
    }

    // Another build opened here ends building together on this one.
    function onDocumentChanged() {
        if (!session) return;
        const openId = documentManager.document ? documentManager.document.world.id : null;
        if (session.role === BuildTogetherRole.HOST && openId !== session.hostedDocumentId) {
            stopBuild();
            feedback.show(t('buildTogether.stoppedOtherBuild'));
        } else if (session.role === BuildTogetherRole.GUEST && session.joined?.opened && openId !== session.joined.documentId) {
            leaveBuild();
        }
        refresh();
    }
    const unsubscribeDocument = documentManager.onStateChanged ? documentManager.onStateChanged(onDocumentChanged) : null;

    // ------------------------------------------------------------ presence

    function sendPresence() {
        if (!session || !session.role) return;
        lastPresenceAt = Date.now();
        session.sharePresence({ pointer, selection: editorSession.selectedBrickIds() });
    }

    function schedulePresence() {
        if (!session || !session.role || presenceTimer) return;
        const wait = Math.max(0, PRESENCE_INTERVAL_MS - (Date.now() - lastPresenceAt));
        presenceTimer = setTimeout(() => {
            presenceTimer = null;
            sendPresence();
        }, wait);
    }

    // Called with the viewport's pointer moves.
    function notePointer(event) {
        if (!session || !session.role) return;
        pointer = editorSession.pointAt(event.clientX, event.clientY);
        schedulePresence();
    }

    function notePointerLeft() {
        pointer = null;
        schedulePresence();
    }

    const selectionSubscription = editorContext && editorContext.eventBus
        ? editorContext.eventBus.subscribe(EditorEvent.SELECTION_CHANGED, schedulePresence)
        : null;

    function disposeBuildTogether() {
        stopHostLink();
        if (presenceTimer) clearTimeout(presenceTimer);
        if (heartbeat) clearInterval(heartbeat);
        if (selectionSubscription) selectionSubscription.unsubscribe();
        if (unsubscribeDocument) unsubscribeDocument();
        if (unsubscribeSession) unsubscribeSession();
        if (session) session.dispose();
        editorSession.setSharedEditing(false);
    }
    onBeforeUnmount(disposeBuildTogether);

    const buildStripTitle = computed(() => {
        if (buildRole.value === BuildTogetherRole.GUEST) {
            const joined = joinedState.value;
            const name = (joined && joined.hostName) || t('walkTogether.someone');
            if (joined && joined.ended) return t('buildTogether.strip.ended', { name });
            return joinedTitle.value ? t('buildTogether.strip.guestOf', { name, title: joinedTitle.value }) : t('buildTogether.strip.guestOfSomeone', { name });
        }
        return coBuilders.value.length ? t('buildTogether.strip.hosting') : t('buildTogether.strip.waiting');
    });

    return {
        buildAvailable, showBuildDialog, signInToBuild, buildState, buildLink, buildNeedsOwner, buildRole, buildSharing,
        coBuilders, buildStripTitle,
        openBuildDialog, closeBuildDialog, startBuild, stopBuild, buildSignedIn, joinFromRoute, leaveBuild,
        notePointer, notePointerLeft
    };
}

