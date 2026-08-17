import { AvatarPresence } from '../core/AvatarPresence.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { Position } from '../core/Position.js';
import { AvatarProfile } from '../core/AvatarProfile.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';

// 0.2.33 — Avatar Identity & Presence Model. This file covers the
// EPHEMERAL half: core/AvatarPresence.js (the live-state value
// object) and application/AvatarPresenceSession.js (the in-memory,
// no-storage-dependency session that tracks the local user's own
// presence). See tests/AvatarProfile.test.js for the PERSISTENT half.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // core/AvatarAnimationState.js
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new AvatarPresence({ avatarId: 'a1', animation: 'not-a-real-state' }); } catch (e) { threw = true; }
        assert(threw, '1. an unrecognized animation state is rejected');
    }

    // -------------------------------------------------------------
    // core/AvatarPresence.js
    // -------------------------------------------------------------
    {
        let threw = false;
        try { new AvatarPresence({}); } catch (e) { threw = true; }
        assert(threw, '2. AvatarPresence requires an avatarId');
    }

    {
        const presence = new AvatarPresence({ avatarId: 'a1' });
        assert(presence.position instanceof Position, '3. default position is a Position at origin');
        assert(presence.position.x === 0 && presence.position.y === 0 && presence.position.z === 0, '4. default position is (0,0,0)');
        assert(presence.animation === AvatarAnimationState.IDLE, '5. default animation is IDLE');
        assert(presence.sequence === 0, '6. default sequence is 0');
    }

    {
        const presence = new AvatarPresence({ avatarId: 'a1', position: new Position(1, 2, 3), animation: AvatarAnimationState.WALKING });
        const advanced = presence.next({ position: new Position(4, 5, 6) });
        assert(advanced !== presence, '7. next() returns a NEW instance');
        assert(presence.position.x === 1, '8. the original instance is unchanged (immutability)');
        assert(advanced.position.x === 4, '9. the new instance carries the position change');
        assert(advanced.sequence === presence.sequence + 1, '10. sequence advances by exactly 1');
        assert(advanced.animation === AvatarAnimationState.WALKING, '11. an unspecified field (animation) carries over unchanged');
        assert(advanced.avatarId === presence.avatarId, '12. avatarId is preserved across an update');
    }

    {
        // Multiple fields in one next() call still advance sequence by
        // exactly 1, not once per field.
        const presence = new AvatarPresence({ avatarId: 'a1' });
        const advanced = presence
            .next({ position: new Position(1, 0, 0), rotation: { x: 0, y: 1, z: 0 }, animation: AvatarAnimationState.RUNNING });
        assert(advanced.sequence === 1, '13. one next() call, however many fields changed, advances sequence by exactly 1');
        assert(advanced.rotation.y === 1, '14. rotation change applied');
        assert(advanced.animation === AvatarAnimationState.RUNNING, '15. animation change applied');
    }

    {
        const presence = new AvatarPresence({ avatarId: 'a1', ownerIdentity: 'alice', position: new Position(1, 2, 3), animation: AvatarAnimationState.JUMPING, sequence: 7 });
        const json = presence.toJSON();
        const restored = AvatarPresence.fromJSON(json);
        assert(restored.avatarId === presence.avatarId, '16. round-trip preserves avatarId');
        assert(restored.ownerIdentity === presence.ownerIdentity, '17. round-trip preserves ownerIdentity');
        assert(restored.position.x === 1 && restored.position.y === 2 && restored.position.z === 3, '18. round-trip preserves position');
        assert(restored.animation === AvatarAnimationState.JUMPING, '19. round-trip preserves animation');
        assert(restored.sequence === 7, '20. round-trip preserves sequence');
    }

    {
        // rotation getter returns a defensive copy.
        const presence = new AvatarPresence({ avatarId: 'a1', rotation: { x: 0, y: 90, z: 0 } });
        const rotation = presence.rotation;
        rotation.y = 999;
        assert(presence.rotation.y === 90, '21. rotation getter returns a defensive copy');
    }

    // -------------------------------------------------------------
    // application/AvatarPresenceSession.js
    // -------------------------------------------------------------
    {
        // Structural guarantee, not merely a convention: the session
        // has no constructor parameter that could even accept a
        // StorageProvider, so there is no code path by which this
        // class could persist presence durably.
        assert(AvatarPresenceSession.length === 1, '22. AvatarPresenceSession\'s only required constructor argument is the avatarProfile — no storage dependency exists to inject');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice' });
        const session = new AvatarPresenceSession(profile);
        assert(session.current.avatarId === profile.avatarId, '23. the session\'s initial presence is derived from the given profile\'s avatarId');
        assert(session.current.ownerIdentity === profile.ownerIdentity, '24. ...and ownerIdentity');
        assert(session.current.sequence === 0, '25. a fresh session starts at sequence 0');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice' });
        const session = new AvatarPresenceSession(profile, { position: new Position(10, 0, 10) });
        assert(session.current.position.x === 10, '26. an initial position can be supplied at construction');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice' });
        const session = new AvatarPresenceSession(profile);
        const updated = session.update({ position: new Position(5, 0, 5), animation: AvatarAnimationState.WALKING });
        assert(session.current === updated, '27. update() both returns and stores the new presence');
        assert(session.current.position.x === 5, '28. session.current reflects the update');
        assert(session.current.sequence === 1, '29. sequence advanced');
    }

    {
        const profile = new AvatarProfile({ ownerIdentity: 'alice' });
        const session = new AvatarPresenceSession(profile);
        let calls = 0;
        let lastSequence = -1;
        const unsubscribe = session.onPresenceChanged((presence) => { calls++; lastSequence = presence.sequence; });
        session.update({ animation: AvatarAnimationState.WALKING });
        session.update({ animation: AvatarAnimationState.RUNNING });
        assert(calls === 2, '30. onPresenceChanged fires once per update() call');
        assert(lastSequence === 2, '31. the listener receives the latest presence');
        unsubscribe();
        session.update({ animation: AvatarAnimationState.IDLE });
        assert(calls === 2, '32. unsubscribe() actually stops delivery');
    }

    {
        // Two sessions built from two different profiles never share
        // an avatarId or interfere with each other's sequence.
        const alice = new AvatarProfile({ ownerIdentity: 'alice' });
        const bob = new AvatarProfile({ ownerIdentity: 'bob' });
        const aliceSession = new AvatarPresenceSession(alice);
        const bobSession = new AvatarPresenceSession(bob);
        aliceSession.update({ animation: AvatarAnimationState.WALKING });
        aliceSession.update({ animation: AvatarAnimationState.RUNNING });
        assert(aliceSession.current.avatarId !== bobSession.current.avatarId, '33. two sessions have independent avatarIds');
        assert(aliceSession.current.sequence === 2 && bobSession.current.sequence === 0, '34. sequences advance independently per session');
    }

    console.log('✅ All Avatar Presence tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
