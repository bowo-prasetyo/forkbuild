// English, the source language: every key the app uses is defined here, and
// every other locale is checked against it (tests/I18nMessages.test.js).
// Keys are grouped by the screen or component they belong to. See
// docs/Translating.md before adding or changing a message.
export default Object.freeze({
    // The header and navigation on every page (ui/App.js).
    'app.menu.open': 'Menu',
    'app.menu.close': 'Close',
    'app.nav.home': 'Home',
    'app.nav.editor': 'Editor',
    'app.nav.repository': 'Repository',
    'app.nav.myWorlds': 'My Worlds',
    'app.nav.myAvatar': 'My Avatar',
    'app.nav.myIdentities': 'My Identities',
    'app.nav.peers': 'Peers',
    'app.nav.following': 'Following',
    'app.nav.conversations': 'Conversations',
    'app.nav.publications': 'Publications',
    'app.nav.networkSettings': 'Network Settings',
    'app.nav.yourData': 'Your Data',
    'app.nav.language': 'Language',
    'app.nav.about': 'About',
    'app.notifications': 'Notifications',

    // The sound button and volume slider (ui/components/SoundControl.js).
    'sound.group': 'Sound',
    'sound.on': '🔊 Sound on',
    'sound.off': '🔇 Sound off',
    'sound.turnOn': 'Turn sound on (M)',
    'sound.turnOff': 'Turn sound off (M)',
    'sound.volume': 'Volume',
    'sound.spatial': '3D',
    'sound.stereo': 'Stereo',
    'sound.spatialHint': 'Sounds are placed in 3D (best with headphones); click for left and right only',
    'sound.stereoHint': 'Sounds are placed left and right; click for 3D',

    // The Language page (ui/views/LanguageSettingsView.js).
    'language.title': 'Language',
    'language.intro': 'Choose the language ForkBuild shows on this device. It is kept only in this browser; nothing is sent anywhere.',
    'language.label': 'Language',
    'language.automatic': 'Match this browser ({language})',
    'language.forTranslators': 'For translators',
    'language.save': 'Save and reload',
    'language.reloadNote': 'The page reloads to show the new language. Save your work in the Editor first.',
    'language.current': 'Showing: {language}',
    'language.pseudoNote': 'The pseudo-locale is English with accented letters, padded and bracketed. Text that still appears plain has not been prepared for translation yet.',
    'language.helpTranslate': 'ForkBuild is being prepared for translation. To help translate it, see docs/Translating.md in the source code.',
    'language.unavailable': 'The language setting is unavailable here.'
});
