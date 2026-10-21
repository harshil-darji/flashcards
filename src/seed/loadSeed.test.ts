import { describe, expect, it, vi } from 'vitest';

vi.mock('../core/db', () => ({ getSettings: vi.fn(), importCards: vi.fn(), saveSettings: vi.fn() }));
import { parseSeeds } from './loadSeed';

describe('parseSeeds', () => {
  it('parses each seed file in name order', () => {
    const out = parseSeeds({
      './b.json': '[{"front":"q","back":"a","deck":"B"}]',
      './a.json': '{"version":1,"cards":[{"front":"q","back":"a","deck":"LeetCode::Two Pointers","tags":["x"]}]}',
    });
    expect(out.map((o) => o.file)).toEqual(['./a.json', './b.json']);
    expect(out[0].result.cards[0].deck).toBe('LeetCode::Two Pointers');
    expect(out.every((o) => o.result.errors.length === 0)).toBe(true);
  });
  it('real seed files (if any) parse without errors', () => {
    for (const { file, result } of parseSeeds()) expect(result.errors, file).toEqual([]);
  });
});
