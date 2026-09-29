// What an avatar is riding, as other players are told: its own message on
// its own channel (`forkbuild:avatar-vehicle`), never a field of presence,
// because presence's signature covers a fixed list of fields and a new one
// would make older clients reject every rider's presence; see
// docs/Principles.md, "Appearance And Position Are Different Lifecycles,
// Never One Message." Sent when the avatar gets on or off, and again with the
// presence heartbeat so a player who joins later learns it.
//
//   { avatarId, ownerIdentity, riding, vehicleId, vehicleType, sequence, signature? }
//
// `riding` false carries no vehicle. Where the avatar is stays presence's
// business; this only says what it sits on.
import { SignatureType } from './Signature.js';
import { VehicleType } from './VehicleType.js';

// The types a rider can be seen on: every one that moves.
export const RIDEABLE_VEHICLE_TYPES = Object.freeze([
    VehicleType.BICYCLE, VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.DRONE
]);

const MAX_VEHICLE_ID_LENGTH = 200;

export function toAvatarVehicleAdvertisement({ avatarId, ownerIdentity, vehicleId = null, vehicleType = null, sequence }) {
    const riding = typeof vehicleType === 'string' && RIDEABLE_VEHICLE_TYPES.includes(vehicleType);
    return {
        avatarId,
        ownerIdentity,
        riding,
        vehicleId: riding ? vehicleId : null,
        vehicleType: riding ? vehicleType : null,
        sequence
    };
}

export function isValidAvatarVehicleAdvertisement(value) {
    if (!value || typeof value !== 'object'
        || typeof value.avatarId !== 'string' || value.avatarId.length === 0
        || typeof value.riding !== 'boolean'
        || !Number.isFinite(value.sequence)) {
        return false;
    }
    if (!value.riding) {
        return value.vehicleId === null && value.vehicleType === null;
    }
    return RIDEABLE_VEHICLE_TYPES.includes(value.vehicleType)
        && typeof value.vehicleId === 'string'
        && value.vehicleId.length > 0 && value.vehicleId.length <= MAX_VEHICLE_ID_LENGTH;
}

export function getAvatarVehicleSigningDescriptor(advertisement) {
    return {
        type: SignatureType.AVATAR_VEHICLE,
        id: advertisement.avatarId,
        revision: advertisement.sequence,
        payload: {
            avatarId: advertisement.avatarId,
            ownerIdentity: advertisement.ownerIdentity,
            riding: advertisement.riding,
            vehicleId: advertisement.vehicleId,
            vehicleType: advertisement.vehicleType,
            sequence: advertisement.sequence
        }
    };
}
