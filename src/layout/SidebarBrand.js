"use client";

import { useContext } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { LanguageContext } from "../contexts/LanguageProvider";
import { ThemeContext } from "../contexts/ThemeProvider";
import config from "../../config";
import { cn } from "@/lib/utils";

export default function SidebarBrand({ collapsed }) {
    const { t } = useTranslation();
    const { language, direction } = useContext(LanguageContext);
    const { theme } = useContext(ThemeContext);
    const { getLogo, getSidebarLogo, siteTitle } = config.global;

    return (
        <div className="-mx-5 flex h-16 shrink-0 items-center border-b border-gray-200 px-2 dark:border-gray-700">
            <Popover>
                <PopoverTrigger
                    aria-label={t("About {{name}}", { name: siteTitle })}
                    title={t("About {{name}}", { name: siteTitle })}
                    className={cn(
                        "flex min-w-10 items-center rounded-lg text-gray-800 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-100 dark:hover:bg-gray-700",
                        collapsed
                            ? "h-14 flex-col justify-center gap-0"
                            : "h-10 gap-2",
                    )}
                >
                    <img
                        src={getLogo(language, theme)}
                        alt=""
                        className="mx-1 h-8 w-8 shrink-0 object-contain"
                    />
                    <span
                        className={cn(
                            "font-medium",
                            collapsed ? "text-[10px] leading-4" : "text-sm",
                        )}
                    >
                        {t(siteTitle)}
                    </span>
                </PopoverTrigger>
                <PopoverContent
                    dir={direction}
                    side="bottom"
                    align="start"
                    className="w-[min(32rem,calc(100vw-1rem))] space-y-4"
                >
                    <div className="[&>div]:flex-wrap [&>div]:whitespace-normal [&_span.hidden]:inline">
                        {getSidebarLogo(language)}
                    </div>
                    <Link
                        href="/"
                        className="inline-flex min-h-10 items-center text-sm text-sky-700 hover:underline dark:text-sky-400"
                    >
                        {t("Home")}
                    </Link>
                </PopoverContent>
            </Popover>
        </div>
    );
}
