import { AvatarTemplate } from '../core/AvatarTemplate.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { validateAvatarAppearance, isValidHexColor } from '../core/AvatarAppearanceValidator.js';

// 0.2.34 — Avatar Templates & Customization. Covers core/AvatarTemplate.js
// (declarative template data + the lenient resolveEffectiveAppearance
// read path), core/AvatarAppearanceValidator.js (the strict write-time
// validator), core/AvatarTemplateRegistry.js, and the built-in
// core/library/CoreAvatarTemplateLibrary.js data itself. See
// tests/AvatarProfile.test.js for AvatarProfileUseCase's own
// validate-on-write / never-fail-on-read integration.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildTemplate() {
    return new AvatarTemplate({
        templateId: 'test-01',
        body: 'humanoid',
        components: {
            skin: { options: ['skin-a', 'skin-b'], hasColor: false, multiple: false },
            hair: { options: ['hair-a', 'hair-b'], hasColor: true, multiple: false },
            accessories: { options: ['acc-a', 'acc-b'], hasColor: false, multiple: true }
        },
        supportedAnimations: [AvatarAnimationState.IDLE, AvatarAnimationState.WALKING],
        defaultAppearance: { skin: 'skin-a', hair: 'hair-a', hairColor: '#111111', accessories: [] }
    });
}

