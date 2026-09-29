import { deriveBlueprintFingerprint, describeBlueprintFingerprint, isLegacyBlueprintFingerprint } from '../../../core/BlueprintFingerprint.js';
import { BLUEPRINT_ATTRIBUTION_KIND } from '../../../core/BlueprintAttribution.js';
import { BLUEPRINT_LINEAGE_CLAIM_KIND } from '../../../core/BlueprintLineageClaim.js';
import { buildBlueprintBundle, blueprintBundlePackages, isBlueprintBundle } from '../../../application/blueprint/BlueprintBundle.js';
import { isDocumentBundle } from '../../../application/document/DocumentBundle.js';
import { message } from '../../../core/Message.js';
import { errorText, t } from '../../i18n/i18n.js';
import { libraryItemName } from '../../i18n/libraryText.js';

// Downloads `data` as pretty-printed JSON, with no intermediate modal.
function downloadJson(filename, data) {
    const link = document.createElement('a');
    link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
    link.download = filename;
    link.click();
}

function slugify(text, fallback) {
    return (text || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

// Exporting and importing documents, blueprints, and the attributions and lineage claims
// bundled with them. Imported text is untrusted and validated before anything changes.
export function useBlueprintExchange({
    blueprintAttributionExchange, blueprintAttributionUseCase, blueprintLineageExchange, blueprintLineageUseCase,
    documentManager, editorSession, feedback, refreshPersonalStructureGroups,
    personalStructureLibraryStore = null, exportAllDocumentsUseCase = null, importDocumentBundleUseCase = null,
    onSavedDocumentsChanged = () => {}
}) {
    // Exports the blueprint as a download, bundling the attributions and lineage
    // claims this replica has for it. The BuildLibraryPanel event is still named
    // 'export-personal-structure'.
    function exportStructure(structure) {
        let pkg;
        try {
            pkg = blueprintPackageFor(structure);
        } catch (e) {
            feedback.show(errorText(e));
            return;
        }
        if (!pkg) {
            return;
        }
        downloadJson(`forkbuild-blueprint-${slugify(structure.name, 'structure')}.json`, pkg);
        feedback.show(t('blueprintExchange.exported', { name: libraryItemName(structure) }));
    }

    function blueprintPackageFor(structure) {
        const { attributions } = blueprintAttributionUseCase.summarize(structure);
        const lineageClaims = blueprintLineageUseCase.claimsForBlueprint(structure);
        return editorSession.exportBlueprint(structure, attributions, lineageClaims);
    }

    // Every structure in My Structures in one file, each packaged as Export
    // Blueprint would.
    function exportAllStructures() {
        let packages;
        try {
            const structures = personalStructureLibraryStore ? personalStructureLibraryStore.listStructures() : [];
            packages = structures.map(blueprintPackageFor).filter(Boolean);
        } catch (e) {
            feedback.show(errorText(e));
            return;
        }
        if (packages.length === 0) {
            feedback.show(t('blueprintExchange.libraryEmpty'));
            return;
        }
        downloadJson(`forkbuild-blueprints-${new Date().toISOString().slice(0, 10)}.json`, buildBlueprintBundle(packages));
        feedback.show(t('blueprintExchange.exportedStructures', { count: packages.length }));
    }

    // Every saved document in one file.
    async function exportAllDocuments() {
        let bundle;
        try {
            bundle = exportAllDocumentsUseCase ? await exportAllDocumentsUseCase.execute() : null;
        } catch (e) {
            feedback.show(errorText(e));
            return;
        }
        if (!bundle) {
            feedback.show(t('blueprintExchange.noDocuments'));
            return;
        }
        downloadJson(`forkbuild-documents-${new Date().toISOString().slice(0, 10)}.json`, bundle);
        feedback.show(t('blueprintExchange.exportedDocuments', { count: bundle.documents.length }));
    }

    // Filename follows the `forkbuild-<kind>-<slug>.json` convention.
    function exportDocument() {
    	let json;
    	try {
    		json = editorSession.exportDocument();
    	} catch (e) {
    		feedback.show(errorText(e));
    		return;
    	}
    	if (!json) {
    		return;
    	}
    	const title = documentManager.document.metadata.title || '';
    	downloadJson(`forkbuild-document-${slugify(title, 'document')}.json`, json);
    	feedback.show(title ? t('blueprintExchange.exportedDocument', { title }) : t('blueprintExchange.exportedUntitled'));
    }

    // `rawText` is untrusted. JSON parse errors and invalid documents are reported
    // separately; either leaves the open document and storage untouched. On
    // success the imported document opens like a fork.
    function importDocument(rawText) {
    	let json;
    	try {
    		json = JSON.parse(rawText);
    	} catch (e) {
    		feedback.show(t('blueprintExchange.invalidDocumentJson'));
    		return;
    	}
    	if (isDocumentBundle(json)) {
    		return importDocumentBundle(json);
    	}
    	try {
    		const imported = editorSession.importDocument(json);
    		if (!imported) {
    			return;
    		}
    		feedback.show(imported.metadata.title ? t('blueprintExchange.importedDocument', { title: imported.metadata.title }) : t('blueprintExchange.importedUntitled'));
    	} catch (e) {
    		feedback.show(errorText(e).replace(/^DocumentSerializer:\s*/, ''));
    	}
    }

    // Saves every document in the bundle without opening any of them.
    async function importDocumentBundle(bundle) {
        if (!importDocumentBundleUseCase) {
            return;
        }
        try {
            const { added, copied, unchanged, failed } = await importDocumentBundleUseCase.execute(bundle);
            onSavedDocumentsChanged();
            const parts = [message('blueprintExchange.importedDocuments', { count: added + copied })];
            if (copied) parts.push(message('blueprintExchange.copiedBeside', { count: copied }));
            if (unchanged) parts.push(message('blueprintExchange.alreadyHere', { count: unchanged }));
            if (failed) parts.push(message('blueprintExchange.unreadable', { count: failed }));
            feedback.show(t(added + copied ? 'blueprintExchange.summaryOpenRecent' : 'blueprintExchange.summary', { parts }), { durationMs: 8000 });
        } catch (e) {
            feedback.show(errorText(e));
        }
    }

    // Exports one attribution on its own; only reachable when `attribution.mine`
    // exists.
    function exportBlueprintAttribution(attribution) {
        let pkg;
        try {
            pkg = editorSession.exportBlueprintAttribution(attribution);
        } catch (e) {
            feedback.show(errorText(e));
            return;
        }
        if (!pkg) {
            return;
        }
        downloadJson(`forkbuild-blueprint-attribution-${slugify(describeBlueprintFingerprint(attribution.fingerprint), 'attribution')}.json`, pkg);
        feedback.show(t('blueprintExchange.exportedAttribution'));
    }

    // `rawText` is untrusted, parsed and validated in two separate steps. It may be
    // a blueprint package or a bare attribution or lineage claim; `pkg.kind`
    // decides which path runs.
    function importBlueprint(rawText) {
        let pkg;
        try {
            pkg = JSON.parse(rawText);
        } catch (e) {
            feedback.show(t('blueprintExchange.invalidBlueprintJson'));
            return;
        }
        if (isBlueprintBundle(pkg)) {
            importBlueprintBundle(pkg);
            return;
        }
        if (pkg && pkg.kind === BLUEPRINT_ATTRIBUTION_KIND) {
            importBareBlueprintAttribution(pkg);
            return;
        }
        if (pkg && pkg.kind === BLUEPRINT_LINEAGE_CLAIM_KIND) {
            importBareBlueprintLineageClaim(pkg);
            return;
        }
        try {
            const structure = editorSession.importBlueprint(pkg);
            if (structure) {
                refreshPersonalStructureGroups();
                const parts = [
                    message('blueprintExchange.importedBlueprint', { name: libraryItemName(structure) }),
                    ...importBundledBlueprintAttributions(pkg, structure),
                    ...importBundledBlueprintLineageClaims(pkg, structure)
                ];
                feedback.show(t('blueprintExchange.summary', { parts }));
            }
        } catch (e) {
            feedback.show(errorText(e).replace(/^(BlueprintImport|BlueprintPackage):\s*/, ''));
        }
    }

    // Each blueprint in the bundle is validated on its own, as a single file
    // would be; a design already in My Structures is not added twice.
    function importBlueprintBundle(bundle) {
        let packages;
        try {
            packages = blueprintBundlePackages(bundle);
        } catch (e) {
            feedback.show(errorText(e));
            return;
        }
        let added = 0;
        let present = 0;
        let failed = 0;
        for (const pkg of packages) {
            try {
                const result = editorSession.importBlueprintIfNew(pkg);
                if (!result) {
                    return;
                }
                if (result.isNew) {
                    added++;
                    importBundledBlueprintAttributions(pkg, result.structure);
                    importBundledBlueprintLineageClaims(pkg, result.structure);
                } else {
                    present++;
                }
            } catch (e) {
                failed++;
            }
        }
        refreshPersonalStructureGroups();
        const parts = [message('blueprintExchange.importedStructures', { count: added })];
        if (present) parts.push(message('blueprintExchange.alreadyThere', { count: present }));
        if (failed) parts.push(message('blueprintExchange.unreadable', { count: failed }));
        feedback.show(t('blueprintExchange.summary', { parts }));
    }

    // Each bundled attribution is cross-checked against the locally derived
    // fingerprint, never the one the package claims. A bad attribution never undoes
    // the successful blueprint import. Returns what to add to the feedback.
    function importBundledBlueprintAttributions(pkg, structure) {
        if (!Array.isArray(pkg.attributions) || pkg.attributions.length === 0 || !blueprintAttributionExchange) {
            return [];
        }
        let imported = 0;
        let legacy = 0;
        for (const attributionJSON of pkg.attributions) {
            if (isLegacyBlueprintFingerprint(attributionJSON && attributionJSON.fingerprint)) {
                legacy += 1;
                continue;
            }
            try {
                const result = editorSession.importBlueprintAttribution(attributionJSON, structure);
                if (result && result.isNew) {
                    imported += 1;
                }
            } catch (e) {
                console.warn('Skipped an attribution bundled with this blueprint:', e.message);
            }
        }
        return [
            ...(imported > 0 ? [message('blueprintExchange.withAuthors', { count: imported })] : []),
            ...legacySkipped(legacy, 'blueprintExchange.legacyAuthorship')
        ];
    }

    // A bare attribution has no local Structure to cross-check against; it is still
    // a legitimate, unconfirmed import. It never touches the personal library.
    function importBareBlueprintAttribution(pkg) {
        if (!blueprintAttributionExchange) {
            feedback.show(t('blueprintExchange.attributionUnavailable'));
            return;
        }
        try {
            const { attribution, isNew } = editorSession.importBlueprintAttribution(pkg);
            if (!isNew) {
                feedback.show(t('blueprintExchange.attributionKnown'));
                return;
            }
            feedback.show(t('blueprintExchange.importedAttribution', { fingerprint: describeBlueprintFingerprint(attribution.fingerprint) }));
        } catch (e) {
            feedback.show(errorText(e).replace(/^BlueprintAttributionExchange:\s*/, ''));
        }
    }

    function exportBlueprintLineageClaim(claim) {
        let pkg;
        try {
            pkg = editorSession.exportBlueprintLineageClaim(claim);
        } catch (e) {
            feedback.show(errorText(e));
            return;
        }
        if (!pkg) {
            return;
        }
        const fingerprints = `${describeBlueprintFingerprint(claim.sourceFingerprint)}-to-${describeBlueprintFingerprint(claim.derivedFingerprint)}`;
        downloadJson(`forkbuild-blueprint-lineage-${slugify(fingerprints, 'lineage-claim')}.json`, pkg);
        feedback.show(t('blueprintExchange.exportedLineage'));
    }

    // A bundled claim's structure may be its source or derived design; the matching
    // fingerprint decides which cross-check runs.
    function importBundledBlueprintLineageClaims(pkg, structure) {
        if (!Array.isArray(pkg.lineageClaims) || pkg.lineageClaims.length === 0 || !blueprintLineageExchange) {
            return [];
        }
        const structureFingerprint = deriveBlueprintFingerprint(structure);
        let imported = 0;
        let legacy = 0;
        for (const claimJSON of pkg.lineageClaims) {
            if (isLegacyBlueprintFingerprint(claimJSON && claimJSON.sourceFingerprint)
                || isLegacyBlueprintFingerprint(claimJSON && claimJSON.derivedFingerprint)) {
                legacy += 1;
                continue;
            }
            try {
                const options = claimJSON.derivedFingerprint === structureFingerprint
                    ? { derivedStructure: structure }
                    : { sourceStructure: structure };
                const result = editorSession.importBlueprintLineageClaim(claimJSON, options);
                if (result && result.isNew) {
                    imported += 1;
                }
            } catch (e) {
                console.warn('Skipped a lineage claim bundled with this blueprint:', e.message);
            }
        }
        return [
            ...(imported > 0 ? [message('blueprintExchange.withLineage', { count: imported })] : []),
            ...legacySkipped(legacy, 'blueprintExchange.legacyLineage')
        ];
    }

    // Claims signed under the old, collidable fingerprint can't be tied to this
    // design, so they are left out, and said so.
    function legacySkipped(count, key) {
        return count > 0 ? [message(key, { count })] : [];
    }

    function importBareBlueprintLineageClaim(pkg) {
        if (!blueprintLineageExchange) {
            feedback.show(t('blueprintExchange.lineageUnavailable'));
            return;
        }
        try {
            const { claim, isNew } = editorSession.importBlueprintLineageClaim(pkg);
            if (!isNew) {
                feedback.show(t('blueprintExchange.lineageKnown'));
                return;
            }
            feedback.show(t('blueprintExchange.importedLineage', { derived: describeBlueprintFingerprint(claim.derivedFingerprint), source: describeBlueprintFingerprint(claim.sourceFingerprint) }));
        } catch (e) {
            feedback.show(errorText(e).replace(/^BlueprintLineageExchange:\s*/, ''));
        }
    }

    return {
        exportAllDocuments, exportAllStructures, exportBlueprintAttribution, exportBlueprintLineageClaim, exportDocument,
        exportStructure, importBlueprint, importDocument
    };
}
