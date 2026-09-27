// Own Publication panel template: the Publication's Commentary, collapsed to one line until opened.
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const commentarySectionTemplate = `<div v-if="getPublicationCommentariesCommand" class="own-publication-commentary">
                <h5 class="own-publication-commentary-title">
                    <button
                        type="button"
                        class="own-publication-commentary-toggle"
                        :aria-expanded="commentaryOpen ? 'true' : 'false'"
                        @click="commentaryOpen = !commentaryOpen"
                    >{{ commentaryOpen ? '▾' : '▸' }} Commentary ({{ publicationCommentaries.length }})</button>
                </h5>

                <!--
                    v-show, not v-if: collapsing hides the section but keeps the remote check
                    mounted, so it still fetches new comments and the count stays current.
                -->
                <div v-show="commentaryOpen" class="own-publication-commentary-body">

                <p v-if="publicationCommentaryError" class="own-publication-commentary-error">{{ publicationCommentaryError }}</p>

                <PublicationCommentaryRemoteCheck
                    v-if="publication"
                    :publication-id="publication.id"
                    @refreshed="refreshPublicationCommentaries"
                />

                <p v-if="!publicationCommentaries.length" class="own-publication-commentary-empty">No commentary yet.</p>
                <ul v-else class="own-publication-commentary-list">
                    <li
                        v-for="commentary in publicationCommentaries"
                        :key="commentary.commentaryId"
                        class="own-publication-commentary-entry"
                    >
                        <span class="own-publication-commentary-author">{{ commentary.authorIdentityId }}</span>
                        <p class="own-publication-commentary-content">{{ commentary.content }}</p>
                    </li>
                </ul>

                <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="own-publication-commentary-signin-hint">
                    Sign in to add commentary.
                </p>
                <form
                    v-else-if="addPublicationCommentaryCommand"
                    class="own-publication-commentary-form"
                    @submit.prevent="submitPublicationCommentary"
                >
                    <textarea
                        v-model="newCommentaryText"
                        class="own-publication-commentary-input"
                        :disabled="!publication || publicationCommentarySubmitting"
                        placeholder="Add a comment…"
                    ></textarea>
                    <button
                        type="submit"
                        class="action-btn own-publication-commentary-submit-action"
                        :disabled="!publication || !newCommentaryText.trim() || publicationCommentarySubmitting"
                    >{{ publicationCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                </form>
                </div>
            </div>`;
