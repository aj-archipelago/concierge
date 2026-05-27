export const categoryColorClasses = {
    general:
        "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    chat: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
    translate:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    transcribe:
        "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    write: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
    applets: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    media: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    skills: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    connectors:
        "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    automations:
        "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
};

export const releaseNoteColorClasses =
    "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300";

/** i18n keys (use with t()) — category comes from help guide frontmatter */
const CATEGORY_I18N_KEYS = {
    general: "help_category_general",
    chat: "help_category_chat",
    translate: "help_category_translate",
    transcribe: "help_category_transcribe",
    write: "help_category_write",
    applets: "help_category_applets",
    media: "help_category_media",
    skills: "help_category_skills",
    connectors: "help_category_connectors",
    automations: "help_category_automations",
};

export function getCategoryLabel(category) {
    if (!category) return "help_category_general";
    return CATEGORY_I18N_KEYS[category] || "help_category_general";
}

export function formatHelpDate(dateStr) {
    if (!dateStr || dateStr === "unknown") return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const hasTime = dateStr.includes("T");
    if (hasTime) {
        return d.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
}
