// 0.9.207 — World View History Timeline UI Integration.
//
// A read-only browser over WorldNavigationSession#getTimeline(documentId) —
// one row per top-level CommandHistory entry, in the exact order and with
// the exact description CommandHistory.getTimeline() already produces (see
// application/CommandHistory.js's own header on the Operation Timeline
// projection). This panel never computes its own notion of "what
// happened" — `entry.description`/`entry.applied`/`entry.timestamp` are
// read straight through, unchanged.
//
// Selecting a row is purely local UI state (`selectedEntryId`, WorldView.js's
// own ref) — it does not preview or restore anything by itself. Preview and
// Restore are two separate, explicit buttons, deliberately gated on a
// selection existing, mirroring the "viewing is observational; replay/
// restore are mutations" boundary this milestone's own design record
// draws. Preview maps to WorldNavigationSession#beginHistoryPreview()/
// previewHistoryAt() (itself backed by ReplayDocumentUseCase — a
// non-destructive reconstruction, never touching the live document);
// Restore maps to WorldNavigationSession#restoreHistoryAt() (a real
// mutation that rebases the live document and leaves it dirty). Neither
// verb is reinterpreted here — this panel only emits the entry id the
// caller already knows how to resolve into a cursor.
//
// Entries are keyed by `entry.id` (CommandHistory's own command identity,
// unchanged since 0.1.40), never by array index — WorldView.js resolves a
// selection back to a cursor by re-reading a FRESH timeline and matching
// on this same id immediately before Preview/Restore actually run, so a
// selection made before an intervening edit changed the history can never
// silently act on whatever now happens to sit at the old index.
export default {
    name: 'HistoryTimelinePanel',
    props: {
        // WorldNavigationSession#getTimeline(documentId)'s own return shape:
        // [{ index, id, type, description, timestamp, childCount, applied }].
        timeline: {
            type: Array,
            default: () => []
        },
        // The currently selected entry's `id`, or null. Local UI state
        // owned by the caller — this panel only reads it back to render
        // which row is selected.
        selectedEntryId: {
            type: String,
            default: null
        },
        // The raw CommandHistory cursor (a command COUNT, one past the
        // last applied entry's own index — see WorldView.js's own
        // _resolveSelectedHistoryCursor()) WorldNavigationSession#
        // getHistoryPreview() reports while a preview is active, or null
        // when there is none.
        previewCursor: {
            type: Number,
            default: null
        }
    },
    emits: [
        // A row was clicked — selection only, no mutation.
        'select',
        // Explicit "Preview" — the caller resolves selectedEntryId into a
        // cursor and calls beginHistoryPreview()/previewHistoryAt().
        'preview',
        // Explicit "Cancel Preview" — ends the non-destructive preview.
        'cancel-preview',
        // Explicit "Restore" — the caller resolves selectedEntryId into a
        // cursor and calls restoreHistoryAt().
        'restore',
        'cancel'
    ],
    computed: {
        isPreviewing() {
            return this.previewCursor !== null;
        }
    },
    methods: {
        formatTimestamp(timestamp) {
            const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
            return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
        },
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('cancel');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="History"
            class="modal-overlay"
            @click.self="$emit('cancel')"
            @keydown="onKeydown"
        >
            <div class="modal-panel history-timeline-panel">
                <h3>History</h3>
                <p class="locations-panel-hint">
                    Read-only until you choose Preview or Restore below — selecting an
                    entry never changes the document by itself. Preview reconstructs a
                    past state alongside the live one without touching it; Restore
                    rebases the live document onto that state and leaves it dirty.
                </p>

                <p v-if="timeline.length === 0" class="locations-panel-empty">
                    No history yet — make an edit to this document to see it here.
                </p>

                <ul v-else class="locations-panel-list history-timeline-list">
                    <li
                        v-for="entry in timeline"
                        :key="entry.id"
                        :class="['locations-panel-item', 'history-timeline-item', {
                            'history-timeline-item--selected': entry.id === selectedEntryId,
                            'history-timeline-item--future': !entry.applied,
                            'history-timeline-item--previewing': entry.index + 1 === previewCursor
                        }]"
                        @click="$emit('select', entry.id)"
                    >
                        <div class="locations-panel-item-info">
                            <span class="locations-panel-item-title">{{ entry.index + 1 }}. {{ entry.description }}</span>
                            <span class="locations-panel-item-position">
                                {{ formatTimestamp(entry.timestamp) }}<template v-if="!entry.applied"> · undone</template><template v-if="entry.index + 1 === previewCursor"> · previewing</template>
                            </span>
                        </div>
                    </li>
                </ul>

                <div class="modal-actions history-timeline-actions">
                    <button
                        class="action-btn"
                        :disabled="!selectedEntryId"
                        @click="$emit('preview', selectedEntryId)"
                    >Preview</button>
                    <button
                        v-if="isPreviewing"
                        class="action-btn"
                        @click="$emit('cancel-preview')"
                    >Cancel Preview</button>
                    <button
                        class="action-btn action-btn--primary"
                        :disabled="!selectedEntryId"
                        @click="$emit('restore', selectedEntryId)"
                    >Restore</button>
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
