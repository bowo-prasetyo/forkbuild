// @environment browser
import { createApp, nextTick, ref, shallowRef } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import CallBar from '../ui/components/CallBar.js';
import AvatarInfoPanel from '../ui/components/AvatarInfoPanel.js';
import { useAvatarCall } from '../ui/voice/useAvatarCall.js';
import { VoiceSessionState } from '../core/social/VoiceSessionState.js';
import { VoiceCallEndReason } from '../core/social/VoiceCallEndReason.js';
import { fakeVoiceUseCase } from './support/FakeVoiceUseCase.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// A call on every page (ui/components/CallBar.js), rendered by real Vue with
// the shipped CSS: who it is with and how it stands, Accept and Decline,
// Mute and Hang up, stepping aside on that friend's own Chat page, and why a
// call ended. And Call on a friend's avatar in World View
// (ui/components/AvatarInfoPanel.js, ui/voice/useAvatarCall.js),
// which starts one.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const FRIEND = 'did:key:z6MkFriendFriendFriendFriend';
const STRANGER = 'did:key:z6MkStrangerStrangerStranger';

async function mount(component, { services, props = {}, path = '/world/doc-house', funnel = null } = {}) {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/world/:id', component: { template: '<p>world</p>' } },
            { path: '/chat/:identityId', name: 'chat', component: { template: '<p>chat</p>' } }
        ]
    });
    await router.push(path);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ components: { Shown: component }, data: () => ({ props }), template: '<Shown v-bind="props" /><router-view />' });
    app.use(router);
    app.provide('callServices', services);
    if (funnel) app.provide('funnelEventCounter', funnel);
    app.mount(host);
    await nextTick();
    return { host, router, unmount: () => { app.unmount(); host.remove(); } };
}

const settle = async () => { await nextTick(); await new Promise((resolve) => setTimeout(resolve, 0)); await nextTick(); };
const text = (host, selector) => host.querySelector(selector)?.textContent.trim() ?? null;
const services = (voice) => shallowRef({
    voiceUseCase: voice,
    peerRelationshipUseCase: { getRelationship: (identityId) => (identityId === FRIEND ? { alias: 'Sam' } : null) }
});

// An incoming call in World View: answered, muted and hung up from the bar.
{
    const voice = fakeVoiceUseCase();
    const view = await mount(CallBar, { services: services(voice) });
    try {
        assert(!view.host.querySelector('.call-bar'), 'with no call, there is no bar');
        voice.ring(FRIEND);
        await settle();
        assert(text(view.host, '.call-bar-who') === 'Sam' && text(view.host, '.call-bar-status') === t('chatView.incomingCall'),
            `a friend calling shows in World View, by name (${text(view.host, '.call-bar')})`);
        view.host.querySelector('.call-bar-accept').click();
        await settle();
        assert(voice.done[0][0] === 'accept', 'Accept answers it');
        voice.to(VoiceSessionState.ACTIVE, {}, { id: 'voice' });
        await settle();
        assert(text(view.host, '.call-bar-status') === t('chatView.onCall'), 'on call');
        view.host.querySelector('.call-bar-mute').click();
        await settle();
        assert(voice.isMuted() && text(view.host, '.call-bar-mute') === t('chatView.unmute'), 'Mute mutes, and says Unmute');
        assert(view.host.querySelector('.call-bar-chat').getAttribute('href').endsWith(`/chat/${FRIEND}`), 'the chat is a click away');

        await view.router.push(`/chat/${FRIEND}`);
        await settle();
        assert(!view.host.querySelector('.call-bar'), 'on that friend\'s own Chat page, its fuller bar shows instead');
        await view.router.push(`/chat/${STRANGER}`);
        await settle();
        assert(view.host.querySelector('.call-bar'), 'on anyone else\'s, this one stays');
        await view.router.push('/world/doc-house');
        await settle();

        view.host.querySelector('.call-bar-hang-up').click();
        await settle();
        assert(voice.done.at(-1)[0] === 'hang-up' && !view.host.querySelector('.call-bar'), 'Hang up ends it, and the bar goes');
        console.log('✓ a friend\'s call is answered, muted and hung up from World View');
    } finally {
        view.unmount();
    }
}

