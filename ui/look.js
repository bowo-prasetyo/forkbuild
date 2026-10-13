import { LOOK } from '../core/LookSettings.js';

// Puts the chosen look on the page: data-look="light" or "dark" on <html>
// picks css/main/theme.css's colours; none follows the device's dark mode.
// The browser's own bar (meta theme-color) follows too.
const PAPER = Object.freeze({ [LOOK.LIGHT]: '#f6efe2', [LOOK.DARK]: '#1c1712' });

export function applyLook(documentRef, look) {
    const root = documentRef && documentRef.documentElement;
    if (!root) {
        return;
    }
    if (look === LOOK.LIGHT || look === LOOK.DARK) {
        root.dataset.look = look;
    } else {
        delete root.dataset.look;
    }
    for (const meta of documentRef.querySelectorAll('meta[name="theme-color"]')) {
        const scheme = (meta.getAttribute('media') || '').includes('dark') ? LOOK.DARK : LOOK.LIGHT;
        meta.setAttribute('content', PAPER[PAPER[look] ? look : scheme]);
    }
}
