// Base class every discovery adapter extends. Answers "How do I find
// published documents?" — distinct from PublisherProvider, which answers
// "How do I publish this document?" The UI consumes Publications through
// these methods without knowing whether the source is localStorage, Steem,
// Hive, IPFS, or another ForkBuild node.
export class DiscoveryProvider {
    list() {
        throw new Error('DiscoveryProvider.list() must be implemented by a subclass');
    }

    findById(id) {
        throw new Error('DiscoveryProvider.findById() must be implemented by a subclass');
    }

    findByAuthor(author) {
        throw new Error('DiscoveryProvider.findByAuthor() must be implemented by a subclass');
    }

    findByParentId(parentDocumentId) {
        throw new Error('DiscoveryProvider.findByParentId() must be implemented by a subclass');
    }
}
