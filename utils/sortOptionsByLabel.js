// Shared ordering for the options of a select box, radio group, or
// checkbox list — the ONE place the app decides how an unordered choice
// list is presented, so every picker reads the same way.
//
// THE RULE. A choice list is shown in alphabetical order of its visible
// label, UNLESS its order itself carries meaning:
//   - an ordered scale (presence visibility Public → Hidden, region kinds
//     Continent → Place, licenses from most to least permissive),
//   - a "sort by" menu (its most useful sort comes first),
//   - a list whose order is the system's own (audio devices, where the OS
//     puts its default first; the reconciliation record-pair pools, whose
//     flat, unreordered order is part of that component's contract).
// Those keep their deliberate order and never call this. A sentinel —
// "All", "None", "System default…", or a "Choose a…" placeholder — always
// stays first; templates render it as its own static `<option>` ahead of
// the sorted ones, so it never goes through this function either.
//
// DISPLAY ONLY. Callers sort what they RENDER, never the underlying list:
// several places treat a list's own first entry as a fallback default
// (e.g. `snapshotDistributionStorageTypes[0]`) or iterate a list in
// registry order for resolution (`retrievalPeers`), and neither may change
// just because a dropdown got reordered. The input array is never mutated.
//
// Comparison is locale-aware, case- and accent-insensitive, and numeric
// ("hair-10" after "hair-09", "Item 2" before "Item 10"). The sort is
// stable, so two options with the same label keep their original order.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareOptionLabels(a, b) {
    return collator.compare(String(a ?? ''), String(b ?? ''));
}

export function sortOptionsByLabel(options, getLabel = (option) => option.label) {
    if (!Array.isArray(options)) {
        return [];
    }
    return options.slice().sort((a, b) => compareOptionLabels(getLabel(a), getLabel(b)));
}

// For a plain list of strings that are themselves the visible labels
// (publisher identifiers, avatar component ids).
export function sortLabels(labels) {
    return sortOptionsByLabel(labels, (label) => label);
}
