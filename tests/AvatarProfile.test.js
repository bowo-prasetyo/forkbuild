import { AvatarProfile, DEFAULT_AVATAR_TEMPLATE_ID } from '../core/AvatarProfile.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.33 — Avatar Identity & Presence Model. This file covers the
// PERSISTENT half: core/AvatarProfile.js (the value object) and
// application/AvatarProfileUseCase.js (load/create/update, one
// profile per identity). See tests/AvatarPresence.test.js for the
// EPHEMERAL half.

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

async function runTests() {
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
            appearance: { hair: 'short' },
            displayName: 'Alice'
        });
        const json = original.toJSON();
        const restored = AvatarProfile.fromJSON(json);
        assert(restored.avatarId === original.avatarId, '7. round-trip preserves avatarId');
        assert(restored.ownerIdentity === original.ownerIdentity, '8. round-trip preserves ownerIdentity');
        assert(restored.templateId === original.templateId, '9. round-trip preserves templateId');
        assert(restored.appearance.hair === 'short', '10. round-trip preserves appearance');
        assert(restored.displayName === original.displayName, '11. round-trip preserves displayName');
        assert(restored.createdAt.toISOString() === original.createdAt.toISOString(), '12. round-trip preserves createdAt');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice', appearance: { hair: 'short' } });
        const appearance = profile.appearance;
        appearance.hair = 'mutated';
        assert(profile.appearance.hair === 'short', '13. appearance getter returns a defensive copy');
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
        const updated = profile.withAppearance({ hair: 'long' }).withDisplayName('Alice W.');
        assert(updated.appearance.hair === 'long', '20. withAppearance applies');
        assert(updated.displayName === 'Alice W.', '21. withDisplayName applies (chained)');
    }

    // -------------------------------------------------------------
    // application/AvatarProfileUseCase.js
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        const useCase = new AvatarProfileUseCase(storage, identityProvider);
        let threw = false;
        try { useCase.getProfile(); } catch (e) { threw = true; }
        assert(threw, '22. getProfile() throws when no user is logged in');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider);
        const profile = useCase.getProfile();
        assert(profile.ownerIdentity === 'alice', '23. getProfile() creates a profile owned by the current user');
        assert(profile.displayName === 'alice', '24. default displayName derives from the identity (LocalIdentityProvider has no separate display name)');
    }

    {
        // Stability: getProfile() called again (even via a FRESH
        // AvatarProfileUseCase instance over the same storage, as if
        // the app reloaded) returns the SAME avatarId — an avatar's
        // identity must not be re-rolled on every access.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const first = new AvatarProfileUseCase(storage, identityProvider).getProfile();
        const second = new AvatarProfileUseCase(storage, identityProvider).getProfile();
        assert(first.avatarId === second.avatarId, '25. avatarId is stable across sessions/reloads');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider);
        const updated = useCase.updateProfile({ displayName: 'Alice', appearance: { hair: 'short' } });
        assert(updated.displayName === 'Alice', '26. updateProfile applies displayName');
        assert(updated.appearance.hair === 'short', '27. updateProfile applies appearance');

        const reloaded = new AvatarProfileUseCase(storage, identityProvider).getProfile();
        assert(reloaded.displayName === 'Alice', '28. the update is actually persisted, not just returned');
        assert(reloaded.avatarId === updated.avatarId, '29. persisted profile keeps the same avatarId as the update');
    }

    {
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('alice');
        const useCase = new AvatarProfileUseCase(storage, identityProvider);
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
        // Two identities never share a profile or an avatarId.
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);

        identityProvider.login('alice');
        const alice = new AvatarProfileUseCase(storage, identityProvider).updateProfile({ displayName: 'Alice' });
        identityProvider.logout();

        identityProvider.login('bob');
        const bob = new AvatarProfileUseCase(storage, identityProvider).updateProfile({ displayName: 'Bob' });

        assert(alice.avatarId !== bob.avatarId, '33. alice and bob get independent avatarIds');
        assert(alice.ownerIdentity === 'alice' && bob.ownerIdentity === 'bob', '34. ownership is correctly scoped per identity');

        identityProvider.logout();
        identityProvider.login('alice');
        const aliceAgain = new AvatarProfileUseCase(storage, identityProvider).getProfile();
        assert(aliceAgain.displayName === 'Alice', "35. alice's profile survived bob's session untouched");
    }

    console.log('✅ All Avatar Profile tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
