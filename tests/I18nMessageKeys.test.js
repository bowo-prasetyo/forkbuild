// Text from core/ and application/ as message keys: the descriptor and error
// types, how the UI turns them into text, and that everything the converted
// modules can say has an English message (so nothing shows up as a key).
import { isMessage, message } from '../core/Message.js';
import { UserFacingError, isUserFacingError } from '../core/UserFacingError.js';
import { EditorActionRegistry, actionCategoryLabel, actionLabel, createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { EditorActionContext } from '../application/editor/EditorActionContext.js';
import { LICENSE_OPTIONS, describeLicense } from '../application/document/LicenseLabels.js';
import { PLACEMENT_POLICY_OPTIONS } from '../application/document/PlacementPolicyLabels.js';
import { LifecycleStatus, describeLifecycleStatus } from '../application/document/DocumentLifecycleStatus.js';
import { describeAnimationState, describeLifecycleState, describeTrustStatus } from '../application/avatar/AvatarPresenceLabels.js';
import { evaluateNewPassphrase } from '../application/identity/NewPassphrasePolicy.js';
import { OpenPublicationLinkOutcome, openPublicationLink } from '../application/publication/OpenPublicationLink.js';
import { createPublicationClaimRetriever } from '../application/publication/PublicationClaimRetriever.js';
import { describePublicationClaimLocator } from '../core/ForkBuildAppLinks.js';
import { PresenceLifecycleState } from '../core/PresenceLifecycleState.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { displayText, errorText, hasMessage, setAppLocale, t } from '../ui/i18n/i18n.js';
import { PSEUDO_LOCALE, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { pseudoLocalize } from '../ui/i18n/pseudoLocalize.js';
import { Translator } from '../ui/i18n/Translator.js';
import { libraryItemDescription, libraryItemKey, libraryItemName } from '../ui/i18n/libraryText.js';
import { assert } from './support/Assert.js';

function assertTranslated(value, where) {
    assert(isMessage(value), `${where} is a message descriptor (got ${JSON.stringify(value)})`);
    assert(hasMessage(value.key), `${where}: "${value.key}" has an English message`);
}

// Descriptors: a key and frozen parameters, readable as the key if one ever
// reaches the screen untranslated.
{
    const descriptor = message('app.nav.home', { a: 1 });
    assert(isMessage(descriptor) && descriptor.key === 'app.nav.home' && descriptor.params.a === 1, 'a descriptor carries its key and parameters');
    assert(Object.isFrozen(descriptor) && Object.isFrozen(descriptor.params), 'descriptors are immutable');
    assert(String(descriptor) === 'app.nav.home' && `${descriptor}` === 'app.nav.home', 'an untranslated descriptor reads as its key');
    assert(!isMessage('app.nav.home') && !isMessage(null) && !isMessage({ key: 'x' }), 'only descriptors are descriptors');
    let refused = false;
    try {
        message('');
    } catch {
        refused = true;
    }
    assert(refused, 'a descriptor needs a key');
    console.log('✓ message descriptors');
}

// A UserFacingError carries a message for the person; its own .message is
// the key and the developer detail.
{
    const error = new UserFacingError(message('fork.notPermitted', { license: 'CC-BY-ND-4.0' }), { detail: 'document "d1"' });
    assert(error instanceof Error && isUserFacingError(error), 'it is an Error');
    assert(error.message === 'fork.notPermitted: document "d1"', 'its message is the key plus the detail, for logs');
    assert(errorText(error) === 'This world can\'t be edited: its license (CC-BY-ND-4.0) doesn\'t allow forking.', 'errorText() gives the person\'s message');
    assert(errorText(new Error('plain')) === 'plain', 'a plain Error shows its own text');
    assert(errorText(null, 'Something went wrong') === 'Something went wrong' && errorText('text') === 'text', 'nothing falls back, text is text');
    let refused = false;
    try {
        new UserFacingError('not a descriptor');
    } catch {
        refused = true;
    }
    assert(refused, 'it requires a descriptor');
    console.log('✓ user-facing errors');
}

// t() takes a descriptor; displayText() also passes finished text through.
{
    assert(t(message('language.current', { language: 'English' })) === 'Showing: English', 't() translates a descriptor with its parameters');
    assert(displayText(message('app.nav.home')) === 'Home', 'displayText() translates a descriptor');
    assert(displayText('Already text') === 'Already text', '…and leaves text as it is');
    assert(displayText(null) === null && displayText(undefined) === undefined, '…and nothing as nothing');
    assert(hasMessage('app.nav.home') && !hasMessage('no.such.key'), 'hasMessage() tells known keys apart');
    console.log('✓ t(), displayText() and hasMessage()');
}

// Parameters that are descriptors are translated first; lists are joined the
// locale's way.
{
    const english = new Translator({
        locale: 'en',
        messages: { outer: 'By {author}: {reasons}.', inner: 'an unknown author', reason: 'it broke' }
    });
    assert(english.translate('outer', { author: message('inner'), reasons: ['a', message('reason')] }) === 'By an unknown author: a, it broke.',
        `nested messages and lists are resolved (got ${english.translate('outer', { author: message('inner'), reasons: ['a', message('reason')] })})`);
    const indonesian = new Translator({ locale: 'id', messages: { list: '{items}' } });
    assert(indonesian.translate('list', { items: ['a', 'b', 'c'] }) === 'a, b, c', 'lists follow the locale');
    console.log('✓ descriptor and list parameters');
}

// Every editor action's label, description and category, every reason it
// gives, and everything it reports has an English message.
{
    const shown = [];
    const feedback = { show(value) { shown.push(value); } };
    const everything = new Proxy({}, { get: (target, name) => (name === 'getGroups' ? () => [] : () => ({ bounds: { center: {} } })) });
    const nothingThere = new Proxy({}, { get: (target, name) => (name === 'getGroups' ? () => [] : () => false) });
    const fullUi = {
        togglePalette() {}, focusNumeric() {}, focusRepeat() {}, openCreateBlueprintDialog() {}, promptRenameGroup: () => 'Name'
    };
    const ready = new EditorActionContext({ selectionCount: 3, clipboardCount: 1, selectedGroupId: 'g', canUndo: true, canRedo: true });
    for (const [session, ui] of [[everything, fullUi], [nothingThere, fullUi], [{}, {}]]) {
        const registry = new EditorActionRegistry(createStandardActions({ session, feedback, ui }));
        for (const action of registry.getAll()) {
            registry.execute(action.id, ready);
        }
    }
    shown.forEach((value, index) => assertTranslated(value, `feedback #${index}`));
    const shownKeys = new Set(shown.map((value) => value.key));
    for (const key of ['editorAction.transform.alignLeft.done', 'editorAction.selection.delete.nothing', 'editorActionUnavailable.groups']) {
        assert(shownKeys.has(key), `the run reported ${key}`);
    }

    const registry = new EditorActionRegistry(createStandardActions({ session: {}, feedback, ui: {} }));
    const contexts = [
        new EditorActionContext(),
        new EditorActionContext({ selectionCount: 1 }),
        new EditorActionContext({ selectionCount: 2 }),
        new EditorActionContext({ selectionCount: 1, selectionIsStructurePlacement: true })
    ];
    for (const action of registry.getAll()) {
        assertTranslated(action.label, `${action.id} label`);
        assert(action.label.key === actionLabel(action.id).key, `${action.id} label is named after its id`);
        assertTranslated(action.description, `${action.id} description`);
        assertTranslated(actionCategoryLabel(action.category), `${action.id} category`);
        for (const context of contexts) {
            const reason = action.disabledReason(context);
            if (reason !== null) {
                assertTranslated(reason, `${action.id} reason`);
            }
        }
    }
    assert(t(registry.get('transform.alignLeft').disabledReason(contexts[1])) === 'Select at least 2 bricks', 'reasons carry their counts');
    console.log(`✓ every editor action says everything through messages (${shown.length} reports checked)`);
}

// A refusal thrown as a UserFacingError reaches the person as its message.
{
    const shown = [];
    const refusing = {
        deleteSelection() {
            throw new UserFacingError(message('fork.notPermitted', { license: 'ALL-RIGHTS-RESERVED' }), { detail: 'no fork' });
        }
    };
    const registry = new EditorActionRegistry(createStandardActions({ session: refusing, feedback: { show: (value) => shown.push(value) }, ui: {} }));
    registry.execute('selection.delete', new EditorActionContext({ selectionCount: 1 }));
    assert(isMessage(shown[0]) && t(shown[0]).includes('ALL-RIGHTS-RESERVED'), 'the refusal is shown as its message, not its developer text');

    const crashing = { deleteSelection() { throw new Error('Something internal'); } };
    const plain = new EditorActionRegistry(createStandardActions({ session: crashing, feedback: { show: (value) => shown.push(value) }, ui: {} }));
    plain.execute('selection.delete', new EditorActionContext({ selectionCount: 1 }));
    assert(shown[1] === 'Something internal', 'any other error is still shown as it was');
    console.log('✓ refusals reach the person as messages');
}

// The label modules: every value, and anything unrecognized.
{
    for (const option of LICENSE_OPTIONS) {
        assertTranslated(option.label, `license ${option.id}`);
    }
    assert(t(describeLicense('MY-OWN-LICENSE')) === 'MY-OWN-LICENSE', 'an unknown license shows its id');
    assert(t(describeLicense(null)) === 'No license specified', 'no license says so');
    for (const option of PLACEMENT_POLICY_OPTIONS) {
        assertTranslated(option.label, `placement policy ${option.id}`);
    }
    for (const status of Object.values(LifecycleStatus)) {
        assertTranslated(describeLifecycleStatus(status), `document status ${status}`);
        assertTranslated(describeLifecycleStatus(status, { dirty: true }), `dirty document status ${status}`);
    }
    for (const state of [...Object.values(PresenceLifecycleState), 'made-up']) {
        assertTranslated(describeLifecycleState(state), `presence ${state}`);
    }
    for (const status of [...Object.values(TrustStatus), null]) {
        assertTranslated(describeTrustStatus(status), `trust ${status}`);
    }
    for (const state of [...Object.values(AvatarAnimationState), undefined]) {
        assertTranslated(describeAnimationState(state), `animation ${state}`);
    }
    for (const input of [{}, { offerUnprotected: false }, { passphrase: 'short', confirmation: 'short' }, { passphrase: 'long enough', confirmation: 'other' }]) {
        assertTranslated(evaluateNewPassphrase(input).message, `passphrase ${JSON.stringify(input)}`);
    }
    assert(t(evaluateNewPassphrase({ passphrase: 'short', confirmation: 'short' }).message) === 'A passphrase needs at least 8 characters.', 'the length rule names its number');
    console.log('✓ license, placement, document, presence and passphrase labels are messages');
}

// Opening a link: every outcome, on every network, is a message.
{
    const locators = ['steem://alice/tower', `ar://${'a'.repeat(43)}`, 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'];
    for (const locator of locators) {
        const where = describePublicationClaimLocator(locator);
        assert(where, `${locator} is a link ForkBuild opens`);
        assertTranslated(where.label, `${where.network} label`);
        const outcomes = [
            await openPublicationLink({ locator, retrieveClaim: async () => { throw new Error('Failed to fetch.'); } }),
            await openPublicationLink({ locator, retrieveClaim: async () => null }),
            await openPublicationLink({ locator, retrieveClaim: async () => ({ not: 'a publication' }) }),
            await openPublicationLink({ locator, retrieveClaim: createPublicationClaimRetriever() })
        ];
        for (const outcome of outcomes) {
            assertTranslated(outcome.message, `${where.network} ${outcome.outcome}`);
        }
        assert(t(outcomes[0].message).includes('Failed to fetch.') && !t(outcomes[0].message).includes('..'), 'the network\'s own error is kept once, ending the sentence');
        assert(t(outcomes[3].message).includes('isn\'t available in this browser'), 'a missing reader is said in the person\'s words');
    }
    const invalid = await openPublicationLink({ locator: 'nonsense', retrieveClaim: async () => null });
    assert(invalid.outcome === OpenPublicationLinkOutcome.INVALID_LINK, 'a link that names nothing is invalid');
    assertTranslated(invalid.message, 'invalid link');
    console.log('✓ every publication link outcome is a message');
}

// Built-in library items show a translation, looked up by id; anything else
// keeps its own name.
{
    assert(libraryItemKey('core:slope_45') === 'library.core.slope45' && libraryItemKey('village:large_house') === 'library.village.largeHouse', 'ids become keys');
    assert(libraryItemKey('no-namespace') === null && libraryItemKey(undefined) === null, 'an id without a namespace has no key');
    for (const item of [...CoreLibrary.definitions, ...VillageLibrary.structures]) {
        assert(hasMessage(libraryItemKey(item.id)), `${item.id} has a name message`);
        assert(libraryItemName(item) === item.name, `${item.id}'s English name matches the library's`);
        assert(libraryItemDescription(item) === item.description, `${item.id}'s English description matches the library's`);
    }
    const blueprint = { id: 'personal:3f2a', name: 'My Tower', description: 'Mine' };
    assert(libraryItemName(blueprint) === 'My Tower' && libraryItemDescription(blueprint) === 'Mine', 'a personal blueprint keeps its own name');
    console.log('✓ built-in library items are named through messages; personal ones keep their names');
}

// In another locale the same descriptors change language.
{
    await setAppLocale(PSEUDO_LOCALE);
    assert(t(actionLabel('selection.selectAll')) === pseudoLocalize('Select All'), 'an action label follows the locale');
    assert(libraryItemName(CoreLibrary.definitions[0]) === pseudoLocalize(CoreLibrary.definitions[0].name), 'so does a library name');
    assert(errorText(new UserFacingError(message('passphrase.mismatch'))) === pseudoLocalize('The two passphrases don\'t match.'), 'and a user-facing error');
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ descriptors are shown in the chosen language');
}
