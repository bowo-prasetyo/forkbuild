// 0.9.284 — Notification History UI Boundary.
//
// 0.9.283 built GetRecipientNotificationEventsUseCase — a real,
// authenticated read boundary over the current identity's own
// NotificationEvent history — but wired it to nothing: no composition
// root constructed one, and no UI ever called it. This file is that
// missing last hop, and deliberately nothing more:
//
//   WorldNavigationSession#getRecipientNotificationEvents()   (0.9.284,
//        │                                                     thin —
//        │                                                     delegates
//        │                                                     to the use
//        │                                                     case below)
//        ▼
//   GetRecipientNotificationEventsUseCase.execute()   (0.9.283, unmodified)
//        ▼
//   NotificationEvent[]
//        │
//        ▼
//   NotificationHistoryPanel   (THIS FILE)
//
// A READ-ONLY VIEW OF DURABLE FACTS, NOT AN INBOX. Every field this panel
// renders already lives on the NotificationEvent it came from
// (notificationId, eventType, createdAt, payload) — nothing here is
// inferred, computed, or added. In particular this panel has NO opinion
// on read/unread, seen/unseen, delivered/undelivered, important,
// trusted, acknowledged, pending/failed, or preferred — none of those
// states exist anywhere in the system yet, and inventing UI for them
// here would be presenting a capability the backend does not have. See
// docs/Roadmap.md's own 0.9.284 entry for why "Notification History,"
// never "Notification Center" or "Unread Notifications," is this
// milestone's own name.
//
// THIS COMPONENT NEVER IMPORTS NotificationEventStore, NotificationEvent,
// or GetRecipientNotificationEventsUseCase — only the host view's own
// thin `getRecipientNotificationEventsCommand` function prop, the exact
// same boundary ui/components/OwnPublicationPanel.js's own Commentary
// section already established for
// `getPublicationCommentariesCommand`/`addPublicationCommentaryCommand`
// (0.9.248). This panel constructs no NotificationEvent, computes no
// deduplication identity, and determines no recipient of its own — the
// command it is handed already answers "my own notifications, and
// nothing else" by construction (GetRecipientNotificationEventsUseCase's
// own "the current authenticated identity is the only recipient this
// class will ever ask about").
//
// ORDERING IS WHATEVER `getRecipientNotificationEventsCommand()` RETURNS,
// NEVER RE-SORTED HERE — the same restraint OwnPublicationPanel's own
// commentary list already documents for GetPublicationCommentariesUseCase.
//
// LOAD, NOT A LIVE CHANNEL. `refreshNotificationHistory()` runs once when
// the panel is mounted (the surface "opening"), and again only on an
// explicit user action (the Refresh button below). No timer, no
// polling, no subscription — per this milestone's own brief, that stays
// a separate, later, evidence-driven decision.
//
// A MISSING CAPABILITY DEGRADES GRACEFULLY; A FAILED READ DOES NOT. A
// panel handed no `getRecipientNotificationEventsCommand` (every
// pre-0.9.284 caller, and every session built without
// GetRecipientNotificationEventsUseCase wired) simply shows the empty
// state — mirroring `refreshPublicationCommentaries()`'s own "no
// capability wired" -> `[]` posture. But once a command IS wired, a
// thrown error (no authenticated identity, or a genuine storage
// failure) is caught here and rendered as `notificationHistoryError` —
// `notifications` is left exactly as it was rather than reset to `[]`,
// the same "a failed read never silently empties an already-shown list"
// restraint `refreshPublicationCommentaries()` already uses. This is the
// one deliberate distinction this panel draws: "no notifications" and
// "notifications could not be loaded" are never the same rendered state.
export default {
    name: 'NotificationHistoryPanel',
    props: {
        // `() -> NotificationEvent[]` — WorldView.js's own thin wrapper
        // around `session.getRecipientNotificationEvents()`. `null` when
        // no session/use case is wired; this panel never calls it in
        // that case (see refreshNotificationHistory() below).
        getRecipientNotificationEventsCommand: {
            type: Function,
            default: null
        }
    },
    emits: ['cancel'],
    data() {
        return {
            notifications: [],
            notificationHistoryError: null
        };
    },
    mounted() {
        this.refreshNotificationHistory();
    },
    methods: {
        // The only writer of `notifications`/`notificationHistoryError`,
        // and the only call site of `getRecipientNotificationEventsCommand`
        // in this file. No capability wired -> empty state, no error.
        // A successful call replaces `notifications` wholesale (never
        // merged/appended) and clears any prior error. A thrown error
        // leaves `notifications` untouched and records the message —
        // see this file's own header.
        refreshNotificationHistory() {
            if (!this.getRecipientNotificationEventsCommand) {
                this.notifications = [];
                this.notificationHistoryError = null;
                return;
            }
            try {
                const events = this.getRecipientNotificationEventsCommand();
                this.notifications = Array.isArray(events) ? events : [];
                this.notificationHistoryError = null;
            } catch (error) {
                this.notificationHistoryError = (error && error.message) ? error.message : 'Notifications could not be loaded.';
            }
        },
        formatNotificationTimestamp(createdAt) {
            const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
            return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
        },
        // Humanizes eventType ("publication.commented" -> "Publication
        // commented") without hardcoding any one producer's own
        // vocabulary — a future eventType this panel has never seen
        // renders exactly as legibly.
        notificationTitle(event) {
            return event.eventType
                .split(/[._:-]/)
                .join(' ')
                .replace(/^./, (char) => char.toUpperCase());
        },
        // Renders `event.payload` generically as label/value pairs —
        // this panel has no per-eventType knowledge of what a payload
        // "means," only that whatever fields a producer put there are
        // already-durable facts safe to show as-is.
        notificationDetails(event) {
            const payload = event.payload || {};
            return Object.keys(payload).map((key) => ({
                label: key
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/^./, (char) => char.toUpperCase()),
                value: payload[key]
            }));
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="Notification History"
            class="modal-overlay"
            @click.self="$emit('cancel')"
        >
            <div class="modal-panel notification-history-panel">
                <h3>Notification History</h3>
                <p class="locations-panel-hint">
                    A durable record of notification facts addressed to you —
                    not an inbox. There is no read/unread state here.
                </p>

                <p v-if="notificationHistoryError" class="notification-history-panel-error">
                    {{ notificationHistoryError }}
                </p>

                <p v-else-if="notifications.length === 0" class="locations-panel-empty">
                    No notifications yet.
                </p>

                <ul v-else class="locations-panel-list notification-history-list">
                    <li
                        v-for="event in notifications"
                        :key="event.notificationId"
                        class="locations-panel-item"
                    >
                        <div class="locations-panel-item-info">
                            <span class="locations-panel-item-title">{{ notificationTitle(event) }}</span>
                            <span class="locations-panel-item-position">{{ formatNotificationTimestamp(event.createdAt) }}</span>
                            <span
                                v-for="detail in notificationDetails(event)"
                                :key="detail.label"
                                class="notification-history-item-detail"
                            >
                                {{ detail.label }}: {{ detail.value }}
                            </span>
                        </div>
                    </li>
                </ul>

                <div class="modal-actions notification-history-actions">
                    <button class="action-btn" @click="refreshNotificationHistory">Refresh</button>
                    <button class="action-btn" @click="$emit('cancel')">Close</button>
                </div>
            </div>
        </div>
    `
};
