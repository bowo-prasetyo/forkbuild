// What the avatar's vehicle and animal actions look like on screen, shared by
// the keyboard prompts (VehicleInteractionPrompt, AnimalInteractionPrompt) and
// the touch pad (TouchMovementPad), so both show the same actions under the
// same conditions. Each function only formats a state the session already
// resolved; none decides eligibility.

const VEHICLE_TYPE_LABEL = Object.freeze({
    bicycle: 'Bicycle',
    motorcycle: 'Motorcycle',
    car: 'Car',
    drone: 'Drone'
});

const ANIMAL_SPECIES_LABEL = Object.freeze({
    DEER: 'Deer',
    RABBIT: 'Rabbit'
});

export function vehicleTypeLabel(type) {
    return VEHICLE_TYPE_LABEL[type] || 'Vehicle';
}

export function animalSpeciesLabel(species) {
    return ANIMAL_SPECIES_LABEL[species] || 'Animal';
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
    'not-on-ground': 'Residents live on the ground: step down to add one.',
    riding: 'Get off your vehicle to add a resident.',
    water: 'Residents stay on dry land: move out of the water to add one.'
});

export function residentRefusalLabel(refusal) {
    return RESIDENT_REFUSAL_LABEL[refusal] || '';
}
