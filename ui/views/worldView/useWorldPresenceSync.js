import { buildSpatialCollaboratorRows } from '../../components/WorldCollaboratorIndicator.js';

// Keeps this replica's World presence, spatial presence and per-World experience
// (camera framing) in step with the ACTIVE document.
export function useWorldPresenceSync({
    openWelcomePanel, refreshWelcomeContext, resolveIdentityDisplayName, session, showWelcomePanel,
    spatialCollaboratorRows, worldMembers, worldPresenceRoster, worldReturnInfo
}) {
    // Non-reactive bookkeeping; the template never reads these.
    let presentWorldDocumentId = null;
    let unsubscribeWorldPresence = null;
    let unsubscribeWorldMembership = null;
    let presentSpatialWorldDocumentId = null;
    let unsubscribeWorldSpatialPresence = null;
    // Separate from the presence ids: tracked even when no experience store is
    // wired.
    let presentExperienceWorldDocumentId = null;
    // The automatic Welcome shows once per World per session; only "Explore"
    // reopens it.
    const welcomeShownForDocumentId = new Set();

    // Presence follows the ACTIVE document, never the merely focused one: entering
    // presence for a world you only look at would announce "here" for a document
    // nothing considers current. A no-op unless the active document changed, to
    // avoid re-subscribing every poll.
    function _syncWorldPresence(activeId) {
        if (activeId === presentWorldDocumentId) {
            return;
        }
        if (presentWorldDocumentId) {
            session.leaveWorldPresence(presentWorldDocumentId);
        }
        if (unsubscribeWorldPresence) {
            unsubscribeWorldPresence();
            unsubscribeWorldPresence = null;
        }
        if (unsubscribeWorldMembership) {
            unsubscribeWorldMembership();
            unsubscribeWorldMembership = null;
        }
        presentWorldDocumentId = activeId || null;
        refreshCollaborationRoster(presentWorldDocumentId);
        if (!presentWorldDocumentId) {
            return;
        }
        session.enterWorldPresence(presentWorldDocumentId);
        // Live membership/presence changes refresh the roster immediately. A grant or
        // revocation also re-derives and re-broadcasts this replica's own advertised
        // activity right away. That refresh is isolated in its own try/catch: this
        // callback runs synchronously inside WorldMembershipUseCase, and a throw would
        // skip its network broadcast for every peer.
        unsubscribeWorldMembership = session.onWorldMembershipChanged(presentWorldDocumentId, () => {
            worldMembers.value = session.listWorldMembers(presentWorldDocumentId);
            try {
                session.refreshWorldPresenceActivity(presentWorldDocumentId);
            } catch {
            }
        });
        unsubscribeWorldPresence = session.onWorldPresenceChanged(presentWorldDocumentId, (roster) => {
            worldPresenceRoster.value = roster;
        });
    }

    // Same shape as _syncWorldPresence() but purely local storage, never
    // broadcast. worldReturnInfo is captured from the prior record before this
    // visit's restore/save.
    function _syncWorldExperience(activeId) {
        if (activeId === presentExperienceWorldDocumentId) {
            return;
        }
        if (presentExperienceWorldDocumentId) {
            session.saveWorldExperience(presentExperienceWorldDocumentId);
        }
        presentExperienceWorldDocumentId = activeId || null;
        if (!presentExperienceWorldDocumentId) {
            worldReturnInfo.value = null;
            return;
        }
        // restoreWorldExperience() only reads, and returns null on a first visit.
        const priorExperience = session.restoreWorldExperience(presentExperienceWorldDocumentId);
        worldReturnInfo.value = priorExperience ? { lastVisitedAt: priorExperience.lastVisitedAt } : null;
    }

    function refreshCollaborationRoster(documentId) {
        if (!documentId) {
            worldMembers.value = [];
            worldPresenceRoster.value = [];
            return;
        }
        worldMembers.value = session.listWorldMembers(documentId);
        worldPresenceRoster.value = session.getWorldPresenceRoster(documentId);
    }

    // Same shape as _syncWorldPresence(), for spatial presence.
    function _syncWorldSpatialPresence(activeId) {
        if (activeId === presentSpatialWorldDocumentId) {
            return;
        }
        if (presentSpatialWorldDocumentId) {
            session.leaveWorldSpatialPresence(presentSpatialWorldDocumentId);
        }
        if (unsubscribeWorldSpatialPresence) {
            unsubscribeWorldSpatialPresence();
            unsubscribeWorldSpatialPresence = null;
        }
        presentSpatialWorldDocumentId = activeId || null;
        spatialCollaboratorRows.value = [];
        if (!presentSpatialWorldDocumentId) {
            return;
        }
        session.enterWorldSpatialPresence(presentSpatialWorldDocumentId, {
            resolveDisplayName: (identityId) => resolveIdentityDisplayName(identityId)
        });
        spatialCollaboratorRows.value = buildSpatialCollaboratorRows(
            session.getWorldSpatialPresenceRoster(presentSpatialWorldDocumentId),
            { resolveDisplayName: resolveIdentityDisplayName, resolveSelectionLabel: (selection) => session.resolveSpatialSelectionLabel(selection) }
        );
        unsubscribeWorldSpatialPresence = session.onWorldSpatialPresenceChanged(presentSpatialWorldDocumentId, (roster) => {
            spatialCollaboratorRows.value = buildSpatialCollaboratorRows(roster, {
                resolveDisplayName: resolveIdentityDisplayName,
                resolveSelectionLabel: (selection) => session.resolveSpatialSelectionLabel(selection)
            });
            // Refreshes an already-open Welcome panel in place; never reopens a dismissed
            // one (docs/Principles.md, "Exploration Guides Attention, Never Ownership or
            // Mutation").
            if (showWelcomePanel.value) {
                refreshWelcomeContext();
            }
        });
        if (!welcomeShownForDocumentId.has(presentSpatialWorldDocumentId)) {
            welcomeShownForDocumentId.add(presentSpatialWorldDocumentId);
            openWelcomePanel(true);
        }
    }

    // A no-op outside spatial presence.
    function syncCurrentWorldSpatialPresence() {
        if (presentSpatialWorldDocumentId) {
            session.syncWorldSpatialPresence(presentSpatialWorldDocumentId);
        }
    }

    // session.dispose() leaves every world's coarse and spatial presence, so only
    // the view's own subscriptions are torn down here.
    function disposeWorldPresence() {
        if (unsubscribeWorldPresence) {
            unsubscribeWorldPresence();
        }
        if (unsubscribeWorldMembership) {
            unsubscribeWorldMembership();
        }
        if (unsubscribeWorldSpatialPresence) {
            unsubscribeWorldSpatialPresence();
        }
        // Final save of the camera framing: _syncWorldExperience() only saves on the
        // next active-document change, which never comes after teardown.
        if (presentExperienceWorldDocumentId) {
            session.saveWorldExperience(presentExperienceWorldDocumentId);
        }
    }

    return {
        _syncWorldExperience, _syncWorldPresence, _syncWorldSpatialPresence, disposeWorldPresence,
        refreshCollaborationRoster, syncCurrentWorldSpatialPresence
    };
}
