# Import / export format

Two formats are supported: **CSV** (simple, for bulk card generation) and **JSON** (simple or full backup with scheduling).
Implementation: `src/core/importExport.ts` (`parseCSV`, `parseJSON`, `exportCSV`, `exportJSON`).

## Common rules

| Field   | Required | Notes |
|---------|----------|-------|
| `front` | yes      | Markdown. Must be non-empty. |
| `back`  | yes      | Markdown (may be empty). Fenced code blocks are highlighted; use ` ```java `. |
| `deck`  | no       | Deck path. Nested decks use `::`, e.g. `LeetCode::Two Pointers`. Missing decks (and parents) are auto-created by name. Whitespace around segments is trimmed. Empty → `Default`. |
| `tags`  | no       | CSV: one field, tags separated by `;`. JSON: array of strings. Trimmed, de-duplicated, empty dropped. |

Invalid rows/cards are skipped and reported with their 1-based row/index; valid ones still import.

## CSV

- UTF-8 (BOM ok), RFC 4180.
- First row is a header. Expected: `front,back,deck,tags` (case-insensitive, any order; `deck`/`tags` optional; extra columns ignored).
- Fields containing `,`, `"`, or newlines must be wrapped in `"..."`; a literal `"` inside is written `""`. Multiline fields are allowed inside quotes.
- LF or CRLF line endings. Blank lines are ignored.
- CSV carries no scheduling state; imported cards start as new.

~~~csv
front,back,deck,tags
"Two Sum: trigger?","Need pair summing to target in **unsorted** array → hash map of value→index.
```java
Map<Integer, Integer> seen = new HashMap<>();
for (int i = 0; i < nums.length; i++) {
    Integer j = seen.get(target - nums[i]);
    if (j != null) return new int[]{j, i};
    seen.put(nums[i], i);
}
```",LeetCode::Arrays & Hashing,hash-map;easy
"Tell me about a conflict ""with a teammate""","STAR: Situation… Task… Action… Result…",Behavioral,star;conflict
~~~

## JSON

```json
{
  "version": 1,
  "cards": [
    {
      "front": "Sorted array, find pair with target sum?",
      "back": "Two pointers `l=0, r=n-1`; move `l++` if sum < target else `r--`.",
      "deck": "LeetCode::Two Pointers",
      "tags": ["two-pointers", "medium"]
    }
  ]
}
```

- A bare array of card objects (`[{...}, {...}]`) is also accepted.
- `version` must be `1` if present.
- Optional per-card fields, written by a full export and preserved on import:
  - `id` (string): if a card with this id exists it is updated, otherwise created with that id.
  - `fsrs` (object): ts-fsrs scheduling state. `due` and `last_review` are ISO-8601 strings; `state` is `0..3` or `"New" | "Learning" | "Review" | "Relearning"`; `stability`, `difficulty` required; `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses` default to 0.

```json
{
  "version": 1,
  "cards": [
    {
      "id": "6f1c2c0e-6b0e-4f7e-9d1e-0a6c3f0b9a11",
      "front": "Sliding window trigger?",
      "back": "Longest/shortest contiguous subarray/substring with a constraint.",
      "deck": "LeetCode::Sliding Window",
      "tags": ["sliding-window"],
      "fsrs": {
        "due": "2026-10-25T16:00:00.000Z",
        "stability": 4.93,
        "difficulty": 5.1,
        "elapsed_days": 0,
        "scheduled_days": 4,
        "learning_steps": 0,
        "reps": 2,
        "lapses": 0,
        "state": 2,
        "last_review": "2026-10-21T16:00:00.000Z"
      }
    }
  ]
}
```

## Export

- `exportCSV(cards, decks)` → header `front,back,deck,tags`, CRLF, no scheduling.
- `exportJSON(cards, decks)` → full backup (includes `id` + `fsrs`); `exportJSON(cards, decks, { includeScheduling: false })` → content only.
