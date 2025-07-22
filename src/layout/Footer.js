import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { LanguageContext } from "../contexts/LanguageProvider";
import { ThemeContext } from "../contexts/ThemeProvider";
import { basePath } from "../utils/constants";

export default function Footer() {
    const { t } = useTranslation();
    const { language, changeLanguage } = useContext(LanguageContext);
    const { theme, changeTheme } = useContext(ThemeContext);

    return (
        <div className="h-10 flex gap-1 justify-between sm:gap-8 bottom-0 items-center text-xs text-sky-700 dark:text-sky-400 px-4 py-2 bg-zinc-200 dark:bg-gray-800">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <div className="truncate text-xs">{t("footer_copyright")}</div>
                <Link
                    href="/privacy"
                    className="text-sky-700 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 text-xs hidden md:block"
                >
                    {t("footer_privacy_policy")}
                </Link>
            </div>

            <div className="flex gap-2 sm:gap-8 items-center flex-shrink-0">
                <DropdownMenu>
                    <DropdownMenuTrigger className="text-sky-700 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 text-xs">
                        <span className="hidden sm:inline">{t("Settings")}</span>
                        <span className="sm:hidden">⚙️</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top">
                        <DropdownMenuItem>
                            <button
                                className="w-full"
                                onClick={() => {
                                    if (language === "en") {
                                        changeLanguage("ar");
                                    } else {
                                        changeLanguage("en");
                                    }
                                }}
                            >
                                {language === "en"
                                    ? "عربي"
                                    : "Switch to English"}
                            </button>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <button
                                className="w-full"
                                onClick={() => {
                                    if (theme === "light") {
                                        changeTheme("dark");
                                    } else {
                                        changeTheme("light");
                                    }
                                }}
                            >
                                {theme === "light"
                                    ? t("Dark mode")
                                    : t("Light mode")}
                            </button>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex gap-1 items-center text-xs hidden sm:flex">
                    <span className="hidden lg:inline">{t("Powered by")}</span>
                    <img
                        src={`${basePath || ""}/assets/azure-openai-logo.png`}
                        alt="azure openai logo"
                        style={{ height: 16 }}
                        height="16px"
                        className="h-4 w-auto"
                    />
                </div>
            </div>
        </div>
    );
}
