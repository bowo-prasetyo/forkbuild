import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PublicationResolver } from './PublicationResolver.js';

// 0.7.1 — IPFS Content Publication & Resolution.
//
// The proof of application/CreatePublicationResolverUseCase.js's own
// 0.7.0 claim: "swapping content/LocalContentStore.js for an IPFS- or
// Arweave-backed ContentStore later means changing exactly this one
// file." Compare the two side by side — identical shape, one line
// different: content/IpfsContentStore.js in place of content/
// LocalContentStore.js. application/PublicationResolver.js, every
// kindPlugin, and every caller of either use case are completely
// unaware which one they got.
//
// `apiUrl` defaults to Kubo's own default local RPC address
// (127.0.0.1:5001); a caller wiring two separate replicas in one process
// (see tests/IpfsPublicationResolution.test.js's own two-node flagship)
// passes two different `apiUrl`s — or two different `fetchImpl`s — to
// two separate `execute()` calls.
export class CreateIpfsPublicationResolverUseCase {
    execute({ apiUrl, fetchImpl, timeoutMs } = {}) {
        const contentStore = new IpfsContentStore({ apiUrl, fetchImpl, timeoutMs });
        const verifier = new LocalAuthorizationVerifier();
        const publicationResolver = new PublicationResolver(contentStore, verifier);

        return { publicationResolver, contentStore, verifier };
    }
}
