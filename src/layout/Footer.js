import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../contexts/LanguageProvider";
import { ThemeContext } from "../contexts/ThemeProvider";
import { basePath } from "../utils/constants";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FaGear } from "react-icons/fa6";

export default function Footer() {
    const { t } = useTranslation();
    const { language, changeLanguage } = useContext(LanguageContext);
    const { theme, changeTheme } = useContext(ThemeContext);

    return (
        <div className="h-10 flex gap-1 justify-between gap-2 sm:gap-8 bottom-0 items-center text-xs text-sky-700 px-4 py-2 bg-zinc-200">
            <div className="truncate">{t("footer_copyright")}</div>

            <div className="flex gap-8 items-center">
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <span className="text-sky-700">{t("Settings")}</span>
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

                <div className="gap-2 items-center hidden sm:flex">
                    {t("Powered by")}
                    <img
                        src={`${basePath || ""}/assets/azure-openai-logo.png`}
                        alt="azure openai logo"
                        style={{ height: 20 }}
                        height="20px"
                    />
                </div>
            </div>
        </div>
    );
}
