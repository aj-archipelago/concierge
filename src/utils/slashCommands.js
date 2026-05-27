import { Plug, BookOpen, Settings, CalendarClock } from "lucide-react";

// Each command has a canonical English form plus per-language aliases.
// `commands[lang]` is what is displayed; aliases are matched on input.
export const SLASH_COMMANDS = [
    {
        id: "connectors",
        commands: { en: "/connectors", ar: "/موصلات" },
        aliases: ["/connectors", "/موصلات"],
        labelKey: "slash_connectors_label",
        descriptionKey: "slash_connectors_description",
        icon: Plug,
        portalTab: "capabilities",
        portalSubTab: "connectors",
    },
    {
        id: "skills",
        commands: { en: "/skills", ar: "/مهارات" },
        aliases: ["/skills", "/مهارات"],
        labelKey: "slash_skills_label",
        descriptionKey: "slash_skills_description",
        icon: BookOpen,
        portalTab: "capabilities",
        portalSubTab: "skills",
    },
    {
        id: "automations",
        commands: { en: "/automations", ar: "/أتمتات" },
        aliases: ["/automations", "/أتمتات"],
        labelKey: "slash_automations_label",
        descriptionKey: "slash_automations_description",
        icon: CalendarClock,
        path: "/automations",
    },
    {
        id: "settings",
        commands: { en: "/settings", ar: "/إعدادات" },
        aliases: ["/settings", "/إعدادات"],
        labelKey: "slash_settings_label",
        descriptionKey: "slash_settings_description",
        icon: Settings,
        portalTab: "discover",
    },
];

export function getCommandLabel(cmd, lang) {
    return cmd.commands[lang] || cmd.commands.en;
}

export function matchesFilter(cmd, filter) {
    const f = (filter || "").toLowerCase();
    if (!f) return true;
    return cmd.aliases.some((alias) => alias.toLowerCase().includes(f));
}
