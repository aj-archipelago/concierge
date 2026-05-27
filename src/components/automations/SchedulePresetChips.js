"use client";

import { useTranslation } from "react-i18next";
import {
    Calendar,
    CalendarClock,
    CalendarDays,
    Clock,
    Hand,
    Sliders,
} from "lucide-react";
import classNames from "../../../app/utils/class-names";
import { CUSTOM_PRESET_ID, SCHEDULE_PRESETS } from "./schedulePresets";

const ICONS = {
    manual: Hand,
    hourly: Clock,
    "daily-morning": CalendarClock,
    "weekday-mornings": CalendarDays,
    "weekly-monday": Calendar,
    [CUSTOM_PRESET_ID]: Sliders,
};

const ALL_CHIPS = [
    ...SCHEDULE_PRESETS,
    {
        id: CUSTOM_PRESET_ID,
        labelKey: "Custom",
        descriptionKey: "Set your own schedule",
    },
];

export default function SchedulePresetChips({
    value,
    onChange,
    showCustom = true,
    className,
}) {
    const { t } = useTranslation();
    const chips = showCustom
        ? ALL_CHIPS
        : ALL_CHIPS.filter((chip) => chip.id !== CUSTOM_PRESET_ID);

    return (
        <div className={classNames("flex flex-wrap gap-2", className)}>
            {chips.map((preset) => {
                const Icon = ICONS[preset.id] || Sliders;
                const isActive = value === preset.id;
                return (
                    <button
                        key={preset.id}
                        type="button"
                        onClick={() => onChange(preset.id)}
                        title={t(preset.descriptionKey)}
                        className={classNames(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                            isActive
                                ? "border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-200"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {t(preset.labelKey)}
                    </button>
                );
            })}
        </div>
    );
}
