import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { License } from '../core/License.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionOutcome } from '../application/PublicationResolutionOutcome.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { createPublicationContentKind } from '../application/PublicationContentKind.js';
import { DiscoveryProvider } from '../discovery/DiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/SearchPublicationsUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.9.335 — Decentralized Publication Discovery Provider.
//
// 0.9.334 named the gap precisely: Repository's contract already accepts
// a plain Publication from any discoveryProvider.list() (proven live),
// but nothing in production accumulates a resolved decentralized
// candidate anywhere list() could find it. This milestone closes exactly
// that gap with discovery/DecentralizedPublicationDiscoveryProvider.js —
// a DiscoveryProvider subclass that accepts already-resolved Publications
// via add() and exposes them through list()/findById()/findByAuthor()/
// findByParentId()/findByDocumentId(), performing no discovery or
// resolution of its own.
//
//   Section A — Contract: it IS a DiscoveryProvider, and add() validates
//               only that its argument genuinely is a Publication.
//   Section B — list()/findBy*() semantics: insertion order, defensive
//               copies, and parity with LocalDiscoveryProvider's own
//               lookup behavior.
//   Section C — No invented deduplication: two add() calls, two entries.
//   Section D — Flagship: a Publication travels the REAL, unmodified
//               decentralized transport (PublicationResolver +
//               PublicationContentKind, 0.9.331/0.9.332), the resolved
//               result is handed to a real
//               DecentralizedPublicationDiscoveryProvider, and
//               Repository's own REAL, unmodified SearchPublicationsUseCase
//               finds it — by title text and by author — without any
//               change to SearchPublicationsUseCase itself.
//   Section E — The provider performs no decentralized discovery or
//               resolution itself: confirmed structurally, not merely
//               claimed by its own header comment.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function makeLocalStylePublication({ documentId, title, author }, identityProvider) {
    const documentContentReference = new ContentReference({
        hash: `docHash-${documentId}`, algorithm: 'fnv1a-32', mediaType: 'application/json', size: 256
    });
    let publication = new Publication({
        documentId,
        title,
        author,
        providerId: 'local',
        contentHash: documentContentReference.hash,
        schemaVersion: 3,
        license: new License({ id: 'CC0-1.0' }),
        contentReference: documentContentReference,
        publisherIdentity: identityProvider.getSigningIdentity().toJSON(),
        signature: null
    });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

