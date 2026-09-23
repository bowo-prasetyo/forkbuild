ES Modules only

No jQuery

Vue 3, components as plain objects with a template string (no build step). Views mostly use setup() (the Composition API); many older components use the Options API (data/methods). Prefer setup() in new code.

One class (or module) per file

camelCase for variables

PascalCase for classes

Four-space indentation, no tabs

No global variables except the Vue application bootstrap

Choice lists (select boxes, radio groups, checkbox lists) show their options in alphabetical order of the visible label, via utils/sortOptionsByLabel.js, unless the order itself carries meaning (a scale, a sort-by menu, a system-provided order). "All", "None", "System default…" and "Choose a…" entries stay first.

Comments explain why: a constraint, invariant or deliberate omission the code itself can't show. Don't narrate what the code plainly does or restate another file's header, and keep comments short (usually one to three lines).

Change history belongs in docs/Roadmap.md and commit messages, not in code comments: no milestone or version tags ("0.8.79 — …"), and no "moved from" or "amended by" notes. Older files still carry them; trim them when you change that code.

HTML comments inside a Vue template are shipped to the browser, so use them sparingly, as brief section labels.
