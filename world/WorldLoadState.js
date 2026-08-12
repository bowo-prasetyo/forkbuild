// Runtime lifecycle states for a streamed world placement.
// This is explicitly runtime state — it never enters the ForkBuild
// Protocol, never serializes, and never travels over the network.
export const WorldLoadState = Object.freeze({
    DISCOVERED: 'DISCOVERED', // Metadata only, outside load radius but inside unload
    LOADING: 'LOADING',       // Resolving content
    LOADED: 'LOADED',         // Session active, renderer can draw
    FAILED: 'FAILED',         // Content resolution failed (corrupt, missing)
    UNLOADED: 'UNLOADED'      // Removed from runtime memory
});
