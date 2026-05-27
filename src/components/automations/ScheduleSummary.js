"use client";

import { useTranslation } from "react-i18next";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTimes(times) {
    return (times || []).join(", ");
}

function describeRelative(t, ms) {
    if (ms <= 0) return t("now");
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return t("in less than a minute");
    if (minutes < 60) return t("in {{n}} min", { n: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("in {{n}} hr", { n: hours });
    const days = Math.round(hours / 24);
    return t("in {{n}} d", { n: days });
}

function describeDays(t, days = []) {
    const sorted = [...days].sort((a, b) => a - b);
    if (sorted.length === 7) return t("every day");
    if (sorted.length === 5 && sorted.every((d) => d >= 1 && d <= 5)) {
        return t("weekdays");
    }
    if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) {
        return t("weekends");
    }
    return sorted.map((d) => t(DAY_SHORT[d])).join(", ");
}

export function describeSchedule(t, schedule, timezone) {
    if (!schedule || schedule.frequency === "manual") {
        return t("Runs only when triggered");
    }

    if (schedule.frequency === "hourly") {
        if (schedule.hourlyMode === "clock") {
            const interval = Math.max(1, Number(schedule.interval) || 1);
            const minute = String(schedule.minute || 0).padStart(2, "0");
            if (interval === 1) {
                return t("Runs every hour at :{{m}} ({{tz}})", {
                    m: minute,
                    tz: timezone,
                });
            }
            return t("Runs every {{n}} hours at :{{m}} ({{tz}})", {
                n: interval,
                m: minute,
                tz: timezone,
            });
        }
        const interval = Math.max(1, Number(schedule.interval) || 1);
        if (interval === 1) {
            return t("Runs every hour");
        }
        return t("Runs every {{n}} hours", { n: interval });
    }

    if (schedule.frequency === "daily") {
        return t("Runs daily at {{times}} ({{tz}})", {
            times: formatTimes(schedule.times),
            tz: timezone,
        });
    }

    // weekly
    return t("Runs {{days}} at {{times}} ({{tz}})", {
        days: describeDays(t, schedule.daysOfWeek),
        times: formatTimes(schedule.times),
        tz: timezone,
    });
}

export default function ScheduleSummary({
    schedule,
    timezone = "UTC",
    nextRunAt,
    enabled,
    className,
}) {
    const { t } = useTranslation();
    const summary = describeSchedule(t, schedule, timezone);
    const nextRunDate = nextRunAt ? new Date(nextRunAt) : null;
    const showNext =
        enabled &&
        schedule?.frequency !== "manual" &&
        nextRunDate &&
        !Number.isNaN(nextRunDate.getTime());
    const relative = showNext
        ? describeRelative(t, nextRunDate.getTime() - Date.now())
        : "";

    return (
        <div className={className}>
            <div className="text-sm text-gray-700 dark:text-gray-200">
                {summary}
            </div>
            {showNext && (
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("Next run {{relative}} · {{date}}", {
                        relative,
                        date: nextRunDate.toLocaleString(),
                    })}
                </div>
            )}
            {!enabled && schedule?.frequency !== "manual" && (
                <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {t("Disabled — schedule is paused")}
                </div>
            )}
        </div>
    );
}
