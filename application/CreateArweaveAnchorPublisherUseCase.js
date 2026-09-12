import { ArweaveAnchorPublisher } from '../anchoring/ArweaveAnchorPublisher.js';

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// Mirrors application/CreateBitcoinAnchorPublisherUseCase.js's own shape
// exactly — a composition root (ui/main.js or tests/) uses this to get a
// concrete ArweaveAnchorPublisher without ever importing anchoring/
// ArweaveAnchorPublisher.js directly. The caller still supplies the
// `signer` itself — this use case wires the publisher, never the signing
// capability behind it (see anchoring/ArweaveAnchorPublisher.js's own
// header on why that stays entirely the caller's own, real or fake).
export class CreateArweaveAnchorPublisherUseCase {
    execute({ signer, gatewayUrl, fetchImpl, timeoutMs } = {}) {
        const arweaveAnchorPublisher = new ArweaveAnchorPublisher({ signer, gatewayUrl, fetchImpl, timeoutMs });

        return { arweaveAnchorPublisher };
    }
}
