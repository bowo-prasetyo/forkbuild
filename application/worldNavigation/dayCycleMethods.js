// World View's day and night (core/DayCycle.js): the sky follows the session's
// clock, the same wall-clock time wildlife wanders by, so everyone at a build
// sees the same sky without exchanging anything. "Always day" is this device's
// own choice (application/settings/WorldViewSkyStore.js) and changes nothing
// for anyone else. The weather (core/Weather.js) follows the same clock, and
// Always day keeps it fair as well.
import { DAY, DAY_SKY_BODIES, skyBodiesAt, skyLookAt } from '../../core/DayCycle.js';
import { FAIR_WEATHER, overcastLook, weatherAt } from '../../core/Weather.js';

export const dayCycleMethods = {
    // The sky's look right now, greyed as far as the weather is overcast:
    // core/DayCycle.js's DAY while Always day is on.
    skyLook() {
        if (this._alwaysDay) return DAY;
        const now = this._wildlifeClock();
        return overcastLook(skyLookAt(now), weatherAt(now).overcast);
    },

    // The weather right now (core/Weather.js): fair while Always day is on.
    weather() {
        return this._alwaysDay ? FAIR_WEATHER : weatherAt(this._wildlifeClock());
    },

    // Where the sun and the moon are right now, and where the light comes
    // from: a still morning sun while Always day is on.
    skyBodies() {
        return this._alwaysDay ? DAY_SKY_BODIES : skyBodiesAt(this._wildlifeClock());
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

    // Whether the sun and the moon cast shadows here: this device's choice
    // (application/settings/WorldViewShadowStore.js), off until it is given.
    areShadowsOn() {
        return this._shadowsOn === true;
    },

    setShadowsOn(on) {
        this._shadowsOn = on === true;
        this._applyShadows();
        return this._shadowsOn;
    },

    // Absent when the render facade can't change its sky.
    _setupDayCycle() {
        if (!this._session || typeof this._session.setSkyLook !== 'function' || typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._applyShadows();
        this._applySkyLook();
        this._dayCycleFrameSubscription = this._session.onAnimationFrame(() => this._applySkyLook());
    },

    _applySkyLook() {
        if (this._session && typeof this._session.setSkyLook === 'function') {
            this._session.setSkyLook(this.skyLook());
        }
        // A render facade that can't draw them keeps its light where it is.
        if (this._session && typeof this._session.setSkyBodies === 'function') {
            this._session.setSkyBodies(this.skyBodies());
        }
        // A render facade that can't draw clouds draws none.
        if (this._session && typeof this._session.setWeather === 'function') {
            this._session.setWeather(this.weather());
        }
    },

    // A render facade that can't draw shadows draws none.
    _applyShadows() {
        if (this._session && typeof this._session.setShadowsEnabled === 'function') {
            this._session.setShadowsEnabled(this._shadowsOn === true);
        }
    }
};
