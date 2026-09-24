import { deriveBlueprintFingerprint, describeBlueprintFingerprint } from '../../../core/BlueprintFingerprint.js';
import { BLUEPRINT_ATTRIBUTION_KIND } from '../../../core/BlueprintAttribution.js';
import { BLUEPRINT_LINEAGE_CLAIM_KIND } from '../../../core/BlueprintLineageClaim.js';

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
    documentManager, editorSession, feedback, refreshPersonalStructureGroups
}) {
    // Exports the blueprint as a download, bundling the attributions and lineage
    // claims this replica has for it. The BuildLibraryPanel event is still named
    // 'export-personal-structure'.
    function exportStructure(structure) {
        let pkg;
        try {
            const { attributions } = blueprintAttributionUseCase.summarize(structure);
            const lineageClaims = blueprintLineageUseCase.claimsForBlueprint(structure);
            pkg = editorSession.exportBlueprint(structure, attributions, lineageClaims);
        } catch (e) {
            feedback.show(e.message);
            return;
        }
        if (!pkg) {
            return;
        }
        downloadJson(`forkbuild-blueprint-${slugify(structure.name, 'structure')}.json`, pkg);
        feedback.show(`Exported "${structure.name}" as a blueprint`);
    }

    // Filename follows the `forkbuild-<kind>-<slug>.json` convention.
    function exportDocument() {
    	let json;
    	try {
    		json = editorSession.exportDocument();
    	} catch (e) {
    		feedback.show(e.message);
    		return;
    	}
    	if (!json) {
    		return;
    	}
    	const title = documentManager.document.metadata.title || '';
    	downloadJson(`forkbuild-document-${slugify(title, 'document')}.json`, json);
    	feedback.show(`Exported "${title || 'document'}"`);
    }

    // `rawText` is untrusted. JSON parse errors and invalid documents are reported
    // separately; either leaves the open document and storage untouched. On
    // success the imported document opens like a fork.
    function importDocument(rawText) {
    	let json;
    	try {
    		json = JSON.parse(rawText);
    	} catch (e) {
    		feedback.show('That is not valid JSON — choose a file exported with "Export."');
    		return;
    	}
    	try {
    		const imported = editorSession.importDocument(json);
    		if (!imported) {
    			return;
    		}
    		feedback.show(`Imported "${imported.metadata.title || 'document'}"`);
    	} catch (e) {
    		feedback.show(e.message.replace(/^DocumentSerializer:\s*/, ''));
    	}
    }

    // Exports one attribution on its own; only reachable when `attribution.mine`
    // exists.
    function exportBlueprintAttribution(attribution) {
        let pkg;
        try {
            pkg = editorSession.exportBlueprintAttribution(attribution);
        } catch (e) {
            feedback.show(e.message);
            return;
        }
        if (!pkg) {
            return;
        }
        downloadJson(`forkbuild-blueprint-attribution-${slugify(describeBlueprintFingerprint(attribution.fingerprint), 'attribution')}.json`, pkg);
        feedback.show('Exported your attribution');
    }

    // `rawText` is untrusted, parsed and validated in two separate steps. It may be
    // a blueprint package or a bare attribution or lineage claim; `pkg.kind`
    // decides which path runs.
    function importBlueprint(rawText) {
        let pkg;
        try {
            pkg = JSON.parse(rawText);
        } catch (e) {
            feedback.show('That is not valid JSON — choose a file exported with "Export Blueprint."');
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
                const attributionSummary = importBundledBlueprintAttributions(pkg, structure);
                const lineageSummary = importBundledBlueprintLineageClaims(pkg, structure);
                feedback.show(`Imported "${structure.name}" into My Structures${attributionSummary}${lineageSummary}`);
            }
        } catch (e) {
            feedback.show(e.message.replace(/^(BlueprintImport|BlueprintPackage):\s*/, ''));
        }
    }

    // Each bundled attribution is cross-checked against the locally derived
    // fingerprint, never the one the package claims. A bad attribution never undoes
    // the successful blueprint import. Returns a feedback suffix or ''.
    function importBundledBlueprintAttributions(pkg, structure) {
        if (!Array.isArray(pkg.attributions) || pkg.attributions.length === 0 || !blueprintAttributionExchange) {
            return '';
        }
        let imported = 0;
        for (const attributionJSON of pkg.attributions) {
            try {
                const result = editorSession.importBlueprintAttribution(attributionJSON, structure);
                if (result && result.isNew) {
                    imported += 1;
                }
            } catch (e) {
                console.warn('Skipped an attribution bundled with this blueprint:', e.message);
            }
        }
        return imported > 0 ? ` with ${imported} attributed ${imported === 1 ? 'author' : 'authors'}` : '';
    }

    // A bare attribution has no local Structure to cross-check against; it is still
    // a legitimate, unconfirmed import. It never touches the personal library.
    function importBareBlueprintAttribution(pkg) {
        if (!blueprintAttributionExchange) {
            feedback.show('Blueprint attribution exchange is not available');
            return;
        }
        try {
            const { attribution, isNew } = editorSession.importBlueprintAttribution(pkg);
            if (!isNew) {
                feedback.show('That attribution was already known — nothing changed');
                return;
            }
            feedback.show(`Imported an attribution for ${describeBlueprintFingerprint(attribution.fingerprint)}`);
        } catch (e) {
            feedback.show(e.message.replace(/^BlueprintAttributionExchange:\s*/, ''));
        }
    }

    function exportBlueprintLineageClaim(claim) {
        let pkg;
        try {
            pkg = editorSession.exportBlueprintLineageClaim(claim);
        } catch (e) {
            feedback.show(e.message);
            return;
        }
        if (!pkg) {
            return;
        }
        const fingerprints = `${describeBlueprintFingerprint(claim.sourceFingerprint)}-to-${describeBlueprintFingerprint(claim.derivedFingerprint)}`;
        downloadJson(`forkbuild-blueprint-lineage-${slugify(fingerprints, 'lineage-claim')}.json`, pkg);
        feedback.show('Exported your lineage claim');
    }

    // A bundled claim's structure may be its source or derived design; the matching
    // fingerprint decides which cross-check runs.
    function importBundledBlueprintLineageClaims(pkg, structure) {
        if (!Array.isArray(pkg.lineageClaims) || pkg.lineageClaims.length === 0 || !blueprintLineageExchange) {
            return '';
        }
        const structureFingerprint = deriveBlueprintFingerprint(structure);
        let imported = 0;
        for (const claimJSON of pkg.lineageClaims) {
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
        return imported > 0 ? ` with ${imported} lineage ${imported === 1 ? 'claim' : 'claims'}` : '';
    }

    function importBareBlueprintLineageClaim(pkg) {
        if (!blueprintLineageExchange) {
            feedback.show('Blueprint lineage exchange is not available');
            return;
        }
        try {
            const { claim, isNew } = editorSession.importBlueprintLineageClaim(pkg);
            if (!isNew) {
                feedback.show('That lineage claim was already known — nothing changed');
                return;
            }
            feedback.show(`Imported a lineage claim: ${describeBlueprintFingerprint(claim.derivedFingerprint)} derived from ${describeBlueprintFingerprint(claim.sourceFingerprint)}`);
        } catch (e) {
            feedback.show(e.message.replace(/^BlueprintLineageExchange:\s*/, ''));
        }
    }

    return {
        exportBlueprintAttribution, exportBlueprintLineageClaim, exportDocument, exportStructure, importBlueprint,
        importDocument
    };
}
