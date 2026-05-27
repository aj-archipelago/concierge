import gettingStarted from "./help-guides/getting-started.md";
import usingChat from "./help-guides/using-chat.md";
import translatingContent from "./help-guides/translating-content.md";
import transcribingAudioVideo from "./help-guides/transcribing-audio-video.md";
import writingWithAi from "./help-guides/writing-with-ai.md";
import creatingUsingApplets from "./help-guides/creating-using-applets.md";
import workingWithMedia from "./help-guides/working-with-media.md";
import usingDockedChat from "./help-guides/using-docked-chat.md";
import managingApps from "./help-guides/managing-apps.md";
import usingConnectors from "./help-guides/using-connectors.md";
import usingAutomations from "./help-guides/using-automations.md";
import usingSkills from "./help-guides/using-skills.md";
import managingProfileSettings from "./help-guides/managing-profile-settings.md";
import keyboardShortcuts from "./help-guides/keyboard-shortcuts.md";

import gettingStartedAr from "./help-guides/getting-started.ar.md";
import usingChatAr from "./help-guides/using-chat.ar.md";
import translatingContentAr from "./help-guides/translating-content.ar.md";
import transcribingAudioVideoAr from "./help-guides/transcribing-audio-video.ar.md";
import writingWithAiAr from "./help-guides/writing-with-ai.ar.md";
import creatingUsingAppletsAr from "./help-guides/creating-using-applets.ar.md";
import workingWithMediaAr from "./help-guides/working-with-media.ar.md";
import usingDockedChatAr from "./help-guides/using-docked-chat.ar.md";
import managingAppsAr from "./help-guides/managing-apps.ar.md";
import usingConnectorsAr from "./help-guides/using-connectors.ar.md";
import usingAutomationsAr from "./help-guides/using-automations.ar.md";
import usingSkillsAr from "./help-guides/using-skills.ar.md";
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
        translatingContent,
        transcribingAudioVideo,
        writingWithAi,
        creatingUsingApplets,
        workingWithMedia,
        usingDockedChat,
        managingApps,
        usingConnectors,
        usingAutomations,
        usingSkills,
        managingProfileSettings,
        keyboardShortcuts,
    ].map(parseGuide),
    ar: [
        gettingStartedAr,
        usingChatAr,
        translatingContentAr,
        transcribingAudioVideoAr,
        writingWithAiAr,
        creatingUsingAppletsAr,
        workingWithMediaAr,
        usingDockedChatAr,
        managingAppsAr,
        usingConnectorsAr,
        usingAutomationsAr,
        usingSkillsAr,
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
