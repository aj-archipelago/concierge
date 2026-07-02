"use client";

import { useState } from "react";
import { Share2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import ShareDialog from "./ShareDialog";
import { useShareSettings } from "./useShareSettings";

export default function ShareButton({
    entityType,
    entityId,
    legacyShared = false,
    label = "Share",
    variant = "outline",
    size = "sm",
    showLabel = true,
    className = "",
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const { isShared } = useShareSettings(entityType, entityId, {
        legacyShared,
    });

    if (!entityId || !entityType) return null;

    const sharedClassName = isShared
        ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/30"
        : "";
    const Icon = isShared ? Users : Share2;
    const ariaLabel = isShared ? t("Shared") : label;

    return (
        <>
            <Button
                type="button"
                variant={variant}
                size={size}
                className={[className, sharedClassName]
                    .filter(Boolean)
                    .join(" ")}
                onClick={() => setOpen(true)}
                aria-label={ariaLabel}
                title={ariaLabel}
            >
                <span className="relative inline-flex">
                    <Icon className={showLabel ? "me-2 h-4 w-4" : "h-4 w-4"} />
                    {isShared && !showLabel ? (
                        <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-500 ring-2 ring-white dark:ring-gray-800" />
                    ) : null}
                </span>
                {showLabel ? (isShared ? t("Shared") : label) : null}
            </Button>
            <ShareDialog
                open={open}
                onOpenChange={setOpen}
                entityType={entityType}
                entityId={entityId}
            />
        </>
    );
}
