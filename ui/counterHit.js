// Sending one hit to the visitor counter (docs/Privacy.md, "Visitor count"):
// an image request, with no referrer, so the counter learns the fixed path and
// nothing about the page it came from. Not waited for.
export function sendCounterHit(url) {
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.src = url;
}

// Global Privacy Control and Do Not Track, as core/VisitorCount.js reads them.
export function browserPrivacySignals() {
    return { globalPrivacyControl: navigator.globalPrivacyControl, doNotTrack: navigator.doNotTrack || window.doNotTrack };
}
