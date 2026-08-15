export class ReplicatePlacementUseCase {
    constructor(mergeService) {
        this._mergeService = mergeService;
    }
    
    async execute(record) {
        return this._mergeService.merge(record);
    }
}