async function run() {
    console.log('Running Decentralized Publication Discovery Provider tests...\n');

    // ===============================================================
    // Section A — Contract: it IS a DiscoveryProvider, and add()
    // validates only that its argument genuinely is a Publication.
    // ===============================================================
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();
        assert(provider instanceof DiscoveryProvider,
            '1. DecentralizedPublicationDiscoveryProvider extends DiscoveryProvider — a genuine subclass, not a lookalike.');
        assert(provider.list().length === 0,
            '2. a freshly constructed provider starts empty.');

        let threw = null;
        try { provider.add({ id: 'not-a-publication', title: 'Fake' }); } catch (error) { threw = error; }
        assert(threw && /requires a Publication instance/.test(threw.message),
            '3. add() rejects a plain object masquerading as a Publication.');
        assert(provider.list().length === 0,
            '4. a rejected add() leaves the provider unchanged.');

        const alice = makeIdentity('Alice');
        const publication = makeLocalStylePublication({ documentId: 'doc-1', title: 'Alpha', author: 'alice' }, alice);
        provider.add(publication);
        assert(provider.list().length === 1 && provider.list()[0] === publication,
            '5. add() with a genuine Publication instance retains it exactly, no copy or projection.');
    }
    console.log('✓ Section A: it is a genuine DiscoveryProvider subclass; add() rejects anything that is not a real Publication instance and leaves state unchanged on rejection; a valid Publication is retained exactly as given.');

    // ===============================================================
    // Section B — list()/findBy*() semantics: insertion order,
    // defensive copies, and parity with LocalDiscoveryProvider's own
    // lookup behavior.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const first = makeLocalStylePublication({ documentId: 'doc-first', title: 'First Light', author: 'alice' }, alice);
        const second = makeLocalStylePublication({ documentId: 'doc-second', title: 'Second Light', author: 'bob' }, bob);
        const third = makeLocalStylePublication({ documentId: 'doc-first', title: 'First Light Revisited', author: 'alice' }, alice);

        const provider = new DecentralizedPublicationDiscoveryProvider();
        provider.add(first);
        provider.add(second);
        provider.add(third);

        const listed = provider.list();
        assert(listed.length === 3 && listed[0] === first && listed[1] === second && listed[2] === third,
            '1. list() returns every accumulated Publication in insertion order.');

        listed.push('mutation');
        assert(provider.list().length === 3,
            '2. list() returns a defensive copy — mutating the returned array does not affect the provider\'s own state.');

        assert(provider.findById(first.id) === first,
            '3. findById() returns the exact matching Publication.');
        assert(provider.findById('no-such-id') === null,
            '4. findById() returns null, not undefined, for a miss — matching LocalDiscoveryProvider\'s own contract.');

        const byAlice = provider.findByAuthor('alice');
        assert(byAlice.length === 2 && byAlice.includes(first) && byAlice.includes(third),
            '5. findByAuthor() returns every matching Publication.');

        const byDocFirst = provider.findByDocumentId('doc-first');
        assert(byDocFirst.length === 2 && byDocFirst.includes(first) && byDocFirst.includes(third),
            '6. findByDocumentId() returns every Publication sharing that documentId — a real, non-unique lookup, matching LocalDiscoveryProvider\'s own semantics.');

        assert(provider.findByParentId('no-such-parent').length === 0,
            '7. findByParentId() returns an empty array, not null, for no matches.');
    }
    console.log('✓ Section B: list() preserves insertion order and returns a defensive copy; findById()/findByAuthor()/findByParentId()/findByDocumentId() mirror LocalDiscoveryProvider\'s own established lookup semantics (null for a single miss, empty array for a filtered miss).');

    // ===============================================================
    // Section C — No invented deduplication: two add() calls, two
    // entries.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const publication = makeLocalStylePublication({ documentId: 'doc-dup', title: 'Duplicate', author: 'alice' }, alice);
        const provider = new DecentralizedPublicationDiscoveryProvider();
        provider.add(publication);
        provider.add(publication);
        assert(provider.list().length === 2,
            '1. adding the same Publication twice produces two entries — no content-hash or id-based deduplication is invented here, per this milestone\'s own scope.');
    }
    console.log('✓ Section C: no deduplication policy is invented. discovery/DiscoveryProvider.js\'s own contract specifies no uniqueness requirement, so two add() calls for the same Publication yield two entries — exactly the conservative posture the brief called for.');

    // ===============================================================
    // Section D — Flagship: a Publication travels the REAL, unmodified
    // decentralized transport, the resolved result is handed to a real
    // DecentralizedPublicationDiscoveryProvider, and Repository's own
    // REAL, unmodified SearchPublicationsUseCase finds it.
    // ===============================================================
    {
        const alice = makeIdentity('Alice');
        const sharedStorage = new InMemoryStorageProvider();
        const aliceResolver = new PublicationResolver(new LocalContentStore(sharedStorage), new LocalAuthorizationVerifier());

        const originalPublication = makeLocalStylePublication(
            { documentId: 'world-lighthouse-2', title: 'The Lighthouse Returns', author: 'alice' },
            alice
        );

        const envelope = await aliceResolver.publish({
            content: originalPublication,
            contentKind: PUBLICATION_CONTENT_KIND,
            identityProvider: alice
        });
        assert(envelope instanceof DecentralizedPublication,
            '1. publish() wraps the Publication in a DecentralizedPublication envelope — unmodified 0.9.331 behavior.');

        const bobVerifier = new LocalAuthorizationVerifier();
        const bobResolver = new PublicationResolver(new LocalContentStore(sharedStorage), bobVerifier);
        const kindPlugin = createPublicationContentKind({ verifier: bobVerifier });
        const result = await bobResolver.resolve(envelope.toJSON(), kindPlugin);
        assert(result.outcome === PublicationResolutionOutcome.RESOLVED,
            `2. Bob resolves the envelope back to real content (${result.reason}).`);

        const resolvedPublication = result.content;
        assert(resolvedPublication instanceof Publication,
            '3. the resolved content is a genuine publisher/Publication.js instance.');

        // The production accumulator this milestone adds — never a
        // test-only stub.
        const provider = new DecentralizedPublicationDiscoveryProvider();
        provider.add(resolvedPublication);

        // Repository's own real, unmodified use case.
        const searchUseCase = new SearchPublicationsUseCase(provider);

        const byText = searchUseCase.execute({ text: 'lighthouse' });
        assert(byText.items.length === 1 && byText.items[0].id === resolvedPublication.id,
            '4. Repository\'s own real SearchPublicationsUseCase finds the decentralized-origin Publication by title text search, unmodified.');

        const byAuthor = searchUseCase.execute({ author: 'alice' });
        assert(byAuthor.items.length === 1 && byAuthor.items[0].documentId === 'world-lighthouse-2',
            '5. ...and by author filter, with documentId intact.');

        const miss = searchUseCase.execute({ text: 'no-such-title-exists' });
        assert(miss.items.length === 0,
            '6. ...and correctly excludes it from an unrelated query.');

        // And a second, purely local Publication in the SAME provider
        // proves this is a real catalog, not a single-item special case.
        const localPublication = makeLocalStylePublication({ documentId: 'doc-local', title: 'Local Only', author: 'alice' }, alice);
        provider.add(localPublication);
        const both = searchUseCase.execute({ author: 'alice' });
        assert(both.items.length === 2,
            '7. a locally-added Publication and a decentralized-origin one coexist in the same provider and both surface through the identical, unmodified search path.');
    }
    console.log('✓ Section D: FLAGSHIP. A Publication travels the real, unmodified decentralized transport — PublicationResolver#publish() under the forkbuild.publication content kind (0.9.331), resolved back by a different identity through PublicationResolver#resolve() (0.9.332\'s own convergence-proven pipeline) — and the resolved result, handed to a real DecentralizedPublicationDiscoveryProvider via add(), is found by Repository\'s own real, unmodified SearchPublicationsUseCase by title text and by author filter, with documentId intact, and correctly excluded from an unrelated query. This is exactly 0.9.334\'s own Section E proof, but through the real production accumulator this milestone adds instead of a disposable test-only stub — the discovery gap that audit named is closed.');

    // ===============================================================
    // Section E — The provider performs no decentralized discovery or
    // resolution itself: confirmed structurally.
    // ===============================================================
    {
        const providerSource = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        const importLines = providerSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 2 &&
            importLines.every((line) => /DiscoveryProvider\.js'|Publication\.js'/.test(line)),
            `1. discovery/DecentralizedPublicationDiscoveryProvider.js imports only its own base class and publisher/Publication.js — never Nostr, PublicationResolver, peer transport, or Arweave machinery (found imports: ${importLines.join(' | ')}).`);
        const classBody = providerSource
            .slice(providerSource.indexOf('export class'))
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        assert(!/signature|verify|trust|fetch\(|Nostr|Arweave/i.test(classBody),
            '2. the class body\'s own executable code never inspects a signature, performs verification, attaches trust, or reaches the network — those remain, per this milestone\'s own scope, someone else\'s job upstream of add().');
    }
    console.log('✓ Section E: confirmed structurally, not merely by header comment. The provider never imports Nostr, PublicationResolver, peer transport, or Arweave machinery, and never inspects a signature or attaches trust — it is exactly the narrow catalog boundary this milestone scoped, nothing more.');

    console.log('\n✅ All Decentralized Publication Discovery Provider tests passed.');
}

run().then(() => {
    console.log('\n✓ All DecentralizedPublicationDiscoveryProvider tests passed');
}).catch((error) => {
    console.error('\n✗ DecentralizedPublicationDiscoveryProvider tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
