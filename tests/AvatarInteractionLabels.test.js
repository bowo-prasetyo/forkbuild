import {
    describeAnimalDecorationAction, describeVehicleStoreAction, animalSpeciesLabel, vehicleTypeLabel
} from '../ui/components/avatarInteractionLabels.js';
import { assert } from './support/Assert.js';

// 1. Store/Deploy: nothing to show, store, deploy one, deploy one of several.
{
    assert(describeVehicleStoreAction(null) === null, 'no state shows nothing');
    assert(describeVehicleStoreAction({ canStore: false, canDeploy: false, vehicleType: 'none', carriedCount: 0, selectedIndex: null }) === null,
        'nothing to store or deploy shows nothing');

    const store = describeVehicleStoreAction({ canStore: true, canDeploy: false, vehicleType: 'car', carriedCount: 3, selectedIndex: null });
    assert(store.action === 'store' && store.vehicleLabel === 'Car', 'riding a car offers Store');
    assert(store.canCycle === false && store.position === null, 'cycling is never offered while riding');

    const single = describeVehicleStoreAction({ canStore: false, canDeploy: true, vehicleType: 'bicycle', carriedCount: 1, selectedIndex: 1 });
    assert(single.action === 'deploy' && single.vehicleLabel === 'Bicycle', 'one carried vehicle offers Deploy');
    assert(single.canCycle === false && single.position === null, 'with one vehicle there is nothing to cycle through');

    const several = describeVehicleStoreAction({ canStore: false, canDeploy: true, vehicleType: 'drone', carriedCount: 3, selectedIndex: 2 });
    assert(several.canCycle === true && several.position === '2/3', 'with three carried, cycling is offered and the position shown');
    assert(several.vehicleLabel === 'Drone', 'the selected vehicle is named');
    console.log('✓ store and deploy');
}

// 2. Decoration: decorate wins when both apply, as 'G' does.
{
    assert(describeAnimalDecorationAction(null) === null, 'no state shows nothing');
    assert(describeAnimalDecorationAction({ canDecorate: false, canUndecorate: false, species: null }) === null,
        'nothing nearby shows nothing');
    const decorate = describeAnimalDecorationAction({ canDecorate: true, canUndecorate: false, species: 'RABBIT' });
    assert(decorate.action === 'decorate' && decorate.speciesLabel === 'Rabbit', 'a released rabbit nearby offers Decorate');
    const undo = describeAnimalDecorationAction({ canDecorate: false, canUndecorate: true, species: 'DEER' });
    assert(undo.action === 'undecorate' && undo.speciesLabel === 'Deer', 'a deer decoration nearby offers Undo');
    const both = describeAnimalDecorationAction({ canDecorate: true, canUndecorate: true, species: 'DEER' });
    assert(both.action === 'decorate', 'decorating wins a tie');
    console.log('✓ decoration');
}

// 3. Unknown kinds fall back to a generic name.
{
    assert(vehicleTypeLabel('hovercraft') === 'Vehicle', 'unknown vehicle type');
    assert(animalSpeciesLabel('FOX') === 'Animal', 'unknown species');
    console.log('✓ fallback labels');
}
