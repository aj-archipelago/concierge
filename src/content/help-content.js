import { helpGuides, getHelpGuides, getHelpGuide } from "./help-guides";
import { releaseNotes, getReleaseNotes } from "./release-notes";

export {
    helpGuides,
    releaseNotes,
    getHelpGuides,
    getHelpGuide,
    getReleaseNotes,
};

/**
 * Get all help items (guides + release notes) for a given language,
 * sorted by date descending. Each item is normalized to:
 * { id, type, title, date, category?, version? }
 */
export function getAllHelpItems(lang) {
    const guideItems = getHelpGuides(lang).map((g) => ({
        id: g.id,
        type: "guide",
        title: g.title,
        date: g.date,
        category: g.category,
    }));

    const releaseItems = getReleaseNotes(lang).map((r) => ({
        id: r.version,
        type: "release",
        title: r.title,
        date: r.date,
        version: r.version,
    }));

    return [...guideItems, ...releaseItems].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
    );
}

/**
 * Get items newer than the given timestamp.
 */
export function getUnseenItems(lastSeenTimestamp, lang) {
    if (!lastSeenTimestamp) return getAllHelpItems(lang);
    const lastSeen = new Date(lastSeenTimestamp);
    return getAllHelpItems(lang).filter(
        (item) => new Date(item.date) > lastSeen,
    );
}

/**
 * Get count of unseen items. The count is independent of language (same
 * underlying releases/guides), so we use English by default.
 */
export function getUnseenCount(lastSeenTimestamp, lang) {
    return getUnseenItems(lastSeenTimestamp, lang).length;
}
