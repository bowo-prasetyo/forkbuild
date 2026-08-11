# Capability Matrix

This document is the normative reference for editing capability parity
between Editor View and World View.

## Shared Editing Surface

| Action                    | Editor | World | Published |
|---------------------------|--------|-------|-----------|
| select                    | ✓      | ✓     | ✓         |
| marquee                   | ✓      | ✓     | –         |
| move                      | ✓      | ✓     | –         |
| rotate                    | ✓      | ✓     | –         |
| numeric transform         | ✓      | ✓     | –         |
| group                     | ✓      | ✓     | –         |
| ungroup                   | ✓      | ✓     | –         |
| copy                      | ✓      | ✓     | –         |
| paste                     | ✓      | ✓     | –         |
| delete                    | ✓      | ✓     | –         |
| align                     | ✓      | ✓     | –         |
| distribute                | ✓      | ✓     | –         |
| undo                      | ✓      | ✓     | –         |
| redo                      | ✓      | ✓     | –         |
| save                      | ✓      | ✓     | –         |
| publish                   | ✓      | ✓     | –         |
| navigation                | ✓      | ✓     | ✓         |
| placement                 | ✓      | ✓     | –         |

## Surface-Specific Capabilities

### Editor View
- Document management (new, load, save, publish)
- Full sidebar with all panels
- Toolbar with save/publish/new

### World View
- Spatial navigation and streaming
- Placement mode
- Timeline / preview / restore
- Camera controls
- Compact editing overlay

### Published World
- Read-only navigation
- Selection (for inspection)
- No editing operations

## Architectural Invariant

Every mutable document operation supported by Editor View is available
through the same action/command pathway in World View, subject only to
explicitly documented presentation or navigation constraints.

The action registry is the authoritative capability vocabulary. Neither
view decides independently whether an operation exists.
