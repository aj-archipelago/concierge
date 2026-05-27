"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import classNames from "../../../../app/utils/class-names";
import SchedulePresetChips from "../SchedulePresetChips";
import ScheduleSummary from "../ScheduleSummary";
import {
    CUSTOM_PRESET_ID,
    applyPreset,
    presetFromSchedule,
} from "../schedulePresets";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMMON_TZ = [
    "UTC",
    "America/Los_Angeles",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Africa/Cairo",
    "Asia/Dubai",
    "Asia/Riyadh",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
];

function getTimezones() {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let supported = COMMON_TZ;
    if (typeof Intl.supportedValuesOf === "function") {
        try {
            supported = Intl.supportedValuesOf("timeZone");
        } catch {
            supported = COMMON_TZ;
        }
    }
    const set = new Set([local, ...COMMON_TZ, ...supported].filter(Boolean));
    return Array.from(set);
}

export default function ScheduleTab({
    form,
    onScheduleReplace,
    onScheduleField,
    onScheduleTime,
    onScheduleTimeAdd,
    onScheduleTimeRemove,
    onScheduleDayToggle,
    onTimezoneChange,
    nextRunAt,
}) {
    const { t } = useTranslation();
    const timezones = useMemo(() => getTimezones(), []);
    const presetId = useMemo(
        () => presetFromSchedule(form.schedule),
        [form.schedule],
    );
    const isCustom = presetId === CUSTOM_PRESET_ID;

    const handlePresetChange = (id) => {
        if (id === CUSTOM_PRESET_ID) {
            // Switching to "custom" keeps current values.
            onScheduleReplace(form.schedule);
            return;
        }
        onScheduleReplace(applyPreset(form.schedule, id));
    };

    const showTimes =
        form.schedule.frequency === "daily" ||
        form.schedule.frequency === "weekly";
    const showDays = form.schedule.frequency === "weekly";
    const showHourly = form.schedule.frequency === "hourly";

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {t("Quick presets")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3">
                    <SchedulePresetChips
                        value={presetId}
                        onChange={handlePresetChange}
                    />
                    <ScheduleSummary
                        schedule={form.schedule}
                        timezone={form.timezone}
                        nextRunAt={nextRunAt}
                        enabled={form.enabled}
                    />
                </CardContent>
            </Card>

            {isCustom && (
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {t("Custom schedule")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-4">
                        <div className="space-y-1.5">
                            <Label
                                htmlFor="schedule-frequency"
                                className="text-xs"
                            >
                                {t("Frequency")}
                            </Label>
                            <select
                                id="schedule-frequency"
                                value={form.schedule.frequency}
                                onChange={(e) =>
                                    onScheduleField("frequency", e.target.value)
                                }
                                className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                            >
                                <option value="manual">
                                    {t("Manual only")}
                                </option>
                                <option value="hourly">{t("Hourly")}</option>
                                <option value="daily">{t("Daily")}</option>
                                <option value="weekly">{t("Weekly")}</option>
                            </select>
                        </div>

                        {showHourly && (
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label
                                        htmlFor="hourly-interval"
                                        className="text-xs"
                                    >
                                        {t("Every N hours")}
                                    </Label>
                                    <Input
                                        id="hourly-interval"
                                        type="number"
                                        min="1"
                                        value={form.schedule.interval}
                                        onChange={(e) =>
                                            onScheduleField(
                                                "interval",
                                                Number(e.target.value),
                                            )
                                        }
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="hourly-clock"
                                        checked={
                                            form.schedule.hourlyMode === "clock"
                                        }
                                        onCheckedChange={(checked) =>
                                            onScheduleField(
                                                "hourlyMode",
                                                checked ? "clock" : "interval",
                                            )
                                        }
                                    />
                                    <Label
                                        htmlFor="hourly-clock"
                                        className="text-sm font-normal text-gray-700 dark:text-gray-300"
                                    >
                                        {t("Run on clock time")}
                                    </Label>
                                </div>
                                {form.schedule.hourlyMode === "clock" && (
                                    <div className="space-y-1.5">
                                        <Label
                                            htmlFor="hourly-minute"
                                            className="text-xs"
                                        >
                                            {t("Minute of hour")}
                                        </Label>
                                        <Input
                                            id="hourly-minute"
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={form.schedule.minute}
                                            onChange={(e) =>
                                                onScheduleField(
                                                    "minute",
                                                    Number(e.target.value),
                                                )
                                            }
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {t(
                                                "Use 0 for the top of the hour.",
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {showTimes && (
                            <div className="space-y-2">
                                <Label className="text-xs">{t("Times")}</Label>
                                <div className="space-y-2">
                                    {(form.schedule.times || ["09:00"]).map(
                                        (time, index) => (
                                            <div
                                                key={`${time}-${index}`}
                                                className="flex gap-2"
                                            >
                                                <Input
                                                    type="time"
                                                    value={time}
                                                    onChange={(e) =>
                                                        onScheduleTime(
                                                            index,
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() =>
                                                        onScheduleTimeRemove(
                                                            index,
                                                        )
                                                    }
                                                    disabled={
                                                        form.schedule.times
                                                            ?.length <= 1
                                                    }
                                                    title={t("Remove")}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ),
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={onScheduleTimeAdd}
                                >
                                    <Plus className="me-1.5 h-3.5 w-3.5" />
                                    {t("Add time")}
                                </Button>
                            </div>
                        )}

                        {showDays && (
                            <div className="space-y-2">
                                <Label className="text-xs">{t("Days")}</Label>
                                <div className="flex flex-wrap gap-2">
                                    {DAY_LABELS.map((day, index) => {
                                        const active =
                                            form.schedule.daysOfWeek?.includes(
                                                index,
                                            );
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() =>
                                                    onScheduleDayToggle(index)
                                                }
                                                className={classNames(
                                                    "inline-flex h-9 w-12 items-center justify-center rounded-full border text-sm transition-colors",
                                                    active
                                                        ? "border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-200"
                                                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                                                )}
                                            >
                                                {t(day)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {t("Timezone")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2">
                    <select
                        value={form.timezone}
                        onChange={(e) => onTimezoneChange(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                    >
                        {timezones.map((tz) => (
                            <option key={tz} value={tz}>
                                {tz}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("Times above are interpreted in this timezone.")}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
