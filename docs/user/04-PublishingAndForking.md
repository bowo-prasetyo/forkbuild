# 04 — Publishing & Forking

This is the heart of ForkBuild. **Publishing** shares your creation with the
world. **Forking** lets anyone copy a creation and evolve it — with the whole
history preserved.

## Publishing your creation

1. Build something in the Editor (or World View).
2. Give it a title (and, optionally, a description and a license — click
   **Edit Metadata**, or set them the first time you save a brand-new
   document).
3. Press **Save** so it's stored.
4. Click **Publish**.

Your creation now appears in the **Repository**, where anyone can search for
it, open it, and fork it. The listing shows your name as the author. It's
also automatically given a position in the shared world, so **Explore**
always has somewhere to take people — see
[Finding worlds](03-WorldView.md#finding-worlds).

> **Note:** In this version, publishing stores your creation locally so the
> full publish → discover → fork flow works end to end. Decentralized
> publishing (e.g. to a blockchain) is on the roadmap — the experience you're
> practicing now is exactly how it will feel.

## Choosing a license

A published creation is always shown with a license, chosen from the
**Document Properties** dialog:

| License | Meaning |
|---|---|
| **CC0 1.0 — Public Domain** | No rights reserved — anyone can do anything with it |
| **CC BY 4.0 — Attribution** | Anyone can fork and reuse it, crediting you |
| **CC BY-SA 4.0 — Attribution, ShareAlike** | Forks must carry the same license forward |
| **CC BY-NC 4.0 — Attribution, NonCommercial** | Forking allowed, commercial use isn't |
| **CC BY-ND 4.0 — Attribution, No Derivatives** | Viewable, but **forking is not allowed** |
| **All Rights Reserved** | Viewable, but forking is not allowed |
| **No license specified** | Forking is not allowed until you set one |

If you leave a creation unlicensed, people can still open and explore it —
they just can't fork it until you pick a license that allows it.

## Editing a published creation

A published creation is **immutable** — it can never change after the fact.
So what happens when you edit one? The moment you make your **first change**
(move a brick, edit the metadata, anything), ForkBuild automatically creates
your own editable copy for you, titled *"Fork of &lt;original name&gt;"* — the
same thing **Fork** does explicitly (see below), just triggered by the act of
editing instead of a button. You'll see a small confirmation
("Created your own editable copy — … is unchanged") the moment it happens, so
you're never left wondering why the title on screen changed.

The original is never touched, no matter how much you change your copy.

## The Repository

The **Repository** is the shared, searchable catalog of everything that's
been published — built to stay usable whether it holds ten creations or ten
thousand.

```
Search [________________]  ☐ Include descriptions  [Search]

Sort: [Recently Published ▾]   Group: [None ▾]   [Cards] [List]

1,248 publications

┌─────────────────────────────────────────┐
│  [preview]  Ancient City                 │
│             A reconstruction of a        │
│             Roman city showing…          │
│             🔒 Published  by alice       │
│             8/16/2026 · CC BY 4.0        │
│             [Open] [Fork] [Explore]      │
└─────────────────────────────────────────┘

        [← Previous]  1 2 3 4 5 … 125  [Next →]
```

- **Search** looks at title and author by default. Check **Include
  descriptions** to also search inside descriptions — this can take a moment
  longer, since it has to read more than the listing normally needs.
- **Sort** offers five orders: Recently Published, Oldest Published, Title
  A–Z, Title Z–A, and Author A–Z.
- **Group** clusters the current page's results by Author, Date, or License —
  purely for browsing; it doesn't change what's found or how many pages there
  are.
- **Cards** is best for browsing visually; **List** is a compact table —
  switch to it once you're scanning a lot of results quickly.
- Pagination is explicit, page by page, rather than endless scrolling — so
  "page 5" always means the same thing if you come back to it later.

Every creation offers three actions:

| Button | What it does |
|---|---|
| **Open** | Load it into the Editor to look around (read‑only browsing) |
| **Fork** | Copy it into your own editable creation |
| **Explore** | Fly to it in World View |

Click any **author's name** to visit their **Author view** — a portfolio of
everything they've made, including their originals and all the forks that grew
from them, using the exact same search/sort/pagination catalog as the
Repository, just scoped to that one author.

## Forking: make it your own

**Forking** is what makes ForkBuild special. When you fork a creation:

- You get a **brand-new, independent copy** to edit freely.
- The **original is untouched** — your changes never affect it.
- The copy **remembers where it came from**, so credit is never lost.

It works just like forking a project in Git: you branch off, do your own thing,
and the family tree keeps track of everyone. (It also happens automatically
the moment you edit a published creation directly — see
[Editing a published creation](#editing-a-published-creation) above.)

### How to fork

1. Find a creation in the **Repository** (or in World View).
2. Click **Fork**.
3. The copy opens in the Editor, titled *"Fork of &lt;original name&gt;"*.
4. Build on it, then save and publish it as your own.

Your published fork shows up with a **"↳ Fork of …"** note, linking it back to
the original.

## The family tree

Because every fork records its parent, ForkBuild can draw a creation's whole
lineage. On an **Author view**, you'll see a **fork tree**:

```
Medieval House (original)
└─ Fork of Medieval House (by Bob)
   └─ Fork of Fork of… (by Carol)
```

This means a great creation can inspire an entire ecosystem of variations —
and everyone in the chain gets credit.

## A typical creative loop

Here's the whole journey in one flow:

1. **Build** a creation in the Editor.
2. **Save** it.
3. **Publish** it to the Repository.
4. Someone **finds** it — by searching, by exploring nearby in World View, or
   by browsing your Author page — and **forks** it.
5. They **publish** their fork.
6. Others **explore** both in World View, and the tree grows.

That's the open construction ecosystem ForkBuild is built for.

## What's next?

Keep the [Controls Reference](ControlsReference.md) handy while you build, or
go back and explore [World View](03-WorldView.md) in more depth.
