/**
 * Compact relative time for dense UI (e.g. sidebar): "34m", "1h", "7d".
 * @param {string|number|Date|null|undefined} value
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatCompactRelativeTime(value, nowMs = Date.now()) {
    if (!value) return "";
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return "";

    const diffMs = Math.max(0, nowMs - then);
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m`;

    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;

    const years = Math.floor(days / 365);
    return `${Math.max(1, years)}y`;
}
