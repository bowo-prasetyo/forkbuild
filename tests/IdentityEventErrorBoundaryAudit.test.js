import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { IdentityUseCase } from '../application/IdentityUseCase.js';
import { EventBus } from '../core/events/EventBus.js';

// 0.9.220 — Identity Event/Error Boundary Characterization Audit.
//
// Test-only. No production changes. 0.9.219's own Section C discovered,
// with evidence, that the exact architectural precondition 0.9.218 fixed
// for World Presence (a use case that publishes an event, then performs
// MORE authoritative work in the same synchronous call chain, over an
// EventBus with no per-listener isolation) recurs in
// application/IdentityUseCase.js — but classified it DEFERRED, because
// no CURRENT production listener performs the kind of fallible,
// cross-use-case derived work that made World Presence's instance a
// realized defect. That finding was correct but narrow: it behaviorally
// proved only ONE of five publish chains (authenticate()) and checked
// only TWO of six real listener call sites directly.
//
// This milestone turns that narrow finding into a complete, named
// characterization, per its own brief: map the exact boundary; prove
// today's behavior, not just observe the code shape; classify every
// current listener; compare explicitly against the 0.9.218 precedent so
// that fix is never accidentally read as a general rule; and produce an
// explicit failure-isolation matrix. It does not fix anything — the
// brief is deliberately DEFERRED-or-nothing.
//
//   Section A — Exact event boundary map: every IdentityUseCase method
//               that publishes, in what sequence, and the one EventBus
//               fact (no per-listener isolation) that makes the sequence
//               matter at all.
//   Section B — Behavioral reproduction, extended to ALL FIVE publish
//               chains that share the 0.9.219 Section C2 precondition
//               (authenticate/endSession/protectIdentity/
//               changePassphrase/revokeIdentity), not only authenticate.
//               Also establishes a fact 0.9.219 never checked: the
//               authoritative provider-level state change is already
//               committed to storage by the time a derived listener
//               throws — the exception is notification-side only.
//   Section C — Full listener classification matrix across all SIX real
//               production call sites (0.9.219 checked two directly).
//   Section D — Explicit comparison with the 0.9.218 World Presence
//               precedent, guarding against the fix there being
//               misread as a general "swallow listener errors" rule.
//   Section E — Failure isolation matrix: combinations 0.9.219 did not
//               exercise, including same-event listener ordering and
//               whether a failure leaves the bus or use case damaged
//               for subsequent, unrelated operations.
//   Section F — Verdict and non-generalization statement.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeUseCase(label = 'boundary-audit-identity') {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    const identityUseCase = new IdentityUseCase(provider);
    return { provider, identity, identityUseCase };
}

