import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import NewPassphraseFields from '../components/NewPassphraseFields.js';
import { evaluateNewPassphrase } from '../../application/identity/NewPassphrasePolicy.js';

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
// application/identity/IdentityUseCase.js, same division as every other view.
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
    components: { NewPassphraseFields },
    // A plain `autofocus` attribute only works on page load, not on an
    // input Vue inserts later, which is how every form here appears.
    directives: {
        focus: { mounted: (el) => el.focus() }
    },
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

        // Errors from the identity layer lead with the throwing module's
        // name ("LocalIdentityProvider: incorrect passphrase…"), which
        // means nothing to the person reading it.
        function displayError(e) {
            return e.message.replace(/^[A-Za-z.]+:\s*/, '');
        }

        // --- per-identity action forms -----------------------------------------
        //
        // Unlock, export, change passphrase, declare successor and revoke
        // each open an inline form on one card. At most one is open at a
        // time — opening another replaces it — and they share one set of
        // fields, cleared on every open and close so a typed passphrase
        // never outlives the form it was typed into.
        const openForm = ref(null); // { kind, identityId }
        // busy: an action is waiting on key derivation, which takes a moment.
        const form = reactive({
            passphrase: '', newPassphrase: '', newPassphraseConfirmation: '', successorIdentityId: '', reason: '',
            error: '', attempted: false, busy: false
        });
        const exportedJson = ref('');
        const exportDownloadHref = computed(() => 'data:application/json;charset=utf-8,' + encodeURIComponent(exportedJson.value));

        function isFormOpen(kind, identity) {
            return !!openForm.value && openForm.value.kind === kind && openForm.value.identityId === identity.identityId;
        }
        function openFormFor(kind, identity) {
            closeForm();
            openForm.value = { kind, identityId: identity.identityId };
            if (kind === 'revoke') {
                form.successorIdentityId = identity.successorIdentityId || '';
            }
        }
        function closeForm() {
            openForm.value = null;
            form.passphrase = '';
            form.newPassphrase = '';
            form.newPassphraseConfirmation = '';
            form.successorIdentityId = '';
            form.reason = '';
            form.error = '';
            form.attempted = false;
            form.busy = false;
            exportedJson.value = '';
        }

        // Runs one form action, showing progress and any error on the form.
        async function runFormAction(action) {
            if (form.busy) {
                return;
            }
            form.busy = true;
            form.error = '';
            try {
                await action();
            } catch (e) {
                form.error = displayError(e);
            } finally {
                form.busy = false;
            }
        }

        // --- lock / unlock -------------------------------------------------
        function confirmUnlock() {
            if (!form.passphrase) {
                return;
            }
            return runFormAction(async () => {
                await identityUseCase.unlock(openForm.value.identityId, form.passphrase);
                closeForm();
            });
        }
        function lockIdentity(identity) {
            identityUseCase.lock(identity.identityId);
        }

        // --- export ----------------------------------------------------------
        function confirmExport() {
            if (!form.passphrase) {
                return;
            }
            return runFormAction(async () => {
                const pkg = await identityUseCase.exportIdentity(openForm.value.identityId, form.passphrase);
                exportedJson.value = JSON.stringify(pkg, null, 2);
                form.passphrase = '';
            });
        }

        function confirmProtect() {
            form.attempted = true;
            const evaluation = evaluateNewPassphrase({
                passphrase: form.newPassphrase, confirmation: form.newPassphraseConfirmation, offerUnprotected: false
            });
            if (!evaluation.ok) {
                return;
            }
            return runFormAction(async () => {
                await identityUseCase.protectIdentity(openForm.value.identityId, form.newPassphrase);
                closeForm();
            });
        }
        function exportFileName(identity) {
            const safeLabel = identity.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'identity';
            return `forkbuild-identity-${safeLabel}.json`;
        }

        // --- create new identity ---------------------------------------------
        // createIdentity() publishes no event, so the list is re-read here.
        const newLabel = ref('');
        const newPassphrase = ref('');
        const newPassphraseConfirmation = ref('');
        const allowUnprotected = ref(false);
        const createAttempted = ref(false);
        const creating = ref(false);
        const createError = ref('');
        async function createIdentity() {
            const label = newLabel.value.trim();
            createAttempted.value = true;
            createError.value = '';
            const evaluation = evaluateNewPassphrase({
                passphrase: newPassphrase.value,
                confirmation: newPassphraseConfirmation.value,
                allowUnprotected: allowUnprotected.value
            });
            if (!label || !evaluation.ok || creating.value) {
                return;
            }
            creating.value = true;
            try {
                await identityUseCase.createIdentity(label, evaluation.protect ? newPassphrase.value : null);
                newLabel.value = '';
                newPassphrase.value = '';
                newPassphraseConfirmation.value = '';
                allowUnprotected.value = false;
                createAttempted.value = false;
                refresh();
            } catch (e) {
                createError.value = displayError(e);
            } finally {
                creating.value = false;
            }
        }

        // --- import ------------------------------------------------------------
        const showImportForm = ref(false);
        const importText = ref('');
        const importLabel = ref('');
        const importPassphrase = ref('');
        const importError = ref('');
        const importResult = ref(null); // { status: 'ALREADY_EXISTS' | 'IMPORTED', identity }

        // The pasted text parsed once, for both the preview and
        // confirmImport(); undefined when it isn't valid JSON.
        const parsedImport = computed(() => {
            try {
                return JSON.parse(importText.value);
            } catch (e) {
                return undefined;
            }
        });

        // Client-side, passphrase-free preview: checks the pasted
        // package's identityId against what this device already lists.
        // Never validates cryptographic consistency itself (that's
        // identity/IdentityImport.js's job, run for real only when
        // confirmImport() actually calls importIdentity()) — this is
        // deliberately a lightweight preview, not a second validator.
        const importPreview = computed(() => {
            const pkg = parsedImport.value;
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

        // importIdentity() publishes no event, so the list is re-read here.
        const importing = ref(false);
        async function confirmImport() {
            if (importing.value) {
                return;
            }
            importError.value = '';
            importResult.value = null;
            const pkg = parsedImport.value;
            if (pkg === undefined) {
                importError.value = 'That is not valid JSON — paste the exported identity file\'s contents exactly.';
                return;
            }
            importing.value = true;
            try {
                const result = await identityUseCase.importIdentity(pkg, importPassphrase.value, importLabel.value.trim() || null);
                importResult.value = result;
                if (result.status === 'IMPORTED') {
                    importText.value = '';
                    importLabel.value = '';
                    importPassphrase.value = '';
                }
                refresh();
            } catch (e) {
                importError.value = displayError(e);
            } finally {
                importing.value = false;
            }
        }

        function dismissImportResult() {
            importResult.value = null;
        }

        // --- 0.2.67: change passphrase, declare successor, revoke --------------
        // Each of these publishes IdentityChanged, which already runs
        // refresh() through the subscriptions below.
        function confirmChangePassphrase() {
            form.attempted = true;
            const evaluation = evaluateNewPassphrase({
                passphrase: form.newPassphrase, confirmation: form.newPassphraseConfirmation, offerUnprotected: false
            });
            if (!form.passphrase || !evaluation.ok) {
                return;
            }
            return runFormAction(async () => {
                await identityUseCase.changePassphrase(openForm.value.identityId, form.passphrase, form.newPassphrase);
                closeForm();
            });
        }

        function confirmDeclareSuccessor() {
            const successorIdentityId = form.successorIdentityId.trim();
            if (!successorIdentityId) {
                return;
            }
            return runFormAction(async () => {
                const record = await identityUseCase.declareSuccessor(openForm.value.identityId, successorIdentityId, form.passphrase || null);
                if (identityLifecyclePropagationUseCase) {
                    identityLifecyclePropagationUseCase.broadcastSuccession(record);
                }
                closeForm();
            });
        }

        function confirmRevoke() {
            return runFormAction(async () => {
                const revokedId = openForm.value.identityId;
                const record = await identityUseCase.revokeIdentity(revokedId, {
                    passphrase: form.passphrase || null,
                    reason: form.reason.trim() || null,
                    successorIdentityId: form.successorIdentityId.trim() || null
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
                closeForm();
            });
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
            form, isFormOpen, openFormFor, closeForm,
            confirmUnlock, lockIdentity,
            exportedJson, exportDownloadHref, exportFileName, confirmExport,
            confirmProtect, confirmChangePassphrase, confirmDeclareSuccessor, confirmRevoke,
            newLabel, newPassphrase, newPassphraseConfirmation, allowUnprotected, createAttempted, creating, createError,
            createIdentity,
            showImportForm, importText, importLabel, importPassphrase, importError, importResult, importing,
            importPreview, onImportFileChosen, confirmImport, dismissImportResult
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
                        <template v-else> · <span class="identity-unprotected-badge" title="The private key is stored unencrypted in this browser">⚠ Unprotected</span></template>
                        <template v-if="identity.lifecycleState === 'REVOKED'"> · <span class="identity-revoked-badge">⚠ Revoked</span></template>
                    </p>
                    <p v-if="identity.successorIdentityId" class="form-hint form-hint--neutral">
                        Successor: …{{ shortId(identity.successorIdentityId) }}
                    </p>

                    <div v-if="isFormOpen('unlock', identity)" class="identity-unlock-form">
                        <p class="identity-unlock-label">🔒 Enter the passphrase for <strong>{{ identity.label }}</strong></p>
                        <input v-model="form.passphrase" type="password" placeholder="Passphrase" class="modal-input"
                               autocomplete="new-password" v-focus @keydown.enter="confirmUnlock" @keydown.escape="closeForm" />
                        <p v-if="form.error" class="identity-unlock-error">{{ form.error }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="closeForm">Cancel</button>
                            <button class="modal-btn modal-btn--primary" :disabled="form.busy" @click="confirmUnlock">{{ form.busy ? 'Unlocking…' : 'Unlock' }}</button>
                        </div>
                    </div>

                    <div v-else-if="isFormOpen('export', identity)" class="identity-unlock-form">
                        <p class="identity-unlock-label">
                            Exporting requires the passphrase again, even if this identity is currently unlocked.
                        </p>
                        <template v-if="!exportedJson">
                            <input v-model="form.passphrase" type="password"
                                   :placeholder="identity.isProtected ? 'Current passphrase' : 'Choose a passphrase to protect the export'"
                                   class="modal-input" autocomplete="new-password" v-focus @keydown.enter="confirmExport" @keydown.escape="closeForm" />
                            <p v-if="form.error" class="identity-unlock-error">{{ form.error }}</p>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--secondary" @click="closeForm">Cancel</button>
                                <button class="modal-btn modal-btn--primary" :disabled="form.busy" @click="confirmExport">{{ form.busy ? 'Encrypting…' : 'Export' }}</button>
                            </div>
                        </template>
                        <template v-else>
                            <p class="form-hint form-hint--neutral">
                                Save this file somewhere safe. Anyone with BOTH this file and its
                                passphrase can act as {{ identity.label }} — treat it like the private key it contains.
                            </p>
                            <textarea class="form-input identity-export-json" rows="6" readonly :value="exportedJson"></textarea>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--secondary" @click="closeForm">Close</button>
                                <a class="modal-btn modal-btn--primary" :href="exportDownloadHref" :download="exportFileName(identity)">Download</a>
                            </div>
                        </template>
                    </div>

                    <div v-else-if="isFormOpen('changePassphrase', identity)" class="identity-unlock-form">
                        <p class="identity-unlock-label">Changing the passphrase never changes the identity itself — its identityId, public key, and every signature it has ever produced stay exactly as valid as before.</p>
                        <input v-model="form.passphrase" type="password" placeholder="Current passphrase" class="modal-input" autocomplete="new-password" v-focus />
                        <NewPassphraseFields v-model:passphrase="form.newPassphrase" v-model:confirmation="form.newPassphraseConfirmation"
                                             :offer-unprotected="false" :show-hint="form.attempted" @submit="confirmChangePassphrase" />
                        <p v-if="form.error" class="identity-unlock-error">{{ form.error }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="closeForm">Cancel</button>
                            <button class="modal-btn modal-btn--primary" :disabled="form.busy" @click="confirmChangePassphrase">{{ form.busy ? 'Changing…' : 'Change Passphrase' }}</button>
                        </div>
                    </div>

                    <div v-else-if="isFormOpen('protect', identity)" class="identity-unlock-form">
                        <p class="identity-unlock-label">
                            Protecting {{ identity.label }} encrypts its private key with a passphrase. The identity itself —
                            its identityId, public key and signatures — does not change. It will be locked until you unlock it.
                        </p>
                        <NewPassphraseFields v-model:passphrase="form.newPassphrase" v-model:confirmation="form.newPassphraseConfirmation"
                                             :offer-unprotected="false" :show-hint="form.attempted" @submit="confirmProtect" />
                        <p v-if="form.error" class="identity-unlock-error">{{ form.error }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="closeForm">Cancel</button>
                            <button class="modal-btn modal-btn--primary" :disabled="form.busy" @click="confirmProtect">{{ form.busy ? 'Protecting…' : 'Protect Identity' }}</button>
                        </div>
                    </div>

                    <div v-else-if="isFormOpen('declareSuccessor', identity)" class="identity-unlock-form">
                        <p class="identity-unlock-label">
                            Declaring a successor signs a statement that another identity replaces this one. It does NOT revoke this identity — do that separately, below, when the rotation should actually take effect.
                        </p>
                        <input v-model="form.successorIdentityId" type="text" placeholder="Successor identity (did:key:z…)" class="modal-input" autocomplete="off" v-focus />
                        <input v-if="identity.isProtected && !isUnlocked(identity)" v-model="form.passphrase" type="password" placeholder="Passphrase" class="modal-input" autocomplete="new-password" @keydown.enter="confirmDeclareSuccessor" @keydown.escape="closeForm" />
                        <p v-if="form.error" class="identity-unlock-error">{{ form.error }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="closeForm">Cancel</button>
                            <button class="modal-btn modal-btn--primary" :disabled="form.busy" @click="confirmDeclareSuccessor">Declare Successor</button>
                        </div>
                    </div>

                    <div v-else-if="isFormOpen('revoke', identity)" class="identity-unlock-form">
                        <p class="identity-unlock-label">
                            Revoking {{ identity.label }} is permanent. It can never sign anything new again, on this
                            device or any device that already holds its key. This does not affect anything already
                            established with it — only new activity going forward.
                        </p>
                        <input v-model="form.reason" type="text" placeholder="Reason (optional, shown only to you)" class="modal-input" autocomplete="off" v-focus />
                        <input v-model="form.successorIdentityId" type="text" placeholder="Successor identity (optional, did:key:z…)" class="modal-input" autocomplete="off" />
                        <input v-if="identity.isProtected && !isUnlocked(identity)" v-model="form.passphrase" type="password" placeholder="Passphrase" class="modal-input" autocomplete="new-password" @keydown.enter="confirmRevoke" @keydown.escape="closeForm" />
                        <p v-if="form.error" class="identity-unlock-error">{{ form.error }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" @click="closeForm">Cancel</button>
                            <button class="modal-btn modal-btn--danger" :disabled="form.busy" @click="confirmRevoke">Revoke Identity</button>
                        </div>
                    </div>

                    <div v-else class="identity-mgmt-actions">
                        <button v-if="identity.isProtected && isUnlocked(identity)" class="action-btn action-btn--secondary" @click="lockIdentity(identity)">Lock</button>
                        <button v-else-if="identity.isProtected" class="action-btn action-btn--secondary" @click="openFormFor('unlock', identity)">Unlock</button>
                        <button class="action-btn action-btn--secondary" @click="openFormFor('export', identity)">Export Identity</button>
                        <button v-if="identity.isProtected" class="action-btn action-btn--secondary" @click="openFormFor('changePassphrase', identity)">Change Passphrase</button>
                        <button v-else-if="identity.lifecycleState !== 'REVOKED'" class="action-btn action-btn--primary" @click="openFormFor('protect', identity)">Protect with Passphrase</button>
                        <template v-if="identity.lifecycleState !== 'REVOKED'">
                            <button class="action-btn action-btn--secondary" @click="openFormFor('declareSuccessor', identity)">Declare Successor</button>
                            <button class="action-btn action-btn--danger" @click="openFormFor('revoke', identity)">Revoke</button>
                        </template>
                    </div>
                </div>
            </div>
            <p v-else class="form-hint form-hint--neutral">No identities on this device yet.</p>

            <div class="identity-mgmt-form">
                <h2>Create New Identity</h2>
                <input v-model="newLabel" type="text" placeholder="Display name" class="modal-input" autocomplete="off" @keydown.enter="createIdentity" />
                <NewPassphraseFields v-model:passphrase="newPassphrase" v-model:confirmation="newPassphraseConfirmation"
                                     v-model:allow-unprotected="allowUnprotected" :show-hint="createAttempted" @submit="createIdentity" />
                <p v-if="createError" class="identity-unlock-error">{{ createError }}</p>
                <button class="action-btn action-btn--primary" :disabled="creating" @click="createIdentity">{{ creating ? 'Creating…' : 'Create Identity' }}</button>
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

                    <input v-model="importLabel" type="text" placeholder="Display name (only used for a new identity)" class="modal-input" autocomplete="off" />
                    <input v-model="importPassphrase" type="password" placeholder="Passphrase this file was exported with" class="modal-input" autocomplete="new-password" @keydown.enter="confirmImport" />

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
                        <button class="modal-btn modal-btn--primary" :disabled="importing" @click="confirmImport">{{ importing ? 'Importing…' : 'Import' }}</button>
                    </div>
                </template>
            </div>
        </section>
    `
};
