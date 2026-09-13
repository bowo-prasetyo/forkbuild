import { PublicationObservationArchive } from '../../application/PublicationObservationArchive.js';
import { PublisherIdentityRecord } from '../../application/PublisherIdentityRecord.js';
import { reconstructDistinctPublisherIdentifiers } from '../../application/PublisherAssociationView.js';
import { reconstructPublisherAchievementProfile } from '../../application/PublisherAchievementProfileView.js';
import { reconstructPublisherAchievementBadges } from '../../application/PublisherAchievementBadgeView.js';
import { reconstructPublisherAchievementStatistics } from '../../application/PublisherAchievementStatisticsView.js';

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
// application/PublisherRankingPolicy.js's own reconstructPublisherRanking()
// (0.8.112) consumes per publisher, and application/PublisherLeaderboardView.js
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
            return reconstructDistinctPublisherIdentifiers(this.archive());
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
            <h1>Leaderboard</h1>
            <p class="form-hint form-hint--neutral">
                Reconciliation, publisher snapshot claims, and publisher performance —
                every leaderboard-related workflow reachable from the Publications page,
                collected in one place.
            </p>

            <ul class="leaderboard-hub-list">
                <li>
                    <router-link to="/reconciliation-leaderboard">
                        <span class="leaderboard-hub-link-title">Reconciliation Candidate Leaderboard</span>
                        <span class="form-hint form-hint--neutral">
                            Compare this archive's decision and observation evidence, candidate by
                            candidate, against a peer's own exported archive.
                        </span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/reconciliation-workspace">
                        <span class="leaderboard-hub-link-title">Reconciliation Workspace</span>
                        <span class="form-hint form-hint--neutral">
                            Reconcile this archive against a single piece of peer evidence, explicitly.
                        </span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/publisher-snapshot-claim">
                        <span class="leaderboard-hub-link-title">Publisher Snapshot Claim</span>
                        <span class="form-hint form-hint--neutral">
                            Author and export your own signed leaderboard snapshot claim — the
                            evidence a peer's Workspace expects.
                        </span>
                    </router-link>
                </li>
                <li>
                    <router-link to="/publisher-leaderboard">
                        <span class="leaderboard-hub-link-title">Publisher Performance Leaderboard</span>
                        <span class="form-hint form-hint--neutral">
                            See publishers ranked by their own recorded achievements and publications,
                            computed fresh from this replica's own archive alone.
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
                    <span class="identity-mgmt-name">Publisher Achievement Profile</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A publisher's own achievements, aggregated across every publication that publisher
                    has explicitly claimed — never inferred from a shared content hash or wallet,
                    and never a score, rank, or leaderboard entry.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAchievementProfile">
                        {{ publisherAchievementProfileExpanded ? 'Hide Publisher Achievement Profile' : 'Show Publisher Achievement Profile' }}
                    </button>
                </div>
                <div v-if="publisherAchievementProfileExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Choose A Publisher</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        No publisher has been associated with anything yet — record one on the
                        <router-link to="/publications">Publications</router-link> page first.
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">Publisher</span>
                        <select v-model="publisherAchievementProfileSelectedPublisherId" class="form-input">
                            <option value="" disabled>Choose a publisher…</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'achievement-profile-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAchievementProfileSelectedPublisherId">
                        <span class="evidence-inspection-adapter-title">Publisher Achievement Profile</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Publisher</dt><dd>{{ publisherAchievementProfileView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>Associated publications</dt><dd>{{ publisherAchievementProfileView().publicationIdentityCount }}</dd></div>
                            <div class="evidence-field"><dt>Achievements earned</dt><dd>{{ publisherAchievementProfileView().achievementCount }}</dd></div>
                            <div class="evidence-field"><dt>Distinct achievement kinds</dt><dd>{{ publisherAchievementProfileView().distinctAchievementKindCount }}</dd></div>
                        </dl>
                        <p v-if="publisherAchievementProfileView().achievementCount === 0" class="form-hint form-hint--neutral">
                            None of this publisher's associated publications have earned an achievement
                            yet.
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(achievement, achievementIndex) in publisherAchievementProfileView().achievements" :key="achievementIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">🏆 {{ achievement.label }}</span>
                                <p class="form-hint form-hint--neutral">
                                    Earned {{ formatWhen(achievement.observedAt) }} by
                                    {{ achievement.sourcePublicationIdentity.blockchain }} —
                                    {{ shortId(achievement.sourcePublicationIdentity.chainReference) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            These achievements belong to the publications this publisher has explicitly
                            claimed — never proof that this publisher controls, owns, or is the human
                            behind any of them.
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
                    <span class="identity-mgmt-name">Publisher Achievement Badges</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A badge presentation of the achievements this publisher has already earned, across
                    every publication that publisher has explicitly claimed — never a new achievement,
                    and never a score, rank, or leaderboard entry. Some achievements (reference-derived
                    ones) have no badge presentation yet and appear only in the "Publisher Achievement
                    Profile" card above.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAchievementBadges">
                        {{ publisherAchievementBadgesExpanded ? 'Hide Publisher Achievement Badges' : 'Show Publisher Achievement Badges' }}
                    </button>
                </div>
                <div v-if="publisherAchievementBadgesExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Choose A Publisher</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        No publisher has been associated with anything yet — record one on the
                        <router-link to="/publications">Publications</router-link> page first.
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">Publisher</span>
                        <select v-model="publisherAchievementBadgesSelectedPublisherId" class="form-input">
                            <option value="" disabled>Choose a publisher…</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'achievement-badges-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAchievementBadgesSelectedPublisherId">
                        <span class="evidence-inspection-adapter-title">Publisher Achievement Badges</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Publisher</dt><dd>{{ publisherAchievementBadgesView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>Associated publications</dt><dd>{{ publisherAchievementBadgesView().publicationIdentityCount }}</dd></div>
                            <div class="evidence-field"><dt>Badges earned</dt><dd>{{ publisherAchievementBadgesView().badgeCount }}</dd></div>
                            <div class="evidence-field"><dt>Distinct badge kinds</dt><dd>{{ publisherAchievementBadgesView().distinctAchievementKindCount }}</dd></div>
                        </dl>
                        <p v-if="publisherAchievementBadgesView().badgeCount === 0" class="form-hint form-hint--neutral">
                            None of this publisher's associated publications have earned a badge-presented
                            achievement yet.
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="badge in publisherAchievementBadgesView().badges" :key="badge.index" class="replica-knowledge-claim">
                                <button type="button" class="peer-action-btn" @click="togglePublisherAchievementBadge(badge.index)">
                                    {{ badge.icon }} {{ badge.title }}
                                </button>
                                <p class="form-hint form-hint--neutral">
                                    {{ badge.description }} — earned {{ formatWhen(badge.earnedAt) }}
                                </p>

                                <div v-if="isPublisherAchievementBadgeExpanded(badge.index)" class="evidence-list">
                                    <span class="evidence-convergence-title">Source Publication</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>Blockchain</dt><dd>{{ badge.sourcePublicationIdentity.blockchain }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ badge.sourcePublicationIdentity.contentHash }}</dd></div>
                                        <div class="evidence-field"><dt>Chain reference</dt><dd>{{ badge.sourcePublicationIdentity.chainReference }}</dd></div>
                                        <div class="evidence-field"><dt>Created</dt><dd>{{ formatWhen(badge.sourcePublicationIdentity.createdAt) }}</dd></div>
                                    </dl>
                                    <p class="form-hint form-hint--neutral">
                                        This badge is a presentation of one achievement already earned by a
                                        publication this publisher has explicitly claimed — never a new
                                        achievement, and never a score or a rank.
                                    </p>
                                    <router-link to="/publications" class="action-btn action-btn--secondary">
                                        View Publication On Publications Page
                                    </router-link>
                                </div>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            These badges present achievements already earned by publications this publisher
                            has explicitly claimed — never proof that this publisher controls, owns, or is
                            the human behind any of them.
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
                 statistics object application/PublisherRankingPolicy.js
                 (0.8.112) consumes to build the Publisher Performance
                 Leaderboard linked above. Collapsed by default. Performs
                 ZERO network operations. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publisher Achievement Statistics</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Measurable facts about a publisher's explicitly associated publications and their
                    derived achievements — never a score, rank, level, or leaderboard entry on their
                    own. These are the same facts the Publisher Performance Leaderboard above ranks
                    publishers by.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAchievementStatistics">
                        {{ publisherAchievementStatisticsExpanded ? 'Hide Publisher Achievement Statistics' : 'Show Publisher Achievement Statistics' }}
                    </button>
                </div>
                <div v-if="publisherAchievementStatisticsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Choose A Publisher</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        No publisher has been associated with anything yet — record one on the
                        <router-link to="/publications">Publications</router-link> page first.
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">Publisher</span>
                        <select v-model="publisherAchievementStatisticsSelectedPublisherId" class="form-input">
                            <option value="" disabled>Choose a publisher…</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'achievement-statistics-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAchievementStatisticsSelectedPublisherId">
                        <span class="evidence-inspection-adapter-title">Publisher Achievement Statistics</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Publisher</dt><dd>{{ publisherAchievementStatisticsView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>Associated publications</dt><dd>{{ publisherAchievementStatisticsView().publicationIdentityCount }}</dd></div>
                            <div class="evidence-field"><dt>Achievements earned</dt><dd>{{ publisherAchievementStatisticsView().achievementCount }}</dd></div>
                            <div class="evidence-field"><dt>Distinct achievement kinds</dt><dd>{{ publisherAchievementStatisticsView().distinctAchievementKindCount }}</dd></div>
                            <div class="evidence-field"><dt>Badges earned</dt><dd>{{ publisherAchievementStatisticsView().badgeCount }}</dd></div>
                            <div class="evidence-field"><dt>Distinct badge kinds</dt><dd>{{ publisherAchievementStatisticsView().distinctBadgeKindCount }}</dd></div>
                            <div v-for="chain in publisherAchievementStatisticsView().blockchainPublicationCounts" :key="chain.blockchain" class="evidence-field">
                                <dt>{{ chain.blockchain }} publications</dt><dd>{{ chain.count }}</dd>
                            </div>
                        </dl>
                        <p v-if="publisherAchievementStatisticsView().achievementKindCounts.length === 0" class="form-hint form-hint--neutral">
                            None of this publisher's associated publications have earned an achievement
                            yet.
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="entry in publisherAchievementStatisticsView().achievementKindCounts" :key="entry.achievementKind" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">{{ entry.achievementKind }} — {{ entry.count }}</span>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            These are plain counts of already-earned facts — never a score, rank, level,
                            tier, or leaderboard entry, and never proof that this publisher controls,
                            owns, or is the human behind any of the publications counted above.
                        </p>
                    </template>
                </div>
            </div>
        </section>
    `
};
