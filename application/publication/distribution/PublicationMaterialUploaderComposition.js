import { ArweavePublicationMaterialUploader } from '../../arweave/ArweavePublicationMaterialUploader.js';
import { ContentStorePublicationMaterialUploader } from './ContentStorePublicationMaterialUploader.js';
import { IpfsContentStore } from '../../../content/IpfsContentStore.js';
import { IpfsRemotePinningContentStore } from '../../../content/IpfsRemotePinningContentStore.js';
import { HttpPinningProvider } from '../../../content/HttpPinningProvider.js';

// 0.9.670 — Publication Material Uploader Composition.
//
// `application/publication/distribution/PublicationDistributionRuntimeComposition.js` (0.9.47/0.9.428)
// and this codebase's own 0.9.444 Nostr multi-relay Publication distribution
// fan-out sibling file each independently constructed `new
// ArweavePublicationMaterialUploader(arweaveUploaderOptions)`, unconditionally
// — the one construction site standing between "Distribute Publication" and
// a real choice of where a Publication's MATERIAL goes, entirely separate
// from `discoveryProvider`'s own, already-real choice of where the
// ANNOUNCEMENT goes (see `application/publication/distribution/ContentStorePublicationMaterialUploader.js`'s
// own header for the report this closes). This file is the one place that
// decision is now made, reused identically by both call sites, so neither
// can quietly drift from the other's own idea of what a given
// `materialStorage` value means.
//
//   composePublicationMaterialUploader({
//       materialStorage,             // 'ar' (default) | 'ipfs' | 'remote-pinning'
//       arweaveUploaderOptions,
//       ipfsNodeOptions,
//       remotePinningProviderOptions
//   })
//        │
//        ├──► 'ar'             → new ArweavePublicationMaterialUploader(arweaveUploaderOptions)               (0.9.45, unmodified)
//        ├──► 'ipfs'           → new ContentStorePublicationMaterialUploader({                                (0.9.670)
//        │                          contentStore: new IpfsContentStore(ipfsNodeOptions) })            (content/IpfsContentStore.js, 0.7.1, unmodified)
//        └──► 'remote-pinning' → new ContentStorePublicationMaterialUploader({                                (0.9.670)
//                                   contentStore: new IpfsRemotePinningContentStore({                          (content/IpfsRemotePinningContentStore.js, 0.8.67, unmodified)
//                                       provider: new HttpPinningProvider(remotePinningProviderOptions) }) })  (content/HttpPinningProvider.js, 0.8.67, unmodified)
//        │
//        ▼
//   materialUploader   ({ upload(material) -> Promise<uri|null>, storage })
//
// SELECTION, NEVER FAN-OUT — THE SAME INVARIANT `PublicationDistributionRuntimeComposition.js`'s
// OWN `discoveryProvider` ALREADY HOLDS, ONE ROLE OVER. `materialStorage`
// chooses EXACTLY ONE uploader to construct; this file never builds more
// than one, and never falls back from one to another on its own. A caller
// wanting a second attempt with a different `materialStorage` calls this
// function again.
//
// `materialStorage` NAMES THE SAME VALUES `ui/components/OwnPublicationPanel.js`'s
// OWN PRE-EXISTING SNAPSHOT STORAGE PICKER ALREADY USES ('ar'/'ipfs'/
// 'remote-pinning') — NEVER A NEW VOCABULARY. Reusing that exact vocabulary,
// rather than inventing a parallel one for Publication material, is what
// lets a single "Material storage" control mean the same thing on both
// panels.
//
// EACH OPTIONS BAG IS FORWARDED VERBATIM, UNREAD BEYOND WHICHEVER
// `materialStorage` SELECTS — THE SAME RESTRAINT `PublicationDistributionRuntimeComposition.js`'s
// OWN HEADER ALREADY HOLDS FOR `arweaveUploaderOptions`/`nostrPublisherOptions`.
// `ipfsNodeOptions` (`{ apiUrl, fetchImpl, timeoutMs }`) goes straight
// to `new IpfsContentStore(...)`; `remotePinningProviderOptions` (`{ endpoint,
// credential, headers, fetchImpl, timeoutMs, cidField, fileFieldName, name }`)
// goes straight to `new HttpPinningProvider(...)`. The option bag for
// whichever storage was NOT selected is simply never read, and never
// validated by this file — a malformed option throws exactly where the
// concrete constructor it reaches already throws.
//
// NO I/O, NO CACHING, NO SINGLETON — CONSTRUCTION ONLY, FRESH EVERY CALL.
// The identical restraint every composition file in this family already
// holds: no network call happens during construction, and calling this
// function twice builds two entirely independent uploader instances.
//
// AN UNRECOGNIZED `materialStorage` THROWS SYNCHRONOUSLY, BEFORE ANY
// CONSTRUCTOR RUNS — a misconfigured caller fails loudly, the same
// restraint `composePublicationDistributionRuntime()`'s own
// `discoveryProvider` check already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A `local`/direct-filesystem material storage option.** Only the three
//   substrates `ui/components/OwnPublicationPanel.js`'s own pre-existing
//   Snapshot storage picker already offers are selectable here.
// - **Persisting, remembering, or defaulting `materialStorage` across
//   calls.** A plain, stateless selector function — exactly like
//   `discoveryProvider`'s own resolution one layer up, deciding a default
//   remains entirely `ui/main.js`'s/the UI's own concern.
// - **Any change to `application/arweave/ArweavePublicationMaterialUploader.js`,
//   `content/IpfsContentStore.js`, `content/IpfsRemotePinningContentStore.js`,
//   or `content/HttpPinningProvider.js`.** All four are reused completely
//   unmodified.

// composePublicationMaterialUploader({ materialStorage, arweaveUploaderOptions,
//   ipfsNodeOptions, remotePinningProviderOptions }) -> materialUploader.
// See this file's own header for the full contract. Throws synchronously for
// an unrecognized `materialStorage`, or for a malformed option bag the
// selected concrete constructor already rejects.
export function composePublicationMaterialUploader({
    materialStorage = 'ar',
    arweaveUploaderOptions = {},
    ipfsNodeOptions = {},
    remotePinningProviderOptions = {}
} = {}) {
    if (materialStorage === 'ar') {
        return new ArweavePublicationMaterialUploader(arweaveUploaderOptions);
    }
    if (materialStorage === 'ipfs') {
        return new ContentStorePublicationMaterialUploader({
            contentStore: new IpfsContentStore(ipfsNodeOptions)
        });
    }
    if (materialStorage === 'remote-pinning') {
        return new ContentStorePublicationMaterialUploader({
            contentStore: new IpfsRemotePinningContentStore({
                provider: new HttpPinningProvider(remotePinningProviderOptions)
            })
        });
    }
    throw new Error(`PublicationMaterialUploaderComposition: unrecognized materialStorage "${materialStorage}" — expected "ar", "ipfs", or "remote-pinning"`);
}
