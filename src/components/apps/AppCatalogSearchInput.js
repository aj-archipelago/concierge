"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export default function AppCatalogSearchInput({
    value,
    onChange,
    placeholder,
    label,
    type = "text",
    className,
    containerClassName,
    onClear,
    dataTestId,
}) {
    const { t } = useTranslation();
    const inputRef = useRef(null);
    const resolvedLabel = label || placeholder || t("Search applets...");
    const clearLabel = t("Clear Filter");

    const handleClear = () => {
        if (onClear) {
            onClear();
        }
        inputRef.current?.focus();
    };

    return (
        <div className={cn("relative min-w-0 flex-1", containerClassName)}>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
                ref={inputRef}
                data-testid={dataTestId}
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                aria-label={resolvedLabel}
                className={cn(
                    "h-10 w-full rounded-md border border-gray-300 bg-white ps-10 pe-3 text-start text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-950",
                    value && onClear && "pe-10",
                    className,
                )}
            />
            {value && onClear && (
                <button
                    data-testid={dataTestId ? `${dataTestId}-clear` : undefined}
                    type="button"
                    className="absolute inset-y-0 end-2 flex min-w-8 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    onClick={handleClear}
                    aria-label={clearLabel}
                    title={clearLabel}
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
