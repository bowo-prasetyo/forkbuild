import { FOLLOWED_AUTHOR_PUBLISHED_EVENT_TYPE } from '../../application/publication/FollowedAuthorPublicationNotifier.js';
import { BUILD_REMIXED_EVENT_TYPE } from '../../application/publication/RemixedBuildNotifier.js';
import { PUBLICATION_COMMENTED_EVENT_TYPE } from '../../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
import { t } from '../i18n/i18n.js';

// A notification in words: `{ title, body }` for the kinds ForkBuild makes,
// or null for a kind it doesn't know (the bell's history then names it from
// its event type, as before). Shown in the bell's history and, when turned
// on, by the operating system (core/DeviceNotifications.js).
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
        case PUBLICATION_COMMENTED_EVENT_TYPE:
            return Object.freeze({ title: t('notificationText.commented'), body: t('notificationText.commentedBody') });
        default:
            return null;
    }
}

function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}
