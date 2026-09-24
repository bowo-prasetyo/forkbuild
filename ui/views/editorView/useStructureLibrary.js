import { ref } from 'vue';

// The Build Library's structures: built-in and personal groups, recently used, and the
// actions that rename, remove, fork, place or create a personal Structure.
export function useStructureLibrary({
    editorSession, feedback, libraryUsageHistoryStore, personalStructureLibraryStore, structureRegistry
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
        const name = prompt('Rename structure:', structure.name);
        if (name === null || !name.trim()) {
            return;
        }
        personalStructureLibraryStore.updateStructureMetadata(structure.id, { name: name.trim() });
        refreshPersonalStructureGroups();
        refreshRecentStructures();
        feedback.show(`Renamed to "${name.trim()}"`);
    }

    function removePersonalStructure(structure) {
        // Removing from the library never touches documents that already used it.
        personalStructureLibraryStore.removeStructure(structure.id);
        refreshPersonalStructureGroups();
        refreshRecentStructures();
        feedback.show(`Removed "${structure.name}" from My Structures`);
    }

    function forkStructure(structure) {
        const forked = editorSession.forkStructure(structure);
        if (forked) {
            feedback.show(`Forked "${structure.name}" — now editing your own copy`);
        }
    }

    // Forks a built-in Structure into a new personal Structure (forkStructure()
    // opens a new Document instead).
    function forkStructureToLibrary(structure) {
        const forked = editorSession.forkStructureToPersonalLibrary(structure);
        if (forked) {
            refreshPersonalStructureGroups();
            feedback.show(`"${forked.name}" added to My Structures`);
        }
    }

    // Enters the interactive preview mode; the copy happens when the tool commits.
    // Also the entry point for a structure card's plain click (docs/Principles.md,
    // "Buildable Things Share One Placement Experience").
    function copyStructureIntoDocument(structure) {
        const started = editorSession.beginStructureComposition(structure);
        if (started) {
            feedback.show(`Placing "${structure.name}" — click to place, R to rotate, Esc to cancel`);
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
            feedback.show('Nothing to create — select bricks first');
            return;
        }
        const saved = editorSession.saveStructureToPersonalLibrary(structure);
        if (saved) {
            refreshPersonalStructureGroups();
        }
        feedback.show(saved ? `"${structure.name}" created in My Structures` : `Created "${structure.name}"`);
    }

    return {
        closeCreateBlueprintDialog, copyStructureIntoDocument, createBlueprintPreview, forkStructure,
        forkStructureToLibrary, onCreateBlueprint, personalSavedAtById, personalStructureGroups, recentStructures,
        refreshPersonalStructureGroups, removePersonalStructure, renamePersonalStructure, showCreateBlueprintDialog,
        structureGroups
    };
}
