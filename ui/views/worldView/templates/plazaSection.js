// World view template: the challenge plaza's panel (ui/views/worldView/useChallengePlaza.js),
// shown at the top while World View is on `/plaza/<week>`: the week, its exhibits, and
// what isn't standing and why. It renders in WorldView's scope, so it uses the names its
// setup() returns.
export const plazaSectionTemplate = `<section v-if="plaza" class="world-view-plaza" aria-labelledby="world-view-plaza-title">
                    <p class="world-view-plaza-kicker"><span aria-hidden="true">🏆</span> {{ t('plaza.kicker') }}</p>
                    <template v-if="plaza.found">
                        <h2 id="world-view-plaza-title" class="world-view-plaza-title">{{ t('plaza.title', { theme: plaza.title }) }}</h2>
                        <p class="world-view-plaza-lead">{{ t('plaza.lead') }}</p>
                        <p class="world-view-plaza-status" role="status">
                            <template v-if="plaza.exhibits.length">{{ t('plaza.standing', { count: plaza.exhibits.length }) }}</template>
                            <template v-else-if="!plaza.loading">{{ t('plaza.empty') }}</template>
                            <template v-if="plaza.loading">{{ ' ' + t('plaza.fetching') }}</template>
                        </p>
                        <div
                            v-for="exhibit in plaza.exhibits"
                            :key="exhibit.key"
                            class="world-view-nearby-row world-view-plaza-exhibit"
                        >
                            <span class="world-view-nearby-row-label">{{ exhibit.title }}</span>
                            <span v-if="exhibit.author" class="world-view-plaza-author">{{ t('worldLocationBrowser.by', { author: exhibit.author }) }}</span>
                            <button class="action-btn world-view-nearby-row-go world-view-plaza-focus" @click="focusExhibit(exhibit)">{{ t('worldView.navigate') }}</button>
                            <button class="action-btn world-view-nearby-row-go world-view-plaza-open" @click="openExhibit(exhibit)">{{ t('plaza.open') }}</button>
                            <button class="action-btn world-view-nearby-row-go world-view-plaza-remix" @click="remixExhibit(exhibit)">{{ t('publicationLink.editCopy') }}</button>
                        </div>
                        <p v-if="plaza.notPlaceable" class="world-view-plaza-note">{{ t('plaza.notPlaceable', { count: plaza.notPlaceable }) }}</p>
                        <p v-if="plaza.unavailable" class="world-view-plaza-note">{{ t('plaza.unavailable', { count: plaza.unavailable }) }}</p>
                        <p v-if="plaza.beyond" class="world-view-plaza-note">{{ t('plaza.beyond', { count: plaza.beyond, max: plaza.max }) }}</p>
                        <div class="world-view-actions">
                            <button type="button" class="action-btn world-view-plaza-middle" @click="backToPlaza">{{ t('plaza.backToMiddle') }}</button>
                            <button type="button" class="action-btn world-view-plaza-challenge" @click="$router.push(plaza.challengeRoute)">{{ t('plaza.toChallenge') }}</button>
                        </div>
                    </template>
                    <template v-else>
                        <h2 id="world-view-plaza-title" class="world-view-plaza-title">{{ t('plaza.notFound') }}</h2>
                        <button type="button" class="action-btn world-view-plaza-challenge" @click="$router.push(plaza.challengeRoute)">{{ t('plaza.toChallenge') }}</button>
                    </template>
                </section>`;
