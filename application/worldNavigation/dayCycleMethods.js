// World View's day and night (core/DayCycle.js): the sky follows the session's
// clock, the same wall-clock time wildlife wanders by, so everyone at a build
// sees the same sky without exchanging anything. "Always day" is this device's
// own choice (application/settings/WorldViewSkyStore.js) and changes nothing
// for anyone else.
import { DAY, skyLookAt } from '../../core/DayCycle.js';

export const dayCycleMethods = {
    // The sky's look right now: core/DayCycle.js's DAY while Always day is on.
    skyLook() {
        return this._alwaysDay ? DAY : skyLookAt(this._wildlifeClock());
    },

    // How deep into the night the world is, from 0 (day) to 1 (night): how
    // strongly lamps shine, and what World View's sound fades birds and
    // crickets by.
    nightLevel() {
        return this.skyLook().glow;
    },

    isAlwaysDay() {
        return this._alwaysDay === true;
    },

    setAlwaysDay(alwaysDay) {
        this._alwaysDay = alwaysDay === true;
        this._applySkyLook();
        return this._alwaysDay;
    },

    // Absent when the render facade can't change its sky.
    _setupDayCycle() {
        if (!this._session || typeof this._session.setSkyLook !== 'function' || typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._applySkyLook();
        this._dayCycleFrameSubscription = this._session.onAnimationFrame(() => this._applySkyLook());
    },

    _applySkyLook() {
        if (this._session && typeof this._session.setSkyLook === 'function') {
            this._session.setSkyLook(this.skyLook());
        }
    }
};
