// A convenience, tab-lifetime memory of the last remote-pinning credential
// a person typed into ui/views/DecentralizedPublicationsView.js's own
// "Configure Remote Publishing" form — NOT a configuration, NOT a
// capability, and explicitly NOT the thing application/
// IpfsRemotePublishingConfiguration.js's own "Ephemeral By Construction"
// header (docs/Principles.md, 0.8.68) refuses to be. That refusal still
// holds unmodified: this module is a separate, narrower convenience the
// view opts into, not a loophole in that class.
//
// A plain module-scope variable, never a Web Storage API. Exactly like
// IpfsRemotePublishingConfiguration itself, this file reads nothing from
// and writes nothing to localStorage, sessionStorage, IndexedDB, a
// cookie, or any other persisted medium — none of those words appear
// anywhere in it. It lives exactly as long as this browser tab's own JS
// module state does: a full page reload or closing the tab clears it
// identically to how it clears every other in-memory reactive field this
// page holds, because nothing here was ever asked to survive either one.
//
// Remembers ONLY what a person themselves already typed and successfully
// used to save a configuration — never a value read back out of a saved
// IpfsRemotePublishingConfiguration instance. ui/views/
// DecentralizedPublicationsView.js still blanks the draft credential
// field whenever it re-seeds a form from an EXISTING configuration (see
// openIpfsRemotePublishingConfigureForm()) — that restraint is untouched.
// This memory only prefills a fresh, never-yet-configured entry's form,
// so a person configuring several entries with the same credential in one
// tab session doesn't have to retype it for every one.
let rememberedCredential = null;

export function rememberIpfsRemotePublishingCredential(credential) {
    if (typeof credential === 'string' && credential.trim()) {
        rememberedCredential = credential.trim();
    }
}

export function recallIpfsRemotePublishingCredential() {
    return rememberedCredential;
}
