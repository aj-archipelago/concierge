"use client";

import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plug, BookOpen, KeyRound } from "lucide-react";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { McpConfigContent } from "../chat/McpConfigDialog";
import { SkillsContent } from "../chat/SkillsDialog";
import SecretsEditor from "../SecretsEditor";
import { SettingsCard } from "./SettingsPrimitives";

const SUB_TABS = [
    {
        id: "connectors",
        icon: Plug,
        labelKey: "Connectors",
        description: "portal_connectors_description",
    },
    {
        id: "skills",
        icon: BookOpen,
        labelKey: "Skills",
        description: "portal_skills_description",
    },
    {
        id: "secrets",
        icon: KeyRound,
        labelKey: "Secrets",
        description: "portal_secrets_description",
    },
];

export default function CapabilitiesSection({ initialSubTab = "connectors" }) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction } = useContext(LanguageContext);
    const canUseSecrets = Boolean(user?.personalEntityId);
    const [activeSubTab, setActiveSubTab] = useState(initialSubTab);
    const [tabKeys, setTabKeys] = useState({
        connectors: 0,
        skills: 0,
        secrets: 0,
    });
    const visibleTabs = canUseSecrets
        ? SUB_TABS
        : SUB_TABS.filter((tab) => tab.id !== "secrets");
    const selectedTab =
        visibleTabs.find((tab) => tab.id === activeSubTab) || visibleTabs[0];

    useEffect(() => {
        setActiveSubTab(
            SUB_TABS.some((tab) => tab.id === initialSubTab) &&
                (initialSubTab !== "secrets" || canUseSecrets)
                ? initialSubTab
                : "connectors",
        );
    }, [initialSubTab, canUseSecrets]);

    const handleTabChange = (id) => {
        setActiveSubTab(id);
        setTabKeys((prev) => ({ ...prev, [id]: prev[id] + 1 }));
    };

    return (
        <div dir={direction} className="space-y-5">
            <nav
                aria-label={t("portal_tab_capabilities")}
                className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-950/30"
            >
                {visibleTabs.map(({ id, icon: Icon, labelKey }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => handleTabChange(id)}
                        aria-current={
                            selectedTab.id === id ? "page" : undefined
                        }
                        className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:text-sm ${selectedTab.id === id ? "bg-white text-sky-800 shadow-sm dark:bg-gray-700 dark:text-sky-200" : "text-gray-500 hover:bg-white/60 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"}`}
                    >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t(labelKey)}
                    </button>
                ))}
            </nav>
            <SettingsCard
                icon={selectedTab.icon}
                title={t(selectedTab.labelKey)}
                description={t(selectedTab.description)}
            >
                {selectedTab.id === "connectors" && (
                    <McpConfigContent key={tabKeys.connectors} />
                )}
                {selectedTab.id === "skills" && (
                    <SkillsContent key={tabKeys.skills} />
                )}
                {selectedTab.id === "secrets" && canUseSecrets && (
                    <SecretsEditor
                        key={tabKeys.secrets}
                        entityId={user.personalEntityId}
                        onClose={() => handleTabChange("secrets")}
                        closeOnSave={false}
                    />
                )}
            </SettingsCard>
        </div>
    );
}
