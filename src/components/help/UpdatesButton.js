"use client";

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { BookOpen, Gift, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../../App";
import { getAllHelpItems, getUnseenCount } from "../../content/help-content";
import {
    categoryColorClasses,
    getCategoryLabel,
    releaseNoteColorClasses,
    formatHelpDate,
} from "./categoryColors";

const MAX_POPOVER_ITEMS = 10;

export default function UpdatesButton() {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const { userState, debouncedUpdateUserState } =
        useContext(AuthContext) || {};

    const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
    const lastSeen = userState?.preferences?.lastSeenHelpTimestamp || null;
    const allItems = useMemo(() => getAllHelpItems(lang), [lang]);
    const unseenCount = useMemo(
        () => getUnseenCount(lastSeen, lang),
        [lastSeen, lang],
    );

    const handleOpenChange = (open) => {
        setIsOpen(open);
        if (open && debouncedUpdateUserState) {
            debouncedUpdateUserState((prev) => ({
                ...prev,
                preferences: {
                    ...prev?.preferences,
                    lastSeenHelpTimestamp: new Date().toISOString(),
                },
            }));
        }
    };

    const handleItemClick = (item) => {
        setIsOpen(false);
        if (item.type === "guide") {
            router.push(`/help/guides/${item.id}`);
        } else {
            router.push(`/help?tab=releases&item=${item.id}`);
        }
    };

    const isItemUnseen = (item) => {
        if (!lastSeen) return true;
        return new Date(item.date) > new Date(lastSeen);
    };

    return (
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
            <PopoverTrigger className="relative mt-1">
                <Gift
                    className="h-5 w-5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    stroke="#0284c7"
                    fill={isOpen ? "#0284c7" : "none"}
                />
                {unseenCount > 0 && (
                    <>
                        <span className="absolute -top-1 -end-1 h-4 w-4 rounded-full bg-red-500 animate-ping opacity-75" />
                        <span className="absolute -top-1 -end-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
                            {unseenCount > 9 ? "9+" : unseenCount}
                        </span>
                    </>
                )}
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="space-y-4">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {t("What's New")}
                    </h3>
                    <div className="max-h-[300px] overflow-y-auto">
                        {allItems.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                {t("No updates yet")}
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {allItems
                                    .slice(0, MAX_POPOVER_ITEMS)
                                    .map((item) => (
                                        <button
                                            key={`${item.type}-${item.id}`}
                                            onClick={() =>
                                                handleItemClick(item)
                                            }
                                            className="flex items-start gap-3 w-full text-start p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <div className="pt-0.5 shrink-0">
                                                {item.type === "guide" ? (
                                                    <BookOpen className="h-4 w-4 text-sky-500" />
                                                ) : (
                                                    <Tag className="h-4 w-4 text-emerald-500" />
                                                )}
                                            </div>
                                            <div className="flex flex-col overflow-hidden grow">
                                                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                                    {item.title}
                                                </span>
                                                <span className="text-xs mt-0.5">
                                                    {item.type === "release" ? (
                                                        <span
                                                            className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${releaseNoteColorClasses}`}
                                                        >
                                                            v{item.version}
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium ${categoryColorClasses[item.category] || categoryColorClasses.general}`}
                                                        >
                                                            {t(
                                                                getCategoryLabel(
                                                                    item.category,
                                                                ),
                                                            )}
                                                        </span>
                                                    )}
                                                    <span className="text-gray-400 dark:text-gray-500 ms-1.5">
                                                        {formatHelpDate(
                                                            item.date,
                                                        )}
                                                    </span>
                                                </span>
                                            </div>
                                            {isItemUnseen(item) && (
                                                <span className="shrink-0 mt-1 h-2 w-2 rounded-full bg-sky-500" />
                                            )}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end">
                        <button
                            className="text-sm text-sky-500 hover:text-sky-600"
                            onClick={() => {
                                router.push("/help");
                                setIsOpen(false);
                            }}
                        >
                            {t("View all")}
                        </button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
