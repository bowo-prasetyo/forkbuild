// Peers page template: connections still in progress and incoming friend
// requests, the only time-sensitive items on the page.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const attentionSectionTemplate = `<section v-if="pendingPeers.length || requestPeers.length" class="peers-section peers-attention" aria-labelledby="peers-attention-heading">
                <h2 id="peers-attention-heading" class="peers-section-heading">{{ attentionHeading }}</h2>
                <ul class="peers-rows">
                    <li v-for="peer in requestPeers" :key="'request-' + peer.connectionId" class="peers-row">
                        <div class="peers-row-main">
                            <span class="peers-row-title">{{ t('peerConnections.wantsToBeFriends2', { peer: peerName(peer) }) }}</span>
                            <div class="peers-row-actions">
                                <button class="action-btn action-btn--primary" @click="act(peer.remoteIdentity.identityId, () => acceptFriendRequest(peer))">{{ t('peerConnections.accept') }}</button>
                                <button class="action-btn action-btn--secondary" @click="act(peer.remoteIdentity.identityId, () => rejectFriendRequest(peer))">{{ t('peerConnections.decline') }}</button>
                            </div>
                        </div>
                    </li>
                    <li v-for="peer in pendingPeers" :key="peer.connectionId" class="peers-row">
                        <div class="peers-row-main">
                            <span class="peers-row-title">{{ peer.alias ? t('peerConnections.connectingTo') + peer.alias : t('peerConnections.newConnection') }}</span>
                            <span class="peer-badge" :class="LIFECYCLE_CLASSES[peer.getLifecycleState()]">
                                {{ LIFECYCLE_LABELS[peer.getLifecycleState()] || peer.getLifecycleState() }}
                            </span>
                            <div class="peers-row-actions">
                                <button class="action-btn action-btn--secondary" @click="disconnectPeer(peer)">
                                    {{ peer.getLifecycleState() === PeerLifecycleState.FAILED ? t('peerConnections.dismiss') : t('peerConnections.cancel2') }}
                                </button>
                            </div>
                        </div>
                        <p class="peers-row-meta">{{ t('peerConnections.startedAgoStepOf', { elapsed: connectedFor(peer), step: progressStep(peer), steps: PROGRESSION_STEPS.length, stage: progressLabel(peer) }) }}</p>
                        <p v-if="peer.getLifecycleState() === PeerLifecycleState.FAILED" class="identity-unlock-error">
                            {{ peer.authenticationSession.failureReason || t('peerConnections.authenticationFailed') }}
                        </p>
                        <div v-if="awaitingReply(peer)" class="peers-reply">
                            <label class="form-label" :for="'reply-' + peer.connectionId">{{ t('peerConnections.pasteTheirReplyToFinish') }}</label>
                            <textarea :id="'reply-' + peer.connectionId" v-model="replyTexts[peer.connectionId]"
                                      class="form-input peer-signal-json" rows="3" :placeholder="t('peerConnections.theirReply')"></textarea>
                            <p v-if="completeErrors[peer.connectionId]" class="identity-unlock-error">{{ completeErrors[peer.connectionId] }}</p>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--primary" :disabled="!(replyTexts[peer.connectionId] || '').trim()" @click="submitComplete(peer)">{{ t('peerConnections.finishConnecting') }}</button>
                            </div>
                        </div>
                    </li>
                </ul>
            </section>`;
