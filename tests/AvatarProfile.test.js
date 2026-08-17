import { AvatarProfile, DEFAULT_AVATAR_TEMPLATE_ID } from '../core/AvatarProfile.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.33/0.2.34 — Avatar Identity, Presence & Customization. This
// file covers the PERSISTENT half: core/AvatarProfile.js (the value
// object) and application/AvatarProfileUseCase.js — including 0.2.34's
// validate-on-write (updateProfile) and never-fail-on-read
// (getEffectiveAvatar) postures. See tests/AvatarPresence.test.js for
// the EPHEMERAL half and tests/AvatarTemplate.test.js for the
// template/validator/registry layer this file's write/read paths sit
// on top of.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// Read-only after construction (AvatarTemplate instances are
// immutable/frozen), safe to share across every test case below —
// mirrors how CreateAvatarProfileUseCase wires exactly one registry
// per app session in production.
function buildRegistry() {
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);
    return registry;
}

async function runTests() {
    const registry = buildRegistry();

    // -------------------------------------------------------------
    // core/AvatarProfile.js
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new AvatarProfile({}); } catch (e) { threw = true; }
        assert(threw, '1. AvatarProfile requires an ownerIdentity');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice' });
        assert(profile.templateId === DEFAULT_AVATAR_TEMPLATE_ID, '2. default templateId applied');
        assert(Object.keys(profile.appearance).length === 0, '3. default appearance is empty');
        assert(profile.displayName === '', '4. default displayName is empty string');
        assert(typeof profile.avatarId === 'string' && profile.avatarId.length > 0, '5. avatarId auto-generated');
    }

    {
        const a = new AvatarProfile({ ownerIdentity: 'alice' });
        const b = new AvatarProfile({ ownerIdentity: 'alice' });
        assert(a.avatarId !== b.avatarId, '6. two independently-constructed profiles get distinct avatarIds');
    }

    {
        const original = new AvatarProfile({
            ownerIdentity: 'alice',
            templateId: 'humanoid-01',
            appearance: { hair: 'hair-02' },
            displayName: 'Alice'
        });
        const json = original.toJSON();
        const restored = AvatarProfile.fromJSON(json);
        assert(restored.avatarId === original.avatarId, '7. round-trip preserves avatarId');
        assert(restored.ownerIdentity === original.ownerIdentity, '8. round-trip preserves ownerIdentity');
        assert(restored.templateId === original.templateId, '9. round-trip preserves templateId');
        assert(restored.appearance.hair === 'hair-02', '10. round-trip preserves appearance');
        assert(restored.displayName === original.displayName, '11. round-trip preserves displayName');
        assert(restored.createdAt.toISOString() === original.createdAt.toISOString(), '12. round-trip preserves createdAt');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice', appearance: { hair: 'hair-02' } });
        const appearance = profile.appearance;
        appearance.hair = 'mutated';
        assert(profile.appearance.hair === 'hair-02', '13. appearance getter returns a defensive copy');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice', templateId: 'humanoid-01' });
        const updated = profile.withTemplateId('humanoid-02');
        assert(updated !== profile, '14. withTemplateId returns a NEW instance');
        assert(profile.templateId === 'humanoid-01', '15. the original instance is unchanged (immutability)');
        assert(updated.templateId === 'humanoid-02', '16. the new instance carries the change');
        assert(updated.avatarId === profile.avatarId, '17. avatarId is preserved across an update');
        assert(updated.ownerIdentity === profile.ownerIdentity, '18. ownerIdentity is preserved across an update');
        assert(updated.updatedAt.getTime() >= profile.updatedAt.getTime(), '19. updatedAt advances (or stays equal at same-tick resolution)');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice' });
        const updated = profile.withAppearance({ hair: 'hair-03' }).withDisplayName('Alice W.');
        assert(updated.appearance.hair === 'hair-03', '20. withAppearance applies');
        assert(updated.displayName === 'Alice W.', '21. withDisplayName applies (chained)');
    }

    // -------------------------------------------------------------
    // application/AvatarProfileUseCase.js — basic load/create/persist
    // (unchanged behavior from 0.2.33, now against the real registry)
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        let threw = false;
        try { useCase.getProfile(); } catch (e) { threw = true; }
        assert(threw, '22. getProfile() throws when no user is logged in');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        const profile = useCase.getProfile();
        assert(profile.ownerIdentity === 'alice', '23. getProfile() creates a profile owned by the current user');
        assert(profile.displayName === 'alice', '24. default displayName derives from the identity (LocalIdentityProvider has no separate display name)');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const first = new AvatarProfileUseCase(storage, identityProvider, registry).getProfile();
        const second = new AvatarProfileUseCase(storage, identityProvider, registry).getProfile();
        assert(first.avatarId === second.avatarId, '25. avatarId is stable across sessions/reloads');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        const updated = useCase.updateProfile({ displayName: 'Alice', appearance: { hair: 'hair-05', hairColor: '#abcdef', skin: 'skin-02', shirt: 'shirt-01', pants: 'pants-01', accessories: [] } });
        assert(updated.displayName === 'Alice', '26. updateProfile applies displayName');
        assert(updated.appearance.hair === 'hair-05', '27. updateProfile applies appearance');

        const reloaded = new AvatarProfileUseCase(storage, identityProvider, registry).getProfile();
        assert(reloaded.displayName === 'Alice', '28. the update is actually persisted, not just returned');
        assert(reloaded.avatarId === updated.avatarId, '29. persisted profile keeps the same avatarId as the update');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        let calls = 0;
        let received = null;
        const unsubscribe = useCase.onProfileChanged((profile) => { calls++; received = profile; });
        useCase.updateProfile({ displayName: 'Alice W.' });
        assert(calls === 1, '30. onProfileChanged fires exactly once per updateProfile() call');
        assert(received.displayName === 'Alice W.', '31. the listener receives the updated profile');
        unsubscribe();
        useCase.updateProfile({ displayName: 'Alice Again' });
        assert(calls === 1, '32. unsubscribe() actually stops delivery');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);

        identityProvider.login('alice');
        const alice = new AvatarProfileUseCase(storage, identityProvider, registry).updateProfile({ displayName: 'Alice' });
        identityProvider.logout();

        identityProvider.login('bob');
        const bob = new AvatarProfileUseCase(storage, identityProvider, registry).updateProfile({ displayName: 'Bob' });

        assert(alice.avatarId !== bob.avatarId, '33. alice and bob get independent avatarIds');
        assert(alice.ownerIdentity === 'alice' && bob.ownerIdentity === 'bob', '34. ownership is correctly scoped per identity');

        identityProvider.logout();
        identityProvider.login('alice');
        const aliceAgain = new AvatarProfileUseCase(storage, identityProvider, registry).getProfile();
        assert(aliceAgain.displayName === 'Alice', "35. alice's profile survived bob's session untouched");
    }

    // -------------------------------------------------------------
    // 0.2.34 — updateProfile() validates strictly and REJECTS
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        let threw = false;
        try { useCase.updateProfile({ templateId: 'not-a-real-template' }); } catch (e) { threw = true; }
        assert(threw, '36. updateProfile rejects an unknown templateId');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        let threw = false;
        try { useCase.updateProfile({ appearance: { hair: 'not-a-real-option' } }); } catch (e) { threw = true; }
        assert(threw, '37. updateProfile rejects an appearance value not among the template\'s options');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        let threw = false;
        try { useCase.updateProfile({ appearance: { hairColor: 'not-a-hex-color' } }); } catch (e) { threw = true; }
        assert(threw, '38. updateProfile rejects a malformed color');
    }

    {
        // A rejected write leaves the previously-persisted profile
        // completely untouched — no partial application.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        useCase.updateProfile({ displayName: 'Alice' });
        try { useCase.updateProfile({ displayName: 'Should Not Stick', appearance: { hair: 'nonsense' } }); } catch (e) { /* expected */ }
        const stillAlice = useCase.getProfile();
        assert(stillAlice.displayName === 'Alice', '39. a rejected update does not persist ANY of its fields, including the otherwise-valid displayName');
    }

    {
        // Switching templateId WITHOUT a new appearance resets to the
        // new template's defaults rather than carrying over
        // (potentially now-invalid) option ids from the old one.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        useCase.updateProfile({ templateId: 'humanoid-01', appearance: { hair: 'hair-07', hairColor: '#111111', skin: 'skin-02', shirt: 'shirt-02', pants: 'pants-02', accessories: [] } });
        const switched = useCase.updateProfile({ templateId: 'humanoid-02' });
        const humanoid02Defaults = registry.get('humanoid-02').defaultAppearance;
        assert(JSON.stringify(switched.appearance) === JSON.stringify(humanoid02Defaults), '40. switching templateId without a new appearance resets appearance to the new template\'s defaults');
    }

    // -------------------------------------------------------------
    // 0.2.34 — getEffectiveAvatar() NEVER throws (the READ path)
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        const { profile, template, appearance } = useCase.getEffectiveAvatar();
        assert(profile.ownerIdentity === 'alice', '41. getEffectiveAvatar returns the current profile');
        assert(template.templateId === DEFAULT_AVATAR_TEMPLATE_ID, '42. a fresh profile resolves to the default template');
        assert(JSON.stringify(appearance) === JSON.stringify(template.defaultAppearance), '43. a fresh (empty-appearance) profile resolves to the template\'s own defaults');
    }

    {
        // Simulate a profile that predates a template rename/removal
        // — written directly to storage, bypassing updateProfile's
        // validation entirely, the same way an old client version or
        // a hand-edited localStorage entry could produce one.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        storage.save('avatar-profile:alice', {
            avatarId: 'a1', ownerIdentity: 'alice', templateId: 'template-that-no-longer-exists',
            appearance: { hair: 'hair-01' }, displayName: 'Alice',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        let threw = false;
        let result = null;
        try { result = useCase.getEffectiveAvatar(); } catch (e) { threw = true; }
        assert(!threw, '44. getEffectiveAvatar never throws, even for an unknown stored templateId');
        assert(result.template !== null && result.template.templateId === DEFAULT_AVATAR_TEMPLATE_ID, '45. it falls back to the default template');
        assert(JSON.stringify(result.appearance) === JSON.stringify(result.template.defaultAppearance), '46. and resolves a complete, safe appearance from that fallback template\'s defaults');
    }

    {
        // A stored profile whose appearance no longer validates
        // against ITS OWN templateId (template options changed, or
        // the record was corrupted) still resolves cleanly, field by
        // field, rather than failing wholesale.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        storage.save('avatar-profile:alice', {
            avatarId: 'a1', ownerIdentity: 'alice', templateId: 'humanoid-01',
            appearance: { hair: 'hair-04', skin: 'not-a-real-skin-anymore' }, displayName: 'Alice',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        const useCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        const result = useCase.getEffectiveAvatar();
        assert(result.appearance.hair === 'hair-04', '47. a still-valid field from the stored appearance is kept');
        assert(result.appearance.skin === result.template.defaultAppearance.skin, '48. an invalid field falls back to that template\'s own default instead of breaking the whole read');
    }

    console.log('✅ All Avatar Profile tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
