// Central registry mapping a templateId (e.g. "humanoid-01") to its
// AvatarTemplate. Mirrors core/BrickRegistry.js's shape exactly:
// libraries register themselves here at startup; nothing else in the
// engine — not the renderer, not the UI, not AvatarProfileUseCase —
// needs to know which library a template came from, or how many
// libraries exist.
export class AvatarTemplateRegistry {
    constructor() {
        this._templates = new Map();
    }

    register(library) {
        for (const template of library.templates) {
            this._templates.set(template.templateId, template);
        }
    }

    get(templateId) {
        return this._templates.get(templateId) || null;
    }

    has(templateId) {
        return this._templates.has(templateId);
    }

    getAll() {
        return Array.from(this._templates.values());
    }
}
