// renderer/RemoteRiderVehicles.js: the vehicle drawn under another player
// while they ride.
import { RemoteRiderVehicles } from '../renderer/RemoteRiderVehicles.js';
import { assert } from './support/Assert.js';

const vehicles = new RemoteRiderVehicles();

// Getting on adds a vehicle to the scene; the same again changes nothing;
// another type swaps it; getting off removes it.
{
    const on = vehicles.setRiding('bob', 'bicycle');
    assert(on.added && on.removed === null && vehicles.isRiding('bob'), 'getting on adds a vehicle');
    const again = vehicles.setRiding('bob', 'bicycle');
    assert(again.added === null && again.removed === null, 'the same vehicle again changes nothing');
    const swap = vehicles.setRiding('bob', 'car');
    assert(swap.added && swap.removed === on.added, 'another vehicle replaces the first');
    const off = vehicles.setRiding('bob', null);
    assert(off.added === null && off.removed === swap.added && !vehicles.isRiding('bob'), 'getting off removes it');
    assert(vehicles.setRiding('bob', 'none').added === null && !vehicles.isRiding('bob'), 'a type with no visual draws nothing');
    console.log('✓ getting on, changing and getting off');
}

// It sits where the rider is and faces the rider's facing, which is the
// vehicle's own: reversing or sliding sideways never turns it.
{
    const { added } = vehicles.setRiding('carol', 'motorcycle');
    vehicles.place('carol', { x: 0, y: 3, z: 0 }, 90);
    assert(added.position.x === 0 && added.position.y === 3, 'at the rider, height included');
    assert(vehicles.headingOf('carol') === 90, 'it faces the rider');
    vehicles.place('carol', { x: -2, y: 3, z: 0 }, 90);
    assert(vehicles.headingOf('carol') === 90, 'reversing (moving along -X while facing +X) does not turn it around');
    vehicles.place('carol', { x: -2, y: 3, z: 2 }, 90);
    assert(vehicles.headingOf('carol') === 90, 'sliding sideways does not turn it');
    vehicles.place('carol', { x: -2, y: 3, z: 4 }, 0);
    assert(vehicles.headingOf('carol') === 0, 'it turns when the rider turns');
    vehicles.place('carol', { x: -2, y: 3, z: 4 }, NaN);
    assert(vehicles.headingOf('carol') === 0, 'a missing facing keeps the last one');
    assert(vehicles.roots().length === 1, 'one vehicle per riding player');
    assert(vehicles.remove('carol') === added && vehicles.remove('carol') === null, 'removing returns it once');
    console.log('✓ placed at the rider, facing the way the rider faces');
}

vehicles.setRiding('dave', 'drone');
vehicles.dispose();
assert(vehicles.roots().length === 0 && !vehicles.isRiding('dave'), 'dispose() clears everything');
console.log('✓ dispose');
