export function getAppSearchText(
    app,
    {
        getDisplayName = (entry) => entry?.name || "",
        translate = (value) => value,
    } = {},
) {
    const authorName =
        app?.author && typeof app.author === "object"
            ? app.author.username || app.author.email || ""
            : "";
    return [
        translate(getDisplayName(app) || ""),
        authorName,
        translate(app?.description || ""),
        app?.category,
        app?.badgeLabel,
        ...(Array.isArray(app?.tags) ? app.tags : []),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

export function appMatchesSearch(app, query, options) {
    if (!query) return true;
    return getAppSearchText(app, options).includes(query);
}

export function filterApps(apps, searchQuery, options) {
    const query = searchQuery.trim().toLowerCase();
    return apps.filter((app) => appMatchesSearch(app, query, options));
}

export const APP_LIBRARY_SORT_OPTIONS = [
    { value: "updated-desc", label: "Newest first" },
    { value: "updated-asc", label: "Oldest first" },
    { value: "name-asc", label: "Name A-Z" },
    { value: "name-desc", label: "Name Z-A" },
];

function readTime(value) {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

export function sortAppCatalogItems(
    items,
    sortValue = "updated-desc",
    {
        getName = (item) => item?.name || "",
        getUpdatedAt = (item) => item?.updatedAt,
    } = {},
) {
    const collator = new Intl.Collator(undefined, {
        sensitivity: "base",
        numeric: true,
    });

    return [...items].sort((a, b) => {
        const nameComparison = collator.compare(getName(a), getName(b));
        const timeComparison =
            readTime(getUpdatedAt(b)) - readTime(getUpdatedAt(a));

        switch (sortValue) {
            case "updated-asc":
                return -timeComparison || nameComparison;
            case "name-asc":
                return nameComparison || timeComparison;
            case "name-desc":
                return -nameComparison || timeComparison;
            case "updated-desc":
            default:
                return timeComparison || nameComparison;
        }
    });
}
