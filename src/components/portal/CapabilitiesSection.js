"use client";

import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plug, BookOpen, KeyRound } from "lucide-react";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { McpConfigContent } from "../chat/McpConfigDialog";
import { SkillsContent } from "../chat/SkillsDialog";
import SecretsEditor from "../SecretsEditor";

const SUB_TABS = [
    { id: "connectors", icon: Plug, labelKey: "Connectors" },
    { id: "skills", icon: BookOpen, labelKey: "Skills" },
    { id: "secrets", icon: KeyRound, labelKey: "Secrets" },
];

export default function CapabilitiesSection({ initialSubTab = "connectors" }) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction } = useContext(LanguageContext);

    const [activeSubTab, setActiveSubTab] = useState(initialSubTab);
    const [tabKeys, setTabKeys] = useState({
        connectors: 0,
        skills: 0,
        secrets: 0,
    });

    const handleTabChange = (id) => {
        setActiveSubTab(id);
        setTabKeys((prev) => ({ ...prev, [id]: prev[id] + 1 }));
    };

    const visibleTabs = user?.personalEntityId
        ? SUB_TABS
        : SUB_TABS.filter((tab) => tab.id !== "secrets");

    const activeLabel =
        t(visibleTabs.find((tab) => tab.id === activeSubTab)?.labelKey || "") ||
        "";

    return (
        <div className="space-y-4">
            {/* Mobile: shadcn Select for sub-tab nav */}
            <div className="sm:hidden">
                <Select value={activeSubTab} onValueChange={handleTabChange}>
                    <SelectTrigger
                        dir={direction}
                        className="w-full"
                        aria-label={t("portal_tab_capabilities")}
                    >
                        <SelectValue placeholder={activeLabel}>
                            <span className="flex items-center gap-2">
                                {(() => {
                                    const ActiveIcon = visibleTabs.find(
                                        (tab) => tab.id === activeSubTab,
                                    )?.icon;
                                    return ActiveIcon ? (
                                        <ActiveIcon className="h-4 w-4" />
                                    ) : null;
                                })()}
                                <span>{activeLabel}</span>
                            </span>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent dir={direction}>
                        {visibleTabs.map(({ id, icon: Icon, labelKey }) => (
                            <SelectItem key={id} value={id}>
                                <span className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    <span>{t(labelKey)}</span>
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Desktop: horizontal tab strip */}
            <div className="hidden sm:flex gap-1 border-b border-gray-200 dark:border-gray-700">
                {visibleTabs.map(({ id, icon: Icon, labelKey }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => handleTabChange(id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                            activeSubTab === id
                                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {t(labelKey)}
                    </button>
                ))}
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
                {activeSubTab === "connectors" && (
                    <McpConfigContent key={tabKeys.connectors} />
                )}
                {activeSubTab === "skills" && (
                    <SkillsContent key={tabKeys.skills} />
                )}
                {activeSubTab === "secrets" && user?.personalEntityId && (
                    <SecretsEditor
                        key={tabKeys.secrets}
                        entityId={user.personalEntityId}
                        onClose={() => {}}
                        closeOnSave={false}
                    />
                )}
            </div>
        </div>
    );
}
