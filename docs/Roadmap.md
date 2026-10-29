# Roadmap

Every milestone ForkBuild has shipped, and why it was chosen, in the
order it happened. The full text is split into parts by version range,
because as one file it grew past 6 MB and could no longer be read or
opened comfortably. Only the part still being written is in the
repository; the closed parts are kept in its history, and the table links
to each as it was when it was closed, so its text never changes.

What comes next, and in what order, is [NowNextLater.md](NowNextLater.md):
at most three items each, decided by the owner. This page records what shipped.

When another document says "see docs/Roadmap.md, 0.8.26", look up that
version in the table below and search its part for `## 0.8.26`.

## Parts

<!-- parts:start (tests read the parts in this repository, in this order, through tests/support/DocText.js) -->

| Part | Covers |
|---|---|
| [0.1 and 0.2](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.1-0.2.md) | The milestone list for 0.1.1 to 0.2.51, deferred work, notes for 0.2.30 to 0.2.92, the 0.1.50 summary, and 0.2.95 to 0.2.99 |
| [0.3 to 0.7](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.3-0.7.md) | Collaborative presence, structures and blueprints, place naming, World View exploration and the decentralized publication protocol |
| [0.8.0 to 0.8.49](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.8.0-0.8.49.md) | Publication anchoring, external evidence, snapshot placement and Bitcoin anchoring |
| [0.8.50 to 0.8.99](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.8.50-0.8.99.md) | Bitcoin wallet signing, IPFS gateways, publication archives and Base network observation |
| [0.8.100 onward](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.8.100-0.8.x.md) | Publication identity, publisher association, claims, reconciliation and leaderboards |
| [0.9.0 to 0.9.99](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.9.0-0.9.99.md) | World View discovery, World Encounters, publication distribution and avatar movement |
| [0.9.100 to 0.9.199](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.9.100-0.9.199.md) | Distribution in World View, Nostr and Arweave, vehicles and snapshot materialization |
| [0.9.200 to 0.9.299](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.9.200-0.9.299.md) | Placement and history audits, remote document operations, commentary and place naming |
| [0.9.300 to 0.9.399](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.9.300-0.9.399.md) | Content provider preferences, multi-placement, diagnostics, federated repositories and gateway settings |
| [0.9.587 onward](https://github.com/bowo-prasetyo/forkbuild/blob/590fccf78895fde987795873bdda1f0e9b797665/docs/roadmap/0.9.587-0.9.x.md) | Navigation history, publication actionability, water traversal, commentary distribution, inventory and animals |
| [Unnumbered, September 2026](roadmap/unnumbered-2026-09.md) | Distribution settings, wallets, vehicles, wildlife, cleanup passes, and the security and release work for 1.0 |

<!-- parts:end -->

## Numbering notes

- 0.9.400 to 0.9.586 have no entries in this roadmap, although other
  documents and tests still refer to some of them (for example 0.9.474,
  0.9.547 and 0.9.586).
- Smaller gaps with no entry: 0.8.142–0.8.149, 0.8.161–0.8.166, 0.8.188,
  0.9.156–0.9.157, 0.9.174–0.9.175, 0.9.272, 0.9.353–0.9.355 and
  0.9.673–0.9.699.
- 0.9.670, 0.9.671, 0.9.701 and 0.9.702 were each used for two
  milestones; the second of each is marked "(number reused)".

## Adding an entry

Add new milestones at the end of the last part. From "The filter's answers,
checked" (2026-10-29) on, every entry answers the filter's four questions
([Pillars.md](Pillars.md), "The filter") in a list of its own, each answer
after its label, in this order:

```
**The filter.**
1. **Pillar:** which pillar it serves, and how a player would notice.
2. **First ten minutes:** whether it makes them harder.
3. **Building first:** whether building gets at least as much as everything else.
4. **Counts:** which first step or target it should move, and what in the
   counts says so; "none yet" when nothing does, said as it is.
```

When the owner's yes is what lets it start, the entry quotes it as well; it
doesn't stand in for any answer. tests/RoadmapFilter.test.js fails on an
entry without the four.

When a part passes about 800 KB, start a new part file under `docs/roadmap/` and add it as the
last row of the table above, then close the old one: delete it from
`docs/roadmap/` and point its row at the file in the last commit that
has it (`https://github.com/bowo-prasetyo/forkbuild/blob/<commit>/docs/roadmap/<part>.md`).
