import gettingStarted from "./help-guides/getting-started.md";
import usingChat from "./help-guides/using-chat.md";
import creatingUsingApplets from "./help-guides/creating-using-applets.md";
import workingWithMedia from "./help-guides/working-with-media.md";
import managingProfileSettings from "./help-guides/managing-profile-settings.md";
import keyboardShortcuts from "./help-guides/keyboard-shortcuts.md";

import gettingStartedAr from "./help-guides/getting-started.ar.md";
import usingChatAr from "./help-guides/using-chat.ar.md";
import creatingUsingAppletsAr from "./help-guides/creating-using-applets.ar.md";
import workingWithMediaAr from "./help-guides/working-with-media.ar.md";
import managingProfileSettingsAr from "./help-guides/managing-profile-settings.ar.md";
import keyboardShortcutsAr from "./help-guides/keyboard-shortcuts.ar.md";

import parseFrontmatter from "./parseFrontmatter";

function parseGuide(raw) {
    const { metadata, content } = parseFrontmatter(raw);
    return {
        id: metadata.id || "unknown",
        title: metadata.title || "Untitled",
        category: metadata.category || "general",
        date: metadata.date || "unknown",
        content,
    };
}

const guidesByLang = {
    en: [
        gettingStarted,
        usingChat,
        creatingUsingApplets,
        workingWithMedia,
        managingProfileSettings,
        keyboardShortcuts,
    ].map(parseGuide),
    ar: [
        gettingStartedAr,
        usingChatAr,
        creatingUsingAppletsAr,
        workingWithMediaAr,
        managingProfileSettingsAr,
        keyboardShortcutsAr,
    ].map(parseGuide),
};

export const helpGuides = guidesByLang.en;

export function getHelpGuides(lang) {
    return guidesByLang[lang] || guidesByLang.en;
}

export function getHelpGuide(lang, id) {
    const list = getHelpGuides(lang);
    const found = list.find((guide) => guide.id === id);
    if (found) return found;
    return guidesByLang.en.find((guide) => guide.id === id);
}
