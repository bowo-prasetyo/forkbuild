import { FOLLOWED_AUTHOR_PUBLISHED_EVENT_TYPE } from '../../application/publication/FollowedAuthorPublicationNotifier.js';
import { BUILD_REMIXED_EVENT_TYPE } from '../../application/publication/RemixedBuildNotifier.js';
import { BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE } from '../../application/publication/LookAlikeBuildNotifier.js';
import { PUBLICATION_COMMENTED_EVENT_TYPE } from '../../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
import { PUBLICATION_HEARTED_EVENT_TYPE } from '../../application/publication/heart/PublicationHeartNotifications.js';
import { t } from '../i18n/i18n.js';

// A notification in words: `{ title, body }` for the kinds ForkBuild makes,
// or null for a kind it doesn't know (the bell's history then names it from
// its event type, as before). Shown in the bell's history and, when turned
// on, by the operating system (core/social/DeviceNotifications.js).
export function describeNotification(event) {
    const payload = event?.payload || {};
    const title = text(payload.title);
    const author = text(payload.author);
    switch (event?.eventType) {
        case FOLLOWED_AUTHOR_PUBLISHED_EVENT_TYPE:
            return Object.freeze({
                title: author ? t('notificationText.followedPublished', { author }) : t('notificationText.followedPublishedNoName'),
                body: title ? t('notificationText.quotedTitle', { title }) : ''
            });
        case BUILD_REMIXED_EVENT_TYPE: {
            const remixed = text(payload.remixedTitle);
            return Object.freeze({
                title: author ? t('notificationText.remixed', { author }) : t('notificationText.remixedNoName'),
                body: remixed && title
                    ? t('notificationText.remixedBody', { title, remixed })
                    : (title ? t('notificationText.quotedTitle', { title }) : '')
            });
        }
        case BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE: {
            const yours = text(payload.yourTitle);
            const percent = Number.isFinite(payload.percent) ? payload.percent : null;
            // How alike (lookAlikeShare()): most of both, or how much of one
            // stands in the other; and whether its builder dated it before
            // yours, which this device can't back.
            const bodyKey = payload.share === 'theirsInMine' ? 'notificationText.looksLikeYoursInBody'
                : (payload.share === 'mineInTheirs' ? 'notificationText.looksLikeYoursOfBody' : 'notificationText.looksLikeYoursBody');
            const titleKey = payload.datedBefore ? 'notificationText.looksLikeYoursDatedBefore' : 'notificationText.looksLikeYours';
            return Object.freeze({
                title: author ? t(titleKey, { author }) : t(`${titleKey}NoName`),
                body: yours && title && percent !== null
                    ? t(bodyKey, { title, yours, percent })
                    : (title ? t('notificationText.quotedTitle', { title }) : '')
            });
        }
        case PUBLICATION_HEARTED_EVENT_TYPE:
            return Object.freeze({
                title: author ? t('notificationText.hearted', { author }) : t('notificationText.heartedNoName'),
                body: title ? t('notificationText.quotedTitle', { title }) : ''
            });
        case PUBLICATION_COMMENTED_EVENT_TYPE:
            return Object.freeze({ title: t('notificationText.commented'), body: t('notificationText.commentedBody') });
        default:
            return null;
    }
}

function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}
