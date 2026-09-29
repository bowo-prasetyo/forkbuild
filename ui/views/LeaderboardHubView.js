import { PublicationObservationArchive } from '../../application/publication/observationArchive/PublicationObservationArchive.js';
import { PublisherIdentityRecord } from '../../application/publisher/PublisherIdentityRecord.js';
import { reconstructDistinctPublisherIdentifiers } from '../../application/publisher/PublisherAssociationView.js';
import { reconstructPublisherAchievementProfile } from '../../application/achievement/PublisherAchievementProfileView.js';
import { reconstructPublisherAchievementBadges } from '../../application/achievement/PublisherAchievementBadgeView.js';
import { reconstructPublisherAchievementStatistics } from '../../application/achievement/PublisherAchievementStatisticsView.js';
import { sortLabels } from '../../utils/sortOptionsByLabel.js';
import { displayText, t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';

// Leaderboard Hub — a single contextual entry point from /publications
// (ui/views/DecentralizedPublicationsView.js's own "Publication Archive"
// card) consolidating what used to be four separate links plus three
// separate data cards spread across that page:
//
//   /reconciliation-leaderboard, /reconciliation-workspace,
//   /publisher-snapshot-claim, /publisher-leaderboard   (0.9.400/0.9.408/
//                                                         0.9.411/0.9.417)
//   Publisher Achievement Profile/Badges/Statistics      (0.8.109-0.8.111)
//
// The three Publisher Achievement cards moved here specifically because
// they are genuinely upstream of the Publisher Performance Leaderboard's
// own data, not merely adjacent to it: Publisher Achievement Statistics
// (0.8.111) is exactly the `PublisherAchievementStatistics` object
// application/leaderboard/PublisherRankingPolicy.js's own reconstructPublisherRanking()
// (0.8.112) consumes per publisher, and application/leaderboard/PublisherLeaderboardView.js
// (0.8.113) presents that ranking as the Publisher Performance Leaderboard.
// Publisher Achievement Badges (0.8.110) composes application/
// AchievementBadgeView.js's own reconstructAchievementBadges() directly
// (the exact function behind the Publications page's own "Achievements"
// card), and Publisher Achievement Statistics composes Publisher
// Achievement Badges in turn — see each application/ file's own header for
// the full composition chain. None of the three ever invents a second
// achievement, score, or ranking of their own; each is a pure projection
// over the SAME archive /publications reads.
//
// The one exception is the "Achievements" card itself (0.8.103) — it stays
// on /publications because it is a presentation of THIS PAGE'S OWN
// publication records, not a publisher lookup, and reads naturally next to
// the publications that earned it.
//
// DELIBERATELY NOT A TOP-NAV DESTINATION — reached by the one contextual
// link on /publications' own "Publication Archive" card, the same
// "contextual, not global" shape every link it replaces already used.
//
// THE SAME ARCHIVE-LOADING SEAM EVERY OTHER PAGE ALREADY USES.
// `publicationObservationArchiveStorage` is injected exactly like
// ui/views/PublisherPerformanceLeaderboardView.js's own copy of the
// identical `inject` block — its own `load()` never throws, so a missing
// or corrupted archive degrades to PublicationObservationArchive.empty()
// rather than a crashed page.
//
// A publisher badge's "View Publication Lifecycle" jump — which on
// /publications opened that same page's own Bitcoin/Base Anchor
// Publications lifecycle disclosures — does not follow the three cards
// here: that lifecycle UI lives on /publications, not on this page, so
// reproducing the jump would mean reaching into a different component
// entirely. The badge's own Source Publication fields (blockchain, content
// hash, chain reference, created) are shown in full below regardless; a
// plain link back to /publications replaces the interactive jump.
export default {
    name: 'LeaderboardHubView',
    components: { I18nText },
    inject: {
        publicationObservationArchiveStorage: { default: null }
    },
    data() {
        return {
            publisherAchievementProfileExpanded: false,
            publisherAchievementProfileSelectedPublisherId: '',
            publisherAchievementBadgesExpanded: false,
            publisherAchievementBadgeExpanded: {},
            publisherAchievementBadgesSelectedPublisherId: '',
            publisherAchievementStatisticsExpanded: false,
            publisherAchievementStatisticsSelectedPublisherId: ''
        };
    },
    methods: {
        t,
        displayText,
        archive() {
            return this.publicationObservationArchiveStorage
                ? this.publicationObservationArchiveStorage.load()
                : PublicationObservationArchive.empty();
        },
        formatWhen(iso) {
            return iso ? new Date(iso).toLocaleString() : 'unknown time';
        },
        shortId(identityId) {
            return identityId ? identityId.slice(-14) : 'an unknown identity';
        },
        distinctPublisherIdentifiersView() {
            return sortLabels(reconstructDistinctPublisherIdentifiers(this.archive()));
        },
        togglePublisherAchievementProfile() {
            this.publisherAchievementProfileExpanded = !this.publisherAchievementProfileExpanded;
        },
        publisherAchievementProfileView() {
            if (!this.publisherAchievementProfileSelectedPublisherId) return null;
            return reconstructPublisherAchievementProfile(
                this.archive(),
                new PublisherIdentityRecord({ publisherId: this.publisherAchievementProfileSelectedPublisherId })
            );
        },
        togglePublisherAchievementBadges() {
            this.publisherAchievementBadgesExpanded = !this.publisherAchievementBadgesExpanded;
        },
        publisherAchievementBadgesView() {
            if (!this.publisherAchievementBadgesSelectedPublisherId) return null;
            return reconstructPublisherAchievementBadges(
                this.archive(),
                new PublisherIdentityRecord({ publisherId: this.publisherAchievementBadgesSelectedPublisherId })
            );
        },
        togglePublisherAchievementBadge(index) {
            this.publisherAchievementBadgeExpanded[index] = !this.publisherAchievementBadgeExpanded[index];
        },
        isPublisherAchievementBadgeExpanded(index) {
            return Boolean(this.publisherAchievementBadgeExpanded[index]);
        },
        togglePublisherAchievementStatistics() {
            this.publisherAchievementStatisticsExpanded = !this.publisherAchievementStatisticsExpanded;
        },
        publisherAchievementStatisticsView() {
            if (!this.publisherAchievementStatisticsSelectedPublisherId) return null;
            return reconstructPublisherAchievementStatistics(
                this.archive(),
                new PublisherIdentityRecord({ publisherId: this.publisherAchievementStatisticsSelectedPublisherId })
            );
        }
    },
    template: `
        <section class="leaderboard-hub-view">
            <h1>{{ t('leaderboardHubView.leaderboard') }}</h1>
            <p class="form-hint form-hint--neutral">
                {{ t('leaderboardHubView.reconciliationPublisherSnapshotClaimsAnd') }}
            </p>

            <ul class="leaderboard-hub-list">
                <li>
                    <router-link to="/reconciliation-leaderboard">
                        <span class="leaderboard-hub-link-title">{{ t('leaderboardHubView.reconciliationCandidateLeaderboard') }}</span>
                        <span class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.compareThisArchiveSDecision') }}
                        </span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/reconciliation-workspace">
                        <span class="leaderboard-hub-link-title">{{ t('leaderboardHubView.reconciliationWorkspace') }}</span>
                        <span class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.reconcileThisArchiveAgainstA') }}
                        </span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/publisher-snapshot-claim">
                        <span class="leaderboard-hub-link-title">{{ t('leaderboardHubView.publisherSnapshotClaim') }}</span>
                        <span class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.authorAndExportYourOwn') }}
                        </span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/publisher-leaderboard">
                        <span class="leaderboard-hub-link-title">{{ t('leaderboardHubView.publisherPerformanceLeaderboard') }}</span>
                        <span class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.seePublishersRankedByTheir') }}
                        </span>
                    </router-link>
                </li>
            </ul>

            <!-- 0.8.109 — Publisher Achievement Profile Projection. A
                 publisher-scoped reduction over the same achievement events
                 the Publications page's own "Achievement Profile" card
                 reads, aggregated across every publication the Publications
                 page's own "Publisher Associations" card has EXPLICITLY
                 recorded for this publisher — application/
                 PublisherAchievementProfileView.js's own
                 reconstructPublisherAchievementProfile(). Deliberately NOT
                 a claim of ownership or human identity. Collapsed by
                 default. Performs ZERO network operations. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('leaderboardHubView.publisherAchievementProfile') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('leaderboardHubView.persistedLocally') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('leaderboardHubView.aPublisherSOwnAchievements') }}
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAchievementProfile">
                        {{ publisherAchievementProfileExpanded ? t('leaderboardHubView.hidePublisherAchievementProfile') : t('leaderboardHubView.showPublisherAchievementProfile') }}
                    </button>
                </div>
                <div v-if="publisherAchievementProfileExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('leaderboardHubView.chooseAPublisher') }}</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        <I18nText keypath="leaderboardHubView.noPublisherHasBeenAssociated">
                            <template #publications><router-link to="/publications">{{ t('leaderboardHubView.publications') }}</router-link></template>
                        </I18nText>
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">{{ t('leaderboardHubView.publisher') }}</span>
                        <select v-model="publisherAchievementProfileSelectedPublisherId" class="form-input">
                            <option value="" disabled>{{ t('leaderboardHubView.chooseAPublisher2') }}</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'achievement-profile-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAchievementProfileSelectedPublisherId">
                        <span class="evidence-inspection-adapter-title">{{ t('leaderboardHubView.publisherAchievementProfile') }}</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.publisher') }}</dt><dd>{{ publisherAchievementProfileView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.associatedPublications') }}</dt><dd>{{ publisherAchievementProfileView().publicationIdentityCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.achievementsEarned') }}</dt><dd>{{ publisherAchievementProfileView().achievementCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.distinctAchievementKinds') }}</dt><dd>{{ publisherAchievementProfileView().distinctAchievementKindCount }}</dd></div>
                        </dl>
                        <p v-if="publisherAchievementProfileView().achievementCount === 0" class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.noneOfThisPublisherS') }}
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(achievement, achievementIndex) in publisherAchievementProfileView().achievements" :key="achievementIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">🏆 {{ displayText(achievement.label) }}</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('leaderboardHubView.earnedBy', { observedAt: formatWhen(achievement.observedAt), blockchain: achievement.sourcePublicationIdentity.blockchain, chainReference: shortId(achievement.sourcePublicationIdentity.chainReference) }) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.theseAchievementsBelongToThe') }}
                        </p>
                    </template>
                </div>
            </div>

            <!-- 0.8.110 — Publisher Achievement Badge Projection. A
                 human-facing presentation of the "Publisher Achievement
                 Profile" card's own achievements above, kept to only those
                 achievements the Publications page's own "Achievements"
                 card can already present as a badge — application/
                 PublisherAchievementBadgeView.js's own
                 reconstructPublisherAchievementBadges(). A badge is a
                 presentation of an achievement already earned by an
                 explicitly associated publication — never a new
                 achievement, never a score, rank, or leaderboard entry.
                 Collapsed by default. Performs ZERO network operations. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('leaderboardHubView.publisherAchievementBadges') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('leaderboardHubView.persistedLocally') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('leaderboardHubView.aBadgePresentationOfThe') }}
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAchievementBadges">
                        {{ publisherAchievementBadgesExpanded ? t('leaderboardHubView.hidePublisherAchievementBadges') : t('leaderboardHubView.showPublisherAchievementBadges') }}
                    </button>
                </div>
                <div v-if="publisherAchievementBadgesExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('leaderboardHubView.chooseAPublisher') }}</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        <I18nText keypath="leaderboardHubView.noPublisherHasBeenAssociated">
                            <template #publications><router-link to="/publications">{{ t('leaderboardHubView.publications') }}</router-link></template>
                        </I18nText>
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">{{ t('leaderboardHubView.publisher') }}</span>
                        <select v-model="publisherAchievementBadgesSelectedPublisherId" class="form-input">
                            <option value="" disabled>{{ t('leaderboardHubView.chooseAPublisher2') }}</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'achievement-badges-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAchievementBadgesSelectedPublisherId">
                        <span class="evidence-inspection-adapter-title">{{ t('leaderboardHubView.publisherAchievementBadges') }}</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.publisher') }}</dt><dd>{{ publisherAchievementBadgesView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.associatedPublications') }}</dt><dd>{{ publisherAchievementBadgesView().publicationIdentityCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.badgesEarned') }}</dt><dd>{{ publisherAchievementBadgesView().badgeCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.distinctBadgeKinds') }}</dt><dd>{{ publisherAchievementBadgesView().distinctAchievementKindCount }}</dd></div>
                        </dl>
                        <p v-if="publisherAchievementBadgesView().badgeCount === 0" class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.noneOfThisPublisherS2') }}
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="badge in publisherAchievementBadgesView().badges" :key="badge.index" class="replica-knowledge-claim">
                                <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAchievementBadge(badge.index)">
                                    {{ badge.icon }} {{ displayText(badge.title) }}
                                </button>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('leaderboardHubView.earned', { description: badge.description, earnedAt: formatWhen(badge.earnedAt) }) }}
                                </p>

                                <div v-if="isPublisherAchievementBadgeExpanded(badge.index)" class="evidence-list">
                                    <span class="evidence-convergence-title">{{ t('leaderboardHubView.sourcePublication') }}</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('leaderboardHubView.blockchain') }}</dt><dd>{{ badge.sourcePublicationIdentity.blockchain }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('leaderboardHubView.contentHash') }}</dt><dd>{{ badge.sourcePublicationIdentity.contentHash }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('leaderboardHubView.chainReference') }}</dt><dd>{{ badge.sourcePublicationIdentity.chainReference }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('leaderboardHubView.created') }}</dt><dd>{{ formatWhen(badge.sourcePublicationIdentity.createdAt) }}</dd></div>
                                    </dl>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('leaderboardHubView.thisBadgeIsAPresentation') }}
                                    </p>
                                    <router-link to="/publications" class="action-btn action-btn--secondary">
                                        {{ t('leaderboardHubView.viewPublicationOnPublicationsPage') }}
                                    </router-link>
                                </div>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.theseBadgesPresentAchievementsAlready') }}
                        </p>
                    </template>
                </div>
            </div>

            <!-- 0.8.111 — Publisher Achievement Statistics Projection. A
                 pure tally over the "Publisher Achievement Profile" and
                 "Publisher Achievement Badges" cards above — application/
                 PublisherAchievementStatisticsView.js's own
                 reconstructPublisherAchievementStatistics(). Describes
                 measurable facts about this publisher's own explicitly
                 associated publications and their derived achievements —
                 never decides whether those facts are good, bad, important,
                 or worthy of a higher rank on their own; this is the exact
                 statistics object application/leaderboard/PublisherRankingPolicy.js
                 (0.8.112) consumes to build the Publisher Performance
                 Leaderboard linked above. Collapsed by default. Performs
                 ZERO network operations. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('leaderboardHubView.publisherAchievementStatistics') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('leaderboardHubView.persistedLocally') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('leaderboardHubView.measurableFactsAboutAPublisher') }}
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAchievementStatistics">
                        {{ publisherAchievementStatisticsExpanded ? t('leaderboardHubView.hidePublisherAchievementStatistics') : t('leaderboardHubView.showPublisherAchievementStatistics') }}
                    </button>
                </div>
                <div v-if="publisherAchievementStatisticsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('leaderboardHubView.chooseAPublisher') }}</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        <I18nText keypath="leaderboardHubView.noPublisherHasBeenAssociated">
                            <template #publications><router-link to="/publications">{{ t('leaderboardHubView.publications') }}</router-link></template>
                        </I18nText>
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">{{ t('leaderboardHubView.publisher') }}</span>
                        <select v-model="publisherAchievementStatisticsSelectedPublisherId" class="form-input">
                            <option value="" disabled>{{ t('leaderboardHubView.chooseAPublisher2') }}</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'achievement-statistics-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAchievementStatisticsSelectedPublisherId">
                        <span class="evidence-inspection-adapter-title">{{ t('leaderboardHubView.publisherAchievementStatistics') }}</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.publisher') }}</dt><dd>{{ publisherAchievementStatisticsView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.associatedPublications') }}</dt><dd>{{ publisherAchievementStatisticsView().publicationIdentityCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.achievementsEarned') }}</dt><dd>{{ publisherAchievementStatisticsView().achievementCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.distinctAchievementKinds') }}</dt><dd>{{ publisherAchievementStatisticsView().distinctAchievementKindCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.badgesEarned') }}</dt><dd>{{ publisherAchievementStatisticsView().badgeCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('leaderboardHubView.distinctBadgeKinds') }}</dt><dd>{{ publisherAchievementStatisticsView().distinctBadgeKindCount }}</dd></div>
                            <div v-for="chain in publisherAchievementStatisticsView().blockchainPublicationCounts" :key="chain.blockchain" class="evidence-field">
                                <dt>{{ t('leaderboardHubView.publications2', { blockchain: chain.blockchain }) }}</dt><dd>{{ chain.count }}</dd>
                            </div>
                        </dl>
                        <p v-if="publisherAchievementStatisticsView().achievementKindCounts.length === 0" class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.noneOfThisPublisherS') }}
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="entry in publisherAchievementStatisticsView().achievementKindCounts" :key="entry.achievementKind" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">{{ entry.achievementKind }} — {{ entry.count }}</span>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            {{ t('leaderboardHubView.theseArePlainCountsOf') }}
                        </p>
                    </template>
                </div>
            </div>
        </section>
    `
};
