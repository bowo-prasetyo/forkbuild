import { findBuildEntrance } from '../../core/BuildEntrance.js';
import { CameraPerspective } from '../../core/CameraPerspective.js';
import { planWalkThrough, startWalkThrough, stepWalkThrough, estimateWalkThroughSeconds, WalkThroughPhase } from '../../core/WalkThroughFilm.js';

// The key that walks the avatar ahead (application/avatar/AvatarMovementController.js).
const FORWARD_KEY = 'w';

// Filming a walk-through (core/WalkThroughFilm.js says what it shows): the
// avatar is put a few steps back from a build's door, and every render frame
// it is turned and walked ahead as the film says, through World View's own
// movement, so it bumps into what is there, the door swings open, its
// footsteps are heard and the third-person camera follows it in (indoors,
// core/IndoorView.js frames the room). The person's own movement keys do
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

    // Starts filming `documentId`'s walk-through. Returns `{ kind, seconds }`
    // (a build entered by a door or walked up to, and about how long the film
    // runs), or null when it can't be filmed now (canFilmWalkThrough()).
    startWalkThroughFilm(documentId) {
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
        const plan = planWalkThrough(findBuildEntrance(bricks, this._registry), bricks, this._registry);
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
            state: startWalkThrough(),
            walking: false,
            endCard: 0,
            perspective: typeof this.getCameraPerspective === 'function' ? this.getCameraPerspective() : null,
            unsubscribe: null
        };
        this._walkThroughFilm = film;
        this.setCameraPerspective(CameraPerspective.THIRD_PERSON);
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
