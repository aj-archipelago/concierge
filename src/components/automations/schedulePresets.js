// Schedule presets cover the 90% case for automation scheduling.
// `presetFromSchedule` round-trips an arbitrary schedule object back to a
// preset id (or "custom") so the UI can highlight the matching chip when the
// user opens an existing automation.

export const SCHEDULE_PRESETS = [
    {
        id: "manual",
        labelKey: "Manual",
        descriptionKey: "Only runs when triggered",
        schedule: {
            frequency: "manual",
            interval: 1,
            times: ["09:00"],
            time: "09:00",
            daysOfWeek: [1],
            dayOfWeek: 1,
            hourlyMode: "interval",
            minute: 0,
        },
    },
    {
        id: "hourly",
        labelKey: "Hourly",
        descriptionKey: "Every hour, on the hour",
        schedule: {
            frequency: "hourly",
            interval: 1,
            times: ["09:00"],
            time: "09:00",
            daysOfWeek: [1],
            dayOfWeek: 1,
            hourlyMode: "clock",
            minute: 0,
        },
    },
    {
        id: "daily-morning",
        labelKey: "Every morning",
        descriptionKey: "Daily at 9:00",
        schedule: {
            frequency: "daily",
            interval: 1,
            times: ["09:00"],
            time: "09:00",
            daysOfWeek: [1],
            dayOfWeek: 1,
            hourlyMode: "interval",
            minute: 0,
        },
    },
    {
        id: "weekday-mornings",
        labelKey: "Weekday mornings",
        descriptionKey: "Mon–Fri at 8:00",
        schedule: {
            frequency: "weekly",
            interval: 1,
            times: ["08:00"],
            time: "08:00",
            daysOfWeek: [1, 2, 3, 4, 5],
            dayOfWeek: 1,
            hourlyMode: "interval",
            minute: 0,
        },
    },
    {
        id: "weekly-monday",
        labelKey: "Weekly",
        descriptionKey: "Mondays at 9:00",
        schedule: {
            frequency: "weekly",
            interval: 1,
            times: ["09:00"],
            time: "09:00",
            daysOfWeek: [1],
            dayOfWeek: 1,
            hourlyMode: "interval",
            minute: 0,
        },
    },
];

export const CUSTOM_PRESET_ID = "custom";

function sameNumberArray(a = [], b = []) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);
    return sortedA.every((value, index) => value === sortedB[index]);
}

function sameStringArray(a = [], b = []) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
}

function scheduleMatchesPreset(schedule, preset) {
    const target = preset.schedule;
    if (schedule.frequency !== target.frequency) return false;

    if (target.frequency === "manual") return true;

    if (target.frequency === "hourly") {
        return (
            Number(schedule.interval) === target.interval &&
            (schedule.hourlyMode || "interval") === target.hourlyMode &&
            Number(schedule.minute || 0) === target.minute
        );
    }

    const times = Array.isArray(schedule.times)
        ? schedule.times
        : [schedule.time].filter(Boolean);
    if (!sameStringArray(times, target.times)) return false;

    if (target.frequency === "weekly") {
        const days = Array.isArray(schedule.daysOfWeek)
            ? schedule.daysOfWeek.map(Number)
            : [Number(schedule.dayOfWeek)].filter((day) => !Number.isNaN(day));
        if (!sameNumberArray(days, target.daysOfWeek)) return false;
    }

    return true;
}

export function presetFromSchedule(schedule = {}) {
    for (const preset of SCHEDULE_PRESETS) {
        if (scheduleMatchesPreset(schedule, preset)) {
            return preset.id;
        }
    }
    return CUSTOM_PRESET_ID;
}

export function getPreset(id) {
    return SCHEDULE_PRESETS.find((preset) => preset.id === id) || null;
}

// Returns a fresh schedule object for the given preset id. For `custom`,
// returns the input schedule unchanged so the granular controls keep the
// user's existing values.
export function applyPreset(currentSchedule, presetId) {
    if (presetId === CUSTOM_PRESET_ID) {
        return currentSchedule;
    }
    const preset = getPreset(presetId);
    if (!preset) return currentSchedule;
    return {
        ...preset.schedule,
        times: [...preset.schedule.times],
        daysOfWeek: [...preset.schedule.daysOfWeek],
    };
}
