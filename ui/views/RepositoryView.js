import PublicationCatalog from '../components/PublicationCatalog.js';

// Repository View — the "GitHub" mode: every published document,
// browsable at catalog scale. As of 0.2.31 this is a thin wrapper
// around ui/components/PublicationCatalog.js (search, sort,
// pagination, grouping, card/list views, preview, actions) — the
// component that also backs AuthorView, scoped here to the whole
// repository (no `author` prop) rather than one author's work. See
// docs/Architecture.md, 0.2.31, for why the two views share one
// implementation instead of maintaining parallel ones.
export default {
    name: 'RepositoryView',
    components: { PublicationCatalog },
    template: `
        <section class="repository-view">
            <h1>Repository</h1>
            <PublicationCatalog />
        </section>
    `
};
