// The remote pinning service this device uses for IPFS (Remote Pinning):
// its upload endpoint and, when the service needs them, the request field
// that carries the file and the response field that holds the CID. Never a
// credential: the token is typed for this visit only and never kept (see
// application/ipfs/IpfsRemotePublishingCredentialMemory.js, and docs/
// principles/publication.md, "A Configured Credential Lives Only As Long As
// The Capability It Grants").
const MAX_FIELD_LENGTH = 128;

export function isValidIpfsRemotePinningEndpoint(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        const { protocol } = new URL(value.trim());
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

// A field name is optional; when given it is one short token, no spaces.
function fieldName(value, name) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') throw new Error(`IpfsRemotePinningSettings: ${name} must be a string`);
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_FIELD_LENGTH || /\s/.test(trimmed)) {
        throw new Error(`IpfsRemotePinningSettings: invalid ${name} "${value}"`);
    }
    return trimmed;
}

export class IpfsRemotePinningSettings {
    constructor({ endpoint, requestField = null, responseField = null } = {}) {
        if (!isValidIpfsRemotePinningEndpoint(endpoint)) {
            throw new Error(`IpfsRemotePinningSettings: invalid endpoint "${endpoint}"`);
        }
        this._endpoint = endpoint.trim();
        this._requestField = fieldName(requestField, 'requestField');
        this._responseField = fieldName(responseField, 'responseField');
        Object.freeze(this);
    }

    get endpoint() { return this._endpoint; }
    get requestField() { return this._requestField; }
    get responseField() { return this._responseField; }

    toJSON() {
        return { endpoint: this._endpoint, requestField: this._requestField, responseField: this._responseField };
    }
}
