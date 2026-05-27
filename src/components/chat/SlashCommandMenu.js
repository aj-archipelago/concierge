"use client";

import React, { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "../../../app/utils/class-names";
import {
    SLASH_COMMANDS,
    getCommandLabel,
    matchesFilter,
} from "../../utils/slashCommands";
import { LanguageContext } from "../../contexts/LanguageProvider";

export default function SlashCommandMenu({
    visible,
    filter,
    onSelect,
    onClose,
}) {
    const { t, i18n } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
        matchesFilter(cmd, filter),
    );

    useEffect(() => {
        setSelectedIndex(0);
    }, [filter]);

    useEffect(() => {
        if (!visible) return;

        const handleKeyDown = (e) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((i) =>
                    Math.min(i + 1, filteredCommands.length - 1),
                );
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                const cmd = filteredCommands[selectedIndex];
                if (cmd) onSelect(cmd.id);
            } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [visible, selectedIndex, filteredCommands, onSelect, onClose]);

    if (!visible || filteredCommands.length === 0) return null;

    return (
        <div
            dir={direction}
            className={classNames(
                "absolute bottom-full start-0 end-0 mb-1 z-50",
                "rounded-lg border border-gray-200 dark:border-gray-600",
                "bg-white dark:bg-gray-800 shadow-lg",
                "max-h-48 overflow-y-auto",
            )}
            role="listbox"
        >
            <div className="py-1">
                {filteredCommands.map((cmd, index) => {
                    const Icon = cmd.icon;
                    const isSelected = index === selectedIndex;
                    const label = getCommandLabel(cmd, lang);
                    const description = cmd.descriptionKey
                        ? t(cmd.descriptionKey)
                        : "";
                    return (
                        <button
                            key={cmd.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={classNames(
                                "w-full flex items-center gap-3 px-3 py-2 text-sm text-start",
                                "transition-colors",
                                isSelected
                                    ? "bg-gray-100 dark:bg-gray-700"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-700/50",
                            )}
                            onMouseEnter={() => setSelectedIndex(index)}
                            onClick={() => onSelect(cmd.id)}
                        >
                            {Icon && (
                                <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                                <div
                                    className="font-medium"
                                    dir={isRTL ? "rtl" : "ltr"}
                                >
                                    {label}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {description}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
