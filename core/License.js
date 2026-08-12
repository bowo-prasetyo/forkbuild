// Standardized license identifiers and their application-level permissions.
// ForkBuild interprets these to enforce protocol rules (e.g., blocking forks
// on ND works). The exact legal meaning remains with the license text itself.
export const LicenseId = Object.freeze({
    CC0_1_0: 'CC0-1.0',
    CC_BY_4_0: 'CC-BY-4.0',
    CC_BY_SA_4_0: 'CC-BY-SA-4.0',
    CC_BY_ND_4_0: 'CC-BY-ND-4.0',
    CC_BY_NC_4_0: 'CC-BY-NC-4.0',
    ALL_RIGHTS_RESERVED: 'ALL-RIGHTS-RESERVED',
    UNSPECIFIED: 'UNSPECIFIED'
});

export class License {
    constructor({ id = LicenseId.UNSPECIFIED, attribution = null } = {}) {
        this._id = id;
        this._attribution = attribution ? { ...attribution } : null;
    }

    get id() { return this._id; }
    get attribution() { return this._attribution ? { ...this._attribution } : null; }

    get permissions() { return License.getPermissions(this._id); }
    get forkAllowed() { return this.permissions.forkAllowed; }
    get attributionRequired() { return this.permissions.attributionRequired; }
    get modificationAllowed() { return this.permissions.modificationAllowed; }
    get redistributionAllowed() { return this.permissions.redistributionAllowed; }

    static getPermissions(id) {
        switch (id) {
            case LicenseId.CC0_1_0:
                return { forkAllowed: true, attributionRequired: false, modificationAllowed: true, redistributionAllowed: true };
            case LicenseId.CC_BY_4_0:
            case LicenseId.CC_BY_SA_4_0:
            case LicenseId.CC_BY_NC_4_0:
                return { forkAllowed: true, attributionRequired: true, modificationAllowed: true, redistributionAllowed: true };
            case LicenseId.CC_BY_ND_4_0:
                return { forkAllowed: false, attributionRequired: true, modificationAllowed: false, redistributionAllowed: true };
            case LicenseId.ALL_RIGHTS_RESERVED:
            case LicenseId.UNSPECIFIED:
            default:
                return { forkAllowed: false, attributionRequired: false, modificationAllowed: false, redistributionAllowed: false };
        }
    }

    toJSON() {
        return {
            id: this._id,
            attribution: this._attribution
        };
    }

    static fromJSON(json) {
        if (!json) return new License();
        return new License({
            id: json.id || LicenseId.UNSPECIFIED,
            attribution: json.attribution || null
        });
    }
}
