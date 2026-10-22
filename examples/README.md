# Example builds

Builds made by hand in ForkBuild, kept here to open, try out and test
against. Each is a build file as **File → Export** writes it; open one with
**File → Import** in the Editor.

| File | Build |
|---|---|
| [forkbuild-document-harbor-wall-light.json](forkbuild-document-harbor-wall-light.json) | **The Harbor Wall Light**: a slim harbor light at the end of a stone harbor wall, with a fishing boat tied up on the sheltered side. |
| [forkbuild-document-islet-lighthouse.json](forkbuild-document-islet-lighthouse.json) | **The Islet Lighthouse**: a striped lighthouse on a rocky islet of its own, with a wooden jetty. |
| [forkbuild-document-hay-wain-bridge.json](forkbuild-document-hay-wain-bridge.json) | **The Hay Wain Bridge**: a timber truss bridge across a river, wide enough for the hay wagon. |
| [forkbuild-document-packhorse-arch.json](forkbuild-document-packhorse-arch.json) | **The Packhorse Arch**: a humpbacked stone bridge over a river, wide enough for the hay wagon. |

What uses them:

- tests/GroundVehicleBridgeCrossing.test.js drives the ground vehicles over
  the two bridges.
- scripts/evaluate-ready-made-detection.mjs checks that none of the four is
  mistaken for a ready-made build.

They aren't part of the published site.
