"use client";

import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Reusable filter input component with search icon and clear button
 * @param {Object} props
 * @param {string} props.value - Current filter value
 * @param {Function} props.onChange - Callback when value changes
 * @param {Function} props.onClear - Callback when clear button is clicked
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.autoFocus - Focus the field when it appears
 */
export default function FilterInput({
    value,
    onChange,
    onClear,
    placeholder,
    className = "",
    dataTestId,
    autoFocus = false,
}) {
    const { t } = useTranslation();
    const filterInputRef = useRef(null);
    const wasInputFocusedRef = useRef(false);
    const clearLabel = t("Clear Filter");

    const handleClear = () => {
        if (onClear) {
            onClear();
        } else {
            onChange("");
        }
        wasInputFocusedRef.current = true;
        filterInputRef.current?.focus();
    };

    // Restore focus to filter input after re-renders
    useEffect(() => {
        if (filterInputRef.current && wasInputFocusedRef.current) {
            filterInputRef.current.focus();
        }
    }, [value]);

    useEffect(() => {
        if (autoFocus) {
            filterInputRef.current?.focus();
        }
    }, [autoFocus]);

    return (
        <div className={`relative ${className}`}>
            <Search className="absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
                data-testid={dataTestId}
                type="text"
                className="lb-input h-full min-h-0 w-full ps-10 pe-10"
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
                    data-testid={dataTestId ? `${dataTestId}-clear` : undefined}
                    className="absolute inset-y-0 end-2 flex items-center"
                    onClick={handleClear}
                    aria-label={clearLabel}
                    title={clearLabel}
                    type="button"
                >
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
            )}
        </div>
    );
}
