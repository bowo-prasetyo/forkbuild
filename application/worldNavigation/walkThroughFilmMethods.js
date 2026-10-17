import { findBuildEntrance } from '../../core/BuildEntrance.js';
import { CameraPerspective } from '../../core/CameraPerspective.js';
import { terrainHeightAt } from '../../core/TerrainHeightField.js';
import {
    EYES_FIELD_OF_VIEW, planWalkThrough, startWalkThrough, stepWalkThrough, estimateWalkThroughSeconds, WalkThroughCamera, WalkThroughPhase
} from '../../core/WalkThroughFilm.js';

// The key that walks the avatar ahead (application/avatar/AvatarMovementController.js).
const FORWARD_KEY = 'w';

// Filming a walk-through (core/WalkThroughFilm.js says what it shows): the
// avatar is put a few steps back from a build's door, and every render frame
// it is turned and walked ahead as the film says, through World View's own
// movement, so it bumps into what is there, the door swings open, its
// footsteps are heard and the camera follows it in: World View's third-person
// camera (indoors, core/IndoorView.js frames the room), or its first-person
// one, seeing through the avatar's eyes. A sweep round the outside, when
// asked for, comes first: the camera is moved round the build each frame
// while the avatar waits, with no perspective taking it over until the walk. The person's own movement keys do
// nothing until the film ends. ui/views/worldView/useWalkThroughFilm.js records
// what is drawn.
export const walkThroughFilmMethods = {
    // Whether `documentId`'s walk-through can be filmed now: its build is
    // loaded and there is an avatar on foot to walk it.
    canFilmWalkThrough(documentId) {
        return Boolean(documentId && this._loadedDocuments.has(documentId) && this._getWorldPosition(documentId)
            && this._avatarPresenceSession && this._avatarMovementController
            && !(typeof this.avatarVehicleMount === 'function' && this.avatarVehicleMount()));
    },

    // Starts filming `documentId`'s walk-through, seen from `camera`
    // (core/WalkThroughFilm.js's WalkThroughCamera), opening on a sweep round
    // the outside when `sweep` is set, framed for a video `aspect` (width /
    // height). Returns `{ kind, seconds }`
    // (a build entered by a door or walked up to, and about how long the film
    // runs), or null when it can't be filmed now (canFilmWalkThrough()).
    startWalkThroughFilm(documentId, { camera = WalkThroughCamera.BEHIND, sweep = false, aspect = 16 / 9 } = {}) {
        if (!this.canFilmWalkThrough(documentId)) {
            return null;
        }
        this.stopWalkThroughFilm();
        const document = this._loadedDocuments.get(documentId);
        const layout = this._getWorldPosition(documentId);
        const bricks = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) bricks.push(brick);
        }
        const plan = planWalkThrough(findBuildEntrance(bricks, this._registry), bricks, this._registry, { camera, sweep, aspect });
        if (!plan) {
            return null;
        }
        if (typeof this.releaseAvatarMovementKeys === 'function') {
            this.releaseAvatarMovementKeys();
        }
        // Presence heights are measured from the ground under the avatar.
        this._avatarPresenceSession.update({
            position: { x: layout.x + plan.start.x, y: layout.y + plan.start.y, z: layout.z + plan.start.z },
            rotation: { x: 0, y: plan.heading, z: 0 }
        });
        const film = {
            documentId,
            plan,
            layout,
            state: startWalkThrough(plan),
            perspectiveForWalk: camera === WalkThroughCamera.EYES ? CameraPerspective.FIRST_PERSON : CameraPerspective.THIRD_PERSON,
            // Through its eyes, the walk has a wide lens (core/WalkThroughFilm.js),
            // and the camera's own comes back after; null when the render
            // facade can't change it.
            fovForWalk: camera === WalkThroughCamera.EYES ? EYES_FIELD_OF_VIEW : null,
            fov: typeof this._session?.getCameraFov === 'function' ? this._session.getCameraFov() : null,
            // The camera, unlike the avatar, is in drawn coordinates: the
            // build stands on the ground at its own origin (as arrivalMethods).
            ground: terrainHeightAt(this.getWorldSeed(), layout.x, layout.z),
            walking: false,
            endCard: 0,
            perspective: typeof this.getCameraPerspective === 'function' ? this.getCameraPerspective() : null,
            unsubscribe: null
        };
        this._walkThroughFilm = film;
        // During a sweep the film moves the camera itself.
        if (plan.sweep) this.setCameraPerspective(null);
        else this._seeWalkThroughWalk(film);
        film.unsubscribe = this.onRenderFrame((deltaSeconds) => this._stepWalkThroughFilm(deltaSeconds));
        return Object.freeze({ kind: plan.kind, seconds: estimateWalkThroughSeconds(plan) });
    },

    // The film under way, or null: `{ phase, seconds, endCard, done }`.
    walkThroughFilmState() {
        const film = this._walkThroughFilm;
        if (!film) {
            return null;
        }
        return Object.freeze({
            phase: film.state.phase,
            seconds: film.state.time,
            endCard: film.endCard,
            done: film.state.phase === WalkThroughPhase.DONE
        });
    },

    // Whether a film is under way, so the person's movement keys wait.
    isFilmingWalkThrough() {
        return Boolean(this._walkThroughFilm);
    },

    // Ends the film: the avatar stops where it is and the camera goes back to
    // the perspective it had.
    stopWalkThroughFilm() {
        const film = this._walkThroughFilm;
        if (!film) {
            return;
        }
        this._walkThroughFilm = null;
        if (typeof film.unsubscribe === 'function') film.unsubscribe();
        if (film.walking && this._avatarMovementController) this._avatarMovementController.keyUp(FORWARD_KEY);
        this.setCameraPerspective(film.perspective ?? null);
        if (film.fov !== null && typeof this._session?.setCameraFov === 'function') this._session.setCameraFov(film.fov);
    },

    // The walk seen from the camera asked for, with its lens.
    _seeWalkThroughWalk(film) {
        this.setCameraPerspective(film.perspectiveForWalk);
        if (film.fovForWalk !== null && film.fov !== null && typeof this._session?.setCameraFov === 'function') {
            this._session.setCameraFov(film.fovForWalk);
        }
    },

    // One render frame of the film: turn the avatar and walk it ahead or stop
    // it, as core/WalkThroughFilm.js says.
    _stepWalkThroughFilm(deltaSeconds) {
        const film = this._walkThroughFilm;
        if (!film || !this._avatarPresenceSession) {
            return;
        }
        const current = this._avatarPresenceSession.current;
        const position = current.position;
        const heading = current.rotation ? current.rotation.y || 0 : 0;
        const step = stepWalkThrough(film.plan, film.state, {
            position: { x: position.x - film.layout.x, z: position.z - film.layout.z },
            heading,
            deltaSeconds
        });
        film.state = step.state;
        film.endCard = step.endCard;
        // The film frames the camera: no glide to somewhere else (an arrival's,
        // or a focus asked for as the build loaded) takes it away, and while
        // the avatar stands still at the start, nothing else would frame it.
        this._activeCameraFocus = null;
        if (step.camera) {
            if (this._spatialCameraController) {
                const drawn = (point) => ({ x: point.x + film.layout.x, y: point.y + film.layout.y + film.ground, z: point.z + film.layout.z });
                this._spatialCameraController.applyFraming({ position: drawn(step.camera.position), target: drawn(step.camera.target) });
            }
        } else if (this.getCameraPerspective() !== film.perspectiveForWalk) {
            // The sweep is over: the walk is seen from the camera asked for.
            this._seeWalkThroughWalk(film);
        }
        if (step.state.phase === WalkThroughPhase.OPENING && typeof this._applyCameraPerspectiveFraming === 'function') {
            this._applyCameraPerspectiveFraming(position, step.heading);
        }
        if (Math.abs(step.heading - heading) > 1e-3) {
            this._avatarPresenceSession.update({ rotation: { x: 0, y: step.heading, z: 0 } });
        }
        if (step.walking !== film.walking && this._avatarMovementController) {
            if (step.walking) this._avatarMovementController.keyDown(FORWARD_KEY);
            else this._avatarMovementController.keyUp(FORWARD_KEY);
            film.walking = step.walking;
        }
    }
};
