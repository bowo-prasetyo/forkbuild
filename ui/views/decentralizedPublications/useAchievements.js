import { ref, reactive } from 'vue';
import { reconstructAchievementBadges } from '../../../application/achievement/AchievementBadgeView.js';
import { BlockchainKind } from '../../../application/anchoring/BlockchainKind.js';
import { reconstructAchievementProfile } from '../../../application/achievement/AchievementProfileView.js';

// Achievement badges and the achievement profile, derived from the archive.
export function useAchievements({
    baseAnchorPublicationLifecycleExpanded, baseAnchorPublicationsExpanded,
    bitcoinAnchorPublicationLifecycleExpanded, bitcoinAnchorPublicationsExpanded, findKnownPublicationIdentity,
    publicationObservationArchive
}) {
    // Presentation over reconstructAchievementBadges(). No network access.
    const achievementsExpanded = ref(false);
    const achievementBadgeExpanded = reactive({});

    function toggleAchievements() {
        achievementsExpanded.value = !achievementsExpanded.value;
    }

    function achievementBadgesView() {
        return reconstructAchievementBadges(publicationObservationArchive.value);
    }

    function toggleAchievementBadge(index) {
        achievementBadgeExpanded[index] = !achievementBadgeExpanded[index];
    }

    function isAchievementBadgeExpanded(index) {
        return Boolean(achievementBadgeExpanded[index]);
    }

    // Opens the existing lifecycle disclosure for the badge's
    // anchorId/txid. A Bitcoin badge whose anchorId couldn't be resolved
    // opens nothing; the id is never guessed.
    function canViewAchievementBadgeLifecycle(badge) {
        return badge.sourcePublicationIdentity.blockchain === BlockchainKind.BASE
            || Boolean(badge.sourceAnchorId);
    }

    function viewAchievementBadgeLifecycle(badge) {
        if (badge.sourcePublicationIdentity.blockchain === BlockchainKind.BITCOIN && badge.sourceAnchorId) {
            bitcoinAnchorPublicationsExpanded.value = true;
            bitcoinAnchorPublicationLifecycleExpanded[badge.sourceAnchorId] = true;
        } else if (badge.sourcePublicationIdentity.blockchain === BlockchainKind.BASE) {
            baseAnchorPublicationsExpanded.value = true;
            baseAnchorPublicationLifecycleExpanded[badge.sourcePublicationIdentity.chainReference] = true;
        }
    }

    // Publication-scoped, never a person or wallet profile. The publication
    // is picked from known identities, never guessed from a content hash.
    const achievementProfileExpanded = ref(false);
    const achievementProfileSelectedKey = ref('');

    function toggleAchievementProfile() {
        achievementProfileExpanded.value = !achievementProfileExpanded.value;
    }

    // With no publication selected this is a valid, empty profile.
    function achievementProfileView() {
        const identity = findKnownPublicationIdentity(achievementProfileSelectedKey.value);
        return reconstructAchievementProfile(publicationObservationArchive.value, identity);
    }

    return {
        achievementsExpanded, achievementBadgeExpanded, toggleAchievements, achievementBadgesView,
        toggleAchievementBadge, isAchievementBadgeExpanded, canViewAchievementBadgeLifecycle,
        viewAchievementBadgeLifecycle, achievementProfileExpanded, achievementProfileSelectedKey,
        toggleAchievementProfile, achievementProfileView
    };
}
