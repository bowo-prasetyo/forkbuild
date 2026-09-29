// What the avatar's vehicle and animal actions look like on screen, shared by
// the keyboard prompts (VehicleInteractionPrompt, AnimalInteractionPrompt) and
// the touch pad (TouchMovementPad), so both show the same actions under the
// same conditions. Each function only formats a state the session already
// resolved; none decides eligibility.
import { t } from '../i18n/i18n.js';

const VEHICLE_TYPE_LABEL = Object.freeze({
    bicycle: 'vehicle.bicycle',
    motorcycle: 'vehicle.motorcycle',
    car: 'vehicle.car',
    drone: 'vehicle.drone'
});

const ANIMAL_SPECIES_LABEL = Object.freeze({
    DEER: 'animal.deer',
    RABBIT: 'animal.rabbit'
});

export function vehicleTypeLabel(type) {
    return t(VEHICLE_TYPE_LABEL[type] || 'vehicle.other');
}

export function animalSpeciesLabel(species) {
    return t(ANIMAL_SPECIES_LABEL[species] || 'animal.other');
}

// `state` is WorldNavigationSession#avatarStoreInteractionState():
// { canStore, canDeploy, vehicleType, carriedCount, selectedIndex }.
// `position` ("2/3") is set only when there is more than one to choose from,
// which is also when `canCycle` lets `[`/`]` change the one Deploy would use.
export function describeVehicleStoreAction(state) {
    if (!state || !(state.canStore || state.canDeploy)) {
        return null;
    }
    if (state.canStore) {
        return Object.freeze({ action: 'store', vehicleLabel: vehicleTypeLabel(state.vehicleType), position: null, canCycle: false });
    }
    const canCycle = state.carriedCount > 1;
    return Object.freeze({
        action: 'deploy',
        vehicleLabel: vehicleTypeLabel(state.vehicleType),
        position: canCycle ? `${state.selectedIndex}/${state.carriedCount}` : null,
        canCycle
    });
}

// `state` is WorldNavigationSession#animalDecorationInteractionState():
// { canDecorate, canUndecorate, species, ... }. Decorating wins when both
// apply, as the session's own 'G' does.
export function describeAnimalDecorationAction(state) {
    if (!state || !(state.canDecorate || state.canUndecorate)) {
        return null;
    }
    return Object.freeze({
        action: state.canDecorate ? 'decorate' : 'undecorate',
        speciesLabel: animalSpeciesLabel(state.species)
    });
}

// Why a World Resident can't be added where the avatar stands, keyed by
// application/worldNavigation/residentMethods.js#RESIDENT_REFUSAL's values.
const RESIDENT_REFUSAL_LABEL = Object.freeze({
    'not-on-ground': 'residentRefusal.notOnGround',
    riding: 'residentRefusal.riding',
    water: 'residentRefusal.water'
});

export function residentRefusalLabel(refusal) {
    return RESIDENT_REFUSAL_LABEL[refusal] ? t(RESIDENT_REFUSAL_LABEL[refusal]) : '';
}