// A call placed and declined: Cancel while it rings, and why it ended.
{
    const voice = fakeVoiceUseCase();
    const view = await mount(CallBar, { services: services(voice) });
    try {
        voice.ring(FRIEND, VoiceSessionState.CALLING);
        await settle();
        assert(text(view.host, '.call-bar-status') === t('chatView.calling') && text(view.host, '.call-bar-hang-up') === t('chatView.cancel'),
            'calling, with Cancel');
        assert(!view.host.querySelector('.call-bar-mute'), 'and nothing to mute yet');
        voice.to(VoiceSessionState.ENDED, { reason: VoiceCallEndReason.REJECTED });
        await settle();
        assert(text(view.host, '.call-bar-note') === t('chatView.callDeclined') && !view.host.querySelector('.call-bar-who'),
            'declined: the bar says so for a moment');
        await view.router.push(`/chat/${FRIEND}`);
        await settle();
        assert(!view.host.querySelector('.call-bar'), 'and on that friend\'s Chat page, which says it too, it doesn\'t repeat it');
        console.log('✓ a call placed shows Cancel, and says why it ended');
    } finally {
        view.unmount();
    }
}

// Before the network runtime is built, nothing; the bar appears once it is.
{
    const holder = shallowRef(null);
    const view = await mount(CallBar, { services: holder });
    try {
        assert(!view.host.querySelector('.call-bar'), 'no network yet, no bar');
        const voice = fakeVoiceUseCase();
        holder.value = services(voice).value;
        await settle();
        voice.ring(FRIEND);
        await settle();
        assert(view.host.querySelector('.call-bar-accept'), 'once it is built, a call shows');
        console.log('✓ the bar waits for the network runtime');
    } finally {
        view.unmount();
    }
}

// Call on a friend's avatar: World View's panel (ui/components/AvatarInfoPanel.js)
// shows it when ui/voice/useAvatarCall.js says they can be called
// and no call is on, and placing it goes through that composable.
{
    const voice = fakeVoiceUseCase({ callable: [FRIEND] });
    const counted = [];
    const said = [];
    const info = (signerIdentityId) => ({
        avatarId: `avatar-${signerIdentityId}`, displayName: 'Sam', templateLabel: 'Humanoid', isLocal: false, signerIdentityId,
        lifecycleState: 'present', trustStatus: 'TRUSTED', position: { x: 1, y: 0, z: 2 }, distance: 3, animation: 'idle'
    });
    // The panel as World View hosts it.
    const host = (signerIdentityId, refuse = false) => ({
        components: { AvatarInfoPanel },
        setup() {
            const avatarInfo = ref(info(signerIdentityId));
            const { canCallAvatar, callAvatar } = useAvatarCall({ avatarInfo, feedback: { show: (text) => said.push(text) }, funnel: { madeVoiceCall: () => counted.push('call') } });
            if (refuse) voice.startCallToIdentity = () => { throw new Error('VoiceUseCase: they can\'t be reached'); };
            return { avatarInfo, canCallAvatar, callAvatar };
        },
        template: '<AvatarInfoPanel :info="avatarInfo" :can-call="canCallAvatar" @call="callAvatar" />'
    });
    const friend = await mount(host(FRIEND), { services: services(voice) });
    const stranger = await mount(host(STRANGER), { services: services(voice) });
    try {
        assert(text(friend.host, '.avatar-info-call') === t('chatView.call'), 'a friend who can be called has Call');
        assert(!stranger.host.querySelector('.avatar-info-call'), 'someone who can\'t be called has none');
        friend.host.querySelector('.avatar-info-call').click();
        await settle();
        assert(voice.done[0].join() === `call,${FRIEND}` && counted.join() === 'call', 'Call calls them, and is counted');
        console.log('✓ a friend\'s avatar offers Call, which starts the call');
    } finally {
        friend.unmount();
        stranger.unmount();
    }
    const busy = await mount(host(FRIEND), { services: services(voice) });
    try {
        assert(!busy.host.querySelector('.avatar-info-call'), 'while a call is on, no second one is offered');
    } finally {
        busy.unmount();
    }
    voice.to(VoiceSessionState.ENDED);
    const refused = await mount(host(FRIEND, true), { services: services(voice) });
    try {
        refused.host.querySelector('.avatar-info-call').click();
        await settle();
        assert(said.join() === 'they can\'t be reached', `a refused call says why, in World View's own message (${said.join()})`);
    } finally {
        refused.unmount();
    }
    const offline = await mount(host(FRIEND), { services: ref(null) });
    try {
        assert(!offline.host.querySelector('.avatar-info-call'), 'and before the network runtime, none');
    } finally {
        offline.unmount();
    }
    console.log('✓ no Call while a call is on or before the network runtime, and a refusal says why');
}

console.log('✅ All call bar tests passed.');
