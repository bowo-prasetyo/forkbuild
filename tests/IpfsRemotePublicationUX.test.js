import { IpfsRemotePublicationCoordinator } from '../application/IpfsRemotePublicationCoordinator.js';
import { IpfsRemotePublicationState, isValidIpfsRemotePublicationState } from '../application/IpfsRemotePublicationState.js';
import { describeIpfsRemotePublication, describeIpfsRemotePublicationStateLabel, describeIpfsRemotePublishingConfiguration } from '../application/IpfsRemotePublicationView.js';
import { IpfsRemotePublishingConfiguration } from '../application/IpfsRemotePublishingConfiguration.js';
import { CreateIpfsRemotePublicationCoordinatorUseCase } from '../application/CreateIpfsRemotePublicationCoordinatorUseCase.js';
import { HttpPinningProvider } from '../content/HttpPinningProvider.js';

// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
//
// The flagship this milestone exists to prove: content/
// IpfsRemotePinningContentStore.js (0.8.67) finally reachable from an
// explicit, configurable, ephemeral UI action —
//
//   configure endpoint/credential/field names (0.8.68, ephemeral, never
//     persisted)
//     -> explicit "Publish to Remote IPFS"
//     -> IpfsRemotePublicationCoordinator (THIS MILESTONE — new)
//     -> content/HttpPinningProvider.js#put()        (0.8.67, UNCHANGED)
//     -> content/IpfsRemotePinningContentStore.js#put()  (0.8.67, UNCHANGED)
//     -> PUBLISHED, with a real contentHash/locator, and NOTHING beyond
//        that — no "verified", no persistence of the configuration
//
//   Section A: FLAGSHIP — the full, real pipeline (a real
//              HttpPinningProvider, a fake fetchImpl), ending in a real
//              PUBLISHED outcome.
//   Section B: a definite rejection (4xx) is reported as REJECTED.
//   Section C: an unreachable provider is reported as UNAVAILABLE, never
//              a rejection.
//   Section D: an unacceptable provider answer (no CID at all) is
//              reported as FAILED, not silently treated as PUBLISHED.
//   Section E: no automatic retry — publish() reaches the injected
//              provider factory exactly once per call; two EXPLICIT
//              calls reach it twice.
//   Section F: caller-contract violations (missing bytes, or a
//              configuration with no endpoint) throw before any provider
//              is ever constructed.
//   Section G: constructing the coordinator with a non-function factory
//              throws.
//   Section H: a fresh provider is constructed for EVERY call, never a
//              remembered one — reconfiguring between two calls reaches
//              the newly configured endpoint, not a stale one.
//   Section I: the view is a pure, stateless projection; IDLE by
//              default; never exposes a credential.
//   Section J: application/IpfsRemotePublishingConfiguration.js is
//              ephemeral — no persistence methods, no way to read a
//              credential back out except through its own getter.
//   Section K: the state vocabulary and every view carry no forbidden
//              verdict word, and no undocumented state.
//   Section L: CreateIpfsRemotePublicationCoordinatorUseCase produces a
//              real, usable coordinator.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (_e) { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (_e) { threw = true; }
    assert(threw, message);
}

