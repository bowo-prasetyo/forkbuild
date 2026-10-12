// World view template: the controls over the view (docs/reviews/CreativeDirection-2026-10-12b.md,
// finding 6): what a visitor came to do — Build here, Walk here with me and Edit a Copy —
// on a bar at the bottom of the World, in place of a row in the side panel, so they are
// there with the panel closed (a phone starts with it closed). On the plaza, with the panel
// closed, a one-line chip names the week and how many builds stand there, and opens the
// panel. It renders in WorldView's scope, so it uses the names its setup() returns.
export const hudSectionTemplate = `<div
                v-if="cameraPosition && ((plaza && !panelOpen) || (activeDocumentInfo && !inPlaza))"
                class="world-view-hud"
                role="toolbar"
                :aria-label="t('worldView.hudLabel')"
            >
                <button
                    v-if="plaza && !panelOpen"
                    type="button"
                    class="action-btn world-view-hud-plaza"
                    :aria-expanded="panelOpen ? 'true' : 'false'"
                    @click="togglePanel"
                ><span aria-hidden="true">🏆</span> {{ plaza.found ? t('plaza.chip', { theme: plaza.title, count: plaza.exhibits.length + plaza.readyMades.length }) : t('plaza.notFound') }}</button>
                <template v-if="activeDocumentInfo && !inPlaza">
                    <button
                        type="button"
                        class="action-btn world-view-build-here"
                        :title="t('buildPlot.buildHereHint')"
                        @click="buildHere"
                    >{{ t('buildPlot.buildHere') }}</button>
                    <button
                        type="button"
                        class="action-btn action-btn--primary world-view-walk-together"
                        :title="t('walkTogether.buttonHint')"
                        @click="openWalkDialog"
                    >{{ t('walkTogether.button') }}</button>
                    <button
                        v-if="!activeDocumentInfo.editable"
                        type="button"
                        class="action-btn world-view-edit-copy"
                        :title="t('publicationLink.editCopyHint')"
                        @click="editActiveCopy"
                    >{{ t('publicationLink.editCopy') }}</button>
                </template>
            </div>`;
