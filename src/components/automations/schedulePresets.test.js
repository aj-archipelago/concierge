import {
    CUSTOM_PRESET_ID,
    SCHEDULE_PRESETS,
    applyPreset,
    getPreset,
    presetFromSchedule,
} from "./schedulePresets";

describe("schedulePresets", () => {
    test("every preset round-trips through presetFromSchedule", () => {
        for (const preset of SCHEDULE_PRESETS) {
            expect(presetFromSchedule(preset.schedule)).toBe(preset.id);
        }
    });

    test("unknown shapes resolve to custom", () => {
        expect(
            presetFromSchedule({
                frequency: "daily",
                times: ["13:30"],
                daysOfWeek: [1],
                hourlyMode: "interval",
                minute: 0,
                interval: 1,
            }),
        ).toBe(CUSTOM_PRESET_ID);

        expect(
            presetFromSchedule({
                frequency: "weekly",
                times: ["09:00"],
                daysOfWeek: [0, 6],
            }),
        ).toBe(CUSTOM_PRESET_ID);

        expect(
            presetFromSchedule({
                frequency: "hourly",
                interval: 3,
                hourlyMode: "interval",
            }),
        ).toBe(CUSTOM_PRESET_ID);
    });

    test("applyPreset returns a fresh schedule for known presets", () => {
        const result = applyPreset({}, "weekday-mornings");
        expect(result.frequency).toBe("weekly");
        expect(result.times).toEqual(["08:00"]);
        expect(result.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
        const preset = getPreset("weekday-mornings");
        expect(result.times).not.toBe(preset.schedule.times);
        expect(result.daysOfWeek).not.toBe(preset.schedule.daysOfWeek);
    });

    test("applyPreset with 'custom' returns the input schedule unchanged", () => {
        const current = {
            frequency: "daily",
            times: ["13:30", "16:00"],
            daysOfWeek: [1],
        };
        expect(applyPreset(current, CUSTOM_PRESET_ID)).toBe(current);
    });

    test("getPreset returns null for unknown id", () => {
        expect(getPreset("does-not-exist")).toBeNull();
    });
});
