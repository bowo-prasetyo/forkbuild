import * as THREE from 'three';
import * as ResidentTalk from '../core/ResidentTalk.js';
import { sanitizeSpokenText, RESIDENT_FACT_KIND, MAX_SPOKEN_TITLE_LENGTH } from '../core/ResidentTalk.js';
import { isMessage } from '../core/Message.js';
import { displayText, errorText } from '../ui/i18n/i18n.js';
import { Translator } from '../ui/i18n/Translator.js';
import en from '../ui/i18n/messages/en.js';
import { gatherResidentFacts, RESIDENT_KNOWLEDGE_RADIUS } from '../application/world/ResidentSurroundings.js';
import { vehiclePresenceInRegion } from '../core/VehiclePlacement.js';
import { wildlifeInRegionAt } from '../core/WildlifeMotion.js';
import { VehicleRuntimeInstances } from '../application/world/VehicleRuntimeInstances.js';
import { AnimalRuntimeInstances } from '../application/world/AnimalRuntimeInstances.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { WorldResident } from '../core/WorldResident.js';
import { WorldLandmark } from '../core/WorldLandmark.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { isResidentWalkClear } from '../core/ResidentPath.js';
import { RESIDENT_MOTION } from '../core/ResidentMotion.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { ResidentFieldRenderer, speechSecondsFor } from '../renderer/ResidentFieldRenderer.js';
import { createSpeechBubble } from '../renderer/ResidentSpeechBubble.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { residentAppearanceFor, RESIDENT_TEMPLATE_ID } from '../core/ResidentAppearance.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { terrainHeightAt } from '../core/TerrainHeightField.js';
import {
    pickResidentRemarkFacts, focusTargetsFor, speechSecondsFor as coreSpeechSecondsFor, FOCUSABLE_FACT_KINDS
} from '../core/ResidentTalk.js';
import { assert } from './support/Assert.js';

// Talking to World Residents: they tell you what's around, never what to do.
//
//   Section A: core/ResidentTalk.js — distances, directions, plain text, one
//              sentence per fact, what gets said on each turn
//   Section B: application/world/ResidentSurroundings.js — what a resident
//              knows, from this replica's view, never what is no longer there
//   Section C: WorldNavigationSession — T talks to the resident beside you,
//              moves on each time, and hands the words to the renderer
//   Section D: ResidentFieldRenderer — the bubble shows, times out, and goes
//              when you walk away
//   Section E: placed structures, named by the document they place (never a
//              bare id), and Focus: a camera-only look at what was mentioned

// core/ResidentTalk.js speaks in messages; these read them in English, the
// words a person sees with the app in English.
const english = (remark) => (remark === null ? null : displayText(remark));
const phraseFact = (fact) => english(ResidentTalk.phraseFact(fact));
const describeDistance = (meters) => english(ResidentTalk.describeDistance(meters));
const composeResidentRemarks = (facts, options) => ResidentTalk.composeResidentRemarks(facts, options).map(english);
const QUIET_REMARK = english(ResidentTalk.QUIET_REMARK);

const SEED = DEFAULT_WORLD_SEED;
const T = 1_759_000_000;

// Words a remark about what exists never needs: nothing is asked of you.
const IMPERATIVE = /\b(go|must|should|find|bring|quest|mission|reward|collect|visit|you need)\b/i;

