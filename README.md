# Flashcards

An iPhone-style spaced-repetition flashcard app (like Anki) that runs in the browser and installs to your home screen. It ships with a starter **LeetCode patterns** deck (NeetCode 150 categories: pattern triggers and Java templates), and you can add your own decks for system design, behavioral stories, or anything else.

- **Offline-first PWA**: works without a connection once loaded (service worker).
- **Private by default**: everything is stored on your device in IndexedDB. No account, no server.
- **FSRS scheduling** (Again / Hard / Good / Easy) with daily new/review limits and adjustable retention.
- **Markdown cards** with syntax-highlighted code (Java and more).
- **iOS feel**: large titles, translucent tab bar, sheets, swipe-to-delete, swipe to grade (← Again, → Good, ↑ Easy), light/dark mode.
- **Decks & tags** (nested decks with `::`), search with deck/tag filters, streaks and a 30-day chart.
- **Import / export** as CSV or JSON. See **[docs/IMPORT_FORMAT.md](docs/IMPORT_FORMAT.md)** for the exact format.

## Install on iPhone

1. Open the app's URL in **Safari**.
2. Tap the **Share** button (square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Launch it from the home screen. It opens full-screen and works offline.

Your cards live in that home-screen app's storage. Use **Settings → Export JSON Backup** now and then to keep a copy.

## Importing cards

Settings → **Import from File…** accepts `.csv` (columns `front,back,deck,tags`; tags separated by `;`) or `.json`. Decks are created automatically from paths like `LeetCode::Two Pointers`. Full details and examples: [docs/IMPORT_FORMAT.md](docs/IMPORT_FORMAT.md).

## Development

```sh
npm ci
npm run dev        # local dev server
npm test           # unit tests (vitest)
npm run build      # type-check + production build (base './')
BASE_PATH=/flashcards/ npm run build   # build for a GitHub Pages subpath
npx vite preview   # serve the production build
```

Stack: Vite + React + TypeScript, `idb` (IndexedDB), `ts-fsrs`, `marked` + `highlight.js`, `vite-plugin-pwa`.

Layout: `src/core` (storage, scheduler, stats, import/export), `src/ui` (screens and components), `src/seed` (starter decks; every `*.json` there is imported once on first run).

## Deployment

`.github/workflows/pages.yml` runs on every push to `main`: `npm ci`, `npm test`, builds with `BASE_PATH=/flashcards/`, and deploys `dist/` to GitHub Pages. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.
