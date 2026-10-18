// World View's day and night (core/DayCycle.js): the sky follows the session's
// clock, the same wall-clock time wildlife wanders by, so everyone at a build
// sees the same sky without exchanging anything. "Always day" is this device's
// own choice (application/settings/WorldViewSkyStore.js) and changes nothing
// for anyone else. The weather (core/Weather.js) and its storms
// (core/Storms.js) follow the same clock, and Always day keeps it fair as
// well. So do the seasons (core/Season.js), unless this device keeps one
// (application/settings/WorldViewSeasonStore.js): then the land stays in it,
// and the world's weather falls as that season's rain or snow. The season
// also sets the sun's path and how long the day is (core/DayCycle.js's
// seasonalSky()). The lakes freeze on the world's clock alone
// (core/Season.js#lakeIceAt()), since the ice is walked on. Footprints in
// the snow (core/Footprints.js) are this device's own.
import { DAY, DAY_SKY_BODIES, moonPhaseAt, moonlitLook, skyBodiesAt, skyLookAt } from '../../core/DayCycle.js';
import { fairWeatherIn, overcastLook, weatherAt, weatherInSeason } from '../../core/Weather.js';
import { SEASON, lakeIceAt, seasonLookAt, seasonLookOf } from '../../core/Season.js';
import { advanceFootprints, createFootprintState } from '../../core/Footprints.js';
import { lightningAt, lightningLook, thunderBetween } from '../../core/Storms.js';

export const dayCycleMethods = {
    // The sky's look right now, lit by the night's moon
    // (core/DayCycle.js#moonlitLook()), greyed as far as the weather is
    // overcast and lit by any flash of lightning (core/Storms.js), unless
    // this device asks for no flashes: core/DayCycle.js's DAY while Always
    // day is on.
    skyLook() {
        if (this._alwaysDay) return DAY;
        const now = this._wildlifeClock();
        const sky = this.season().sky;
        const look = overcastLook(moonlitLook(skyLookAt(now, sky), moonPhaseAt(now, sky)), weatherAt(now).overcast);
        return this._noFlashes ? look : lightningLook(look, lightningAt(now));
    },

    // Keeps lightning from flashing on this device (it asks for reduced
    // motion): the storm's thunder is still heard.
    setNoFlashes(noFlashes) {
        this._noFlashes = noFlashes === true;
    },

    // The world's clock the weather follows, in seconds.
    weatherClock() {
        return this._wildlifeClock();
    },

    // The thunder heard after `from` and up to `to` on that clock
    // (core/Storms.js#thunderBetween()): none while Always day is on.
    thunderBetween(from, to) {
        return this._alwaysDay ? [] : thunderBetween(from, to);
    },

    // The weather right now (core/Weather.js): fair while Always day is on,
    // over whatever snow the season brings; in the season this device keeps,
    // if it keeps one.
    weather() {
        if (this._alwaysDay) return fairWeatherIn(this.season());
        const weather = weatherAt(this._wildlifeClock());
        return this._keptSeason ? weatherInSeason(weather, this.season()) : weather;
    },

    // The season's look on the land right now (core/Season.js): the
    // world's, or the middle of the one this device keeps.
    season() {
        return this._keptSeason ? seasonLookOf(this._keptSeason) : seasonLookAt(this._wildlifeClock());
    },

    // The season this device keeps (core/Season.js's SEASON), or null when it
    // follows the world's year.
    keptSeason() {
        return this._keptSeason;
    },

    setKeptSeason(season) {
        this._keptSeason = SEASON[season] ? season : null;
        this._applySkyLook();
        return this._keptSeason;
    },

    // Where the sun and the moon are right now, the moon's phase, and where
    // the light comes from: a still morning sun while Always day is on.
    skyBodies() {
        return this._alwaysDay ? DAY_SKY_BODIES : skyBodiesAt(this._wildlifeClock(), this.season().sky);
    },

    // How much ice lies on the lakes now, 0 to 1: the world's, whatever this
    // device shows (core/Season.js#lakeIceAt()).
    lakeIce() {
        return lakeIceAt(this._wildlifeClock());
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

    // Whether nearby trees are drawn with every branch and leaf: this
    // device's choice (application/settings/WorldViewTreeDetailStore.js).
    areDetailedTreesOn() {
        return this._detailedTreesOn === true;
    },

    setDetailedTreesOn(on) {
        this._detailedTreesOn = on === true;
        this._applyTreeDetail();
        return this._detailedTreesOn;
    },

    // Absent when the render facade can't change its sky.
    _setupDayCycle() {
        if (!this._session || typeof this._session.setSkyLook !== 'function' || typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._applyShadows();
        this._applyTreeDetail();
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
        // One that can't show the seasons keeps its summer.
        if (this._session && typeof this._session.setSeason === 'function') {
            this._session.setSeason(this.season());
        }
        if (this._session && typeof this._session.setLakeIce === 'function') {
            this._session.setLakeIce(this.lakeIce());
        }
        this._stepFootprints();
    },

    // Footprints behind the local avatar while it walks in snow, pressed in
    // and faded on this screen only.
    _stepFootprints() {
        if (!this._session || typeof this._session.addFootprints !== 'function') return;
        const now = this._wildlifeClock();
        const observation = typeof this.avatarSoundObservation === 'function' ? this.avatarSoundObservation() : null;
        const { state, prints } = advanceFootprints(this._footprintState || createFootprintState(), observation && {
            ...observation,
            sheltered: typeof this.isSheltered === 'function' && this.isSheltered()
        }, now);
        this._footprintState = state;
        if (prints.length > 0) this._session.addFootprints(prints);
        if (typeof this._session.updateFootprints === 'function') this._session.updateFootprints(now);
    },

    // A render facade that can't draw shadows draws none.
    _applyShadows() {
        if (this._session && typeof this._session.setShadowsEnabled === 'function') {
            this._session.setShadowsEnabled(this._shadowsOn === true);
        }
    },

    _applyTreeDetail() {
        if (typeof this._detailedTreesOn === 'boolean' && this._session && typeof this._session.setTreesDetailed === 'function') {
            this._session.setTreesDetailed(this._detailedTreesOn);
        }
    }
};
