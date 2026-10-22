# Card format (rich NeetCode 150 cards)

Cards are Markdown (`front`, `back`) in `src/seed/*.json` (file format: [IMPORT_FORMAT.md](IMPORT_FORMAT.md)).
On top of GFM, the renderer (`src/ui/lib/markdown.ts`) supports **expandable sections** and **diagram fences**.
Raw HTML is always escaped, so `<details>` / `<img>` tags do **not** work. Use the syntax below.

Golden examples: `nc150-invert-binary-tree` and `nc150-number-of-islands` in `src/seed/neetcode150-b.json`.
Copy their shape.

## Content rules (site is public)

- Write the problem statement, explanations and examples **in your own words**. Never paste text, examples or images from
  LeetCode or NeetCode. Restating the standard example *inputs* is fine; the prose must be ours.
- Every Java and Python solution must be **run** against the card's examples (and an edge case) before committing.
- Python uses LeetCode's camelCase method names (`def numIslands(self, grid: List[List[str]]) -> int`). Java uses `class Solution`.
  Assume LeetCode's implicit imports (`java.util.*`; `List`, `Optional`, `deque`, …) and its `TreeNode` / `ListNode`.
- NeetCode slugs differ from LeetCode's (e.g. `invert-a-binary-tree`, `count-number-of-islands`). Take them from
  <https://neetcode.io/sitemap.xml>.

## Required order

### Front

1. Title line: `**<Title>** · Easy|Medium|Hard`
2. Full problem statement (own words): inputs, what to return, edge semantics.
3. `**Constraints**` as a bullet list.
4. `**Example 1**` … up to 3: a diagram fence when the problem involves a tree, graph, grid or linked list, then
   `` Input: `…` `` / `` Output: `…` `` and a one-line explanation. Short examples may be one line: `` Input: `…` → Output: `…` ``.
5. Links line: `[NeetCode](https://neetcode.io/problems/<neetcode-slug>) · [LeetCode](https://leetcode.com/problems/<slug>/)`

### Back

1. `**Key idea:** <one line>` (optionally followed by a diagram of the result).
2. `**Brute force:** <idea>. Time O(…), Space O(…).`
3. One `:::details` section per real approach (e.g. DFS recursive, BFS, iterative stack, Union-Find, DP top-down / bottom-up),
   best-known approach first or simplest first, numbered `1.`, `2.`, … Each section contains, in order:
   - explanation (2–5 sentences; optional diagram fence)
   - `**Java**` paragraph, then a ```` ```java ```` fence
   - `**Python**` paragraph, then a ```` ```python ```` fence
   - `**Time:** O(…) <why>` and `**Space:** O(…) <why>` on their own lines
4. Optional `**Pitfall:** …` after the sections.

Keep `id`, `deck` and `tags` of existing cards unchanged (see *Updates* below).

The `**Java**` / `**Python**` labels are significant: the review card's language picker hides the label and the code fence of the
language the user didn't pick (only on cards that contain both languages). Always write both.

Test `src/seed/richCards.test.ts` checks this structure for every card whose back has a `:::details` section.

## Expandable sections

```
:::details 1. DFS (recursive)
Any Markdown: **bold**, lists, code fences, diagram fences.

```java
class Solution { … }
```
:::
```

- Opens with `:::details <title>` at the start of a line, closes with a line that is just `:::`.
- Rendered collapsed (`<details>`); tap the title to expand. A `:::` line inside a code fence does not close the section.
- No nesting. An unclosed section runs to the end of the card (no crash). The title is plain text.

## Diagram fences

Drawn as inline SVG, theme-aware, scaled down to the card width. Any fence may add a `caption: text` line.
Highlight markers on a value: `*` blue, `+` green, `!` orange (e.g. `7*`). Malformed input renders a red error box
with the source instead of breaking the card. The tests fail if a seed card has one.

| Fence | Syntax | Example |
|-------|--------|---------|
| `tree` | LeetCode level order, `null` for gaps | `[3,9,20,null,null,15,7]` |
| `graph` | one edge per line (or `,`/`;`-separated): `A -> B` directed, `A -- B` undirected, `A <-> B` both ways, `: w` weight; a bare name adds an isolated node | `A -> B : 4` |
| `grid` | one row per line, cells separated by spaces or commas, or a JSON 2D array | `1 1 0` |
| `list` | `->`- or comma-separated values; `cycle: k` makes the tail point to node `k` (0-based, LeetCode `pos`, `-1` = none) | `3 -> 2 -> 0 -> -4` + `cycle: 1` |

````
```tree
[4,2*,7,1,3,6,9]
caption: input
```

```graph
0 -- 1
1 -- 2
2 -- 0
3
```

```graph
A -> B : 4
A -> C : 1
C -> B : 2
```

```grid
1* 1* 0 0
0 1* 0 1+
caption: two islands
```

```list
3 -> 2 -> 0 -> -4
cycle: 1
```
````

Limits: 400 items per diagram, labels truncated at 12 characters. Graphs use a circular layout; keep them ≤ ~10 nodes.

## Updates keep review progress

Seed cards are matched by their explicit `id` (`nc150-<slug>`). On startup `loadSeed` hashes each card's front, back, tags and
deck path. When a card's hash changes, its content is replaced **in place**, and its FSRS state, review logs and createdAt are kept.
A card the user edited in the app is left alone. So: rewrite `front`/`back` freely, but **never change `id`**. A new id would insert a
duplicate card with no progress (the old one stays).
