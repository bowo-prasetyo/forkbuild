import { onBeforeUnmount, ref } from 'vue';
import { t } from '../../i18n/i18n.js';

// What World View's Say panel (ui/components/WorldSayPanel.js) shows: the
// session's short log of lines said aloud (application/worldNavigation/
// avatarSayMethods.js), re-read when a line joins it and every few seconds so
// old ones leave after their minute, and whether you are a guest, who must
// choose a name before anyone can see, or hear, them.
const LOG_REFRESH_MS = 5000;

export function useWorldSay({ session }) {
    const sayLog = ref([]);
    const sayGuest = ref(false);
    const sayPanel = ref(null);
    let unsubscribe = null;
    let timer = null;

    function refreshSayLog() {
        sayLog.value = session.sayLog().map((entry) => ({
            ...entry,
            who: entry.own ? t('worldSay.you') : (entry.name || t('worldSay.someone'))
        }));
        sayGuest.value = session.isLocalAvatarGuest();
    }

    function startSay() {
        unsubscribe = session.onSayLogChanged(refreshSayLog);
        timer = setInterval(refreshSayLog, LOG_REFRESH_MS);
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
        clearInterval(timer);
    });

    return { sayLog, sayGuest, sayPanel, sayLine, startSay, openSay };
}