async function runTests() {
    // -------------------------------------------------------------
    // core/AvatarTemplate.js
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new AvatarTemplate({ body: 'humanoid' }); } catch (e) { threw = true; }
        assert(threw, '1. AvatarTemplate requires a templateId');
    }
    {
        let threw = false;
        try { new AvatarTemplate({ templateId: 'x' }); } catch (e) { threw = true; }
        assert(threw, '2. AvatarTemplate requires a body');
    }

    {
        const template = buildTemplate();
        assert(template.hasComponent('hair') === true, '3. hasComponent true for a declared component');
        assert(template.hasComponent('pants') === false, '4. hasComponent false for an undeclared one');
        assert(template.getComponent('pants') === null, '5. getComponent returns null for an undeclared one');
        assert(template.supportsAnimation(AvatarAnimationState.WALKING) === true, '6. supportsAnimation true for a declared animation');
        assert(template.supportsAnimation(AvatarAnimationState.JUMPING) === false, '7. supportsAnimation false for an undeclared one');
    }

    {
        // componentNames + defensive copies
        const template = buildTemplate();
        assert(template.componentNames.includes('hair') && template.componentNames.includes('accessories'), '8. componentNames lists every declared component');
        const appearance = template.defaultAppearance;
        appearance.hair = 'mutated';
        assert(template.defaultAppearance.hair === 'hair-a', '9. defaultAppearance getter returns a defensive copy');
    }

    // -------------------------------------------------------------
    // resolveEffectiveAppearance — the lenient, never-fail READ path
    // -------------------------------------------------------------
    {
        const template = buildTemplate();
        const resolved = template.resolveEffectiveAppearance(undefined);
        assert(resolved.skin === 'skin-a' && resolved.hair === 'hair-a', '10. undefined appearance resolves to the template defaults');
    }
    {
        const template = buildTemplate();
        const resolved = template.resolveEffectiveAppearance({ skin: 'skin-b' });
        assert(resolved.skin === 'skin-b', '11. a valid override is kept');
        assert(resolved.hair === 'hair-a', '12. a field absent from the input falls back to the default');
    }
    {
        // Invalid individual fields fall back to default INSTEAD OF
        // failing the whole resolution — per-field graceful
        // degradation, not all-or-nothing.
        const template = buildTemplate();
        const resolved = template.resolveEffectiveAppearance({ skin: 'not-a-real-option', hair: 'hair-b', hairColor: 'not-a-color' });
        assert(resolved.skin === 'skin-a', '13. an unknown option value falls back to default');
        assert(resolved.hair === 'hair-b', '14. a VALID sibling field is still kept');
        assert(resolved.hairColor === '#111111', '15. a malformed color falls back to default');
    }
    {
        const template = buildTemplate();
        const resolved = template.resolveEffectiveAppearance({ accessories: ['acc-a', 'not-a-real-accessory'] });
        assert(JSON.stringify(resolved.accessories) === JSON.stringify(['acc-a']), '16. an accessories array keeps only valid entries');
    }
    {
        const template = buildTemplate();
        const resolved = template.resolveEffectiveAppearance('not an object');
        assert(resolved.skin === 'skin-a', '17. a non-object appearance resolves to pure defaults rather than throwing');
    }
    {
        const template = buildTemplate();
        const resolved = template.resolveEffectiveAppearance({ pants: 'pants-01' });
        assert(resolved.pants === undefined, '18. an unrecognized component key is silently ignored, not carried through');
    }

    // -------------------------------------------------------------
    // core/AvatarAppearanceValidator.js — the strict, reject-on-write path
    // -------------------------------------------------------------
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance({ skin: 'skin-a', hair: 'hair-b', hairColor: '#ABCDEF', accessories: ['acc-a'] }, template);
        assert(result.valid === true, '19. a fully valid appearance passes');
    }
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance({ pants: 'pants-01' }, template);
        assert(result.valid === false, '20. an unknown appearance field is rejected');
    }
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance({ skin: 'not-a-real-option' }, template);
        assert(result.valid === false, '21. an unrecognized option value is rejected');
    }
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance({ hairColor: 'blue' }, template);
        assert(result.valid === false, '22. a non-hex color string is rejected');
    }
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance({ skinColor: '#111111' }, template);
        assert(result.valid === false, '23. a Color field on a component without hasColor is rejected (skin has no color)');
    }
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance({ accessories: 'acc-a' }, template);
        assert(result.valid === false, '24. accessories must be an array, not a bare string');
    }
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance({ accessories: ['acc-a', 'not-real'] }, template);
        assert(result.valid === false, '25. an unknown entry inside an accessories array is rejected');
    }
    {
        // Every individual entry is a genuinely valid option — this
        // isolates the "too many entries" cap from the "unknown
        // option" check, proving the cap is enforced on its own.
        const template = buildTemplate();
        const tooMany = Array.from({ length: 9 }, (_, i) => (i % 2 === 0 ? 'acc-a' : 'acc-b'));
        const result = validateAvatarAppearance({ accessories: tooMany }, template);
        assert(result.valid === false, '26. an accessories array exceeding the max entry count is rejected even when every entry is individually valid');
    }
    {
        // Isolates the raw byte-size cap: a huge number of unknown
        // top-level keys pushes the JSON payload over the limit. Each
        // key ALSO trips "unknown appearance field," so this proves
        // the size guard runs (via the error count), not that it's
        // the only thing wrong with the object.
        const template = buildTemplate();
        const bloated = {};
        for (let i = 0; i < 500; i++) {
            bloated[`field${i}`] = 'x'.repeat(20);
        }
        const result = validateAvatarAppearance(bloated, template);
        assert(result.valid === false, '27. an oversized appearance object is rejected');
        assert(result.errors.some((e) => e.includes('too large')), '28. the size-cap error is specifically reported, not just swallowed into the unknown-field errors');
    }
    {
        const template = buildTemplate();
        const result = validateAvatarAppearance(null, template);
        assert(result.valid === false, '29. a null appearance is rejected outright');
    }
    {
        assert(isValidHexColor('#aabbcc') === true, '30. a lowercase 6-digit hex color is valid');
        assert(isValidHexColor('#AABBCC') === true, '31. an uppercase 6-digit hex color is valid');
        assert(isValidHexColor('#abc') === false, '32. a 3-digit shorthand hex color is rejected (this schema requires 6 digits)');
        assert(isValidHexColor('aabbcc') === false, '33. a hex color missing its leading # is rejected');
    }

    // -------------------------------------------------------------
    // core/AvatarTemplateRegistry.js + built-in library data
    // -------------------------------------------------------------
    {
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        assert(registry.has('humanoid-01') && registry.has('humanoid-02'), '34. both built-in templates are registered');
        assert(registry.get('does-not-exist') === null, '35. an unknown templateId resolves to null, not undefined or a throw');
        assert(registry.getAll().length === 2, '36. getAll() returns every registered template');
    }
    {
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        const slim = registry.get('humanoid-02');
        assert(slim.supportsAnimation(AvatarAnimationState.RUNNING) === false, '37. humanoid-02 deliberately does not support every animation (proves templates genuinely differ)');
        const full = registry.get('humanoid-01');
        assert(full.supportsAnimation(AvatarAnimationState.RUNNING) === true, '38. humanoid-01 supports the full animation set');
    }
    {
        // Regression guard: every built-in template's own
        // defaultAppearance must validate against ITSELF. A typo in
        // the built-in data (an option id in defaultAppearance that
        // doesn't appear in that same component's options) would
        // otherwise ship silently and only surface as a confusing
        // fallback later.
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        for (const template of registry.getAll()) {
            const result = validateAvatarAppearance(template.defaultAppearance, template);
            assert(result.valid, `39. ${template.templateId}'s own defaultAppearance validates against itself (errors: ${result.errors.join('; ')})`);
        }
    }

    console.log('✅ All Avatar Template tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
