import {
    LobbyCard, PUBLIC_LOBBY, MAX_LOBBY_CARD_TTL_MS, worldLobby, isValidLobby, lobbyWorldId, normalizeDisplayName
} from '../core/LobbyCard.js';
import { signLobbyCard, signLobbyLeave } from '../peer/LobbyCardSigning.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

function throws(fn, pattern, message) {
    try {
        fn();
    } catch (err) {
        assert(pattern.test(err.message), `${message} (got "${err.message}")`);
        return;
    }
    throw new Error(`ASSERT FAILED: ${message} (it did not throw)`);
}

const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
alice.login('lobby-alice');
const aliceId = alice.getSigningIdentity().id;
const bob = new LocalIdentityProvider(new InMemoryStorageProvider());
bob.login('lobby-bob');
const verifier = new LocalAuthorizationVerifier();

// Lobby names: the global lobby and one per World, nothing else.
{
    assert(isValidLobby(PUBLIC_LOBBY) && isValidLobby(worldLobby('0b6c-42')), 'the public lobby and a World lobby are valid');
    assert(lobbyWorldId(worldLobby('0b6c-42')) === '0b6c-42' && lobbyWorldId(PUBLIC_LOBBY) === null, 'a World lobby names its World');
    assert(!isValidLobby('private') && !isValidLobby('world:') && !isValidLobby('world:a|b') && !isValidLobby(`world:${'x'.repeat(129)}`),
        'anything else is not a lobby');
    console.log('✓ lobbies are the public lobby or one per World');
}

// Display names are normalized the same way everywhere.
{
    assert(normalizeDisplayName('  Ada \n  Lovelace ') === 'Ada Lovelace', 'whitespace is collapsed and trimmed');
    assert(normalizeDisplayName('a\u0007b') === 'a b', 'control characters are dropped');
    assert(normalizeDisplayName('x'.repeat(60)).length === 40, 'a name is capped at 40 characters');
    assert(normalizeDisplayName(null) === '', 'no name is an empty name');
    throws(() => new LobbyCard({ identityId: aliceId, lobby: PUBLIC_LOBBY, displayName: ' spaced ', expiresAt: new Date(Date.now() + 1000) }),
        /normalized/, 'a card never carries an unnormalized name');
    console.log('✓ display names are normalized and capped');
}

// A card is short-lived, round-trips through JSON, and is signed only by
// the identity it names.
{
    const now = new Date('2026-09-27T10:00:00Z');
    const card = LobbyCard.create({ identityId: aliceId, lobby: worldLobby('w1'), displayName: ' Alice ', ttlMs: 60 * 60 * 1000, now });
    assert(card.displayName === 'Alice' && card.expiresAt.getTime() - now.getTime() === MAX_LOBBY_CARD_TTL_MS,
        'create() normalizes the name and caps the lifetime at 15 minutes');
    assert(card.isExpired(new Date(now.getTime() + MAX_LOBBY_CARD_TTL_MS)), 'a card expires on its own');
    throws(() => LobbyCard.create({ identityId: aliceId, lobby: 'everyone' }), /not a lobby/, 'a card must name a real lobby');

    assert(signLobbyCard(card, bob) === null, 'Bob\'s device will not sign Alice\'s card');
    const signed = signLobbyCard(LobbyCard.create({ identityId: aliceId, lobby: PUBLIC_LOBBY, displayName: 'Alice' }), alice);
    assert(signed && signed.signature, 'Alice\'s device signs her card');
    const parsed = LobbyCard.fromJSON(JSON.parse(JSON.stringify(signed.toJSON())));
    assert(verifier.verifyLobbyCard(parsed).valid, 'the signature verifies after a JSON round trip');
    assert(!verifier.verifyLobbyCard(LobbyCard.fromJSON({ ...signed.toJSON(), displayName: 'Mallory' })).valid, 'a renamed card no longer verifies');
    assert(!verifier.verifyLobbyCard(LobbyCard.create({ identityId: aliceId, lobby: PUBLIC_LOBBY })).valid, 'an unsigned card is never valid');
    const bobSignedForAlice = LobbyCard.fromJSON({ ...signed.toJSON(), signature: signLobbyCard(LobbyCard.create({ identityId: bob.getSigningIdentity().id, lobby: PUBLIC_LOBBY }), bob).signature });
    assert(!verifier.verifyLobbyCard(bobSignedForAlice).valid, 'a card signed by someone other than its identity is not valid');
    assert(signLobbyLeave(signed, alice) && signLobbyLeave(signed, bob) === null, 'only Alice\'s device signs her leaving');
    console.log('✓ a card is short-lived, round-trips, and is valid only when signed by its identity');
}

console.log('\n✅ All LobbyCard tests passed.');
