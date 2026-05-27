"use client";

import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, User, Bot, Brain, Zap } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { cn } from "@/lib/utils";

import DiscoverSection from "./DiscoverSection";
import ProfileSection from "./ProfileSection";
import AIAssistantSection from "./AIAssistantSection";
import MemorySection from "./MemorySection";
import CapabilitiesSection from "./CapabilitiesSection";

const TABS = [
    { id: "discover", icon: Compass, labelKey: "portal_tab_discover" },
    { id: "profile", icon: User, labelKey: "portal_tab_profile" },
    { id: "ai-assistant", icon: Bot, labelKey: "portal_tab_ai_assistant" },
    { id: "memory", icon: Brain, labelKey: "portal_tab_memory" },
    { id: "capabilities", icon: Zap, labelKey: "portal_tab_capabilities" },
];

export default function PersonalizationPortal({
    open,
    onClose,
    initialTab = "discover",
    initialSubTab = "connectors",
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);

    const [activeTab, setActiveTab] = useState(initialTab);
    const [capabilitiesSubTab, setCapabilitiesSubTab] = useState(initialSubTab);

    useEffect(() => {
        if (open) {
            setActiveTab(initialTab);
            if (initialTab === "capabilities") {
                setCapabilitiesSubTab(initialSubTab);
            }
        }
    }, [open, initialTab, initialSubTab]);

    const activeTabLabel =
        t(TABS.find((tab) => tab.id === activeTab)?.labelKey || "") || "";

    return (
        <Dialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
        >
            <DialogContent
                dir={direction}
                className={cn(
                    "p-0 gap-0 overflow-hidden",
                    // Mobile: nearly full screen
                    "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] rounded-lg",
                    // Desktop: bounded
                    "sm:w-full sm:max-w-4xl sm:h-[min(90vh,700px)] sm:max-h-[min(90vh,700px)]",
                )}
            >
                <DialogTitle className="sr-only">
                    {t("portal_title")}
                </DialogTitle>
                <DialogDescription className="sr-only">
                    {t("portal_dialog_description")}
                </DialogDescription>
                <div className="flex flex-col sm:flex-row h-full min-h-0">
                    {/* Mobile: shadcn Select dropdown for section nav */}
                    <div className="sm:hidden border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 ps-3 pe-12 py-3">
                        <Select
                            value={activeTab}
                            onValueChange={(v) => setActiveTab(v)}
                        >
                            <SelectTrigger
                                dir={direction}
                                className="w-full bg-white dark:bg-gray-800"
                                aria-label={t("portal_title")}
                            >
                                <SelectValue placeholder={activeTabLabel}>
                                    <span className="flex items-center gap-2">
                                        {(() => {
                                            const ActiveIcon = TABS.find(
                                                (tab) => tab.id === activeTab,
                                            )?.icon;
                                            return ActiveIcon ? (
                                                <ActiveIcon className="h-4 w-4" />
                                            ) : null;
                                        })()}
                                        <span>{activeTabLabel}</span>
                                    </span>
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent dir={direction}>
                                {TABS.map(({ id, icon: Icon, labelKey }) => (
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

                    {/* Desktop: vertical sidebar. dir attribute on parent flips border side automatically. */}
                    <div className="hidden sm:flex sm:flex-col shrink-0 sm:w-48 bg-gray-50 dark:bg-gray-900 sm:overflow-y-auto sm:border-e border-gray-200 dark:border-gray-700 sm:py-3">
                        <div className="px-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t("portal_title")}
                            </h2>
                        </div>
                        <nav className="flex flex-col flex-1 py-2">
                            {TABS.map(({ id, icon: Icon, labelKey }) => {
                                const active = activeTab === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActiveTab(id)}
                                        className={cn(
                                            "flex items-center gap-2.5 text-sm transition-colors whitespace-nowrap",
                                            "justify-start px-4 py-2.5 text-start",
                                            active
                                                ? "bg-white dark:bg-gray-800 text-sky-600 dark:text-sky-400 font-medium border-e-2 border-sky-500"
                                                : "text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-100",
                                        )}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span>{t(labelKey)}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Content pane */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                        <div className="hidden sm:flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                {activeTabLabel}
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
                            {activeTab === "discover" && <DiscoverSection />}
                            {activeTab === "profile" && <ProfileSection />}
                            {activeTab === "ai-assistant" && (
                                <AIAssistantSection />
                            )}
                            {activeTab === "memory" && <MemorySection />}
                            {activeTab === "capabilities" && (
                                <CapabilitiesSection
                                    initialSubTab={capabilitiesSubTab}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
