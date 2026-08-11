import { ref, onMounted, onBeforeUnmount } from 'vue';

// The Editor's group surface (0.1.45). Purely a view over
// EditorSession's group methods — the SAME six group commands World
// View uses. Selecting a group resolves membership into the Editor's
// SelectionState and produces ZERO history entries; every mutation
// (create/rename/delete/duplicate/add/remove) goes through the existing
// group commands and therefore through CommandHistory.
//
// Refresh strategy: every group command dirties the document, and
// DocumentManager publishes STATE_CHANGED on every state change — so
// subscribing to documentManager.onStateChanged() keeps the list
// current after undo/redo as well, not just after panel clicks.
export default {
    name: 'GroupsPanel',
    props: {
        editorSession: {
            type: Object,
            required: true
        },
        documentManager: {
            type: Object,
            required: true
        }
    },
    setup(props) {
        const groups = ref([]);
        let unsubscribe = null;

        function refresh() {
            groups.value = props.editorSession.getGroups();
        }

        function createGroup() {
            const name = prompt('Group name:', `Group ${groups.value.length + 1}`);
            if (name === null) {
                return;
            }
            props.editorSession.createGroupFromSelection(name.trim() || null);
            refresh();
        }

        function selectGroup(groupId) {
            // Session state change only — no history entry, no document
            // mutation. The panel never mutates a group by selecting it.
            props.editorSession.selectGroup(groupId);
        }

        function renameGroup(groupId) {
            const current = groups.value.find((g) => g.id === groupId);
            const name = prompt('New group name:', current ? current.name : '');
            if (name === null || !name.trim()) {
                return;
            }
            props.editorSession.renameGroup(groupId, name.trim());
            refresh();
        }

        function duplicateGroup(groupId) {
            props.editorSession.duplicateGroup(groupId);
            refresh();
        }

        function deleteGroup(groupId) {
            if (!confirm('Delete this group? The bricks themselves are kept.')) {
                return;
            }
            props.editorSession.deleteGroup(groupId);
            refresh();
        }

        function addToGroup(groupId) {
            props.editorSession.addToGroupWithSelection(groupId);
            refresh();
        }

        function removeFromGroup(groupId) {
            props.editorSession.removeFromGroupWithSelection(groupId);
            refresh();
        }

        onMounted(() => {
            refresh();
            unsubscribe = props.documentManager.onStateChanged(refresh);
        });

        onBeforeUnmount(() => {
            if (unsubscribe) {
                unsubscribe();
            }
        });

        return {
            groups,
            createGroup,
            selectGroup,
            renameGroup,
            duplicateGroup,
            deleteGroup,
            addToGroup,
            removeFromGroup
        };
    },
    template: `
<div class="groups-panel">
    <h3 class="palette-title">Groups</h3>
    <button class="action-btn action-btn--secondary groups-panel-create" @click="createGroup">
        + Group Selection
    </button>
    <ul v-if="groups.length > 0" class="world-list">
        <li v-for="group in groups" :key="group.id" class="world-item">
            <span class="world-item-title">{{ group.name }} ({{ group.memberCount }})</span>
            <span class="group-actions">
                <button class="group-action-btn" @click="selectGroup(group.id)">Select</button>
                <button class="group-action-btn" @click="addToGroup(group.id)">+Sel</button>
                <button class="group-action-btn" @click="removeFromGroup(group.id)">−Sel</button>
                <button class="group-action-btn" @click="renameGroup(group.id)">Rename</button>
                <button class="group-action-btn" @click="duplicateGroup(group.id)">Duplicate</button>
                <button class="group-action-btn group-action-btn--danger" @click="deleteGroup(group.id)">Delete</button>
            </span>
        </li>
    </ul>
    <p v-else class="groups-panel-empty">No groups yet.</p>
</div>
`
};
