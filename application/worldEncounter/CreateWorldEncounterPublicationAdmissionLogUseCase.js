import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { LocalWorldEncounterPublicationAdmissionLog } from './LocalWorldEncounterPublicationAdmissionLog.js';

// 0.9.651 — Persist World-Encounter Publication Admissions.
//
// The identical composition-root shape application/
// CreatePublicationCatalogUseCase.js already established for
// LocalPublicationCatalog.js: wires the concrete local storage so ui/
// never imports storage/LocalStorageProvider.js or application/
// LocalWorldEncounterPublicationAdmissionLog.js directly.
export class CreateWorldEncounterPublicationAdmissionLogUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const admissionLog = new LocalWorldEncounterPublicationAdmissionLog(storageProvider);

        return { admissionLog };
    }
}
