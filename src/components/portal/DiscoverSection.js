"use client";

import { useContext } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { SLASH_COMMANDS, getCommandLabel } from "../../utils/slashCommands";
import { PortalContext } from "../../contexts/PortalContext";
import { SettingsCard } from "./SettingsPrimitives";
import { User, Zap, Users, Bot, ArrowUpRight, Terminal } from "lucide-react";

const QUICK_ACTIONS = [
    {
        tab: "profile",
        icon: User,
        labelKey: "portal_tab_profile",
        descKey: "portal_discover_profile_desc",
    },
    {
        tab: "sharing",
        icon: Users,
        labelKey: "portal_tab_sharing",
        descKey: "portal_discover_sharing_desc",
    },
    {
        tab: "ai-assistant",
        icon: Bot,
        labelKey: "portal_tab_ai_assistant",
        descKey: "portal_discover_assistants_desc",
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
    const { openPortal, closePortal } = useContext(PortalContext);
    const lang = i18n.language?.startsWith("ar") ? "ar" : "en";

    const handleSlashCommandOpen = (cmd) => {
        if (cmd.path) {
            closePortal?.();
            router.push(cmd.path);
            return;
        }
        if (cmd.portalTab) {
            openPortal(cmd.portalTab, cmd.portalSubTab);
        }
    };

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
                                className="group flex min-h-32 items-start gap-3 rounded-2xl border border-gray-200/90 bg-white p-5 text-start shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700/80 dark:bg-gray-800/80 dark:hover:border-sky-500/40 dark:hover:bg-gray-800"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
                                    <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {t(labelKey)}
                                    </div>
                                    <div className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                        {t(descKey)}
                                    </div>
                                </div>
                                <ArrowUpRight
                                    aria-hidden="true"
                                    className="mt-1 h-4 w-4 shrink-0 text-gray-400 group-hover:text-sky-600 dark:text-gray-500 dark:group-hover:text-sky-300 rtl:-scale-x-100"
                                />
                            </button>
                        ),
                    )}
                </div>
            </div>

            <SettingsCard
                icon={Terminal}
                title={t("portal_discover_slash_commands")}
                description={t("portal_discover_slash_hint")}
            >
                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    {SLASH_COMMANDS.map((cmd, i) => {
                        const Icon = cmd.icon;
                        const label = getCommandLabel(cmd, lang);
                        return (
                            <div
                                key={cmd.id}
                                className={`flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 ${i < SLASH_COMMANDS.length - 1 ? "border-b border-gray-200 dark:border-gray-700" : ""}`}
                            >
                                <Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                                <code className="text-sm font-mono text-sky-600 dark:text-sky-400 flex-shrink-0">
                                    {label}
                                </code>
                                <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex-1 min-w-0">
                                    {t(cmd.descriptionKey)}
                                </span>
                                {(cmd.path || cmd.portalTab) && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleSlashCommandOpen(cmd)
                                        }
                                        className="ms-auto min-h-10 shrink-0 rounded-lg px-3 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-400/10"
                                    >
                                        {t("portal_discover_open")}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </SettingsCard>
        </div>
    );
}
