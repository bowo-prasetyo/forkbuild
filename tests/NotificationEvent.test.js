import { readFile } from 'node:fs/promises';
import { NotificationEvent, isValidEventType, MAX_EVENT_TYPE_LENGTH, MAX_RECIPIENT_ID_LENGTH } from '../core/NotificationEvent.js';

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function throws(fn, message) {
    try {
        fn();
        throw new Error(`Expected to throw but did not: ${message}`);
    } catch (error) {
        if (error.message.startsWith('Expected to throw but did not')) {
            throw error;
        }
    }
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section 1 — Construction and validation.
    // ---------------------------------------------------------------
    {
        const event = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: 'did:key:zAlice'
        });
        assert(typeof event.notificationId === 'string' && event.notificationId.length > 0, '1. a notificationId is auto-generated when omitted');
        assert(event.eventType === 'publication.commented', '1. eventType is preserved');
        assert(event.recipientIdentityId === 'did:key:zAlice', '1. recipientIdentityId is preserved');
        assert(event.createdAt instanceof Date, '1. createdAt defaults to a Date');
        assert(Object.keys(event.payload).length === 0, '1. payload defaults to an empty object');

        throws(() => new NotificationEvent({ recipientIdentityId: 'did:key:zAlice' }), '1. eventType is required');
        throws(() => new NotificationEvent({ eventType: '', recipientIdentityId: 'did:key:zAlice' }), '1. eventType must be non-empty');
        throws(() => new NotificationEvent({ eventType: 'publication.commented' }), '1. recipientIdentityId is required');
        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: '' }), '1. recipientIdentityId must be non-empty');
        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', notificationId: '' }), '1. notificationId cannot be forced empty');
        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', createdAt: 'not-a-date' }), '1. createdAt must be a valid date');

        console.log('✓ Section 1: construction and validation');
    }

    // ---------------------------------------------------------------
    // Section 2 — Immutable representation.
    // ---------------------------------------------------------------
    {
        const event = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice' });
        assert(Object.getOwnPropertyDescriptor(NotificationEvent.prototype, 'notificationId').set === undefined, '2. notificationId has no setter');
        assert(Object.getOwnPropertyDescriptor(NotificationEvent.prototype, 'eventType').set === undefined, '2. eventType has no setter');
        assert(Object.getOwnPropertyDescriptor(NotificationEvent.prototype, 'recipientIdentityId').set === undefined, '2. recipientIdentityId has no setter');
        assert(Object.getOwnPropertyDescriptor(NotificationEvent.prototype, 'createdAt').set === undefined, '2. createdAt has no setter');
        assert(Object.getOwnPropertyDescriptor(NotificationEvent.prototype, 'payload').set === undefined, '2. payload has no setter');
        assert(typeof event.withState === 'undefined', '2. NotificationEvent has no state-transition method — a state transition is not a concept it has');

        const before = event.toJSON();
        event.createdAt.setFullYear(1970);
        const after = event.toJSON();
        assert(before.createdAt === after.createdAt, '2. mutating a returned Date does not affect the stored createdAt');

        console.log('✓ Section 2: immutable representation');
    }

    // ---------------------------------------------------------------
    // Section 3 — Recipient identity preservation.
    // ---------------------------------------------------------------
    {
        const alice = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice' });
        const bob = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zBob' });
        assert(alice.recipientIdentityId === 'did:key:zAlice' && bob.recipientIdentityId === 'did:key:zBob', '3. two events addressed to different identities each keep their own recipient');

        const longId = 'x'.repeat(MAX_RECIPIENT_ID_LENGTH);
        const atLimit = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: longId });
        assert(atLimit.recipientIdentityId === longId, '3. a recipientIdentityId at the max length is accepted');
        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'x'.repeat(MAX_RECIPIENT_ID_LENGTH + 1) }), '3. a recipientIdentityId past the max length is rejected');

        console.log('✓ Section 3: recipient identity preservation');
    }

    // ---------------------------------------------------------------
    // Section 4 — Event-type preservation.
    // ---------------------------------------------------------------
    {
        const validTypes = ['publication.commented', 'place-naming:claim.adopted', 'collaboration_edit_applied', 'presence.arrived', 'a', 'a1.b2-c3:d4_e5'];
        for (const eventType of validTypes) {
            const event = new NotificationEvent({ eventType, recipientIdentityId: 'did:key:zAlice' });
            assert(event.eventType === eventType, `4. eventType "${eventType}" is preserved verbatim`);
            assert(isValidEventType(eventType), `4. isValidEventType accepts "${eventType}"`);
        }

        const invalidTypes = ['', ' ', 'has space', 'trailing.', '.leading', 'double..dot', 'x'.repeat(MAX_EVENT_TYPE_LENGTH + 1), 42, null, undefined, {}];
        for (const eventType of invalidTypes) {
            assert(!isValidEventType(eventType), `4. isValidEventType rejects ${JSON.stringify(eventType)}`);
            throws(() => new NotificationEvent({ eventType, recipientIdentityId: 'did:key:zAlice' }), `4. constructor rejects eventType ${JSON.stringify(eventType)}`);
        }

        console.log('✓ Section 4: event-type preservation');
    }

    // ---------------------------------------------------------------
    // Section 5 — Payload isolation.
    // ---------------------------------------------------------------
    {
        const original = { publicationId: 'pub-1', nested: { count: 1 } };
        const event = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', payload: original });

        original.publicationId = 'MUTATED';
        original.nested.count = 999;
        assert(event.payload.publicationId === 'pub-1', '5. mutating the caller\'s original payload after construction never reaches the stored copy');
        assert(event.payload.nested.count === 1, '5. a deep mutation of the caller\'s original payload never reaches the stored copy');

        const readBack = event.payload;
        readBack.publicationId = 'ALSO_MUTATED';
        readBack.nested.count = 555;
        assert(event.payload.publicationId === 'pub-1', '5. mutating a value returned by .payload never reaches the stored copy');
        assert(event.payload.nested.count === 1, '5. mutating a nested value returned by .payload never reaches the stored copy');

        assert(event.payload !== event.payload, '5. two reads of .payload return distinct object instances');

        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', payload: [1, 2, 3] }), '5. an array payload is rejected — payload is a plain object, never a list');
        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', payload: null }), '5. a null payload is rejected');
        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', payload: 'not-an-object' }), '5. a string payload is rejected');
        const circular = { a: 1 };
        circular.self = circular;
        throws(() => new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', payload: circular }), '5. a non-JSON-serializable (circular) payload is rejected');

        console.log('✓ Section 5: payload isolation');
    }

    // ---------------------------------------------------------------
    // Section 6 — Timestamp semantics.
    // ---------------------------------------------------------------
    {
        const explicit = new Date('2026-01-15T12:00:00.000Z');
        const event = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', createdAt: explicit });
        assert(event.createdAt.getTime() === explicit.getTime(), '6. an explicit Date createdAt is preserved');

        const fromString = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', createdAt: '2026-01-15T12:00:00.000Z' });
        assert(fromString.createdAt.getTime() === explicit.getTime(), '6. an ISO string createdAt is normalized to the same Date');

        const before = Date.now();
        const defaulted = new NotificationEvent({ eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice' });
        const after = Date.now();
        assert(defaulted.createdAt.getTime() >= before && defaulted.createdAt.getTime() <= after, '6. an omitted createdAt defaults to construction time, never a fixed epoch');

        console.log('✓ Section 6: timestamp semantics');
    }

    // ---------------------------------------------------------------
    // Section 7 — Distinct events remain distinct.
    // ---------------------------------------------------------------
    {
        const shared = { eventType: 'publication.commented', recipientIdentityId: 'did:key:zAlice', createdAt: new Date('2026-01-15T12:00:00.000Z'), payload: { publicationId: 'pub-1' } };
        const first = new NotificationEvent(shared);
        const second = new NotificationEvent(shared);
        assert(first.notificationId !== second.notificationId, '7. two events built from identical fields still receive distinct notificationIds');
        assert(first !== second, '7. two events built from identical fields are distinct instances');

        const explicitSameId = new NotificationEvent({ ...shared, notificationId: 'fixed-id' });
        const explicitSameIdAgain = new NotificationEvent({ ...shared, notificationId: 'fixed-id' });
        assert(explicitSameId.notificationId === explicitSameIdAgain.notificationId, '7. an explicitly supplied notificationId is honored, not overridden');

        console.log('✓ Section 7: distinct events remain distinct');
    }

    // ---------------------------------------------------------------
    // Section 8 — No ChatOutbox coupling.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('core/NotificationEvent.js');
        const forbidden = ['ChatOutbox', 'ChatMessage', 'ChatDeliveryState', 'peerIdentityId', 'DeliveryState', 'expiresAt', 'TTL'];
        for (const term of forbidden) {
            assert(!code.includes(term), `8. core/NotificationEvent.js code must never reference "${term}"`);
        }
        console.log('✓ Section 8: no ChatOutbox coupling');
    }

    // ---------------------------------------------------------------
    // Section 9 — No Publication/Place Naming/Collaboration coupling.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('core/NotificationEvent.js');
        const forbidden = [
            'Publication', 'Commentary', 'PlaceNaming', 'PlaceNamingClaim',
            'Collaboration', 'CollaborationSession', 'Presence', 'AvatarPresence',
            'WorldView', 'WorldRegion'
        ];
        for (const term of forbidden) {
            assert(!code.includes(term), `9. core/NotificationEvent.js code must never reference "${term}"`);
        }
        console.log('✓ Section 9: no Publication/Place Naming/Collaboration/Presence coupling');
    }

    // ---------------------------------------------------------------
    // Section 10 — Serialization round-trip.
    // ---------------------------------------------------------------
    {
        const original = new NotificationEvent({
            eventType: 'publication.commented',
            recipientIdentityId: 'did:key:zAlice',
            createdAt: new Date('2026-01-15T12:00:00.000Z'),
            payload: { publicationId: 'pub-1', commentId: 'comment-1' }
        });
        const json = original.toJSON();
        assert(typeof json.createdAt === 'string', '10. toJSON serializes createdAt as an ISO string');

        const roundTripped = NotificationEvent.fromJSON(json);
        assert(roundTripped.notificationId === original.notificationId, '10. round-trip preserves notificationId');
        assert(roundTripped.eventType === original.eventType, '10. round-trip preserves eventType');
        assert(roundTripped.recipientIdentityId === original.recipientIdentityId, '10. round-trip preserves recipientIdentityId');
        assert(roundTripped.createdAt.getTime() === original.createdAt.getTime(), '10. round-trip preserves createdAt');
        assert(JSON.stringify(roundTripped.payload) === JSON.stringify(original.payload), '10. round-trip preserves payload');

        const reserialized = roundTripped.toJSON();
        assert(JSON.stringify(reserialized) === JSON.stringify(json), '10. re-serializing a round-tripped event yields byte-identical JSON');

        const throughWire = JSON.parse(JSON.stringify(json));
        const fromWire = NotificationEvent.fromJSON(throughWire);
        assert(fromWire.recipientIdentityId === original.recipientIdentityId, '10. round-trip survives an actual JSON.stringify/parse wire hop, not just object identity');

        console.log('✓ Section 10: serialization round-trip');
    }

    // ---------------------------------------------------------------
    // Section 11 — Malformed input behavior.
    // ---------------------------------------------------------------
    {
        assert(NotificationEvent.fromJSON(null) === null, '11. fromJSON(null) degrades to null, never throws');
        assert(NotificationEvent.fromJSON(undefined) === null, '11. fromJSON(undefined) degrades to null');
        assert(NotificationEvent.fromJSON('not-an-object') === null, '11. fromJSON(string) degrades to null');
        assert(NotificationEvent.fromJSON(42) === null, '11. fromJSON(number) degrades to null');
        assert(NotificationEvent.fromJSON({}) === null, '11. fromJSON({}) degrades to null — missing required fields');
        assert(NotificationEvent.fromJSON({ eventType: 'x' }) === null, '11. fromJSON with only eventType degrades to null — missing recipientIdentityId');
        assert(NotificationEvent.fromJSON({ eventType: 'bad type', recipientIdentityId: 'did:key:zAlice' }) === null, '11. fromJSON with a malformed eventType degrades to null');
        assert(NotificationEvent.fromJSON({ eventType: 'x', recipientIdentityId: 'did:key:zAlice', payload: [1, 2] }) === null, '11. fromJSON with an array payload degrades to null');

        console.log('✓ Section 11: malformed input behavior');
    }

    // ---------------------------------------------------------------
    // Section 12 — Architectural import-boundary regression.
    // ---------------------------------------------------------------
    {
        const rawText = await readFile(new URL('../core/NotificationEvent.js', import.meta.url), 'utf8');
        const importLines = rawText.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 1, '12. core/NotificationEvent.js has exactly one import statement');
        assert(importLines[0].includes("from './createId.js'"), '12. the sole import is core/createId.js');

        // Constructing a NotificationEvent must not require Chat,
        // Publication Commentary, Place Naming, World Presence, or
        // Document Collaboration machinery — proven by actually
        // constructing one with nothing else in scope, not merely by
        // reading source text.
        const standalone = new NotificationEvent({ eventType: 'anything.happened', recipientIdentityId: 'did:key:zAlice' });
        assert(standalone instanceof NotificationEvent, '12. NotificationEvent constructs with no domain machinery present');

        console.log('✓ Section 12: architectural import-boundary regression');
    }

    console.log('\n✅ All NotificationEvent tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
