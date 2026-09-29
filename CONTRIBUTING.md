# Contributing to ForkBuild

Thanks for helping. This page covers setting up, testing, and what a change
needs before it can be merged.

## Setting up

ForkBuild has no build step. Clone the repository and serve it over HTTP:

```
python3 -m http.server 8000
```

then open <http://localhost:8000/>. To run the tests, install Node.js 22 or
later, then:

```
npm install
npm test
```

`npm test` runs the Node tests, the rendezvous worker's tests, and the few
tests that need a browser in headless Chromium (install it once with
`npx playwright-core install chromium`, or set `CHROMIUM_PATH`). Pass a filter
to run matching files only: `npm run test:node -- Avatar`.

## Making a change

1. Read [docs/Architecture.md](docs/Architecture.md) for how the code is
   layered, and [docs/CodingConventions.md](docs/CodingConventions.md) for the
   rules every change follows. [docs/DeveloperFAQ.md](docs/DeveloperFAQ.md)
   answers the questions that come up most. The ones that most often matter:
   - `core/` stays pure: no Three.js, Vue or browser APIs.
     `tests/LayerBoundaries.test.js` checks the imports (`core/` never
     imports `application/`, `renderer/`, `ui/`, Three.js or Vue, and
     `renderer/` never imports `application/` or `ui/`); browser API use
     isn't checked, so keep an eye on it in review.
   - Tests check behavior: import the real module, run it, and assert on what
     it does. Don't assert on source text.
   - Don't implement cryptography yourself; use the vendored noble libraries
     or WebCrypto.
   - No scripts from other origins and no inline scripts: libraries go through
     `vendor/` (`scripts/vendor.mjs`).
   - Tests don't use the internet; inject a fake when a test needs a server.
   - Text the app shows goes through `t()` so it can be translated; see
     [docs/Translating.md](docs/Translating.md), which also covers adding
     a language.
2. Add or update tests for what you change, and run `npm test`.
3. Update the docs the change affects: the user guides in `docs/user/`, and
   `docs/Architecture.md` or `docs/Protocol.md`, edited in place;
   `docs/Privacy.md` if the app contacts a new server or stores something new,
   and `docs/CapabilityMatrix.md` if what a surface may change is different.
   Add an entry to the roadmap describing what changed and why.
4. Open a pull request. CI runs the full test suite; it must pass.

## Reporting bugs and security problems

Open an issue for bugs, with steps to reproduce and what you expected. For
anything security-related, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## License

By contributing, you agree that your contribution is licensed under the
Mozilla Public License 2.0, like the rest of the project (see
[LICENSE](LICENSE)).
