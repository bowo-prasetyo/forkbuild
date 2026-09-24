# Principles: Documents, publishing and forking

Each rule links to its full text in [the history](../Principles.md#history).

### A Published Snapshot Is Never Mutated In Place (0.2.20)

Opening a published snapshot never makes it editable. The first mutation
creates a new Document derived from the snapshot (fork-on-edit) and
applies the change there, lazily: never on navigation, camera movement,
selection, hover or inspection, and never merely because a published
world was opened.

*Changed by 0.5.9:* World View no longer edits bricks. Fork-on-edit now
runs only for its remaining World View mutations (Region and Landmark
naming, Animal Decorations); brick editing forks through "Edit a Copy"
and the Editor.

[Full text](history/0.1-0.2.md#a-published-snapshot-is-never-mutated-in-place-0220)

### Forking Creates Provenance, Not Publication (0.2.20)

Forking produces a new, independently owned, editable Document, never a
new Publication. A Publication exists only once the fork is explicitly
published. Provenance is recorded through `parentDocumentId`, the same
way as every other fork.

[Full text](history/0.1-0.2.md#forking-creates-provenance-not-publication-0220)

### A Default Value Is Not An Absent One (0.2.21)

A default the system chose (a title of "Untitled", a license of
UNSPECIFIED) is a real value, not evidence that the user has set
nothing. Every editable metadata field has a real value from the moment
a Document exists (description defaults to `''`, never `null`), so "what
did the user set" is never answered by matching a placeholder string.

[Full text](history/0.1-0.2.md#a-default-value-is-not-an-absent-one-0221)

### Status Is Computed, Not Stored (0.2.21)

A document's lifecycle status (Draft, Saved or Published) is never
stored. `DocumentLifecycleStatus` computes it each time from facts
already tracked for other reasons: whether a save has happened, and
whether a Publication exists. Two sources of truth for one fact
eventually drift apart.

[Full text](history/0.1-0.2.md#status-is-computed-not-stored-0221)

### Explaining A Decision Is Not Optional Once The System Can Make One (0.2.21)

Once the system can refuse a mutation, telling the user why is part of
the same feature. Every surface that can reject a mutation exposes a
structured reason (such as `getEditabilityNotice()`) that the UI shows
in plain language before the user runs into the refusal, not only after
an error.

[Full text](history/0.1-0.2.md#explaining-a-decision-is-not-optional-once-the-system-can-make-one-0221)

### The Displayed Document Is The Active Document (0.2.22)

A World View session has exactly one active document at any moment. The
title, the route, the inspection panel and the target of the next
mutation all read that one fact (`getActiveDocumentId()`) each time they
are observed, never a value captured when the session began.

[Full text](history/0.1-0.2.md#the-displayed-document-is-the-active-document-0222)

### A Fork Is Not A Modal Interruption (0.2.22)

Forking on the first mutation should feel like editing, not like asking
permission. The system says what happened after the fact (a transient
notice, then a persistent "Editing fork" status line) and never blocks a
gesture already in motion with a prompt. A refusal is the one case that
does interrupt, because otherwise the user would believe a change
happened that did not.

*Changed by 0.5.9:* this applies only to the World View mutations that
still exist (naming and Animal Decorations); brick editing goes through
the Editor.

[Full text](history/0.1-0.2.md#a-fork-is-not-a-modal-interruption-0222)

### An Imported Document Always Gets A Fresh Identity (0.9.642)

An imported file's `world.id` means nothing on this device, and reusing
it as a storage key could overwrite another document or the manifest.
Import always clones through `DocumentCloneService`: new document,
building and brick ids, remapped groups, and `parentDocumentId: null`,
since an import is not a fork. Export and import are about portability,
not publication: no signature, no announcement, no network.

[Full text](history/0.9.md#an-imported-document-always-gets-a-fresh-identity-09642)
