export const releaseNotes = {
    en: [],
    ar: [],
};

export function getReleaseNotes(lang = "en") {
    return lang?.startsWith("ar") ? releaseNotes.ar : releaseNotes.en;
}
