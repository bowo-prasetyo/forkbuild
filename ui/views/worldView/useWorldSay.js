import { onBeforeUnmount, ref } from 'vue';
import { t } from '../../i18n/i18n.js';
import { SAY_LOG_SECONDS } from '../../../core/avatar/AvatarSay.js';

// What World View's Say panel (ui/components/WorldSayPanel.js) shows: the
// session's short log of lines said aloud (application/worldNavigation/
// avatarSayMethods.js), re-read when a line joins it and again when its oldest
// line's minute is up (one timeout, no polling), and whether you are a guest,
// who must choose a name before anyone can see, or hear, them.

export function useWorldSay({ session }) {
    const sayLog = ref([]);
    const sayGuest = ref(false);
    const sayPanel = ref(null);
    let unsubscribe = null;
    let timer = null;

    function refreshSayLog() {
        const now = Date.now();
        const log = session.sayLog(now);
        sayLog.value = log.map((entry) => ({
            ...entry,
            who: entry.own ? t('worldSay.you') : (entry.name || t('worldSay.someone'))
        }));
        sayGuest.value = session.isLocalAvatarGuest();
        clearTimeout(timer);
        timer = log.length ? setTimeout(refreshSayLog, Math.max(0, log[0].at + SAY_LOG_SECONDS * 1000 - now) + 50) : null;
    }

    function startSay() {
        unsubscribe = session.onSayLogChanged(refreshSayLog);
        refreshSayLog();
    }

    // Enter in World View, outside any text field.
    function openSay() {
        refreshSayLog();
        sayPanel.value?.open();
    }

    const sayLine = (text) => session.sayAloud(text);

    onBeforeUnmount(() => {
        if (unsubscribe) unsubscribe();
        clearTimeout(timer);
    });

    return { sayLog, sayGuest, sayPanel, sayLine, startSay, openSay };
}