function throwingListener(message) {
    return () => { throw new Error(message); };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — Exact event boundary map.
    // ---------------------------------------------------------------
    {
        const source = codeOnlyLines(await rawSource('application/IdentityUseCase.js')).join('\n');

        // A1 — the five methods that share 0.9.219 Section C2's exact
        // precondition: _publishChange() (itself two sequential
        // publishes) followed by MORE authoritative-adjacent work
        // (_publishLockChange) in the same synchronous call.
        for (const method of ['authenticate', 'endSession', 'protectIdentity', 'changePassphrase', 'revokeIdentity']) {
            const methodIndex = source.indexOf(`    ${method}(`);
            assert(methodIndex >= 0, `A1. IdentityUseCase still declares ${method}(...)`);
            const methodBody = source.slice(methodIndex, source.indexOf('\n    }', methodIndex));
            assert(/_publishChange\(\)/.test(methodBody), `A1. ${method}() still calls _publishChange()`);
            assert(/_publishLockChange\(/.test(methodBody), `A1. ${method}() still calls _publishLockChange() after _publishChange()`);
            const changeIdx = methodBody.indexOf('_publishChange()');
            const lockIdx = methodBody.indexOf('_publishLockChange(');
            assert(changeIdx >= 0 && lockIdx > changeIdx, `A1. ${method}() still calls _publishChange() BEFORE _publishLockChange(), not after`);
        }

        // A2 — methods that publish only ONE thing: login/logout/
        // declareSuccessor call only _publishChange(); unlock/lock/
        // checkVaultTimeouts call only _publishLockChange(). Neither
        // shape carries C2's "publish, then separately-named more work"
        // precondition, so they are out of this audit's scope by
        // construction, not by oversight.
        for (const method of ['login', 'logout', 'declareSuccessor']) {
            const methodIndex = source.indexOf(`    ${method}(`);
            const methodBody = source.slice(methodIndex, source.indexOf('\n    }', methodIndex));
            assert(/_publishChange\(\)/.test(methodBody) && !/_publishLockChange\(/.test(methodBody), `A2. ${method}() still publishes only _publishChange(), no lock event in the same call`);
        }
        for (const method of ['unlock', 'lock']) {
            const methodIndex = source.indexOf(`    ${method}(`);
            const methodBody = source.slice(methodIndex, source.indexOf('\n    }', methodIndex));
            assert(/_publishLockChange\(/.test(methodBody) && !/_publishChange\(\)/.test(methodBody), `A2. ${method}() still publishes only _publishLockChange(), no identity/session event in the same call`);
        }

        // A3 — exportIdentity()/importIdentity() publish nothing at all
        // (per this file's own 0.2.48 comment) — confirmed, not assumed.
        const exportIndex = source.indexOf('    exportIdentity(');
        const exportBody = source.slice(exportIndex, source.indexOf('\n    }', exportIndex));
        assert(!/_publish/.test(exportBody), 'A3. exportIdentity() still publishes nothing');
        const importIndex = source.indexOf('    importIdentity(');
        const importBody = source.slice(importIndex, source.indexOf('\n    }', importIndex));
        assert(!/_publish/.test(importBody), 'A3. importIdentity() still publishes nothing');

        // A4 — the one EventBus fact that makes every sequence above
        // matter: publish() has no per-listener try/catch, so a throwing
        // listener on the FIRST event of a chain unwinds through every
        // "then" that follows it in the same synchronous call.
        const eventBusSource = codeOnlyLines(await rawSource('core/events/EventBus.js')).join('\n');
        assert(/for \(const listener of listeners\) \{\s*listener\(payload\);\s*\}/.test(eventBusSource), 'A4. EventBus.publish() still has no per-listener try/catch');

        // A5 — IdentityUseCase uses exactly this EventBus, not some
        // already-isolated variant — the boundary this audit maps is the
        // real one the production code runs on.
        assert(/this\._eventBus = new EventBus\(\);/.test(source), 'A5. IdentityUseCase still constructs a plain core/events/EventBus.js instance, not a specialized/isolated bus');

        console.log('✓ Section A: Event boundary mapped — five methods (authenticate/endSession/protectIdentity/changePassphrase/revokeIdentity) share the publish-then-more-work precondition (A1); three publish only one thing and are out of scope by construction (A2); export/import publish nothing (A3); EventBus.publish() has no per-listener isolation (A4), and IdentityUseCase runs on that exact bus (A5).');
    }

    // ---------------------------------------------------------------
    // Section B — Behavioral reproduction across all five publish
    // chains, plus the "already committed" characterization 0.9.219
    // never checked.
    // ---------------------------------------------------------------
    {
        // B1 — authenticate(): reconfirms 0.9.219 Section C3 directly,
        // as this audit's own baseline case.
        {
            const { provider, identity, identityUseCase } = makeUseCase();
            let vaultLockFired = false;
            identityUseCase.onVaultLockChanged(() => { vaultLockFired = true; });
            identityUseCase.onUserChanged(throwingListener('B1 injected failure'));
            let threw = false;
            try { identityUseCase.authenticate(identity.identityId); } catch { threw = true; }
            assert(threw, 'B1a. authenticate() still lets a throwing onUserChanged() listener unwind to its own caller');
            assert(!vaultLockFired, 'B1b. ...and _publishLockChange()\'s own VaultLockChanged broadcast never ran');
            assert(provider.isAuthenticated(), 'B1c. BUT the authoritative session change already committed to the provider before the listener ever ran — authenticate() persists the session, THEN publishes; the thrown exception is notification-side only, it does not roll back the session that already exists');
        }

        // B2 — endSession(): the same shape, the other direction — logs
        // out successfully at the provider level even though the caller
        // sees an exception.
        {
            const { provider, identity, identityUseCase } = makeUseCase();
            identityUseCase.authenticate(identity.identityId);
            let vaultLockFired = false;
            identityUseCase.onVaultLockChanged(() => { vaultLockFired = true; });
            identityUseCase.onUserChanged(throwingListener('B2 injected failure'));
            let threw = false;
            try { identityUseCase.endSession(); } catch { threw = true; }
            assert(threw, 'B2a. endSession() still lets a throwing onUserChanged() listener unwind to its own caller');
            assert(!vaultLockFired, 'B2b. ...and its own VaultLockChanged broadcast never ran');
            assert(!provider.isAuthenticated(), 'B2c. BUT the session was already ended at the provider level before the listener ran — the exception does not un-end it');
        }

        // B3 — protectIdentity(): the identity is already protected
        // (and already forced locked) at the provider level despite the
        // caller seeing an exception.
        {
            const { provider, identity, identityUseCase } = makeUseCase();
            identityUseCase.onUserChanged(throwingListener('B3 injected failure'));
            let threw = false;
            try { identityUseCase.protectIdentity(identity.identityId, 'a-passphrase'); } catch { threw = true; }
            assert(threw, 'B3a. protectIdentity() still lets a throwing onUserChanged() listener unwind to its own caller');
            assert(provider.getLocalIdentity(identity.identityId).isProtected, 'B3b. BUT the identity is already protected at the provider level before the listener ran');
        }

        // B4 — changePassphrase(): the new passphrase is already active
        // at the provider level despite the caller seeing an exception.
        {
            const { provider, identity, identityUseCase } = makeUseCase();
            provider.protectIdentity(identity.identityId, 'old-passphrase');
            identityUseCase.onUserChanged(throwingListener('B4 injected failure'));
            let threw = false;
            try { identityUseCase.changePassphrase(identity.identityId, 'old-passphrase', 'new-passphrase'); } catch { threw = true; }
            assert(threw, 'B4a. changePassphrase() still lets a throwing onUserChanged() listener unwind to its own caller');
            let rejectedOld = false;
            try { provider.unlock(identity.identityId, 'old-passphrase'); } catch { rejectedOld = true; }
            assert(rejectedOld, 'B4b. BUT the OLD passphrase is already rejected at the provider level before the listener ran — the change already took effect');
            assert(provider.unlock(identity.identityId, 'new-passphrase'), 'B4c. ...and the NEW passphrase already works');
        }

        // B5 — revokeIdentity(): the revocation record already exists at
        // the provider level despite the caller seeing an exception.
        {
            const { provider, identity, identityUseCase } = makeUseCase();
            identityUseCase.onUserChanged(throwingListener('B5 injected failure'));
            let threw = false;
            try { identityUseCase.revokeIdentity(identity.identityId); } catch { threw = true; }
            assert(threw, 'B5a. revokeIdentity() still lets a throwing onUserChanged() listener unwind to its own caller');
            assert(provider.isRevoked(identity.identityId), 'B5b. BUT the identity is already revoked at the provider level before the listener ran');
        }

        console.log('✓ Section B: Behavioral reproduction — all five publish-then-more-work methods (authenticate/endSession/protectIdentity/changePassphrase/revokeIdentity) reproduce the identical failure-skips-a-later-broadcast shape 0.9.219 proved only for authenticate() (B1-B5, "a" facts). A fact 0.9.219 never established: in every case, the authoritative provider-level state change is already durably committed BEFORE the derived listener runs — a throwing listener is a notification-side failure, never a rollback of the identity operation itself ("b"/"c" facts).');
    }

    // ---------------------------------------------------------------
    // Section C — Full listener classification matrix, all six real
    // production call sites (0.9.219 checked UserWidget.js and
    // AvatarSettingsView.js directly; this extends to the other four).
    // ---------------------------------------------------------------
    {
        const rows = [];

        // C1 — UserWidget.js: onUserChanged assigns a ref and calls a
        // local, read-only refreshLockState(); onVaultLockChanged calls
        // the same local read-only function.
        const userWidgetSource = codeOnlyLines(await rawSource('ui/components/UserWidget.js')).join('\n');
        assert(/identityUseCase\.onUserChanged\(\(u\) => \{\s*user\.value = u;\s*refreshLockState\(\);\s*\}\);/.test(userWidgetSource), 'C1a. UserWidget.js onUserChanged callback still only assigns a ref and calls local refreshLockState()');
        assert(/identityUseCase\.onVaultLockChanged\(\(\) => \{\s*refreshLockState\(\);\s*\}\);/.test(userWidgetSource), 'C1b. UserWidget.js onVaultLockChanged callback still only calls local refreshLockState()');
        rows.push('UserWidget.js');

        // C2 — AvatarSettingsView.js: onUserChanged assigns a ref and
        // calls loadForCurrentUser(), a same-owner data reload (its own
        // avatar profile), never a different use case's mutation.
        const avatarSettingsSource = codeOnlyLines(await rawSource('ui/views/AvatarSettingsView.js')).join('\n');
        assert(/identityUseCase\.onUserChanged\(\(u\) => \{\s*user\.value = u;\s*loadForCurrentUser\(\);\s*\}\);/.test(avatarSettingsSource), 'C2a. AvatarSettingsView.js onUserChanged callback still only assigns a ref and calls local loadForCurrentUser()');
        rows.push('AvatarSettingsView.js');

        // C3 — IdentityManagementView.js: all three events call the SAME
        // local refresh() function directly, by reference — the simplest
        // possible shape, never a cross-use-case call.
        const identityManagementSource = codeOnlyLines(await rawSource('ui/views/IdentityManagementView.js')).join('\n');
        assert(/unsubscribeUser = identityUseCase\.onUserChanged\(refresh\);/.test(identityManagementSource), 'C3a. IdentityManagementView.js onUserChanged still passes local refresh() directly, no wrapper');
        assert(/unsubscribeSession = identityUseCase\.onSessionChanged\(refresh\);/.test(identityManagementSource), 'C3b. IdentityManagementView.js onSessionChanged still passes local refresh() directly');
        assert(/unsubscribeLock = identityUseCase\.onVaultLockChanged\(refresh\);/.test(identityManagementSource), 'C3c. IdentityManagementView.js onVaultLockChanged still passes local refresh() directly');
        rows.push('IdentityManagementView.js');

        // C4 — ConversationsView.js: onSessionChanged assigns a ref and
        // calls local refresh() — reads its OWN conversations list, no
        // mutating call into another use case.
        const conversationsSource = codeOnlyLines(await rawSource('ui/views/ConversationsView.js')).join('\n');
        assert(/identityUseCase\.onSessionChanged\(\(\) => \{\s*isAuthenticated\.value = identityUseCase\.isAuthenticated\(\);\s*refresh\(\);\s*\}\);/.test(conversationsSource), 'C4a. ConversationsView.js onSessionChanged callback still only reads isAuthenticated() and calls local refresh()');
        rows.push('ConversationsView.js');

        // C5 — ChatView.js: onSessionChanged only re-reads
        // isAuthenticated() into a local ref — no other call at all.
        const chatViewSource = codeOnlyLines(await rawSource('ui/views/ChatView.js')).join('\n');
        assert(/identityUseCase\.onSessionChanged\(\(\) => \{\s*isAuthenticated\.value = identityUseCase\.isAuthenticated\(\);\s*\}\);/.test(chatViewSource), 'C5a. ChatView.js onSessionChanged callback still only reads isAuthenticated() into a local ref');
        rows.push('ChatView.js');

        // C6 — PeerConnectionsView.js: the most complex real callback —
        // touches THREE other use cases (peerRelationshipUseCase,
        // friendRelationshipUseCase, peerBlockUseCase) plus its own
        // refreshLockState(). Verified explicitly, not assumed from
        // shape alone: every one of those calls is a pure read-only
        // getter (getRelationships()/getBlocked()/isUnlocked()), never a
        // mutating call — the same distinction that made World
        // Presence's refreshWorldPresenceActivity() (which reaches into
        // WorldAuthorizationService AND performs a network broadcast) a
        // realized defect and this one not.
        const peerConnectionsSource = codeOnlyLines(await rawSource('ui/views/PeerConnectionsView.js')).join('\n');
        assert(/identityUseCase\.onSessionChanged\(\(\) => \{\s*isAuthenticated\.value = identityUseCase\.isAuthenticated\(\);\s*refreshRelationships\(\);\s*refreshFriendships\(\);\s*refreshBlocked\(\);\s*refreshLockState\(\);\s*\}\);/.test(peerConnectionsSource), 'C6a. PeerConnectionsView.js onSessionChanged callback still calls exactly these four local functions, nothing else');
        assert(/function refreshRelationships\(list\) \{\s*relationships\.value = list \|\| peerRelationshipUseCase\.getRelationships\(\);\s*\}/.test(peerConnectionsSource), 'C6b. refreshRelationships() is still a pure read via getRelationships(), no mutation');
        assert(/function refreshFriendships\(list\) \{\s*friendships\.value = list \|\| friendRelationshipUseCase\.getRelationships\(\);\s*\}/.test(peerConnectionsSource), 'C6c. refreshFriendships() is still a pure read via getRelationships(), no mutation');
        assert(/function refreshBlocked\(list\) \{\s*blocked\.value = list \|\| peerBlockUseCase\.getBlocked\(\);\s*\}/.test(peerConnectionsSource), 'C6d. refreshBlocked() is still a pure read via getBlocked(), no mutation');
        assert(/isIdentityLocked\.value = !identityUseCase\.isUnlocked\(identityId\);/.test(peerConnectionsSource), 'C6e. refreshLockState() is still a pure read via isUnlocked(), no mutation');
        assert(/identityUseCase\.onVaultLockChanged\(\(\) => refreshLockState\(\)\);/.test(peerConnectionsSource), 'C6f. PeerConnectionsView.js onVaultLockChanged callback still only calls local refreshLockState()');
        rows.push('PeerConnectionsView.js');

        assert(rows.length === 6, 'C7. all six known production listener call sites were checked directly — none skipped');

        console.log('✓ Section C: Full listener classification — all six real production call sites checked directly (0.9.219 checked two): UserWidget.js, AvatarSettingsView.js, IdentityManagementView.js, ConversationsView.js, ChatView.js, and PeerConnectionsView.js (its callback the most complex, touching three other use cases). Every one, without exception, performs only local ref assignment or a read-only getter call — derived, never authoritative; none is fallible cross-use-case mutation. None should abort the identity operation it derives from, and none currently can.');
    }

    // ---------------------------------------------------------------
    // Section D — Explicit comparison with the 0.9.218 World Presence
    // precedent, so that fix is never misread as a general rule.
    // ---------------------------------------------------------------
    {
        // D1 — the 0.9.218 fix is still local and scoped: a try/catch in
        // WorldView.js around ONE call (refreshWorldPresenceActivity),
        // not a change to EventBus.js or PeerMessageBus.js themselves.
        const worldViewSource = codeOnlyLines(await rawSource('ui/views/WorldView.js')).join('\n');
        assert(/refreshWorldPresenceActivity/.test(worldViewSource), 'D1a. WorldView.js still calls refreshWorldPresenceActivity()');
        const refreshCallIndex = worldViewSource.indexOf('refreshWorldPresenceActivity(');
        const surroundingWindow = worldViewSource.slice(Math.max(0, refreshCallIndex - 200), refreshCallIndex + 50);
        assert(/try\s*\{/.test(surroundingWindow), 'D1b. the refreshWorldPresenceActivity() call site is still wrapped in a local try/catch, not a bus-wide change');

        // D2 — EventBus.js and PeerMessageBus.js themselves are still
        // completely unchanged by that fix: no per-listener try/catch
        // was ever added anywhere in the shared bus.
        const eventBusSource = codeOnlyLines(await rawSource('core/events/EventBus.js')).join('\n');
        assert(!/try\s*\{/.test(eventBusSource), 'D2a. EventBus.js still contains no try/catch anywhere — the World Presence fix was never generalized into the bus itself');
        const peerMessageBusSource = codeOnlyLines(await rawSource('peer/PeerMessageBus.js')).join('\n');
        assert(/for \(const handler of Array\.from\(handlers\)\) \{\s*handler\(message\.payload, meta\);\s*\}/.test(peerMessageBusSource), 'D2b. PeerMessageBus\'s own dispatch loop still has no per-handler isolation either');

        // D3 — the actual distinguishing fact between the two cases,
        // stated precisely: WorldPresence's derived listener called INTO
        // a separate collaborator that itself performs a network
        // broadcast (a fallible, cross-use-case, externally-visible
        // side effect); Identity's six derived listeners (Section C)
        // never do more than a local ref assignment or a read-only
        // getter. The fix follows the fallible collaborator, not the
        // "is this a derived listener" question alone — so this
        // milestone does not, and must not, conclude "wrap every
        // IdentityUseCase listener in try/catch too."
        const worldPresenceUseCaseSource = codeOnlyLines(await rawSource('application/WorldPresenceUseCase.js')).join('\n');
        assert(/_broadcast/.test(worldPresenceUseCaseSource), 'D3. WorldPresenceUseCase.js still performs a network broadcast as part of the derived work the 0.9.218 fix isolated — the precedent case had an externally-visible fallible side effect that IdentityUseCase\'s current listeners (Section C) do not share');

        console.log('✓ Section D: Compared explicitly against the 0.9.218 precedent — that fix is still a local try/catch around one call site, never generalized into EventBus.js or PeerMessageBus.js (D1/D2). The two cases differ on the fact that actually mattered: World Presence\'s derived listener reached a collaborator with a fallible, externally-visible side effect (a network broadcast); none of Identity\'s six current listeners do (D3). "This is a derived listener" alone was never the trigger for a fix, and this milestone does not treat it as one.');
    }

    // ---------------------------------------------------------------
    // Section E — Failure isolation matrix: combinations 0.9.219 did
    // not exercise.
    // ---------------------------------------------------------------
    {
        // E1 — baseline: authentication succeeds, listener succeeds ->
        // normal result, both events observed, no exception.
        {
            const { identity, identityUseCase } = makeUseCase();
            let userSeen = null;
            let sessionSeen = null;
            identityUseCase.onUserChanged((u) => { userSeen = u; });
            identityUseCase.onSessionChanged((s) => { sessionSeen = s; });
            let threw = false;
            try { identityUseCase.authenticate(identity.identityId); } catch { threw = true; }
            assert(!threw, 'E1a. authenticate() with well-behaved listeners does not throw');
            assert(userSeen && userSeen.username === 'boundary-audit-identity', 'E1b. onUserChanged still observes the authenticated user');
            assert(sessionSeen && sessionSeen.isAuthenticated, 'E1c. onSessionChanged still observes the new session');
        }

        // E2 — authentication itself fails (bad passphrase on a
        // protected identity) -> no event of any kind is published, so a
        // listener is never even invoked. The failure never reaches the
        // event boundary at all; it is a completely separate case from
        // the "operation succeeds, listener fails" shape B/C3 cover.
        {
            const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
            const identity = provider.createLocalIdentity('protected-identity', 'correct-passphrase');
            const identityUseCase = new IdentityUseCase(provider);
            let listenerInvoked = false;
            identityUseCase.onUserChanged(() => { listenerInvoked = true; });
            let threw = false;
            try { identityUseCase.authenticate(identity.identityId, 'wrong-passphrase'); } catch { threw = true; }
            assert(threw, 'E2a. authenticate() with a wrong passphrase still throws, as before');
            assert(!listenerInvoked, 'E2b. ...and no onUserChanged listener is invoked at all — a failed AUTHENTICATION never reaches the event boundary, a structurally different case from a failed LISTENER');
        }

        // E3 — two listeners on the SAME event; the first (registration
        // order) throws. EventBus.publish() iterates a Set in insertion
        // order with no try/catch, so the loop halts immediately: the
        // second listener, registered after the first, never runs. This
        // is checked directly against EventBus, not simulated.
        {
            const bus = new EventBus();
            let secondRan = false;
            bus.subscribe('TestEvent', throwingListener('E3 injected failure'));
            bus.subscribe('TestEvent', () => { secondRan = true; });
            let threw = false;
            try { bus.publish('TestEvent', {}); } catch { threw = true; }
            assert(threw, 'E3a. EventBus.publish() still propagates a listener\'s exception to its own caller');
            assert(!secondRan, 'E3b. ...and a SECOND listener registered after the throwing one never runs — the failure is not isolated per-listener, it aborts the rest of that publish() call entirely');
        }

        // E4 — extends E3/0.9.219's C3b to the SESSION_EVENT itself, not
        // only the downstream VaultLockChanged: a throwing onUserChanged
        // listener means _publishChange()'s own SECOND publish
        // (AuthenticationSessionChanged) never runs either, because both
        // publishes are two statements in the same method body with
        // nothing between them to catch the first one's exception.
        {
            const { identity, identityUseCase } = makeUseCase();
            let sessionEventFired = false;
            identityUseCase.onSessionChanged(() => { sessionEventFired = true; });
            identityUseCase.onUserChanged(throwingListener('E4 injected failure'));
            try { identityUseCase.authenticate(identity.identityId); } catch { /* expected */ }
            assert(!sessionEventFired, 'E4. a throwing onUserChanged() listener still prevents AuthenticationSessionChanged from firing at all, even though it is a structurally separate publish() call one line later in _publishChange()');
        }

        // E5 — no lingering damage: after a listener throws once, the
        // SAME EventBus and the SAME IdentityUseCase instance are still
        // fully usable for a subsequent, unrelated operation. The
        // failure is confined to the one publish() call that hit it; it
        // does not corrupt bus state or leave the use case unusable.
        {
            const { identity, identityUseCase } = makeUseCase();
            const secondIdentity = identityUseCase.provider.createLocalIdentity('second-identity');
            let failOnce = true;
            identityUseCase.onUserChanged(() => {
                if (failOnce) { failOnce = false; throw new Error('E5 injected one-time failure'); }
            });
            try { identityUseCase.authenticate(identity.identityId); } catch { /* expected */ }
            let secondThrew = false;
            let sessionSeen = null;
            identityUseCase.onSessionChanged((s) => { sessionSeen = s; });
            try { identityUseCase.authenticate(secondIdentity.identityId); } catch { secondThrew = true; }
            assert(!secondThrew, 'E5a. a SUBSEQUENT, unrelated authenticate() call does not throw just because a PRIOR call once hit a throwing listener');
            assert(sessionSeen && sessionSeen.identityId === secondIdentity.identityId, 'E5b. ...and its own events fire normally — no lingering bus or use-case corruption from the earlier failure');
        }

        console.log('✓ Section E: Failure isolation matrix — happy path unaffected (E1); a failed AUTHENTICATION never even reaches the event boundary, a structurally different case from a failed LISTENER (E2); a throwing listener silently drops every SUBSEQUENT listener on the SAME event, proven directly against EventBus (E3); it drops the subsequent SESSION_EVENT publish too, not only the downstream lock event 0.9.219 checked (E4); and a single failure leaves no lingering damage — the bus and the use case both work normally again on the very next call (E5).');
    }

    // ---------------------------------------------------------------
    // Section F — Verdict.
    // ---------------------------------------------------------------
    {
        console.log('✓ Section F: Verdict — DEFERRED, reconfirmed with a materially larger evidence base than 0.9.219 Section C alone: all five publish chains (not one) behaviorally proven (Section B), all six real listener call sites (not two) classified with source evidence (Section C), the 0.9.218 precedent compared explicitly so its fix is never misread as a general rule (Section D), and a failure-isolation matrix covering same-event listener ordering, a failed-authentication case, and post-failure recovery that 0.9.219 never exercised (Section E). New fact this audit establishes that 0.9.219 did not: every affected method already durably commits its authoritative state change BEFORE the derived listener runs, so a throwing listener is a notification-side failure only, never a rollback (Section B). Zero production changes were made. This does NOT become a blanket "swallow all IdentityUseCase listener errors" rule — Section D names the actual trigger precisely: if a FUTURE listener on these three events performs fallible, externally-visible derived work the way World Presence\'s did (a network call, a write into a different use case\'s mutation surface), THAT listener\'s call site is the one to wrap in a local try/catch, mirroring WorldView.js\'s own 0.9.218 fix exactly — not a change to EventBus.js, not a change to every listener uniformly, and not a decision this milestone makes on a future author\'s behalf.');
    }

    console.log('\n✅ All Identity Event/Error Boundary Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
