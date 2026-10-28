import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue';
import LoginModal from './LoginModal.js';
import PublishSheet from './PublishSheet.js';
import SimilarBuildDialog from './SimilarBuildDialog.js';
import { License, LicenseId } from '../../core/document/License.js';
import { PublishSheetRow, licenseForRemix, publishSheetRows, suggestedNameNumber } from '../../core/publication/PublishSheet.js';
import { Findability } from '../../application/settings/FindabilityStore.js';
import { UpdateDocumentMetadataUseCase } from '../../application/document/UpdateDocumentMetadataUseCase.js';
import { saveFailureMessage } from './saveFailureMessages.js';
import { saveDocument, savesInProgress } from './saveDocument.js';
import { errorText, formatDate, t } from '../i18n/i18n.js';

// Save/New/dirty indicator/Recent Documents — all driven by
// DocumentManager, LoadDocumentUseCase, and (as of 0.1.20C) EditorSession
// for New/Load, which the toolbar calls without knowing that either
// operation tears down and rebuilds the entire runtime graph underneath.
//
// Reactivity: DocumentManager isn't a Vue reactive object, so this
// component keeps its own refs and refreshes them by subscribing to
// documentManager.onStateChanged() — the same imperative-subscription
// pattern BrickPalette uses for the active brick. Both New and Load go
// through DocumentManager's own state-changing methods internally
// (attachWorld -> newDocument, or LoadDocumentUseCase -> load), so the
// SAME subscription that updates the dirty indicator after a save also
// picks up New/Load automatically — no separate wiring needed for either.
//
// Hardening: Recent Documents used to render one inline button per
// saved document directly in the toolbar row, with `overflow: hidden`
// as the only answer to what happens once there are more of them than
// fit — they just got clipped, with no way to reach the rest. It's now
// a single "Recent" toggle opening a scrollable dropdown (sorted
// newest-first; DocumentManifest.list() carries no ordering guarantee
// of its own), with a search box once there are enough documents that
// scrolling alone stops being the fastest way to find one.
const SEARCH_THRESHOLD = 8;
// The builds Publish has already asked "nothing of your own yet?" about in
// this visit: asked once each, never again however often it is published.
const NOTHING_ADDED_ASKED = new Set();
// The builds Publish has already pointed out look-alikes for in this visit.
const SIMILAR_ASKED = new Set();

// 0.9.653 — SaveDocumentUseCase.execute() performs multiple independent
// StorageProvider writes (document blob, then manifest — see
// tests/DocumentSaveFailureHandlingBoundaryAudit.test.js Section B5) and
// can throw raw, technical storage exceptions. Never shown to the user
// verbatim; saveFailureMessage() turns it into a message (a full browser
// storage gets its own, since trying again cannot help). EditorView.js's
// Ctrl+S save path uses the same function.

