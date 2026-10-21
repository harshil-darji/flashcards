# Flashcards

An iPhone-style spaced-repetition flashcard app (like Anki) that runs in the browser and installs to your home screen. It ships with a starter **LeetCode patterns** deck (NeetCode 150 categories: pattern triggers and Java templates), and you can add your own decks for system design, behavioral stories, or anything else.

- **Offline-first PWA**: works without a connection once loaded (service worker).
- **Private by default**: everything is stored on your device in IndexedDB. No account, no server.
- **Optional sync** between devices through a secret GitHub gist (see below).
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

## Sync between devices (optional)

Sync uses one **secret gist** on your own GitHub account as the shared copy. No server is involved, and nothing goes into this repo.

1. Make a fine-grained token at [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens/new): repository access **Public repositories**, account permission **Gists: Read and write**, nothing else.
2. In the app: **Settings → Sync**, paste the token, tap **Connect GitHub**. Do this once on each device (on iPhone, in the home-screen app).

The first device creates a secret gist described `flashcards-sync` with one file, `flashcards.json`. Other devices find it by that description. The token is kept in that device's `localStorage` only. It is never written to the gist or to exports.

Sync runs when the app opens, when it comes back to the foreground, about 30 seconds after you review or edit, and from **Sync Now**. When you're offline, sync waits and retries automatically.

How changes are merged (`src/core/sync.ts`):

- Each sync pulls the gist, merges it three ways (this device, the gist, and what this device saw at its last sync), writes the result locally, and pushes only if something changed. A conditional request (ETag) makes "nothing changed" checks nearly free. If the gist changes between the pull and the push, sync merges again rather than overwriting it.
- Cards and decks merge by id. Card **content** (front, back, tags, deck) and **scheduling** (FSRS) merge separately. Content comes from whichever side changed, or the newer edit if both did. Scheduling comes from the most recent review. So an edit on one device and a review on another both survive.
- **Deletes** become tombstones in the gist, so they reach other devices. If the other device edited that card since its last sync, the edit wins over the delete.
- **Review logs** are combined by id, so review history from every device is kept.
- Decks with the same path that were created separately on different devices are merged into one.

`flashcards.json` is a superset of the JSON backup format (cards carry `id`, `deck`, `fsrs`), so it can also be imported as a backup.

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

Layout: `src/core` (storage, scheduler, stats, import/export), `src/ui` (screens and components), `src/seed` (starter decks).

### Seed decks

Every `src/seed/*.json` (JSON import format) is imported at startup if it's **new or changed**. Each file's content hash is stored per device in `settings.seedVersions`, so adding or editing a seed file reaches existing users on their next launch:

- Cards are upserted by id. Give seed cards an explicit `"id"`. Otherwise a stable id is derived from deck path + front, so changing a front creates a new card.
- Existing cards keep their review state. Their content is updated only if the user hasn't edited it since the last import.
- Seed cards the user deleted are not re-added when the file changes.
- Installs from before seed versioning had random ids for the starter deck. Those cards are re-keyed in place (with their review logs) to the stable ids, so devices line up for sync.

## Deployment

`.github/workflows/pages.yml` runs on every push to `main`: `npm ci`, `npm test`, builds with `BASE_PATH=/flashcards/`, and deploys `dist/` to GitHub Pages. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.
