import { createApp } from 'vue';
import EmbedView from './EmbedView.js';
import { applyDocumentLanguage, setAppLocale } from '../i18n/i18n.js';
import { negotiateLocale } from '../i18n/locales.js';
import { payloadFromEmbedHash } from '../../core/ForkBuildAppLinks.js';
import { DEFAULT_VISITOR_COUNT_SETTINGS } from '../../core/VisitorCount.js';
import { composeWorldEncounterMaterialVerifier } from '../../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { FunnelEventCounter } from '../../application/settings/FunnelEventCounter.js';
import { browserPrivacySignals, sendCounterHit } from '../counterHit.js';

// embed.html's entry point: a build shown inside another site's page
// (`embed.html#<payload>`, core/ForkBuildAppLinks.js). Nothing of the app is
// started: no storage, no peers, no relays. The page checks the build the
// link carries and shows it turning, with a way into ForkBuild.
//
// In the browser's own language, since the reader's ForkBuild setting lives in
// storage this page never opens (and that a browser keeps apart inside other
// sites anyway). For the same reason the visitor count's setting can't be
// read here, so the count follows only Global Privacy Control and Do Not
// Track (docs/Privacy.md, "Visitor count").
await setAppLocale(negotiateLocale(null, navigator.languages));
applyDocumentLanguage(document);

const funnel = new FunnelEventCounter({
    settingsStore: { get: () => DEFAULT_VISITOR_COUNT_SETTINGS },
    origin: window.location.origin,
    privacySignals: browserPrivacySignals(),
    sendHit: sendCounterHit
});

createApp(EmbedView, {
    payload: payloadFromEmbedHash(window.location.hash),
    verifier: composeWorldEncounterMaterialVerifier().verifier,
    funnel,
    // This copy of ForkBuild, wherever it is hosted.
    appUrl: new URL('./', window.location.href).href
}).mount('#app');