function openHome() {
    const reach = RESIDENT_MOTION.wanderRadius + 2;
    for (let x = 0; x < 4000; x += 13) {
        const home = { x, z: 17 };
        let ok = true;
        for (let a = 0; a < 16 && ok; a++) {
            const angle = (a / 16) * Math.PI * 2;
            ok = isResidentWalkClear(SEED, home, { x: home.x + Math.sin(angle) * reach, z: home.z + Math.cos(angle) * reach });
        }
        if (ok && vehiclePresenceInRegion(SEED, x - 140, 17 - 140, x + 140, 17 + 140).length >= 2) return home;
    }
    throw new Error('No open home with vehicles around found — fixture assumption broken');
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — core/ResidentTalk.js
    // -------------------------------------------------------------
    {
        assert(describeDistance(4) === 'just a few steps' && describeDistance(NaN) === 'just a few steps', '1. Very close is "just a few steps"');
        assert(describeDistance(83) === 'about 80 m' && describeDistance(340) === 'about 350 m', '2. Metres are rounded, never falsely precise');
        assert(describeDistance(3240) === 'about 3.2 km' && describeDistance(12600) === 'about 13 km', '3. Kilometres too');
        assert(phraseFact({ kind: RESIDENT_FACT_KIND.VEHICLE, vehicleType: 'car', distance: 200, direction: 'NE' }) === "There's a car about 200 m to the north-east."
            && phraseFact({ kind: RESIDENT_FACT_KIND.VEHICLE, vehicleType: 'car', distance: 200, direction: null }) === "There's a car about 200 m away.",
            '4. Compass sectors become words; with no direction, just how far');

        assert(sanitizeSpokenText('  Old\n\tMill  ', 60) === 'Old Mill', '5. Whitespace collapses');
        assert(sanitizeSpokenText('abc\u202edef\u0007', 60) === 'abc def', '6. Control and direction-override characters are removed');
        assert(sanitizeSpokenText('<b>Hi</b>', 60) === '<b>Hi</b>', '7. Markup stays literal text (it is drawn as text, never interpreted)');
        const long = sanitizeSpokenText('x'.repeat(200), MAX_SPOKEN_TITLE_LENGTH);
        assert(Array.from(long).length === MAX_SPOKEN_TITLE_LENGTH && long.endsWith('…'), '8. Long titles are cut, marked with an ellipsis');
        assert(sanitizeSpokenText('   ', 60) === null && sanitizeSpokenText(42, 60) === null, '9. Nothing speakable is null');

        const bike = { kind: RESIDENT_FACT_KIND.VEHICLE, vehicleType: 'bicycle', distance: 82, direction: 'E' };
        assert(phraseFact(bike) === "There's a bicycle about 80 m to the east.", '10. A vehicle');
        assert(phraseFact({ kind: RESIDENT_FACT_KIND.ANIMAL, species: 'DEER', distance: 5, direction: 'N' }) === "There's a deer just a few steps away.", '11. An animal, close by');
        assert(phraseFact({ kind: RESIDENT_FACT_KIND.LANDMARK, title: 'Old Well', distance: 120, direction: 'SW' }) === 'The landmark “Old Well” is about 100 m to the south-west.', '12. A landmark');
        assert(phraseFact({ kind: RESIDENT_FACT_KIND.PERSON, displayName: 'Alice', distance: 30, direction: 'W' }) === 'Alice is about 30 m to the west.', '13. A person');
        const build = { kind: RESIDENT_FACT_KIND.BUILD, title: 'Hill Fort', author: 'bob', distance: 3100, direction: 'N' };
        assert(phraseFact(build) === 'There\'s a build called “Hill Fort” by bob, about 3.1 km to the north.', '14. Another build, with its author');
        assert(phraseFact({ ...build, author: '  ' }) === 'There\'s a build called “Hill Fort” about 3.1 km to the north.', '15. ...or without one when it has none');
        assert(phraseFact({ ...build, title: '' }) === null && phraseFact({ ...bike, vehicleType: 'none' }) === null, '16. Nothing speakable, no sentence');
        assert(phraseFact({ kind: RESIDENT_FACT_KIND.PLACE, name: 'Willow Village' }) === 'This is Willow Village.', '17. The place itself');

        const facts = [
            bike,
            { ...bike, vehicleType: 'car', distance: 20 },
            { kind: RESIDENT_FACT_KIND.ANIMAL, species: 'RABBIT', distance: 40, direction: 'S' },
            { kind: RESIDENT_FACT_KIND.LANDMARK, title: 'Old Well', distance: 300, direction: 'N' },
            build,
            { ...build, title: 'Mill', distance: 800, key: 'm' },
            { kind: RESIDENT_FACT_KIND.PLACE, name: 'Willow Village' }
        ];
        const first = composeResidentRemarks(facts, { turn: 0 });
        assert(first.length === 2, '18. A resident says two things: something nearby, and another build');
        assert(first[0] === "There's a car about 20 m to the east." && first[1].includes('“Mill”'),
            '19. First, the nearest nearby thing and the nearest other build');
        const turns = [0, 1, 2, 3].map((turn) => composeResidentRemarks(facts, { turn })[0]);
        assert(turns[0].includes('car') && turns[1].includes('rabbit') && turns[2].includes('Old Well') && turns[3] === 'This is Willow Village.',
            '20. Talking again moves on: each kind takes its turn, nearest kind first, the place last');
        assert(composeResidentRemarks(facts, { turn: 4 })[0].includes('bicycle'),
            '20b. ...and when a kind comes round again, it names its next-nearest thing');
        const single = [bike, { ...bike, vehicleType: 'car', distance: 20 }];
        assert(composeResidentRemarks(single, { turn: 0 })[0] !== composeResidentRemarks(single, { turn: 1 })[0],
            '20c. Even with only one kind around, talking again says something new');
        assert(composeResidentRemarks(facts, { turn: 1 })[1].includes('Hill Fort'), '21. ...and through the nearest few builds');
        assert(JSON.stringify(composeResidentRemarks(facts, { turn: 5 })) === JSON.stringify(composeResidentRemarks(facts, { turn: 5 })),
            '22. The same facts and turn always give the same words');
        const placeOnly = composeResidentRemarks([{ kind: RESIDENT_FACT_KIND.PLACE, name: 'Willow Village' }]);
        assert(placeOnly.length === 1 && placeOnly[0] === 'This is Willow Village.', '23. With nothing else nearby, it names the place');
        assert(JSON.stringify(composeResidentRemarks([])) === JSON.stringify([QUIET_REMARK]), '24. Knowing of nothing, it says so');
        for (let turn = 0; turn < 8; turn++) {
            for (const remark of composeResidentRemarks(facts, { turn })) {
                assert(!IMPERATIVE.test(remark), `25. A remark only says what exists, never what to do ("${remark}")`);
            }
        }
    }

    // -------------------------------------------------------------
    // Section B — what a resident knows
    // -------------------------------------------------------------
    const home = openHome();
    {
        const vehicles = new VehicleRuntimeInstances();
        vehicles.sync(SEED, home, RESIDENT_KNOWLEDGE_RADIUS.VEHICLE);
        const tracked = vehicles.instances;
        const stored = tracked[0];
        const moved = tracked[1];
        vehicles.discard(stored.id);
        vehicles.setPosition(moved.id, new Position(home.x, 0, home.z + 50));
        const animals = new AnimalRuntimeInstances();
        const wild = wildlifeInRegionAt(SEED, home.x - 100, home.z - 100, home.x + 100, home.z + 100, T)
            .filter((a) => Math.hypot(a.x - home.x, a.z - home.z) <= 100);
        if (wild.length > 0) animals.discard(wild[0].id, new Position(wild[0].x, 0, wild[0].z));
        animals.add(new AnimalPresence({ id: 'released-1', species: 'RABBIT', position: new Position(home.x - 10, 0, home.z) }));

        const facts = gatherResidentFacts({
            position: home, seed: SEED, timeSeconds: T,
            vehicleRuntime: vehicles, animalRuntime: animals,
            landmarks: [
                { id: 'l-near', title: 'Old Well', position: { x: home.x, z: home.z + 500 } },
                { id: 'l-far', title: 'Too Far', position: { x: home.x, z: home.z + 5000 } }
            ],
            people: [{ identityId: 'alice', displayName: 'Alice', position: { x: home.x - 30, z: home.z } }],
            builds: [
                { documentId: 'own', title: 'Home Village', author: 'me', position: { x: home.x + 5, z: home.z } },
                { documentId: 'fort', title: 'Hill Fort', author: 'bob', position: { x: home.x, z: home.z + 3000 } },
                { documentId: 'fort', title: 'Hill Fort', author: 'bob', position: { x: home.x, z: home.z + 3000 } },
                { documentId: 'moon', title: 'Moon', author: 'x', position: { x: home.x, z: home.z + 90000 } }
            ],
            excludedDocumentIds: ['own'],
            placeName: 'Willow Village'
        });
        const of = (kind) => facts.filter((f) => f.kind === kind);
        assert(!of(RESIDENT_FACT_KIND.VEHICLE).some((f) => f.key === stored.id), '26. A vehicle this session stored is never mentioned');
        const movedFact = of(RESIDENT_FACT_KIND.VEHICLE).find((f) => f.key === moved.id);
        assert(movedFact && Math.abs(movedFact.distance - 50) < 1e-9 && movedFact.direction === 'N', '27. A moved vehicle is where it is now (north is +Z)');
        const ridden = gatherResidentFacts({ position: home, seed: SEED, timeSeconds: T, vehicleRuntime: vehicles, mountedVehicleId: moved.id });
        assert(!ridden.some((f) => f.key === moved.id), '28. Nor is the vehicle you are riding');
        const riddenByOther = gatherResidentFacts({ position: home, seed: SEED, timeSeconds: T, vehicleRuntime: vehicles, riddenVehicleIds: [moved.id] });
        assert(!riddenByOther.some((f) => f.key === moved.id), '28b. Nor one someone else is riding');
        if (wild.length > 0) {
            assert(!of(RESIDENT_FACT_KIND.ANIMAL).some((f) => f.key === wild[0].id), '29. A caught animal is never mentioned');
        }
        assert(of(RESIDENT_FACT_KIND.ANIMAL).some((f) => f.key === 'released-1' && f.direction === 'W'), '30. A released one is');
        assert(of(RESIDENT_FACT_KIND.LANDMARK).map((f) => f.key).join() === 'l-near', '31. Landmarks within reach only');
        assert(of(RESIDENT_FACT_KIND.PERSON)[0].displayName === 'Alice', '32. People by their shown name');
        assert(of(RESIDENT_FACT_KIND.BUILD).map((f) => f.key).join() === 'fort',
            '33. Other builds: not its own World, not twice, not beyond hearing');
        assert(of(RESIDENT_FACT_KIND.PLACE)[0].name === 'Willow Village', '34. And the place it lives in');
        assert(facts.filter((f) => f.kind !== RESIDENT_FACT_KIND.PLACE).every((f) => Number.isFinite(f.distance)), '35. Every fact has a distance from the resident');
    }

    // -------------------------------------------------------------
    // Section C — WorldNavigationSession
    // -------------------------------------------------------------
    {
        const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
        identity.login('alice');
        const avatar = new AvatarPresenceSession({ avatarId: 'alice-avatar', ownerIdentity: 'alice' }, { position: new Position(home.x, 0, home.z) });
        const positions = { fort: { x: home.x, y: 0, z: home.z + 3000 }, 'w-home': { x: home.x - 10, y: 0, z: home.z - 10 } };
        const searched = [];
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null,
            worldLayoutProvider: { getPosition: (id) => positions[id] || null },
            searchWorldUseCase: {
                execute: (options) => {
                    searched.push(options);
                    return [
                        { id: 'pub-home', documentId: 'w-home', title: 'Home Village', author: 'alice' },
                        { id: 'pub-fort', documentId: 'fort', title: 'Hill Fort', author: 'bob' }
                    ];
                }
            },
            identityProvider: identity, avatarPresenceSession: avatar, wildlifeClock: () => T
        });
        const said = [];
        session._session = { onAnimationFrame: () => () => {}, showResidentSpeech: (id, remarks) => said.push({ id, remarks }) };
        session.setResidentSpeechTranslator(displayText);
        const world = new World({ id: 'w-home' });
        world.addWorldLandmark(new WorldLandmark({ id: 'l1', worldId: 'w-home', authorIdentityId: 'alice', title: 'Old Well', position: new Position(10, 0, 40) }));
        session._loadedDocuments.set('w-home', new Document({ world, metadata: new DocumentMetadata({ title: 'Home Village' }) }));
        session._registerCommandHistory('w-home', new CommandHistory({ world }));
        session._activeDocumentId = 'w-home';

        assert(session.talkToNearestResident() === null, '36. With nobody beside you, there is no one to talk to');
        assert(session.residentInteractionState().canTalk === false, '37. ...and T is not offered');
        const id = session.addResidentHere();
        assert(session.residentInteractionState().canTalk === true, '38. Beside a resident, T is offered');

        const first = session.talkToNearestResident();
        assert(first.residentId === id && first.remarks.length >= 1, '39. T talks to the resident beside you');
        assert(said.length === 1 && said[0].id === id && said[0].remarks === first.remarks, '40. ...and the renderer is handed its words');
        assert(first.remarks.some((r) => r.includes('Hill Fort') && r.includes('by bob') && r.includes('north')),
            '41. It mentions another build, with its author, and which way it is');
        assert(!first.remarks.some((r) => r.includes('Home Village')), '42. ...never its own World as "another build"');
        assert(searched[0].center && searched[0].radius === RESIDENT_KNOWLEDGE_RADIUS.BUILD, '43. Builds come from the location search around the resident');
        assert(session.lastResidentSpeech().residentId === id, '44. The last thing said is kept for screen readers');

        const heard = [first.remarks.join(' ')];
        for (let i = 0; i < 4; i++) heard.push(session.talkToNearestResident().remarks.join(' '));
        assert(new Set(heard).size > 1, '45. Talking again, it moves on to other things');

        said.length = 0;
        assert(session._processResidentTalkInput('T', 'keydown') === true && said.length === 1, '46. The T key talks');
        session._processResidentTalkInput('t', 'keydown');
        assert(said.length === 1, '47. ...once per press, however long it is held');
        const canEdit = session.canEditDocument;
        session.canEditDocument = () => false;
        let refused = null;
        try { session.addResidentHere(); } catch (e) { refused = e; }
        session.canEditDocument = canEdit;
        assert(refused && errorText(refused) === "You can't change this World." && refused.message.includes('not authorized'),
            '47b. A refused add reads as a message for the person, keeping the developer detail');
        session._processResidentTalkInput('t', 'keyup');
        assert(session._processResidentTalkInput('x', 'keydown') === false, '48. Other keys are not T');
        const residentsBefore = world.getResidents().length;
        session._processResidentTalkInput('t', 'keydown');
        assert(world.getResidents().length === residentsBefore, '49. Talking never changes the World');
    }

    // -------------------------------------------------------------
    // Section D — the bubble
    // -------------------------------------------------------------
    {
        assert(createSpeechBubble(['Hello.']) === null, '50. Without a canvas (no DOM), no bubble is drawn — and nothing breaks');
        const template = CoreAvatarTemplateLibrary.templates.find((t) => t.templateId === RESIDENT_TEMPLATE_ID);
        const made = [];
        const field = new ResidentFieldRenderer({
            appearanceFor: (rid) => ({ template, appearance: residentAppearanceFor(rid, template) }),
            speechBubbleFor: (remarks) => {
                const bubble = { object: new THREE.Object3D(), remarks, disposed: false, dispose() { this.disposed = true; } };
                made.push(bubble);
                return bubble;
            }
        });
        const pose = { id: 'r-1', x: 0, z: 0, rotationY: 0, moving: false, idleSeconds: 4, idleDuration: 8 };
        field.sync([pose], { x: 0, z: 2 });
        assert(field.say('nobody', ['Hi.']) === false && made.length === 0, '51. A resident not drawn says nothing');
        assert(field.say('r-1', ["There's a bicycle about 80 m to the east."]) === true, '52. say() shows a bubble');
        const bubbleObject = field.speechObject('r-1');
        assert(bubbleObject && bubbleObject.parent === field.getObject('r-1'), '53. ...over the resident');
        field.say('r-1', ['Something else.']);
        assert(made[0].disposed && !made[0].object.parent && field.speechObject('r-1') === made[1].object, '54. Saying something new replaces it');
        const seconds = speechSecondsFor(['Something else.']);
        field.tick(seconds - 0.5);
        assert(field.speechObject('r-1') !== null, '55. The bubble stays up long enough to read');
        field.tick(1);
        assert(field.speechObject('r-1') === null && made[1].disposed, '56. ...then goes by itself');
        field.say('r-1', ['Hello.']);
        field.sync([pose], { x: 0, z: 20 });
        assert(field.speechObject('r-1') === null && made[2].disposed, '57. Walk away and it stops talking');
        field.say('r-1', ['Hello.']);
        field.sync([]);
        assert(made[3].disposed, '58. A resident leaving view takes its bubble with it');
        assert(speechSecondsFor(['a']) >= 5 && speechSecondsFor(['word '.repeat(200)]) <= 14, '59. Bubbles last between 5 and 14 seconds');
    }

    // -------------------------------------------------------------
    // Section E — placed structures and Focus
    // -------------------------------------------------------------
    {
        const mill = { kind: RESIDENT_FACT_KIND.STRUCTURE, key: 'p1', title: 'Old Mill', author: 'carol', distance: 42, direction: 'N', position: { x: 1, z: 42 } };
        assert(phraseFact(mill) === '“Old Mill” by carol stands about 40 m to the north.', '60. A placed structure, by its author');
        assert(phraseFact({ ...mill, author: null }) === '“Old Mill” stands about 40 m to the north.', '61. ...or without one');
        assert(phraseFact({ ...mill, title: '\u0007 ' }) === null, '62. An unnamed structure is never spoken');
        const picked = pickResidentRemarkFacts([mill, { kind: RESIDENT_FACT_KIND.BUILD, key: 'b', title: 'Hill Fort', distance: 3000, direction: 'E', position: { x: 3000, z: 0 } }]);
        assert(picked.length === 2 && picked[0] === mill, '63. Structures take their turn among the nearby things');
        assert(JSON.stringify(composeResidentRemarks([mill])) === JSON.stringify(picked.slice(0, 1).map(phraseFact)), '64. The remarks are exactly the picked facts, spoken');

        const targets = focusTargetsFor([
            mill,
            { kind: RESIDENT_FACT_KIND.VEHICLE, vehicleType: 'bicycle', distance: 80, direction: 'E', position: { x: 80, z: 0 } },
            { kind: RESIDENT_FACT_KIND.LANDMARK, title: '  Old\nWell ', distance: 90, direction: 'S', position: { x: 0, z: -90 } },
            { kind: RESIDENT_FACT_KIND.BUILD, title: 'Hill Fort', distance: 3000, direction: 'E', position: { x: 3000, z: 0 } },
            { kind: RESIDENT_FACT_KIND.ANIMAL, species: 'DEER', distance: 20, direction: 'W', position: { x: -20, z: 0 } },
            { kind: RESIDENT_FACT_KIND.PERSON, displayName: 'Alice', distance: 20, direction: 'W', position: { x: -20, z: 0 } },
            { kind: RESIDENT_FACT_KIND.PLACE, name: 'Willow Village' },
            { kind: RESIDENT_FACT_KIND.LANDMARK, title: 'Nowhere', distance: 1, direction: 'N' }
        ]);
        assert(JSON.stringify(targets.map((t) => english(t.label))) === JSON.stringify(['Old Mill', 'bicycle', 'Old Well', 'Hill Fort']),
            '65. Focus is offered for what stays put — structures, vehicles, landmarks, builds — with plain labels');
        assert(!FOCUSABLE_FACT_KINDS.includes(RESIDENT_FACT_KIND.ANIMAL) && !FOCUSABLE_FACT_KINDS.includes(RESIDENT_FACT_KIND.PERSON),
            '66. ...never for animals or people, who move on, or anything without a position');
        assert(targets[0].position.x === 1 && targets[0].position.z === 42, '67. ...each with where it is');
        assert(coreSpeechSecondsFor === speechSecondsFor, '68. The bubble and the Focus buttons stay up for the same time');

        // The gatherer: structures within reach, and a position on every fact.
        const gathered = gatherResidentFacts({
            position: home, seed: SEED, timeSeconds: T,
            structures: [
                { id: 'near', title: 'Old Mill', author: 'carol', position: { x: home.x, z: home.z + 40 } },
                { id: 'far', title: 'Far Barn', author: null, position: { x: home.x, z: home.z + RESIDENT_KNOWLEDGE_RADIUS.STRUCTURE + 1 } }
            ]
        });
        const structureFacts = gathered.filter((f) => f.kind === RESIDENT_FACT_KIND.STRUCTURE);
        assert(structureFacts.length === 1 && structureFacts[0].title === 'Old Mill' && structureFacts[0].direction === 'N',
            '69. Placed structures within reach are known, with their direction');
        assert(gathered.every((f) => f.position && Number.isFinite(f.position.x)), '70. Every gathered fact says where the thing is');

        // The session: names structures by their document, never by a bare id.
        const identity = new LocalIdentityProvider(new InMemoryStorageProvider());
        identity.login('alice');
        const avatar = new AvatarPresenceSession({ avatarId: 'alice-avatar', ownerIdentity: 'alice' }, { position: new Position(home.x, 0, home.z) });
        const session = new WorldNavigationSession({
            registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null,
            worldLayoutProvider: { getPosition: () => null },
            publicationActionDiscoveryProvider: {
                findByDocumentId: (documentId) => (documentId === 'mill-doc' ? [{ id: 'pub-mill', documentId, title: 'Old Mill', author: 'carol' }] : [])
            },
            loadDocumentUseCase: { listSavedDocuments: () => [{ id: 'shed-doc', title: 'Tool Shed' }] },
            identityProvider: identity, avatarPresenceSession: avatar, wildlifeClock: () => T
        });
        session._session = { onAnimationFrame: () => () => {}, showResidentSpeech: () => true };
        session.setResidentSpeechTranslator(displayText);
        const world = new World({ id: 'w-village' });
        world.addStructurePlacement(new StructurePlacement({ id: 'p-mill', documentId: 'mill-doc', position: new Position(0, 0, 30) }));
        world.addStructurePlacement(new StructurePlacement({ id: 'p-shed', documentId: 'shed-doc', position: new Position(-25, 0, 0) }));
        world.addStructurePlacement(new StructurePlacement({ id: 'p-mystery', documentId: 'mystery-doc-id', position: new Position(5, 0, 5) }));
        session._loadedDocuments.set('w-village', new Document({ world, metadata: new DocumentMetadata({ title: 'Village' }) }));
        session._localPositions.set('w-village', { x: home.x, y: 0, z: home.z });
        session._registerCommandHistory('w-village', new CommandHistory({ world }));
        session._activeDocumentId = 'w-village';
        session.addResidentHere();

        const heard = [];
        const offered = [];
        for (let i = 0; i < 40; i++) {
            const speech = session.talkToNearestResident();
            heard.push(...speech.remarks);
            offered.push(...speech.focusTargets.map((t) => english(t.label)));
        }
        assert(heard.some((r) => r.startsWith('“Old Mill” by carol stands')), '71. A placed structure is named by its publication, with its author');
        assert(heard.some((r) => r.startsWith('“Tool Shed” stands')), '72. ...or by the title this device saved it under');
        assert(!heard.some((r) => r.includes('mystery-doc-id')), '73. A structure nobody named is never spoken as a bare id');
        assert(offered.includes('Old Mill'), '74. Focus is offered on a mentioned structure');

        let millSpeech = session.lastResidentSpeech();
        for (let i = 0; i < 40 && !millSpeech.focusTargets.some((t) => t.label === 'Old Mill'); i++) {
            millSpeech = session.talkToNearestResident();
        }
        assert(millSpeech.spokenAt > 0 && millSpeech.seconds === coreSpeechSecondsFor(millSpeech.remarks), '75. What was said carries when, and for how long');
        const focused = [];
        session.focusPosition = (position) => { focused.push(position); return true; };
        const index = millSpeech.focusTargets.findIndex((t) => t.label === 'Old Mill');
        const avatarBefore = { ...session.getAvatarPosition() };
        assert(session.focusResidentMention(index) === true, '76. Focus looks at what was mentioned');
        const mx = home.x;
        const mz = home.z + 30;
        assert(focused.length === 1 && Math.abs(focused[0].x - mx) < 1e-9 && Math.abs(focused[0].z - mz) < 1e-9
            && Math.abs(focused[0].y - terrainHeightAt(SEED, mx, mz)) < 1e-9,
            '77. ...through the camera-only focusPosition(), framed on the ground there');
        const avatarAfter = session.getAvatarPosition();
        assert(avatarAfter.x === avatarBefore.x && avatarAfter.z === avatarBefore.z, '78. The avatar stays where it is');
        assert(session.focusResidentMention(99) === false && focused.length === 1, '79. A Focus on nothing does nothing');
        assert(world.getStructurePlacements().length === 3 && world.getResidents().length === 1, '80. Talking and looking never change the World');
    }

    // -------------------------------------------------------------
    // Section F — in another language
    // -------------------------------------------------------------
    {
        const build = { kind: RESIDENT_FACT_KIND.BUILD, title: 'Hill Fort', author: 'bob', distance: 3240, direction: 'N' };
        const remark = ResidentTalk.phraseFact(build);
        assert(isMessage(remark) && remark.params.title === 'Hill Fort' && remark.params.author === 'bob',
            '81. A remark is a message; titles and names are parameters, never translated');
        const german = new Translator({
            locale: 'de',
            fallbackMessages: en,
            messages: {
                'resident.buildBy': '„{title}“ von {author} steht {where}.',
                'resident.where.north': '{distance} nördlich',
                'resident.distance.kilometers': 'etwa {kilometers} km'
            }
        });
        assert(german.translate(remark.key, remark.params) === '„Hill Fort“ von bob steht etwa 3,2 km nördlich.',
            '82. Each part is translated, and the distance is written the language\'s way');
        const bike = { kind: RESIDENT_FACT_KIND.VEHICLE, vehicleType: 'bicycle', distance: 80, direction: 'E', position: { x: 80, z: 0 } };
        const [target] = ResidentTalk.focusTargetsFor([bike]);
        assert(isMessage(target.label) && english(target.label) === 'bicycle', '83. A vehicle\'s Focus label is a message too');
    }

    console.log('✅ All Resident Talk tests passed.');
}

runTests();
