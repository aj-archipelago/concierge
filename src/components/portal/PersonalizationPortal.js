"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, User, Zap, Users, SlidersHorizontal } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { AuthContext } from "../../App";
import { cn } from "@/lib/utils";
import DiscoverSection from "./DiscoverSection";
import ProfileSection from "./ProfileSection";
import SharingSection from "./SharingSection";
import CapabilitiesSection from "./CapabilitiesSection";

const TABS = [
    {
        id: "discover",
        icon: Compass,
        labelKey: "portal_tab_discover",
        description: "portal_overview_description",
    },
    {
        id: "profile",
        icon: User,
        labelKey: "portal_tab_profile",
        description: "portal_profile_description",
    },
    {
        id: "sharing",
        icon: Users,
        labelKey: "portal_tab_sharing",
        description: "portal_sharing_description",
    },
    {
        id: "capabilities",
        icon: Zap,
        labelKey: "portal_tab_capabilities",
        description: "portal_capabilities_description",
    },
];

export default function PersonalizationPortal({
    open,
    onClose,
    initialTab = "discover",
    initialSubTab = "connectors",
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const { user } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [capabilitiesSubTab, setCapabilitiesSubTab] = useState(initialSubTab);
    const activeNavRef = useRef(null);

    useEffect(() => {
        if (open) {
            setActiveTab(
                TABS.some((tab) => tab.id === initialTab)
                    ? initialTab
                    : "discover",
            );
            if (initialTab === "capabilities")
                setCapabilitiesSubTab(initialSubTab);
        }
    }, [open, initialTab, initialSubTab]);

    const selectedTab = TABS.find((tab) => tab.id === activeTab) || TABS[0];

    return (
        <Dialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isOpen) onClose();
            }}
        >
            <DialogContent
                dir={direction}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    activeNavRef.current?.focus();
                }}
                overlayClassName="bg-gray-950/50 backdrop-blur-sm dark:bg-gray-950/65"
                className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl border-gray-200 bg-gray-50 p-0 shadow-2xl dark:border-gray-700/80 dark:bg-gray-900 sm:h-[min(90dvh,740px)] sm:max-h-[min(90dvh,740px)] sm:w-full sm:max-w-5xl sm:rounded-3xl"
            >
                <DialogTitle className="sr-only">
                    {t("portal_title")}
                </DialogTitle>
                <DialogDescription className="sr-only">
                    {t("portal_dialog_description")}
                </DialogDescription>
                <div className="flex h-full min-h-0 w-full flex-col sm:flex-row">
                    <aside className="shrink-0 border-b border-gray-200 bg-white dark:border-gray-700/70 dark:bg-gray-950/30 sm:flex sm:w-56 sm:flex-col sm:border-b-0 sm:border-e">
                        <div className="flex items-center gap-3 px-4 pb-3 pe-14 pt-4 sm:px-5 sm:pb-6 sm:pt-7">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
                                <SlidersHorizontal
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                />
                            </span>
                            <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                                {t("portal_title")}
                            </h2>
                        </div>
                        <nav
                            aria-label={t("portal_title")}
                            className="flex gap-1 overflow-x-auto px-3 pb-3 sm:flex-col sm:gap-1.5 sm:overflow-x-visible"
                        >
                            {TABS.map(({ id, icon: Icon, labelKey }) => (
                                <button
                                    key={id}
                                    ref={
                                        activeTab === id
                                            ? activeNavRef
                                            : undefined
                                    }
                                    type="button"
                                    onClick={() => setActiveTab(id)}
                                    aria-current={
                                        activeTab === id ? "page" : undefined
                                    }
                                    className={cn(
                                        "flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                                        activeTab === id
                                            ? "bg-sky-50 font-medium text-sky-800 ring-1 ring-inset ring-sky-200/70 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/15"
                                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                                    )}
                                >
                                    <Icon
                                        className="h-4 w-4 shrink-0"
                                        aria-hidden="true"
                                    />
                                    <span>{t(labelKey)}</span>
                                </button>
                            ))}
                        </nav>
                        {user?.name && (
                            <div className="mx-5 mb-5 mt-auto hidden items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700/70 sm:flex">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                    <User
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
                                    {user.name}
                                </span>
                            </div>
                        )}
                    </aside>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <header className="shrink-0 px-5 pb-4 pt-5 sm:px-8 sm:pe-16 sm:pt-7">
                            <h3 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-2xl">
                                {t(selectedTab.labelKey)}
                            </h3>
                            <p className="mb-0 mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                                {t(selectedTab.description)}
                            </p>
                        </header>
                        <div
                            key={activeTab}
                            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1 sm:px-8 sm:pb-8"
                        >
                            {activeTab === "discover" && <DiscoverSection />}
                            {activeTab === "profile" && <ProfileSection />}
                            {activeTab === "sharing" && <SharingSection />}
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
