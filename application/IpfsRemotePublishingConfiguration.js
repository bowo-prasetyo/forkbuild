// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
//
// content/PinningProvider.js's own 0.8.67 header already drew the line
// this class holds one layer up: "CREDENTIALS ARE NEVER THIS CLASS'S
// CONCERN... a concrete provider is constructed with whatever it needs
// to authenticate already injected." Something upstream of that
// construction still has to COLLECT what a person actually types in —
// an endpoint, an optional credential, and the two field names content/
// HttpPinningProvider.js already accepts as constructor arguments
// (`fileFieldName`/`cidField`, named here `requestField`/`responseField`
// to match the vocabulary a person configuring a service thinks in, not
// this codebase's own internal one). This class is that collection, and
// nothing more:
//
//   { endpoint, credential, requestField, responseField }
//
// EPHEMERAL BY CONSTRUCTION — THE IDENTICAL RESTRAINT anchoring/
// BitcoinWalletConnection.js's own header already holds for a wallet's
// signing capability. This class has no save(), no load(), no static
// fromStorage()/toStorage(), and reads nothing from and writes nothing
// to localStorage, sessionStorage, IndexedDB, a cookie, or any other
// persisted medium — none of those exist anywhere in this file. An
// instance lives exactly as long as whatever local variable or reactive
// UI state a caller (ui/views/DecentralizedPublicationsView.js, this
// milestone) chooses to hold it in, and is discarded the moment that
// caller lets go of it — a page reload, an explicit "Clear" click, and
// simply navigating away all discard it identically, because none of
// them were ever asked to persist it in the first place. See
// docs/Principles.md, "A Configured Credential Lives Only As Long As
// The Capability It Grants (0.8.68)."
//
// VALIDATES ONLY WHAT content/HttpPinningProvider.js ITSELF ALREADY
// REQUIRES. `endpoint` is the one field that class refuses to be
// constructed without, so this class refuses it too — at the moment a
// person tries to configure remote publishing, rather than deferring
// the identical refusal to the first publish attempt. `credential`,
// `requestField`, and `responseField` stay fully optional, mirroring
// exactly how content/HttpPinningProvider.js's own constructor already
// defaults them.
//
// NEVER EXPOSES THE CREDENTIAL BACK OUT AS A DISPLAYABLE FACT. `hasCredential`
// is the one thing application/IpfsRemotePublicationView.js's own
// "Credential: configured / not configured" line is ever drawn from —
// never `credential` itself. See that file's own header.
export class IpfsRemotePublishingConfiguration {
    constructor({ endpoint, credential = null, requestField = null, responseField = null } = {}) {
        if (typeof endpoint !== 'string' || !endpoint.trim()) {
            throw new Error('IpfsRemotePublishingConfiguration: a non-empty endpoint is required');
        }
        this._endpoint = endpoint.trim();
        this._credential = (typeof credential === 'string' && credential.trim()) ? credential.trim() : null;
        this._requestField = (typeof requestField === 'string' && requestField.trim()) ? requestField.trim() : null;
        this._responseField = (typeof responseField === 'string' && responseField.trim()) ? responseField.trim() : null;
        Object.freeze(this);
    }

    get endpoint() { return this._endpoint; }
    get credential() { return this._credential; }
    get requestField() { return this._requestField; }
    get responseField() { return this._responseField; }
    get hasCredential() { return this._credential !== null; }
}
