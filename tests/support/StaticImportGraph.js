// Test-support only. The static import walk the app's own tooling uses
// (scripts/moduleGraph.mjs), for tests that check what the first page load
// and each page contain.
export { ROOT, staticGraph, staticImportSpecifiers, stripComments } from '../../scripts/moduleGraph.mjs';
