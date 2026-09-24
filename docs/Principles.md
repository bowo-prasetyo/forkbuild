# Principles

The design rules the code keeps, grouped by theme. Each rule is stated
in a few lines and links to the full text it was written as, in the
history files below.

A rule a later milestone changed is stated as it applies today. Rules
that no longer apply are listed at the end of their theme file under
"Changed or superseded".

## Rules by theme

| Theme | Rules |
|---|---|
| [Foundations (0.1.x to 0.2.16)](principles/foundations.md) | the short, early rules |
| [Trust, signatures and authorization](principles/trust.md) | 7 |
| [Documents, publishing and forking](principles/documents.md) | 8 |
| [Placement, world coordinates and overlap](principles/placement.md) | 10 |
| [World navigation, focus and spatial discovery](principles/navigation.md) | 24 |
| [World View and the Editor](principles/world-view-and-editor.md) | 2 |
| [Repository catalog and previews](principles/catalog.md) | 11 |
| [Avatars, presence, movement and interaction](principles/avatars.md) | 68 |
| [Identity, keys and devices](principles/identity.md) | 31 |
| [Peers, friends, chat and voice](principles/peers.md) | 106 |
| [Terrain, water and nature](principles/terrain.md) | 16 |
| [Bricks, structures and blueprints](principles/building.md) | 27 |
| [Shared worlds and collaboration](principles/collaboration.md) | 22 |
| [Places, landmarks and naming](principles/places.md) | 19 |
| [Decentralized publication, content and replicas](principles/publication.md) | 50 |
| [External anchoring and chain transactions](principles/anchoring.md) | 67 |
| [Achievements, rankings and reconciliation](principles/achievements.md) | 20 |
| [Notifications](principles/notifications.md) | 9 |
| [Distribution, settings and wallets](principles/distribution.md) | 4 |
| [Vehicles, inventory and animals](principles/vehicles.md) | 2 |

## History

The full text of every principle, as written at the milestone that
introduced it, in milestone order. Other documents and code comments
that cite a principle by its title, such as "World View Observes and
Navigates; Editor Mutates and Builds", can find it here or in the
theme files, which keep the same titles.

<!-- parts:start (tests read these in this order through tests/support/DocText.js) -->

- [Foundations and 0.2](principles/history/0.1-0.2.md)
- [0.3 to 0.7](principles/history/0.3-0.7.md)
- [0.8](principles/history/0.8.md)
- [0.9 and later](principles/history/0.9.md)

<!-- parts:end -->

## Adding a principle

Add the full text at the end of the last history file, then add a short
version with a link to it in the theme file it belongs to. When a later
milestone changes a rule, update the short version and add a
"*Changed by …*" note at the top of the full text.