function fakeFetchResponding(handler) {
    const calls = [];
    return {
        calls,
        async fetch(url, init) {
            calls.push({ url, init });
            return handler(url, init, calls.length);
        }
    };
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return body; },
        async text() { return JSON.stringify(body); }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: the full, real pipeline (a real
    // HttpPinningProvider, injected only a fake fetchImpl), ending in a
    // real PUBLISHED outcome.
    // ---------------------------------------------------------------
    {
        const fake = fakeFetchResponding(() => jsonResponse(200, { cid: 'bafybeigflagshipcid' }));
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: (options) => new HttpPinningProvider({ ...options, fetchImpl: fake.fetch })
        });
        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin', credential: 'secret-token' });

        const outcome = await coordinator.publish({ bytes: '{"hello":"world"}', configuration });
        assert(outcome.state === IpfsRemotePublicationState.PUBLISHED, '1. a real publish through a real HttpPinningProvider reaches PUBLISHED');
        assert(outcome.published === true, '2. the outcome reports published: true');
        assert(outcome.locator === 'ipfs://bafybeigflagshipcid', '3. the locator is the ipfs:// URI built from the provider\'s own CID');
        assert(typeof outcome.contentHash === 'string' && outcome.contentHash.length > 0, '4. a real content hash was computed');
        assert(outcome.endpoint === 'https://pin.example/api/pin', '5. the outcome carries the configured endpoint');
        assert(typeof outcome.publishedAt === 'string', '6. publishedAt is a real timestamp string');
        assert(fake.calls.length === 1, '7. the injected fetch was reached exactly once');
        assert(fake.calls[0].init.headers['Authorization'] === 'Bearer secret-token', '8. the configured credential reached the provider as a bearer header');

        const view = describeIpfsRemotePublication(outcome);
        assert(view.state === IpfsRemotePublicationState.PUBLISHED, '9. the view reports the coordinator\'s own PUBLISHED state');
        assert(view.locator === outcome.locator && view.contentHash === outcome.contentHash, '10. the view exposes the real locator/contentHash, unmodified');
    }
    console.log('✓ Section A (FLAGSHIP): configure -> explicit publish -> real HttpPinningProvider -> real IpfsRemotePinningContentStore -> PUBLISHED');

    // ---------------------------------------------------------------
    // Section B — a definite rejection (4xx) is reported as REJECTED.
    // ---------------------------------------------------------------
    {
        const fake = fakeFetchResponding(() => jsonResponse(401, { error: 'invalid credential' }));
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: (options) => new HttpPinningProvider({ ...options, fetchImpl: fake.fetch })
        });
        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin' });

        const outcome = await coordinator.publish({ bytes: 'content', configuration });
        assert(outcome.state === IpfsRemotePublicationState.REJECTED, '11. a 401 response is reported as REJECTED');
        assert(outcome.published === false && outcome.locator === null, '12. a rejected outcome carries no locator');
        assert(typeof outcome.reason === 'string' && outcome.reason.length > 0, '13. a rejection carries a reason');
    }
    console.log('✓ Section B: a definite rejection (4xx) is reported as REJECTED');

    // ---------------------------------------------------------------
    // Section C — an unreachable provider is reported as UNAVAILABLE,
    // never a rejection.
    // ---------------------------------------------------------------
    {
        const fake = { calls: [], async fetch() { throw new Error('network down'); } };
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: (options) => new HttpPinningProvider({ ...options, fetchImpl: fake.fetch })
        });
        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin' });

        const outcome = await coordinator.publish({ bytes: 'content', configuration });
        assert(outcome.state === IpfsRemotePublicationState.UNAVAILABLE, '14. an unreachable host is reported as UNAVAILABLE, never REJECTED');
    }
    console.log('✓ Section C: an unreachable provider is reported as UNAVAILABLE, never a rejection');

    // ---------------------------------------------------------------
    // Section D — an unacceptable provider answer (no CID at all) is
    // reported as FAILED.
    // ---------------------------------------------------------------
    {
        // A fake provider — not a real HttpPinningProvider — that
        // resolves successfully but names no CID, exactly the
        // content/IpfsRemotePinningContentStore.js#put() contract
        // violation this coordinator's own header names as honestly
        // reachable.
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: () => ({ name: 'misbehaving provider', async put() { return { cid: null }; } })
        });
        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin' });

        const outcome = await coordinator.publish({ bytes: 'content', configuration });
        assert(outcome.state === IpfsRemotePublicationState.FAILED, '15. a provider that names no CID is reported as FAILED, never silently PUBLISHED');
        assert(outcome.published === false, '16. a FAILED outcome never reports published: true');
    }
    console.log('✓ Section D: an unacceptable provider answer (no CID) is reported as FAILED, never silently PUBLISHED');

    // ---------------------------------------------------------------
    // Section E — no automatic retry: publish() reaches the injected
    // provider factory exactly once per call; two EXPLICIT calls reach
    // it twice.
    // ---------------------------------------------------------------
    {
        let factoryCalls = 0;
        const fake = fakeFetchResponding(() => jsonResponse(200, { cid: 'bafyrepeat' }));
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: (options) => { factoryCalls++; return new HttpPinningProvider({ ...options, fetchImpl: fake.fetch }); }
        });
        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin' });

        await coordinator.publish({ bytes: 'content', configuration });
        assert(factoryCalls === 1, '17. a single explicit publish() call reaches the provider factory exactly once');

        await coordinator.publish({ bytes: 'content', configuration });
        assert(factoryCalls === 2, '18. a second explicit call reaches the provider factory again — never batched or deduplicated automatically');
        assert(fake.calls.length === 2, '19. both calls reach the network independently');
    }
    console.log('✓ Section E: no automatic retry — each explicit publish() call reaches the provider exactly once');

    // ---------------------------------------------------------------
    // Section F — caller-contract violations throw before any provider
    // is ever constructed.
    // ---------------------------------------------------------------
    {
        let constructed = 0;
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: () => { constructed++; return { put: async () => ({ cid: 'x' }) }; }
        });
        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin' });

        await expectRejects(coordinator.publish({ configuration }), '20. missing bytes throws');
        await expectRejects(coordinator.publish({ bytes: 'content' }), '21. a missing configuration throws');
        await expectRejects(coordinator.publish({ bytes: 'content', configuration: {} }), '22. a configuration with no endpoint throws');
        assert(constructed === 0, '24. the provider factory is never reached for any caller-contract violation');
    }
    console.log('✓ Section F: caller-contract violations throw before any provider is ever constructed');

    // ---------------------------------------------------------------
    // Section G — constructing the coordinator with a non-function
    // factory throws.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new IpfsRemotePublicationCoordinator({ createPinningProvider: 'not a function' }), '25. constructing the coordinator with a non-function factory throws');
    }
    console.log('✓ Section G: constructing the coordinator with a non-function factory throws');

    // ---------------------------------------------------------------
    // Section H — a fresh provider is constructed for EVERY call;
    // reconfiguring between two calls reaches the newly configured
    // endpoint, never a stale one.
    // ---------------------------------------------------------------
    {
        const seenEndpoints = [];
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: (options) => { seenEndpoints.push(options.endpoint); return { put: async () => ({ cid: 'bafyfresh' }) }; }
        });

        await coordinator.publish({ bytes: 'content', configuration: new IpfsRemotePublishingConfiguration({ endpoint: 'https://one.example/pin' }) });
        await coordinator.publish({ bytes: 'content', configuration: new IpfsRemotePublishingConfiguration({ endpoint: 'https://two.example/pin' }) });

        assert(seenEndpoints.length === 2 && seenEndpoints[0] === 'https://one.example/pin' && seenEndpoints[1] === 'https://two.example/pin',
            '26. reconfiguring between two explicit publish() calls reaches the newly configured endpoint each time, never a remembered one');
    }
    console.log('✓ Section H: a fresh provider is constructed for every call — reconfiguring is never stale');

    // ---------------------------------------------------------------
    // Section I — the view is a pure, stateless projection; IDLE by
    // default; never exposes a credential.
    // ---------------------------------------------------------------
    {
        const idleView = describeIpfsRemotePublication(null);
        assert(idleView.state === IpfsRemotePublicationState.IDLE, '27. describeIpfsRemotePublication(null) reports IDLE');
        assert(Object.isFrozen(idleView), '28. the view result is frozen');
        assert(idleView.locator === null && idleView.contentHash === null && idleView.reason === null, '29. an IDLE view carries no leftover fact from any previous attempt');

        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin', credential: 'top-secret-value' });
        const configView = describeIpfsRemotePublishingConfiguration(configuration);
        assert(configView.configured === true && configView.endpoint === 'https://pin.example/api/pin', '30. the configuration view reports the endpoint');
        assert(configView.hasCredential === true, '31. the configuration view reports hasCredential: true when one was supplied');
        assert(JSON.stringify(configView).includes('top-secret-value') === false, '32. the configuration view never includes the raw credential value');

        const noCredentialConfigView = describeIpfsRemotePublishingConfiguration(new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin' }));
        assert(noCredentialConfigView.hasCredential === false, '33. the configuration view reports hasCredential: false when none was supplied');

        const unconfiguredView = describeIpfsRemotePublishingConfiguration(null);
        assert(unconfiguredView.configured === false, '34. describeIpfsRemotePublishingConfiguration(null) reports configured: false');
    }
    console.log('✓ Section I: the view is a pure, stateless projection; IDLE by default; never exposes a credential');

    // ---------------------------------------------------------------
    // Section J — application/IpfsRemotePublishingConfiguration.js is
    // ephemeral: no persistence methods, no way to read a credential
    // back out except through its own getter, and it validates its one
    // required field.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new IpfsRemotePublishingConfiguration({}), '35. a configuration with no endpoint throws');
        expectThrows(() => new IpfsRemotePublishingConfiguration({ endpoint: '   ' }), '36. a configuration with a blank endpoint throws');

        const configuration = new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin', credential: 'a-real-secret', requestField: 'upload', responseField: 'Hash' });
        assert(configuration.endpoint === 'https://pin.example/api/pin', '37. endpoint is exposed verbatim');
        assert(configuration.credential === 'a-real-secret', '38. credential is exposed only through its own explicit getter');
        assert(configuration.requestField === 'upload' && configuration.responseField === 'Hash', '39. requestField/responseField are exposed verbatim');
        assert(Object.isFrozen(configuration), '40. a configuration instance is frozen — never mutated after construction');

        for (const forbiddenMethod of ['save', 'load', 'persist', 'toStorage', 'fromStorage', 'toJSON']) {
            assert(typeof configuration[forbiddenMethod] === 'undefined', `41. IpfsRemotePublishingConfiguration carries no "${forbiddenMethod}" method — it is never persisted`);
        }
    }
    console.log('✓ Section J: IpfsRemotePublishingConfiguration is ephemeral — no persistence methods of any kind');

    // ---------------------------------------------------------------
    // Section K — the state vocabulary and every view carry no
    // forbidden verdict word, and no undocumented state.
    // ---------------------------------------------------------------
    {
        assert(Object.values(IpfsRemotePublicationState).length === 6, '42. the publication state vocabulary carries exactly its six documented values');
        for (const forbiddenState of ['ready', 'safe', 'valid', 'verified', 'trusted', 'permanent', 'guaranteed']) {
            assert(!Object.values(IpfsRemotePublicationState).includes(forbiddenState), `43. the publication state vocabulary never carries a "${forbiddenState}" value`);
        }
        assert(isValidIpfsRemotePublicationState(IpfsRemotePublicationState.PUBLISHED), '44. isValidIpfsRemotePublicationState() recognizes a real state value');
        assert(!isValidIpfsRemotePublicationState('verified'), '45. isValidIpfsRemotePublicationState() rejects a value outside the vocabulary');
        assert(describeIpfsRemotePublicationStateLabel('not-a-real-state') === null, '46. an unrecognized state has no label');

        const fake = fakeFetchResponding(() => jsonResponse(200, { cid: 'bafyverdictcheck' }));
        const coordinator = new IpfsRemotePublicationCoordinator({
            createPinningProvider: (options) => new HttpPinningProvider({ ...options, fetchImpl: fake.fetch })
        });
        const outcome = await coordinator.publish({ bytes: 'content', configuration: new IpfsRemotePublishingConfiguration({ endpoint: 'https://pin.example/api/pin' }) });
        const serialized = JSON.stringify(describeIpfsRemotePublication(outcome)).toLowerCase();
        for (const forbidden of ['verified', 'trusted', 'safe', 'permanent', 'guaranteed', 'confidence', 'score', 'health']) {
            assert(!serialized.includes(forbidden), `47. the view never carries "${forbidden}" — an acceptance observation is never promoted to a broader verdict`);
        }
    }
    console.log('✓ Section K: the publication state vocabulary and its views carry no forbidden verdict word, and no undocumented state');

    // ---------------------------------------------------------------
    // Section L — CreateIpfsRemotePublicationCoordinatorUseCase produces
    // a real, usable coordinator.
    // ---------------------------------------------------------------
    {
        const { coordinator } = new CreateIpfsRemotePublicationCoordinatorUseCase().execute();
        assert(coordinator instanceof IpfsRemotePublicationCoordinator, '48. the use case produces a real IpfsRemotePublicationCoordinator');
        await expectRejects(coordinator.publish({}), '49. the use case\'s own coordinator still enforces the caller contract');
    }
    console.log('✓ Section L: CreateIpfsRemotePublicationCoordinatorUseCase produces a real, usable coordinator');

    console.log('\nAll IpfsRemotePublicationUX tests passed.');
}

run().catch((error) => {
    console.error('IpfsRemotePublicationUX.test.js FAILED:', error);
    process.exitCode = 1;
});
