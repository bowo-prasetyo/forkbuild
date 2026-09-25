// The document envelope schema version — versioned independently from
// the protocol version (metadata.protocolVersion) and the engine version.
//
// protocolVersion tracks the DOMAIN MODEL: what fields exist on Brick,
// Group, World, what commands are valid, what the ForkBuild Protocol
// guarantees.
//
// schemaVersion tracks the SERIALIZATION ENVELOPE: the structure of the
// JSON that wraps the domain. Adding a field to the envelope (like this
// one) increments schemaVersion without necessarily changing the protocol.
//
// Migration between schema versions happens in
// serializer/DocumentSchemaMigrator.js, BEFORE the JSON enters the
// domain. Domain classes never see old-format envelopes.
//
// Schema 2 stores each building's bricks as a table (core/BrickTable.js)
// instead of one object per brick.
export const DOCUMENT_SCHEMA_VERSION = 2;
