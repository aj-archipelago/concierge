"use client";

import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { SLASH_COMMANDS, getCommandLabel } from "../../utils/slashCommands";
import { PortalContext } from "../../contexts/PortalContext";
import { Bot, Brain, User, Zap } from "lucide-react";

const QUICK_ACTIONS = [
    {
        tab: "profile",
        icon: User,
        labelKey: "portal_tab_profile",
        descKey: "portal_discover_profile_desc",
    },
    {
        tab: "ai-assistant",
        icon: Bot,
        labelKey: "portal_tab_ai_assistant",
        descKey: "portal_discover_ai_desc",
    },
    {
        tab: "memory",
        icon: Brain,
        labelKey: "portal_tab_memory",
        descKey: "portal_discover_memory_desc",
    },
    {
        tab: "capabilities",
        icon: Zap,
        labelKey: "portal_tab_capabilities",
        descKey: "portal_discover_capabilities_desc",
    },
];

export default function DiscoverSection() {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const { openPortal } = useContext(PortalContext);
    const lang = i18n.language?.startsWith("ar") ? "ar" : "en";

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 text-start">
                    {t("portal_discover_quick_actions")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {QUICK_ACTIONS.map(
                        ({ tab, icon: Icon, labelKey, descKey }) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => openPortal(tab)}
                                className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-start"
                            >
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-50 dark:bg-sky-900/30">
                                    <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {t(labelKey)}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                        {t(descKey)}
                                    </div>
                                </div>
                            </button>
                        ),
                    )}
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 text-start">
                    {t("portal_discover_slash_commands")}
                </h3>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                    {SLASH_COMMANDS.map((cmd, i) => {
                        const Icon = cmd.icon;
                        const label = getCommandLabel(cmd, lang);
                        return (
                            <div
                                key={cmd.id}
                                className={`flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 ${i < SLASH_COMMANDS.length - 1 ? "border-b border-gray-200 dark:border-gray-700" : ""}`}
                            >
                                <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                <code className="text-sm font-mono text-sky-600 dark:text-sky-400 flex-shrink-0">
                                    {label}
                                </code>
                                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex-1 min-w-0">
                                    {t(cmd.descriptionKey)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (cmd.path) {
                                            router.push(cmd.path);
                                            return;
                                        }
                                        openPortal(
                                            cmd.portalTab,
                                            cmd.portalSubTab,
                                        );
                                    }}
                                    className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex-shrink-0 ms-auto"
                                >
                                    {t("portal_discover_open")}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-start">
                    {t("portal_discover_slash_hint")}
                </p>
            </div>
        </div>
    );
}
