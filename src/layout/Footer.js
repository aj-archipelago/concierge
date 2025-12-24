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
import { AuthContext } from "../App";
import {
    getProviderFromModelId,
    DEFAULT_AGENT_MODEL,
} from "../../app/utils/agent-model-mapping";
import {
    OpenAIIcon,
    GoogleGeminiIcon,
    AnthropicIcon,
    XAIGrokIcon,
} from "../components/icons/ModelIcons";

export default function Footer() {
    const { t } = useTranslation();
    const { language, changeLanguage } = useContext(LanguageContext);
    const { theme, changeTheme } = useContext(ThemeContext);
    const { user } = useContext(AuthContext);
    const currentYear = new Date().getFullYear();
    const copyrightText = t("footer_copyright", { year: currentYear });

    // Get the provider icon for the current agent model
    const agentModel = user?.agentModel || DEFAULT_AGENT_MODEL;
    const provider = getProviderFromModelId(agentModel);

    const getProviderIcon = () => {
        switch (provider) {
            case "openai":
                return <OpenAIIcon className="w-4 h-4" />;
            case "google":
                return <GoogleGeminiIcon className="w-4 h-4" />;
            case "anthropic":
                return <AnthropicIcon className="w-4 h-4" />;
            case "xai":
                return <XAIGrokIcon className="w-4 h-4" />;
            default:
                return <OpenAIIcon className="w-4 h-4" />;
        }
    };

    return (
        <div className="h-10 flex gap-1 justify-between sm:gap-8 bottom-0 items-center text-xs text-sky-700 dark:text-sky-400 px-4 py-2 bg-zinc-200 dark:bg-gray-800">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <div className="truncate text-xs">{copyrightText}</div>
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
                        <span className="hidden sm:inline">
                            {t("Settings")}
                        </span>
                        <span className="sm:hidden">⚙️</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top">
                        <DropdownMenuItem
                            onClick={() => {
                                if (language === "en") {
                                    changeLanguage("ar");
                                } else {
                                    changeLanguage("en");
                                }
                            }}
                            className="cursor-pointer"
                        >
                            {language === "en" ? "عربي" : "Switch to English"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                if (theme === "light") {
                                    changeTheme("dark");
                                } else {
                                    changeTheme("light");
                                }
                            }}
                            className="cursor-pointer"
                        >
                            {theme === "light"
                                ? t("Dark mode")
                                : t("Light mode")}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <div className="hidden sm:flex gap-2 items-center text-xs">
                    <span className="hidden lg:inline">{t("Powered by")}</span>
                    <div className="flex items-center">{getProviderIcon()}</div>
                </div>
            </div>
        </div>
    );
}
