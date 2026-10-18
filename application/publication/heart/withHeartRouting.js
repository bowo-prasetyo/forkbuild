import { PublicationHeart } from '../../../core/PublicationHeart.js';
import { isPublicationHeartEnvelope } from '../../../core/PublicationHeartDistributionEnvelope.js';

// Hearts ride the comment carriers (docs/Protocol.md, "Publication Hearts"):
// the peer exchange, Arweave, Steem and Blurt carry whatever signed envelope
// they're given, and every reader of them hands what it finds to one
// exchange. This wraps the comment exchange so that a heart goes to the heart
// exchange instead, both ways, and everything else is left exactly as it was.
// `onHeart(result)` hears of every heart accepted this way (the builder's
// notification); a failure there never stops the import.
//
// An accepted heart comes back as `{ heart, isNew }`, with no `commentary`,
// so comment counts and comment notifications never see one.
export function withHeartRouting(commentaryExchange, heartExchange, { onHeart = null } = {}) {
    return Object.freeze({
        exportCommentary(record) {
            return record instanceof PublicationHeart
                ? heartExchange.exportHeart(record)
                : commentaryExchange.exportCommentary(record);
        },
        importCommentaryEnvelope(envelopeJson) {
            if (!isPublicationHeartEnvelope(envelopeJson)) {
                return commentaryExchange.importCommentaryEnvelope(envelopeJson);
            }
            const result = heartExchange.importHeartEnvelope(envelopeJson);
            if (onHeart) {
                try {
                    onHeart(result);
                } catch {
                }
            }
            return result;
        }
    });
}
