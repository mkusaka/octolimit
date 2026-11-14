import { expect, test } from "bun:test";
import { recentRate } from "./Dashboard";

test("recentRate is time-weighted for unevenly spaced samples", () => {
  const min = 60_000;
  // Old sample outside the 10m window, then a burst of manual reloads.
  const samples = [
    { t: 0, used: 0 },
    { t: 20 * min, used: 100 },
    { t: 25 * min, used: 150 },
    { t: 25 * min + 1000, used: 151 },
    { t: 25 * min + 2000, used: 152 },
    { t: 30 * min, used: 200 },
  ];
  const r = recentRate(samples)!;
  expect(r.spanMs).toBe(10 * min);
  expect(r.rate * min).toBeCloseTo(10);
  expect(
    recentRate([
      { t: 0, used: 0 },
      { t: 1000, used: 5 },
    ]),
  ).toBeNull();
});
