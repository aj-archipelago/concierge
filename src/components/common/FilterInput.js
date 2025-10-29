"use client";

import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

/**
 * Reusable filter input component with search icon and clear button
 * @param {Object} props
 * @param {string} props.value - Current filter value
 * @param {Function} props.onChange - Callback when value changes
 * @param {Function} props.onClear - Callback when clear button is clicked
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - Additional CSS classes
 */
export default function FilterInput({
    value,
    onChange,
    onClear,
    placeholder,
    className = "",
}) {
    const { t } = useTranslation();
    const filterInputRef = useRef(null);
    const wasInputFocusedRef = useRef(false);
    const isRtl = i18next.language === "ar";

    // Restore focus to filter input after re-renders
    useEffect(() => {
        if (filterInputRef.current && wasInputFocusedRef.current) {
            filterInputRef.current.focus();
        }
    }, [value]);

    return (
        <div className={`relative ${className}`}>
            <Search
                className={`absolute ${isRtl ? "right-3" : "left-3"} top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400`}
            />
            <input
                type="text"
                className={`lb-input w-full ${isRtl ? "pr-10 pl-10" : "pl-10 pr-10"}`}
                placeholder={placeholder || t("Filter...")}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => {
                    wasInputFocusedRef.current = true;
                }}
                onBlur={() => {
                    wasInputFocusedRef.current = false;
                }}
                ref={filterInputRef}
            />
            {value && (
                <button
                    className={`absolute inset-y-0 ${isRtl ? "left-0 pl-3" : "right-0 pr-3"} flex items-center`}
                    onClick={onClear}
                    type="button"
                >
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
            )}
        </div>
    );
}
