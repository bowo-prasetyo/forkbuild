import { AvatarAnimationState } from './AvatarAnimationState.js';
import { isValidHexColor } from './AvatarAppearanceValidator.js';

// 0.2.34 — a template is DECLARATIVE DATA describing what an avatar
// built from it is allowed to look like: which appearance components
// exist, what values each one accepts, and which animations it
// supports. It is never code, never an asset URL, never something
// that could be pointed at an arbitrary remote resource — see
// docs/Principles.md, "A Template Is A Closed Vocabulary, Not An
// Asset Loader."
//
// Each entry in `components` describes one appearance field:
//   { options: [ids...], hasColor: bool, multiple: bool }
//
// `hasColor` means a PAIRED field, `${name}Color`, is also accepted —
// e.g. a `hair` component with hasColor:true additionally accepts
// `hairColor` as a "#rrggbb" string. `multiple` means the field is an
// array of option ids rather than a single one (e.g. `accessories`).
// `body` is NOT a component — it's a fixed property of the template
// itself (every avatar built from Humanoid-01 has a humanoid body);
// nothing about body shape is user-selectable in 0.2.34.
export class AvatarTemplate {
    constructor({
        templateId,
        body,
        displayLabel = templateId,
        components = {},
        supportedAnimations = Object.values(AvatarAnimationState),
        defaultAppearance = {}
    } = {}) {
        if (!templateId) {
            throw new Error('AvatarTemplate requires a templateId');
        }
        if (!body) {
            throw new Error('AvatarTemplate requires a body');
        }
        this._templateId = templateId;
        this._body = body;
        this._displayLabel = displayLabel;
        this._components = Object.freeze(
            Object.fromEntries(
                Object.entries(components).map(([name, component]) => [
                    name,
                    Object.freeze({
                        options: Object.freeze([...component.options]),
                        hasColor: Boolean(component.hasColor),
                        multiple: Boolean(component.multiple)
                    })
                ])
            )
        );
        this._supportedAnimations = Object.freeze([...supportedAnimations]);
        this._defaultAppearance = Object.freeze({ ...defaultAppearance });
    }

    get templateId() { return this._templateId; }
    get body() { return this._body; }
    get displayLabel() { return this._displayLabel; }
    get componentNames() { return Object.keys(this._components); }
    get supportedAnimations() { return [...this._supportedAnimations]; }
    get defaultAppearance() { return { ...this._defaultAppearance }; }

    getComponent(name) {
        return this._components[name] || null;
    }

    hasComponent(name) {
        return name in this._components;
    }

    supportsAnimation(animation) {
        return this._supportedAnimations.includes(animation);
    }

    // Fills in a COMPLETE, safe appearance from a possibly partial or
    // possibly invalid one — every recognized, valid field from
    // `appearance` is kept, and every missing or invalid field falls
    // back to this template's own default. Never throws, unlike
    // core/AvatarAppearanceValidator.js's validateAvatarAppearance
    // (which is the strict, reject-on-write check). This is the
    // lenient, never-fail READ path — see docs/Principles.md, "An
    // Invalid Avatar Profile Must Never Block World View Access."
    resolveEffectiveAppearance(appearance) {
        const resolved = { ...this._defaultAppearance };
        if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) {
            return resolved;
        }

        for (const [key, value] of Object.entries(appearance)) {
            if (key.endsWith('Color')) {
                const componentName = key.slice(0, -'Color'.length);
                const component = this._components[componentName];
                if (component && component.hasColor && isValidHexColor(value)) {
                    resolved[key] = value;
                }
                continue;
            }

            const component = this._components[key];
            if (!component) {
                continue;
            }
            if (component.multiple) {
                if (Array.isArray(value)) {
                    resolved[key] = value.filter((entry) => component.options.includes(entry));
                }
            } else if (component.options.includes(value)) {
                resolved[key] = value;
            }
        }

        return resolved;
    }
}
