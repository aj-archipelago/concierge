"use client";

import { useTranslation } from "react-i18next";
import { AppHeaderPortal, useAppHeader } from "../contexts/AppHeaderContext";
import { cn } from "@/lib/utils";
import styles from "./PageHeader.module.css";

export default function PageHeader({
    title,
    titleKey,
    descriptionKey,
    description,
    children,
    leading,
    enabled = true,
    compactActions = false,
}) {
    const { t, i18n } = useTranslation();
    title = titleKey ? t(titleKey) : title;
    description = descriptionKey ? t(descriptionKey) : description;
    const header = useAppHeader();
    const direction = header?.direction || i18n?.dir?.() || "ltr";
    const hosted = enabled && header;
    const Title = typeof title === "string" ? "h1" : "div";
    return (
        <AppHeaderPortal enabled={enabled}>
            <div
                data-page-header
                dir={direction}
                className={
                    hosted
                        ? "contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-2"
                        : "mb-4 flex flex-wrap items-center gap-3"
                }
            >
                <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-2">
                    {leading || (hosted && header.navigation)}
                    <div className="min-w-0">
                        <Title
                            className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base"
                            title={
                                typeof title === "string" ? title : undefined
                            }
                        >
                            {title}
                        </Title>
                        {description && (
                            <div
                                className="max-w-xl whitespace-normal break-words text-xs text-gray-500 dark:text-gray-400"
                                title={
                                    typeof description === "string"
                                        ? description
                                        : undefined
                                }
                            >
                                {description}
                            </div>
                        )}
                    </div>
                    {compactActions && (
                        <div className={styles.controls}>{children}</div>
                    )}
                </div>
                {!compactActions && children && (
                    <div
                        data-page-header-controls
                        className={cn(
                            styles.controls,
                            "col-span-3 col-start-1 row-start-2 flex min-w-0 max-w-full flex-wrap items-center gap-2 pt-2 text-sm lg:py-0 [&>button]:min-w-10",
                            !hosted && "flex-1",
                        )}
                    >
                        {children}
                    </div>
                )}
            </div>
        </AppHeaderPortal>
    );
}
