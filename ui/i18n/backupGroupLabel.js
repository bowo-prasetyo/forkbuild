import { BACKUP_ENTRY_GROUP_LABELS } from '../../application/backup/BackupEntryGroups.js';
import { hasMessage, t } from './i18n.js';

// A backup group's name by its id ('avatar-and-worlds' → backupGroup.avatarAndWorlds),
// or application/backup's English for a group without a message.
export function backupGroupLabel(group) {
    const key = `backupGroup.${group.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())}`;
    return hasMessage(key) ? t(key) : BACKUP_ENTRY_GROUP_LABELS[group];
}

// One row per group with entries, in the groups' own order:
// { group, label, count }.
export function backupGroupRows(counts) {
    return Object.keys(BACKUP_ENTRY_GROUP_LABELS)
        .filter((group) => counts && counts[group])
        .map((group) => ({ group, label: backupGroupLabel(group), count: counts[group] }));
}
