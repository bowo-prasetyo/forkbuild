// 0.9.670 — Content-Store-Backed Publication Material Uploader.
//
// `application/ArweavePublicationMaterialUploader.js` (0.9.45) is the only
// concrete `materialUploader` (`{ upload(material) -> Promise<uri|null>,
// storage }`) `application/PublicationDistributionExecutor.js`'s own
// duck-typed contract has ever had, which is why "Distribute Publication"
// has never been able to place a Publication's material anywhere but
// Arweave — see that file's own header, "always Arweave," and
// `docs/Roadmap.md`'s own 0.9.670 entry for the real report this closes:
// choosing Nostr as the Announcement/Discovery substrate still reached an
// Arweave wallet-signing prompt, because ANNOUNCEMENT and MATERIAL PLACEMENT
// are two independent decisions and only the first one was ever
// selectable.
//
//   content/ContentStore.js-shaped collaborator   (content/IpfsContentStore.js,
//        │                                          content/IpfsRemotePinningContentStore.js,
//        │                                          or any other put()/storage pair)
//        │
//        ▼
//   application/ContentStorePublicationMaterialUploader.js   ★ (THIS)
//        #upload(material)
//        │
//        ▼
//   contentStore.put(material) -> ContentReference{ uri, storage, ... }
//        │
//        ▼
//   ContentReference.uri   (e.g. "ipfs://<cid>")   | rejection, propagated
//
// AN ADAPTER, NEVER A SECOND UPLOAD IMPLEMENTATION. This class performs no
// I/O of its own — every byte ever leaves this process through the injected
// `contentStore`'s own `put()`. Its only job is reshaping that call's own
// `ContentReference` result into the bare uri string
// `application/PublicationDistributionExecutor.js` already expects back
// from `materialUploader.upload()`, the identical narrow translation
// `application/ArweavePublicationMaterialUploader.js` itself performs for
// its own Arweave-specific wire call.
//
// `contentStore` IS DUCK-TYPED, NEVER A CLASS IMPORT — THE SAME RESTRAINT
// EVERY COLLABORATOR IN THIS WHOLE FAMILY ALREADY HOLDS. This file never
// imports `content/ContentStore.js`, `content/IpfsContentStore.js`, or
// `content/IpfsRemotePinningContentStore.js` — it only requires whatever it
// is handed to expose a `put(bytes) -> Promise<ContentReference>` function
// and a non-empty `storage` string, exactly the two facts this class itself
// reads. `application/PublicationMaterialUploaderComposition.js` is where a
// concrete `content/` class actually gets chosen and constructed; this file
// has no opinion about which one a caller supplies.
//
// GENUINE FAILURE PROPAGATES, NEVER SWALLOWED — THE SAME LINE
// `ArweavePublicationMaterialUploader.js`'s OWN HEADER ALREADY DRAWS. A
// `contentStore.put()` rejection (no connectivity, a pinning service's own
// definitive refusal, a Kubo daemon that is not running) is not "this
// upload did not succeed," it propagates to this class's own caller
// unchanged — never caught, reclassified, or retried here.
//
// A CONTENT STORE THAT RESOLVES BUT VIOLATES ITS OWN CONTRACT THROWS —
// NEVER DEGRADES TO `null`. If `contentStore.put()` resolves without a
// usable `uri`, this class throws rather than returning `null`, the
// identical "resolved with success but broke its own contract" distinction
// `ArweavePublicationMaterialUploader.js`'s own header already draws for a
// malformed `signer` response.
//
// MALFORMED `material` DEGRADES TO `null`, NEVER THROWS, AND THE CONTENT
// STORE IS NEVER CONSULTED — the identical restraint
// `ArweavePublicationMaterialUploader.js`'s own header already holds for a
// missing/non-string/empty `material`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Choosing which `content/` class backs a given `materialStorage`
//   choice.** `application/PublicationMaterialUploaderComposition.js`'s own
//   job, one layer up.
// - **Size ceilings, retry, caching, or deduplication of any kind.** None
//   of `content/IpfsContentStore.js`/`content/IpfsRemotePinningContentStore.js`
//   impose one on this side of the boundary; this adapter adds none either.
export class ContentStorePublicationMaterialUploader {
    // contentStore: a duck-typed `{ put(bytes) -> Promise<ContentReference>,
    //   storage }` collaborator — see this file's own header, "contentStore
    //   is duck-typed."
    constructor({ contentStore } = {}) {
        if (!contentStore || typeof contentStore.put !== 'function') {
            throw new Error('ContentStorePublicationMaterialUploader: a contentStore with a put() method is required');
        }
        if (typeof contentStore.storage !== 'string' || contentStore.storage.length === 0) {
            throw new Error('ContentStorePublicationMaterialUploader: a contentStore with a non-empty storage name is required');
        }
        this._contentStore = contentStore;

        // Bound so `uploader.upload` survives being passed around as a bare
        // function reference — the identical reason
        // `ArweavePublicationMaterialUploader`'s own `upload` is bound in
        // its own constructor.
        this.upload = this.upload.bind(this);
    }

    // Matches whatever `storage` label the injected contentStore itself
    // already stamps onto every `ContentReference` it returns — never
    // re-derived from `materialUri`'s own scheme here, the same fallback
    // `application/PublicationDistributionExecutor.js` already reads off
    // `materialUploader.storage` for the one case its own descriptor call
    // never ran.
    get storage() { return this._contentStore.storage; }

    // upload(material) -> Promise<string uri | null>. See this file's own
    // header for the full contract: `null` for missing/non-string/empty
    // `material`, before the content store is ever consulted; a genuine
    // `contentStore.put()` rejection propagates unchanged; a contentStore
    // resolving with no usable `uri` throws rather than degrading to
    // `null`.
    async upload(material) {
        if (typeof material !== 'string' || material.length === 0) {
            return null;
        }

        const reference = await this._contentStore.put(material);
        const uri = reference && reference.uri;
        if (typeof uri !== 'string' || uri.length === 0) {
            throw new Error('ContentStorePublicationMaterialUploader: contentStore resolved with no uri');
        }
        return uri;
    }
}
