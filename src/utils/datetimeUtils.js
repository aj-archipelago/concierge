/**
 * Composes user datetime and timezone information for sending to chat assistant
 * @returns {string} JSON string containing datetime information
 */
export function composeUserDateTimeInfo() {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const localDateTime = now.toLocaleString(locale, {
        timeZone: timezone,
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
    const isoDateTime = now.toISOString();
    const dayOfWeek = now.toLocaleDateString(locale, {
        weekday: "long",
    });
    const hour = now.getHours();
    const timeOfDay =
        hour >= 5 && hour < 12
            ? "morning"
            : hour >= 12 && hour < 17
              ? "afternoon"
              : hour >= 17 && hour < 21
                ? "evening"
                : "night";

    return JSON.stringify({
        datetime: {
            local: localDateTime,
            iso: isoDateTime,
            timezone: timezone,
            dayOfWeek: dayOfWeek,
            timeOfDay: timeOfDay,
        },
    });
}
