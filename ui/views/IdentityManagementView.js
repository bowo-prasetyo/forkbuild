import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue';

// 0.2.48 — Identity Management: a dedicated view for what LoginModal was
// deliberately never meant to grow into. LoginModal answers "which
// identity should the app show as logged in right now" — a fast,
// single-identity decision. This view answers a completely different
// question: "what does this device hold, and what can I do with each of
// those keys" — lock/unlock any identity independent of which one is
// currently authenticated, export a protected, portable copy of one, and
// import a copy someone (or some earlier version of this same device)
// exported. See identity/LocalIdentityProvider.js's exportLocalIdentity/
// importLocalIdentity and identity/IdentityRecovery.js for where the
// actual logic lives — this view is pure presentation over
// application/IdentityUseCase.js, same division as every other view.
//
// Export requires re-entering the identity's own passphrase even if it's
// currently unlocked — LocalIdentityProvider.exportLocalIdentity()
// enforces this itself (it never reads the vault cache), so this view
// doesn't special-case it; a stale "already unlocked" assumption simply
// isn't available to lean on.
//
// Import shows a live preview BEFORE anything is decrypted or persisted
// — label, identityId, algorithm, and whether this device already holds
// that identityId — computed by parsing the pasted JSON and checking it
// against the identities already listed, entirely client-side and
// passphrase-free, matching identity/IdentityImport.js's own "structural
// validation needs no secret" property.
export default {
    name: 'IdentityManagementView',
    setup() {
        const identityUseCase = inject('identityUseCase');
        // 0.2.68 — optional: a test harness or a partial embedding of
        // this view may not have wired app-wide peer propagation at all
        // (see ui/main.js). Every call site below guards on it being
        // present before broadcasting — declareSuccessor()/revokeIdentity()
        // themselves succeed identically either way; propagation is
        // purely an ADDITIONAL step layered on top, never a precondition
        // for the local, 0.2.67 lifecycle operation itself.
        const identityLifecyclePropagationUseCase = inject('identityLifecyclePropagationUseCase', null);

        const identities = ref(identityUseCase.listIdentities());
        const session = ref(identityUseCase.currentSession());

        function refresh() {
            identities.value = identityUseCase.listIdentities();
            session.value = identityUseCase.currentSession();
        }

        const sortedIdentities = computed(() =>
            [...identities.value].sort((a, b) => b.createdAt - a.createdAt)
        );

        function shortId(identityId) {
            return identityId.slice(-10);
        }

        function isCurrentSession(identity) {
            return session.value.isAuthenticated && session.value.identityId === identity.identityId;
        }

        function isUnlocked(identity) {
            return identityUseCase.isUnlocked(identity.identityId);
        }

        // --- lock / unlock -------------------------------------------------
        const unlockingId = ref(null);
        const unlockPassphrase = ref('');
        const unlockError = ref('');

        function startUnlock(identity) {
            unlockingId.value = identity.identityId;
            unlockPassphrase.value = '';
            unlockError.value = '';
        }
        function cancelUnlock() {
            unlockingId.value = null;
            unlockPassphrase.value = '';
            unlockError.value = '';
        }
        function confirmUnlock() {
            if (!unlockPassphrase.value) {
                return;
            }
            try {
                identityUseCase.unlock(unlockingId.value, unlockPassphrase.value);
                cancelUnlock();
            } catch (e) {
                unlockError.value = e.message.replace(/^LocalIdentityProvider:\s*/, '');
            }
        }
        function lockIdentity(identity) {
            identityUseCase.lock(identity.identityId);
        }

        // --- export ----------------------------------------------------------
        const exportingId = ref(null);
        const exportPassphrase = ref('');
        const exportError = ref('');
        const exportedPackage = reactive({ json: '', fileName: '', downloadHref: '' });

        function startExport(identity) {
            exportingId.value = identity.identityId;
            exportPassphrase.value = '';
            exportError.value = '';
            exportedPackage.json = '';
            exportedPackage.fileName = '';
            exportedPackage.downloadHref = '';
        }
        function cancelExport() {
            exportingId.value = null;
        }
        function confirmExport() {
            if (!exportPassphrase.value) {
                return;
            }
            exportError.value = '';
            try {
                const identity = identities.value.find((i) => i.identityId === exportingId.value);
                const pkg = identityUseCase.exportIdentity(exportingId.value, exportPassphrase.value);
                const json = JSON.stringify(pkg, null, 2);
                const safeLabel = identity.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'identity';
                exportedPackage.json = json;
                exportedPackage.fileName = `forkbuild-identity-${safeLabel}.json`;
                exportedPackage.downloadHref = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
            } catch (e) {
                exportError.value = e.message.replace(/^(LocalIdentityProvider|KeyEncryption):\s*/, '');
            }
        }

        // --- create new identity ---------------------------------------------
        const newLabel = ref('');
        const newPassphrase = ref('');
        function createIdentity() {
            const label = newLabel.value.trim();
            if (!label) {
                return;
            }
            identityUseCase.createIdentity(label, newPassphrase.value || null);
            newLabel.value = '';
            newPassphrase.value = '';
            refresh();
        }

        // --- import ------------------------------------------------------------
        const showImportForm = ref(false);
        const importText = ref('');
        const importLabel = ref('');
        const importPassphrase = ref('');
        const importError = ref('');
        const importResult = ref(null); // { status: 'ALREADY_EXISTS' | 'IMPORTED', identity }

        // Client-side, passphrase-free preview: parses the pasted JSON and
        // checks its identityId against what this device already lists.
        // Never validates cryptographic consistency itself (that's
        // identity/IdentityImport.js's job, run for real only when
        // confirmImport() actually calls importIdentity()) — this is
        // deliberately a lightweight preview, not a second validator.
        const importPreview = computed(() => {
            const text = importText.value.trim();
            if (!text) {
                return null;
            }
            let pkg;
            try {
                pkg = JSON.parse(text);
            } catch (e) {
                return null;
            }
            if (!pkg || typeof pkg !== 'object' || typeof pkg.identityId !== 'string') {
                return null;
            }
            const existing = identities.value.find((i) => i.identityId === pkg.identityId);
            return {
                label: typeof pkg.label === 'string' && pkg.label.trim() ? pkg.label.trim() : null,
                identityId: pkg.identityId,
                algorithm: typeof pkg.algorithm === 'string' ? pkg.algorithm : null,
                alreadyExists: !!existing,
                existingLabel: existing ? existing.label : null
            };
        });

        function onImportFileChosen(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                importText.value = String(reader.result || '');
            };
            reader.readAsText(file);
        }

        function confirmImport() {
            importError.value = '';
            importResult.value = null;
            let pkg;
            try {
                pkg = JSON.parse(importText.value);
            } catch (e) {
                importError.value = 'That is not valid JSON — paste the exported identity file\'s contents exactly.';
                return;
            }
            try {
                const result = identityUseCase.importIdentity(pkg, importPassphrase.value, importLabel.value.trim() || null);
                importResult.value = result;
                if (result.status === 'IMPORTED') {
                    importText.value = '';
                    importLabel.value = '';
                    importPassphrase.value = '';
                }
                refresh();
            } catch (e) {
                importError.value = e.message.replace(/^(LocalIdentityProvider|IdentityImport|IdentityRecovery|KeyEncryption):\s*/, '');
            }
        }

        function dismissImportResult() {
            importResult.value = null;
        }

        // --- 0.2.67: change passphrase ----------------------------------------
        const changingPassphraseId = ref(null);
        const changeOldPassphrase = ref('');
        const changeNewPassphrase = ref('');
        const changePassphraseError = ref('');

        function startChangePassphrase(identity) {
            changingPassphraseId.value = identity.identityId;
            changeOldPassphrase.value = '';
            changeNewPassphrase.value = '';
            changePassphraseError.value = '';
        }
        function cancelChangePassphrase() {
            changingPassphraseId.value = null;
        }
        function confirmChangePassphrase() {
            if (!changeOldPassphrase.value || !changeNewPassphrase.value) {
                return;
            }
            try {
                identityUseCase.changePassphrase(changingPassphraseId.value, changeOldPassphrase.value, changeNewPassphrase.value);
                cancelChangePassphrase();
                refresh();
            } catch (e) {
                changePassphraseError.value = e.message.replace(/^LocalIdentityProvider:\s*/, '');
            }
        }

        // --- 0.2.67: declare successor ------------------------------------------
        const successorFormId = ref(null);
        const successorIdentityInput = ref('');
        const successorPassphrase = ref('');
        const successorError = ref('');

        function startDeclareSuccessor(identity) {
            successorFormId.value = identity.identityId;
            successorIdentityInput.value = '';
            successorPassphrase.value = '';
            successorError.value = '';
        }
        function cancelDeclareSuccessor() {
            successorFormId.value = null;
        }
        function confirmDeclareSuccessor() {
            if (!successorIdentityInput.value.trim()) {
                return;
            }
            try {
                const record = identityUseCase.declareSuccessor(successorFormId.value, successorIdentityInput.value.trim(), successorPassphrase.value || null);
                if (identityLifecyclePropagationUseCase) {
                    identityLifecyclePropagationUseCase.broadcastSuccession(record);
                }
                cancelDeclareSuccessor();
                refresh();
            } catch (e) {
                successorError.value = e.message.replace(/^LocalIdentityProvider:\s*/, '');
            }
        }

        // --- 0.2.67: revoke ------------------------------------------------------
        const revokingId = ref(null);
        const revokeReason = ref('');
        const revokeSuccessor = ref('');
        const revokePassphrase = ref('');
        const revokeError = ref('');

        function startRevoke(identity) {
            revokingId.value = identity.identityId;
            revokeReason.value = '';
            revokeSuccessor.value = identity.successorIdentityId || '';
            revokePassphrase.value = '';
            revokeError.value = '';
        }
        function cancelRevoke() {
            revokingId.value = null;
        }
        function confirmRevoke() {
            try {
                const revokedId = revokingId.value;
                const record = identityUseCase.revokeIdentity(revokedId, {
                    passphrase: revokePassphrase.value || null,
                    reason: revokeReason.value.trim() || null,
                    successorIdentityId: revokeSuccessor.value.trim() || null
                });
                if (identityLifecyclePropagationUseCase) {
                    identityLifecyclePropagationUseCase.broadcastRevocation(record);
                    // revokeIdentity({ successorIdentityId }) also produces
                    // a succession record as a side effect (see
                    // identity/LocalIdentityProvider.js's own header) —
                    // broadcast that too, in the same gesture, so peers
                    // learn "revoked, AND here is the successor" together.
                    if (record.successorIdentityId) {
                        identityLifecyclePropagationUseCase.broadcastSuccession(identityUseCase.getSuccessionRecord(revokedId));
                    }
                }
                cancelRevoke();
                refresh();
            } catch (e) {
                revokeError.value = e.message.replace(/^LocalIdentityProvider:\s*/, '');
            }
        }

        let unsubscribeUser = null;
        let unsubscribeSession = null;
        let unsubscribeLock = null;
        onMounted(() => {
            unsubscribeUser = identityUseCase.onUserChanged(refresh);
            unsubscribeSession = identityUseCase.onSessionChanged(refresh);
            unsubscribeLock = identityUseCase.onVaultLockChanged(refresh);
        });
        onBeforeUnmount(() => {
            if (unsubscribeUser) unsubscribeUser();
            if (unsubscribeSession) unsubscribeSession();
            if (unsubscribeLock) unsubscribeLock();
        });

        return {
            sortedIdentities, shortId, isCurrentSession, isUnlocked,
            unlockingId, unlockPassphrase, unlockError, startUnlock, cancelUnlock, confirmUnlock, lockIdentity,
            exportingId, exportPassphrase, exportError, exportedPackage, startExport, cancelExport, confirmExport,
            newLabel, newPassphrase, createIdentity,
            showImportForm, importText, importLabel, importPassphrase, importError, importResult,
            importPreview, onImportFileChosen, confirmImport, dismissImportResult,
            changingPassphraseId, changeOldPassphrase, changeNewPassphrase, changePassphraseError,
            startChangePassphrase, cancelChangePassphrase, confirmChangePassphrase,
            successorFormId, successorIdentityInput, successorPassphrase, successorError,
            startDeclareSuccessor, cancelDeclareSuccessor, confirmDeclareSuccessor,
            revokingId, revokeReason, revokeSuccessor, revokePassphrase, revokeError,
            startRevoke, cancelRevoke, confirmRevoke
        };
    },
    template: `
        <section class="identity-management-view">
            <h1>My Identities</h1>
            <p class="form-hint form-hint--neutral">
                Every identity listed here is a keypair THIS device holds. Export
                a protected copy to move an identity to another device;
                import a copy exported from this device (or another one) to
                bring an identity here. There is no password reset — the
                export passphrase protects the private key, and losing both
                the exported file and its passphrase means the identity
                cannot be recovered by anyone, including its owner.
            </p>

            <div v-if="sortedIdentities.length" class="identity-mgmt-list">
                <div v-for="identity in sortedIdentities" :key="identity.identityId" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">
                            <span v-if="identity.isProtected" class="identity-lock-icon"
                                  :title="isUnlocked(identity) ? 'Protected — currently unlocked' : 'Protected — currently locked'">
                                {{ isUnlocked(identity) ? '🔓' : '🔒' }}
                            </span>
                            {{ identity.label }}
                        </span>
                        <span class="identity-list-item-id">…{{ shortId(identity.identityId) }}</span>
                    </div>
                    <p class="identity-mgmt-status">
                        {{ isCurrentSession(identity) ? 'Authenticated' : 'Not signed in' }}
                        <template v-if="identity.isProtected"> · {{ isUnlocked(identity) ? 'Unlocked' : 'Locked' }}</template>
                        <template v-else> · Unprotected</template>
                        <template v-if="identity.lifecycleState === 'REVOKED'"> · <span class="identity-revoked-badge">⚠ Revoked</span></template>
                    </p>
                    <p v-if="identity.successorIdentityId" class="form-hint form-hint--neutral">
                        Successor: …{{ shortId(identity.successorIdentityId) }}
                    </p>

                    <div v-if="unlockingId === identity.identityId" class="identity-unlock-form">
                        <p class="identity-unlock-label">🔒 Enter the passphrase for <strong>{{ identity.label }}</strong></p>
                        <input v-model="unlockPassphrase" type="password" placeholder="Passphrase" class="modal-input"
                               autofocus @keydown.enter="confirmUnlock" @keydown.escape="cancelUnlock" />
                        <p v-if="unlockError" class="identity-unlock-error">{{ unlockError }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="cancelUnlock">Cancel</button>
                            <button class="modal-btn modal-btn--primary" @click="confirmUnlock">Unlock</button>
                        </div>
                    </div>

                    <div v-else-if="exportingId === identity.identityId" class="identity-unlock-form">
                        <p class="identity-unlock-label">
                            Exporting requires the passphrase again, even if this identity is currently unlocked.
                        </p>
                        <template v-if="!exportedPackage.json">
                            <input v-model="exportPassphrase" type="password"
                                   :placeholder="identity.isProtected ? 'Current passphrase' : 'Choose a passphrase to protect the export'"
                                   class="modal-input" autofocus @keydown.enter="confirmExport" @keydown.escape="cancelExport" />
                            <p v-if="exportError" class="identity-unlock-error">{{ exportError }}</p>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--secondary" @click="cancelExport">Cancel</button>
                                <button class="modal-btn modal-btn--primary" @click="confirmExport">Export</button>
                            </div>
                        </template>
                        <template v-else>
                            <p class="form-hint form-hint--neutral">
                                Save this file somewhere safe. Anyone with BOTH this file and its
                                passphrase can act as {{ identity.label }} — treat it like the private key it contains.
                            </p>
                            <textarea class="form-input identity-export-json" rows="6" readonly :value="exportedPackage.json"></textarea>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--secondary" @click="cancelExport">Close</button>
                                <a class="modal-btn modal-btn--primary" :href="exportedPackage.downloadHref" :download="exportedPackage.fileName">Download</a>
                            </div>
                        </template>
                    </div>

                    <div v-else-if="changingPassphraseId === identity.identityId" class="identity-unlock-form">
                        <p class="identity-unlock-label">Changing the passphrase never changes the identity itself — its identityId, public key, and every signature it has ever produced stay exactly as valid as before.</p>
                        <input v-model="changeOldPassphrase" type="password" placeholder="Current passphrase" class="modal-input" autofocus />
                        <input v-model="changeNewPassphrase" type="password" placeholder="New passphrase" class="modal-input" @keydown.enter="confirmChangePassphrase" @keydown.escape="cancelChangePassphrase" />
                        <p v-if="changePassphraseError" class="identity-unlock-error">{{ changePassphraseError }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="cancelChangePassphrase">Cancel</button>
                            <button class="modal-btn modal-btn--primary" @click="confirmChangePassphrase">Change Passphrase</button>
                        </div>
                    </div>

                    <div v-else-if="successorFormId === identity.identityId" class="identity-unlock-form">
                        <p class="identity-unlock-label">
                            Declaring a successor signs a statement that another identity replaces this one. It does NOT revoke this identity — do that separately, below, when the rotation should actually take effect.
                        </p>
                        <input v-model="successorIdentityInput" type="text" placeholder="Successor identity (did:key:z…)" class="modal-input" autofocus />
                        <input v-if="identity.isProtected && !isUnlocked(identity)" v-model="successorPassphrase" type="password" placeholder="Passphrase" class="modal-input" @keydown.enter="confirmDeclareSuccessor" @keydown.escape="cancelDeclareSuccessor" />
                        <p v-if="successorError" class="identity-unlock-error">{{ successorError }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="cancelDeclareSuccessor">Cancel</button>
                            <button class="modal-btn modal-btn--primary" @click="confirmDeclareSuccessor">Declare Successor</button>
                        </div>
                    </div>

                    <div v-else-if="revokingId === identity.identityId" class="identity-unlock-form">
                        <p class="identity-unlock-label">
                            Revoking {{ identity.label }} is permanent. It can never sign anything new again, on this
                            device or any device that already holds its key. This does not affect anything already
                            established with it — only new activity going forward.
                        </p>
                        <input v-model="revokeReason" type="text" placeholder="Reason (optional, shown only to you)" class="modal-input" autofocus />
                        <input v-model="revokeSuccessor" type="text" placeholder="Successor identity (optional, did:key:z…)" class="modal-input" />
                        <input v-if="identity.isProtected && !isUnlocked(identity)" v-model="revokePassphrase" type="password" placeholder="Passphrase" class="modal-input" @keydown.enter="confirmRevoke" @keydown.escape="cancelRevoke" />
                        <p v-if="revokeError" class="identity-unlock-error">{{ revokeError }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="cancelRevoke">Cancel</button>
                            <button class="modal-btn modal-btn--danger" @click="confirmRevoke">Revoke Identity</button>
                        </div>
                    </div>

                    <div v-else class="identity-mgmt-actions">
                        <button v-if="identity.isProtected && isUnlocked(identity)" class="action-btn action-btn--secondary" @click="lockIdentity(identity)">Lock</button>
                        <button v-else-if="identity.isProtected" class="action-btn action-btn--secondary" @click="startUnlock(identity)">Unlock</button>
                        <button class="action-btn action-btn--secondary" @click="startExport(identity)">Export Identity</button>
                        <button v-if="identity.isProtected" class="action-btn action-btn--secondary" @click="startChangePassphrase(identity)">Change Passphrase</button>
                        <template v-if="identity.lifecycleState !== 'REVOKED'">
                            <button class="action-btn action-btn--secondary" @click="startDeclareSuccessor(identity)">Declare Successor</button>
                            <button class="action-btn action-btn--danger" @click="startRevoke(identity)">Revoke</button>
                        </template>
                    </div>
                </div>
            </div>
            <p v-else class="form-hint form-hint--neutral">No identities on this device yet.</p>

            <div class="identity-mgmt-form">
                <h2>Create New Identity</h2>
                <input v-model="newLabel" type="text" placeholder="Display name" class="modal-input" @keydown.enter="createIdentity" />
                <input v-model="newPassphrase" type="password" placeholder="Protect with a passphrase (optional)" class="modal-input" @keydown.enter="createIdentity" />
                <button class="action-btn action-btn--primary" @click="createIdentity">Create Identity</button>
            </div>

            <div class="identity-mgmt-form">
                <h2>Import Identity</h2>
                <button v-if="!showImportForm" class="action-btn action-btn--secondary" @click="showImportForm = true">Import Identity</button>
                <template v-else>
                    <label class="form-field">
                        <span class="form-label">Exported identity file</span>
                        <input type="file" accept="application/json" @change="onImportFileChosen" class="form-input" />
                    </label>
                    <textarea v-model="importText" class="form-input identity-export-json" rows="6"
                              placeholder="…or paste the exported identity JSON here"></textarea>

                    <div v-if="importPreview" class="identity-import-preview">
                        <p><strong>Identity:</strong> {{ importPreview.label || '(no name given)' }}</p>
                        <p><strong>Identity ID:</strong> {{ importPreview.identityId }}</p>
                        <p><strong>Algorithm:</strong> {{ importPreview.algorithm || 'unknown' }}</p>
                        <p v-if="importPreview.alreadyExists" class="form-hint form-hint--neutral">
                            This identity already exists on this device as "{{ importPreview.existingLabel }}".
                            Importing it again will not create a second copy.
                        </p>
                    </div>

                    <input v-model="importLabel" type="text" placeholder="Display name (only used for a new identity)" class="modal-input" />
                    <input v-model="importPassphrase" type="password" placeholder="Passphrase this file was exported with" class="modal-input" @keydown.enter="confirmImport" />

                    <p v-if="importError" class="identity-unlock-error">{{ importError }}</p>

                    <div v-if="importResult" class="identity-import-result">
                        <p v-if="importResult.status === 'ALREADY_EXISTS'">
                            This identity already exists on this device as "{{ importResult.identity.label }}". Nothing was changed.
                        </p>
                        <p v-else>
                            Identity imported successfully. The identity is currently locked — unlock it when you're ready to use it.
                        </p>
                        <button class="modal-btn modal-btn--secondary" @click="dismissImportResult">Dismiss</button>
                    </div>

                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="showImportForm = false">Cancel</button>
                        <button class="modal-btn modal-btn--primary" @click="confirmImport">Import</button>
                    </div>
                </template>
            </div>
        </section>
    `
};
