import { getDefaultWeeklyUsd } from "./budgets";

it("accepts operator defaults and rejects invalid allowances", () => {
    for (const value of [undefined, null, "", " Unlimited "])
        expect(getDefaultWeeklyUsd(value)).toBeNull();
    expect(getDefaultWeeklyUsd("0")).toBe(0);
    expect(getDefaultWeeklyUsd("42.50")).toBe(42.5);
    for (const value of ["-1", "unknown", "Infinity"])
        expect(() => getDefaultWeeklyUsd(value)).toThrow();
});
