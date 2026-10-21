# Flashcards

iOS-style spaced-repetition flashcard PWA (Vite + React + TS, IndexedDB via `idb`, FSRS via `ts-fsrs`).

```sh
npm install
npm run dev
npm test
npm run build              # base './'
BASE_PATH=/repo-name/ npm run build   # GitHub Pages subpath
```

Import/export format: [docs/IMPORT_FORMAT.md](docs/IMPORT_FORMAT.md). Seed decks: drop `*.json` files in `src/seed/`.
