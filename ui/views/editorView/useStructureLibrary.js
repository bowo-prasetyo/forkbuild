import { ref } from 'vue';
import { t } from '../../i18n/i18n.js';
import { libraryItemName } from '../../i18n/libraryText.js';

// The Build Library's structures: built-in and personal groups, recently used, and the
// actions that rename, remove, fork, place or create a personal Structure.
// How long Undo is offered after a structure is removed from My Structures.
export const REMOVED_NOTICE_MS = 10000;

export function useStructureLibrary({
    editorSession, feedback, libraryUsageHistoryStore, personalStructureLibraryStore, structureRegistry, isTouch = () => false,
    isRemovedNoticeInUse = () => false, removedNoticeMs = REMOVED_NOTICE_MS
}) {
    // Built-in structures never change at runtime, so this is read once.
    const structureGroups = ref(structureRegistry.groupByCategory());

    // Changes at runtime, so it is refreshed after save, rename or remove.
    const personalStructureGroups = ref(personalStructureLibraryStore.groupByCategory());
    // Used only by the 'recent' sort; refreshed with the personal library.
    const personalSavedAtById = ref(personalStructureLibraryStore.getSavedAtById());
    function refreshPersonalStructureGroups() {
        personalStructureGroups.value = personalStructureLibraryStore.groupByCategory();
        personalSavedAtById.value = personalStructureLibraryStore.getSavedAtById();
    }

    // Resolves recent ids against whichever library still has them (renames keep
    // their id); ids that are gone are dropped. The one place that decides
    // built-in vs. personal for a recent id.
    function resolveRecentStructures() {
        const ids = libraryUsageHistoryStore.listRecent(5);
        const resolved = [];
        for (const id of ids) {
            const personal = personalStructureLibraryStore.getStructure(id);
            if (personal) {
                resolved.push({ structure: personal, source: 'personal' });
                continue;
            }
            const builtIn = structureRegistry.get(id);
            if (builtIn) {
                resolved.push({ structure: builtIn, source: 'built-in' });
            }
        }
        return resolved;
    }
    const recentStructures = ref(resolveRecentStructures());
    function refreshRecentStructures() {
        recentStructures.value = resolveRecentStructures();
    }

    function renamePersonalStructure(structure) {
        const name = prompt(t('editor.renameStructurePrompt'), structure.name);
        if (name === null || !name.trim()) {
            return;
        }
        personalStructureLibraryStore.updateStructureMetadata(structure.id, { name: name.trim() });
        refreshPersonalStructureGroups();
        refreshRecentStructures();
        feedback.show(t('editor.structureRenamed', { name: name.trim() }));
    }

    // The last structure removed, until it is put back, another is removed, or
    // the notice times out: removing is one click, and Undo in the library's
    // header puts it back as it was (docs/reviews/EditorPlacementUX-2026-10-27.md, P2-13).
    const removedStructure = ref(null);
    let removedTimer = null;
    function clearRemovedTimer() {
        if (removedTimer !== null) clearTimeout(removedTimer);
        removedTimer = null;
    }
    function dismissRemovedStructure() {
        clearRemovedTimer();
        removedStructure.value = null;
    }
    // Kept while the pointer or the focus is on the notice, so Undo never goes
    // from under a hand reaching for it.
    function armRemovedTimer() {
        clearRemovedTimer();
        removedTimer = setTimeout(() => {
            removedTimer = null;
            if (isRemovedNoticeInUse()) armRemovedTimer();
            else removedStructure.value = null;
        }, removedNoticeMs);
    }

    function removePersonalStructure(structure) {
        // Removing from the library never touches documents that already used it.
        const savedAt = personalStructureLibraryStore.getSavedAtById()[structure.id];
        personalStructureLibraryStore.removeStructure(structure.id);
        refreshPersonalStructureGroups();
        refreshRecentStructures();
        removedStructure.value = { structure, savedAt, name: libraryItemName(structure) };
        armRemovedTimer();
    }

    // Puts the last removed structure back, with its id and its saved time, so
    // it returns to its place in the list and in recently used.
    function undoRemovePersonalStructure() {
        const removed = removedStructure.value;
        dismissRemovedStructure();
        if (!removed) return;
        personalStructureLibraryStore.addStructure(removed.structure, { savedAt: removed.savedAt });
        refreshPersonalStructureGroups();
        refreshRecentStructures();
        feedback.show(t('editor.structureRestored', { name: removed.name }));
    }

    function forkStructure(structure) {
        const forked = editorSession.forkStructure(structure);
        if (forked) {
            feedback.show(t('editor.structureForked', { name: libraryItemName(structure) }));
        }
    }

    // Forks a built-in Structure into a new personal Structure (forkStructure()
    // opens a new Document instead).
    function forkStructureToLibrary(structure) {
        const forked = editorSession.forkStructureToPersonalLibrary(structure);
        if (forked) {
            refreshPersonalStructureGroups();
            feedback.show(t('editor.structureAddedToLibrary', { name: libraryItemName(forked) }));
        }
    }

    // Enters the interactive preview mode; the copy happens when the tool commits.
    // Also the entry point for a structure card's plain click (docs/Principles.md,
    // "Buildable Things Share One Placement Experience").
    function copyStructureIntoDocument(structure) {
        const started = editorSession.beginStructureComposition(structure);
        if (started) {
            feedback.show(t(isTouch() ? 'editor.touchPlacingStructure' : 'editor.placingStructure', { name: libraryItemName(structure) }));
            // Recorded on place intent, even if later cancelled; a stale entry is harmless.
            libraryUsageHistoryStore.recordUse(structure.id);
            refreshRecentStructures();
        }
    }

    const showCreateBlueprintDialog = ref(false);
    // Placeholder metadata so the dialog can preview before a name is typed.
    const createBlueprintPreview = ref(null);
    function closeCreateBlueprintDialog() {
        showCreateBlueprintDialog.value = false;
        createBlueprintPreview.value = null;
    }
    function onCreateBlueprint({ name, category, description }) {
        const structure = editorSession.createStructureFromSelection({ name, category, description });
        closeCreateBlueprintDialog();
        if (!structure) {
            feedback.show(t('editor.nothingToCreate'));
            return;
        }
        const saved = editorSession.saveStructureToPersonalLibrary(structure);
        if (saved) {
            refreshPersonalStructureGroups();
        }
        feedback.show(t(saved ? 'editor.blueprintSaved' : 'editor.blueprintCreated', { name: structure.name }));
    }

    return {
        closeCreateBlueprintDialog, copyStructureIntoDocument, createBlueprintPreview, forkStructure,
        forkStructureToLibrary, onCreateBlueprint, personalSavedAtById, personalStructureGroups, recentStructures,
        refreshPersonalStructureGroups, removePersonalStructure, removedStructure, dismissRemovedStructure,
        undoRemovePersonalStructure, renamePersonalStructure, showCreateBlueprintDialog, structureGroups
    };
}