export default {
    name: 'Toolbar',
    props: {
        documentManager: {
            type: Object,
            required: true
        },
        saveDocumentUseCase: {
            type: Object,
            required: true
        },
        loadDocumentUseCase: {
            type: Object,
            required: true
        },
        editorSession: {
            type: Object,
            required: true
        },
        publishDocumentUseCase: {
            type: Object,
            required: true
        },
        // Save/Publish report through the same transient-toast
        // mechanism every other Editor action uses.
        feedback: {
            type: Object,
            required: true
        },
        // 0.6.1 — World ↔ Editor Continuity & Return Navigation. The
        // EditorEntryContext (core/document/EditorEntryContext.js) EditorView
        // decoded off the fork that opened the CURRENTLY open document,
        // or null — see that view's own `entryContext` ref header for
        // exactly when it's null (every non-"Edit a Copy" way to reach
        // the Editor, and any later Load/New that replaces the fork).
        // Toolbar only ever READS it (title/kind/returnWorldTitle for
        // the header line, returnWorldId to decide whether "← Back to
        // World" renders at all) — it never constructs, mutates, or
        // navigates with one directly; every actual navigation goes
        // through the `back-to-world` emit below, so EditorView (which
        // owns the router) stays the one place that ever calls
        // router.push().
        entryContext: {
            type: Object,
            default: null
        },
        // Changes when documents were saved without the open document
        // changing (importing a bundle), so Recent is read again.
        savedDocumentsRevision: {
            type: Number,
            default: 0
        }
    },
    // 0.9.377 — EditorView Post-Publish Distribution Action. `published`
    // carries the EXACT Publication object publish() below already holds
    // as a local variable — never a re-derived lookup — so EditorView can
    // offer a "Distribute now" action over that same identity without
    // Toolbar knowing anything about distribution itself. Emitted only on
    // a SUCCESSFUL publish; the catch branch below never emits it.
    //
    // 0.9.641 — Editor Document Export. `export-document` is a plain
    // trigger, no payload — the same division of labor EditorView.js
    // already keeps for exportStructure()/exportBlueprintAttribution()/
    // exportBlueprintLineageClaim(): Toolbar knows a user wants to export
    // the open document; EditorView is the one that calls
    // editorSession.exportDocument() and turns the result into an actual
    // browser download. Toolbar itself never touches `document.createElement`
    // or a data: URI.
    //
    // 0.9.642 — Editor Document Import. `import-document` carries the
    // raw text of whatever file the hidden input below read off disk —
    // untrusted, unparsed — mirroring 'import-blueprint's own division
    // of labor one component up (ui/components/BuildLibraryPanel.js):
    // THIS component owns the native file picker (browser mechanics
    // only), EditorView owns JSON.parse and everything after it. Toolbar
    // never calls editorSession.importDocument() itself.
    // `saved` follows a successful Save, for the Editor's save sound.
    emits: ['back-to-world', 'open-shortcuts', 'published', 'saved', 'export-document', 'export-model', 'export-all-documents', 'import-document', 'new-document'],
    components: { LoginModal, PublishSheet, SimilarBuildDialog },
    setup(props, { emit }) {
        const identityUseCase = inject('identityUseCase', null);
        const findabilityStore = inject('findabilityStore', null);
        const readyMadeBricks = inject('readyMadeBricksStore', null);
        const similarBuildFinder = inject('similarBuildFinder', null);
        const dirty = ref(props.documentManager.state.dirty);
        const recentDocuments = ref(props.loadDocumentUseCase.listSavedDocuments());
        const recentOpen = ref(false);
        const recentQuery = ref('');
        let unsubscribe = null;

        function report(message) {
            props.feedback.show(message);
        }

        async function save() {
            try {
                await saveDocument(props.saveDocumentUseCase, props.documentManager);
            } catch (error) {
                console.error('Save failed:', error);
                props.feedback.show(saveFailureMessage(error), { durationMs: 10000 });
                return;
            }
            report(t('toolbar.saved'));
            emit('saved');
        }

        // New asks the Editor, which offers an empty plot or a ready-made build
        // (ui/components/NewDocumentDialog.js) and opens the one chosen.
        function createNew() {
            emit('new-document');
        }

        function load(id) {
            props.editorSession.loadDocument(id);
            recentOpen.value = false;
            recentQuery.value = '';
        }

        // 0.2.90 — Structure Placement & World Instances. "Place" is the
        // sibling action to "Load" on the exact same Recent Documents
        // entry: Load REPLACES the current document with this one; Place
        // adds a StructurePlacement REFERENCING it to the document
        // that's already open, without leaving it. See
        // application/editor/EditorSession.js#placeDocument()'s own header for
        // why this deliberately doesn't open `doc.id`.
        function place(doc) {
            const placed = props.editorSession.placeDocument(doc.id, doc.title);
            recentOpen.value = false;
            recentQuery.value = '';
            if (placed) {
                report(t('toolbar.placing', { title: doc.title }));
            }
        }

        function refresh() {
            dirty.value = props.documentManager.state.dirty;
            recentDocuments.value = props.loadDocumentUseCase.listSavedDocuments();
        }

        function publish() {
            try {
                const publication = props.publishDocumentUseCase.execute(props.documentManager);
                report(t('toolbar.published', { title: publication.title }));
                // Publishing keeps the build too: what was just published is
                // never left reading "Draft" and "Unsaved changes".
                if (props.documentManager.state.dirty) {
                    saveDocument(props.saveDocumentUseCase, props.documentManager)
                        .then(() => emit('saved'))
                        .catch((error) => console.error('Saving after publish failed:', error));
                }
                // 0.9.377 — forwards the exact just-published Publication
                // to whichever host holds a `@published` listener. What,
                // if anything, a listener does with it is entirely its
                // own concern — see EditorView.js's own 0.9.377 comment.
                emit('published', publication);
            } catch (err) {
                report(t('toolbar.publishFailed', { error: errorText(err) }));
            }
        }

        // Publishing signs the build with an identity, which is what lets anyone
        // trust a link to it, so sign-in is asked for here rather than before
        // building. The modal can still publish unsigned.
        const signInToPublish = ref(false);
        const lockedIdentityId = ref(null);
        // A build started from something ready-made with nothing of the
        // builder's own in it yet (core/building/PlacedBricks.js) is asked about once,
        // kindly: publishing it untouched isn't building it
        // (docs/reviews/CreativeDirection-2026-10-12b.md, finding 2).
        const askNothingAdded = ref(false);
        const checkingSimilar = ref(false);
        const similarBuilds = ref([]);
        function requestPublish() {
            if (checkingSimilar.value) return;
            const world = props.documentManager.document?.world;
            if (world && readyMadeBricks && !NOTHING_ADDED_ASKED.has(world.id)) {
                let untouched = false;
                try {
                    untouched = readyMadeBricks.get(world.id) !== null && readyMadeBricks.placedCount(world) === 0;
                } catch {
                    untouched = false;
                }
                if (untouched) {
                    NOTHING_ADDED_ASKED.add(world.id);
                    askNothingAdded.value = true;
                    return;
                }
            }
            checkSimilarBuilds();
        }
        function keepBuilding() {
            askNothingAdded.value = false;
        }
        function publishAnyway() {
            askNothingAdded.value = false;
            checkSimilarBuilds();
        }
        // A build that looks a lot like someone else's published build on
        // this device is pointed out once a visit, with Edit a Copy as the way
        // to credit them (SimilarBuildDialog). Only a hint: a failed or slow
        // check publishes as before.
        async function checkSimilarBuilds() {
            const document = props.documentManager.document;
            const world = document?.world;
            if (!similarBuildFinder || !world || SIMILAR_ASKED.has(world.id)) {
                continueToPublish();
                return;
            }
            checkingSimilar.value = true;
            let found = [];
            try {
                found = await similarBuildFinder.find(document, { readyMade: readyMadeBricks ? readyMadeBricks.get(world.id) : null });
            } catch (err) {
                console.warn('Looking for similar builds failed:', err);
                found = [];
            } finally {
                checkingSimilar.value = false;
            }
            // Another build was opened while it looked.
            if (props.documentManager.document !== document) return;
            if (found.length > 0) {
                SIMILAR_ASKED.add(world.id);
                similarBuilds.value = found;
                return;
            }
            continueToPublish();
        }
        function keepBuildingSimilar() {
            similarBuilds.value = [];
        }
        function publishOwnWork() {
            similarBuilds.value = [];
            continueToPublish();
        }
        // What Publish still needs to know, asked together in one sheet
        // (PublishSheet): whether others may remix a build with no license
        // (with no license, nobody may copy it), who can find what this
        // device publishes (asked once per device; the answer decides whether
        // each publish is also sent to everyone, ui/views/editorView/
        // useBuildNoteSend.js), and a name to sign with on a device that has
        // none. With nothing to ask, it publishes straight away.
        const sheetRows = ref([]);
        const sheetName = ref('');
        const sheetBusy = ref(false);
        const sheetError = ref('');
        function continueToPublish() {
            const license = props.documentManager.document?.metadata?.license;
            let findability = null;
            try {
                findability = findabilityStore ? findabilityStore.get() : 'none';
            } catch {
                findability = null;
            }
            const rows = publishSheetRows({
                needsName: needsFirstName(),
                needsLicense: Boolean(license && license.id === LicenseId.UNSPECIFIED),
                needsFindability: findability === null
            });
            if (rows.length === 0) {
                requestSignedPublish();
                return;
            }
            sheetError.value = '';
            sheetName.value = t('publishSheet.suggestedName', { number: suggestedNameNumber() });
            sheetRows.value = rows;
        }
        // Only a device with no name at all is asked for one on the sheet; a
        // name that is locked, or one of several to pick from, is asked for
        // after it (LoginModal), as before.
        function needsFirstName() {
            if (!identityUseCase) return false;
            const session = identityUseCase.currentSession?.();
            if (session && session.isAuthenticated) return false;
            try {
                return identityUseCase.listIdentities().length === 0;
            } catch {
                return false;
            }
        }
        function closeSheet() {
            if (sheetBusy.value) return;
            sheetRows.value = [];
            sheetError.value = '';
        }
        // Keeps the sheet's choices: the license on the build, who can find
        // it for this device. False when the license couldn't be set.
        function keepSheetChoices({ remix, everyone }) {
            const rows = sheetRows.value;
            if (rows.includes(PublishSheetRow.REMIX)) {
                try {
                    new UpdateDocumentMetadataUseCase().execute(props.documentManager, { license: new License({ id: licenseForRemix(remix) }) });
                } catch (err) {
                    sheetError.value = t('toolbar.publishFailed', { error: errorText(err) });
                    return false;
                }
            }
            if (rows.includes(PublishSheetRow.FIND)) {
                try {
                    findabilityStore.set(everyone ? Findability.EVERYONE : Findability.LINK);
                } catch {
                    // Asked again at the next publish.
                }
            }
            return true;
        }
        async function publishFromSheet(choice) {
            if (sheetBusy.value || !keepSheetChoices(choice)) return;
            if (sheetRows.value.includes(PublishSheetRow.NAME)) {
                // A name is all it takes; its key stays unprotected until a
                // passphrase is added on My Identities (ProtectIdentityNote.js
                // reminds at a later publish).
                sheetBusy.value = true;
                try {
                    const identity = await identityUseCase.createIdentity(choice.name, null);
                    await identityUseCase.authenticate(identity.identityId, null);
                } catch (err) {
                    sheetError.value = errorText(err).replace(/^LocalIdentityProvider:\s*/, '');
                    return;
                } finally {
                    sheetBusy.value = false;
                }
            }
            sheetRows.value = [];
            requestSignedPublish();
        }
        function publishUnsignedFromSheet(choice) {
            if (sheetBusy.value || !keepSheetChoices(choice)) return;
            sheetRows.value = [];
            publish();
        }
        function requestSignedPublish() {
            const session = identityUseCase?.currentSession?.();
            if (!session || (session.isAuthenticated && identityUseCase.isUnlocked(session.identityId))) {
                publish();
                return;
            }
            lockedIdentityId.value = session.isAuthenticated ? session.identityId : null;
            signInToPublish.value = true;
        }
        function publishAfterSignIn() {
            signInToPublish.value = false;
            publish();
        }

        // 0.6.1 — World ↔ Editor Continuity & Return Navigation. "Save &
        // Return to World" — deliberately the SAME save() above (never a
        // second save path) immediately followed by the `back-to-world`
        // emit EditorView's own plain "← Back to World" button already
        // uses — this button exists purely so a viewer who wants both
        // doesn't have to click Save, notice it worked, then find Back
        // to World separately.
        function saveAndReturnToWorld() {
            save();
            emit('back-to-world');
        }

        // 0.9.642 — Editor Document Import. The exact
        // <input type="file"> + FileReader shape
        // ui/components/BuildLibraryPanel.js#triggerImportBlueprint()/
        // onImportBlueprintFileChosen() already established for
        // 'import-blueprint' — Toolbar reads the raw file text and hands
        // it up unparsed; EditorView.js owns JSON.parse and everything
        // downstream of it (see this component's own emits comment).
        const importFileInput = ref(null);
        function triggerImportDocument() {
            if (importFileInput.value) {
                importFileInput.value.click();
            }
        }

        function onImportDocumentFileChosen(event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = ''; // allow re-choosing the same file later
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                emit('import-document', String(reader.result || ''));
            };
            reader.readAsText(file);
        }

        // The File menu: Export, 3D model and Import. Placed on the page under
        // its button, since a phone's toolbar scrolls sideways and would clip a
        // menu inside it.
        const fileOpen = ref(false);
        const fileMenuStyle = ref({});
        function toggleFile(event) {
            if (!fileOpen.value) {
                const rect = event?.currentTarget?.getBoundingClientRect?.();
                const viewportWidth = typeof window === 'undefined' ? Infinity : window.innerWidth;
                fileMenuStyle.value = rect
                    ? { top: `${Math.round(rect.bottom + 6)}px`, left: `${Math.round(Math.max(8, Math.min(rect.left, viewportWidth - 180)))}px` }
                    : {};
            }
            fileOpen.value = !fileOpen.value;
        }

        function toggleRecent() {
            recentOpen.value = !recentOpen.value;
            if (!recentOpen.value) {
                recentQuery.value = '';
            }
        }

        function formatModified(modified) {
            const date = new Date(modified);
            return Number.isNaN(date.getTime()) ? '' : formatDate(date, { dateStyle: 'short' });
        }

        const sortedRecentDocuments = computed(() => {
            return [...recentDocuments.value].sort((a, b) => new Date(b.modified) - new Date(a.modified));
        });

        const filteredRecentDocuments = computed(() => {
            const query = recentQuery.value.trim().toLowerCase();
            if (!query) return sortedRecentDocuments.value;
            return sortedRecentDocuments.value.filter((doc) =>
                (doc.title || '').toLowerCase().includes(query));
        });

        watch(() => props.savedDocumentsRevision, refresh);

        function exportAllDocuments() {
            recentOpen.value = false;
            emit('export-all-documents');
        }

        onMounted(() => {
            unsubscribe = props.documentManager.onStateChanged(refresh);
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        // A save not yet stored reads "Saving…" (ui/components/saveDocument.js).
        const saving = computed(() => savesInProgress.value > 0);

        return {
            t,
            dirty, saving, recentDocuments, sortedRecentDocuments, filteredRecentDocuments,
            recentOpen, recentQuery, toggleRecent, formatModified, fileOpen, fileMenuStyle, toggleFile,
            searchThreshold: SEARCH_THRESHOLD,
            save, createNew, load, place, publish, saveAndReturnToWorld,
            signInToPublish, lockedIdentityId, requestPublish, publishAfterSignIn,
            askNothingAdded, keepBuilding, publishAnyway,
            sheetRows, sheetName, sheetBusy, sheetError, closeSheet, publishFromSheet, publishUnsignedFromSheet,
            checkingSimilar, similarBuilds, keepBuildingSimilar, publishOwnWork,
            importFileInput, triggerImportDocument, onImportDocumentFileChosen, exportAllDocuments
        };
    },
    template: `
        <div class="toolbar">
            <span class="toolbar-title">ForkBuild</span>

            <!-- 0.6.1 — World ↔ Editor Continuity & Return Navigation.
                 Only renders once EditorView has decoded a real
                 EditorEntryContext WITH a return address — see that
                 view's own entryContext ref header for exactly when
                 that is (an "Edit a Copy" fork, and only for as long as
                 its own fork stays the open document). "Editing a copy
                 of ___" names what's open the same way EditorView's own
                 0.6.0 arrival toast already does; "· From: ___" only
                 appears when a return world title was actually carried
                 — a stale/hand-typed URL degrades to no subtitle rather
                 than "From: undefined." -->
            <template v-if="entryContext && entryContext.returnWorldId">
                <button class="toolbar-back-to-world" @click="$emit('back-to-world')">{{ t('toolbar.backToWorld') }}</button>
                <span class="toolbar-entry-context">
                    {{ t('toolbar.editingCopy', { title: entryContext.title || entryContext.returnWorldTitle || t('toolbar.thisWorld') }) }}<template v-if="entryContext.returnWorldTitle"> · {{ t('toolbar.from', { title: entryContext.returnWorldTitle }) }}</template>
                </span>
            </template>

            <button class="toolbar-save" @click="save">{{ t('toolbar.save') }}</button>
            <button class="toolbar-publish" :disabled="checkingSimilar" :aria-busy="checkingSimilar ? 'true' : 'false'" @click="requestPublish">{{ t('toolbar.publish') }}</button>
            <button class="toolbar-new" @click="createNew">{{ t('toolbar.new') }}</button>
            <!-- Files, under one menu so they don't sit beside Publish at the same
                 weight, nor push New off a phone's toolbar
                 (docs/reviews/CreativeDirection-2026-10-12b.md, finding 6). -->
            <div class="toolbar-file">
                <button
                    type="button"
                    class="toolbar-file-toggle"
                    aria-haspopup="menu"
                    :aria-expanded="fileOpen ? 'true' : 'false'"
                    @click="toggleFile"
                >{{ t('toolbar.file') }} <span class="toolbar-recent-caret">▾</span></button>
                <template v-if="fileOpen">
                    <div class="dropdown-backdrop" @click="fileOpen = false"></div>
                    <!-- A choice closes the menu. -->
                    <div class="toolbar-file-menu" role="menu" :style="fileMenuStyle" @click="fileOpen = false" @keydown.esc.stop="fileOpen = false">
                        <button class="toolbar-export" role="menuitem" @click="$emit('export-document')">{{ t('toolbar.export') }}</button>
                        <!-- The build as a 3D model file other programs open; EditorView makes it. -->
                        <button class="toolbar-export-model" role="menuitem" @click="$emit('export-model')">{{ t('toolbar.exportModel') }}</button>
                        <button class="toolbar-import" role="menuitem" @click="triggerImportDocument">{{ t('toolbar.import') }}</button>
                    </div>
                </template>
            </div>
            <input
                ref="importFileInput"
                type="file"
                accept="application/json"
                class="toolbar-import-input"
                :aria-label="t('toolbar.importFile')"
                @change="onImportDocumentFileChosen"
            />
            <div
                v-if="askNothingAdded"
                role="dialog"
                aria-modal="true"
                aria-labelledby="nothing-added-title"
                class="modal-overlay"
                @click.self="keepBuilding"
                @keydown.esc.stop="keepBuilding"
            >
                <div class="modal-panel nothing-added-dialog">
                    <h3 id="nothing-added-title">{{ t('toolbar.nothingAddedTitle') }}</h3>
                    <p>{{ t('toolbar.nothingAddedText') }}</p>
                    <div class="modal-actions">
                        <button type="button" class="action-btn action-btn--primary nothing-added-keep" @click="keepBuilding">{{ t('toolbar.nothingAddedKeep') }}</button>
                        <button type="button" class="action-btn action-btn--secondary nothing-added-publish" @click="publishAnyway">{{ t('toolbar.nothingAddedPublish') }}</button>
                    </div>
                </div>
            </div>
            <SimilarBuildDialog
                v-if="similarBuilds.length"
                :matches="similarBuilds"
                @publish="publishOwnWork"
                @cancel="keepBuildingSimilar"
            />
            <PublishSheet
                v-if="sheetRows.length"
                :rows="sheetRows"
                :suggested-name="sheetName"
                :busy="sheetBusy"
                :error="sheetError"
                @publish="publishFromSheet"
                @publish-unsigned="publishUnsignedFromSheet"
                @cancel="closeSheet"
            />
            <LoginModal
                v-if="signInToPublish"
                purpose="publish"
                :unlock-identity-id="lockedIdentityId"
                @signed-in="publishAfterSignIn"
                @skip="publishAfterSignIn"
                @close="signInToPublish = false"
            />
            <button
                v-if="entryContext && entryContext.returnWorldId"
                class="toolbar-save-return"
                @click="saveAndReturnToWorld"
            >
                {{ t('toolbar.saveAndReturn') }}
            </button>

            <span class="toolbar-dirty" :class="{ 'toolbar-dirty--clean': !dirty }">
                {{ dirty ? t('toolbar.unsaved') : (saving ? t('toolbar.saving') : t('toolbar.saved')) }}
            </span>

            <!-- 0.6.2 — Editor UX Consolidation: discoverability for the
                 same overlay the '?' key opens (see EditorView's own
                 keydown handler) — a viewer who never guesses that a
                 shortcuts list exists can still find it. -->
            <button class="toolbar-shortcuts" :title="t('toolbar.shortcutsHint')" @click="$emit('open-shortcuts')">{{ t('toolbar.shortcuts') }}</button>

            <div class="toolbar-recent" v-if="recentDocuments.length">
                <button
                    class="toolbar-recent-toggle"
                    :class="{ 'toolbar-recent-toggle--open': recentOpen }"
                    @click="toggleRecent"
                >
                    {{ t('toolbar.recent') }} <span class="toolbar-recent-count">{{ recentDocuments.length }}</span>
                    <span class="toolbar-recent-caret">▾</span>
                </button>
                <template v-if="recentOpen">
                    <div class="dropdown-backdrop" @click="recentOpen = false"></div>
                    <div class="toolbar-recent-dropdown">
                        <input
                            v-if="recentDocuments.length > searchThreshold"
                            v-model="recentQuery"
                            type="text"
                            class="toolbar-recent-search"
                            :placeholder="t('toolbar.filter')"
                            autofocus
                        />
                        <div class="toolbar-recent-dropdown-list">
                            <div
                                v-for="doc in filteredRecentDocuments"
                                :key="doc.id"
                                class="toolbar-recent-dropdown-row"
                            >
                                <button
                                    class="toolbar-recent-dropdown-item"
                                    @click="load(doc.id)"
                                >
                                    <span class="toolbar-recent-dropdown-title">{{ doc.title }}</span>
                                    <span class="toolbar-recent-dropdown-date">{{ formatModified(doc.modified) }}</span>
                                </button>
                                <button
                                    class="toolbar-recent-dropdown-place"
                                    :title="t('toolbar.placeHint')"
                                    @click="place(doc)"
                                >
                                    {{ t('toolbar.place') }}
                                </button>
                            </div>
                            <p v-if="filteredRecentDocuments.length === 0" class="toolbar-recent-dropdown-empty">
                                {{ t('toolbar.noMatches', { query: recentQuery }) }}
                            </p>
                        </div>
                        <button class="toolbar-recent-export-all" :title="t('toolbar.exportAllHint')" @click="exportAllDocuments">
                            {{ t('toolbar.exportAll') }}
                        </button>
                    </div>
                </template>
            </div>
        </div>
    `
};
