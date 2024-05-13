import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../contexts/LanguageProvider";
import { ThemeContext } from "../contexts/ThemeProvider";
import { basePath } from "../utils/constants";

export default function Footer() {
    const { t } = useTranslation();
    const { changeLanguage } = useContext(LanguageContext);
    const { changeTheme } = useContext(ThemeContext);

    return (
        <div className="flex justify-end gap-8 bottom-0 items-center text-xs text-sky-700 px-4 py-2 bg-zinc-200">
            <div>{t("footer_copyright")}</div>
            <div>
                <button
                    className="text-sky-600 hover:underline"
                    onClick={() => changeLanguage("en")}
                >
                    English
                </button>
                &nbsp;|&nbsp;
                <button
                    className="text-sky-600 hover:underline"
                    onClick={() => changeLanguage("ar")}
                >
                    عربي
                </button>
            </div>
            <div>
                <button
                    className="text-sky-600 hover:underline"
                    onClick={() => changeTheme("light")}
                >
                    {t("Light")}
                </button>
                &nbsp;|&nbsp;
                <button
                    className="text-sky-600 hover:underline"
                    onClick={() => changeTheme("dark")}
                >
                    {t("Dark")}
                </button>
            </div>
            <div className="flex gap-2 items-center">
                {t("Powered by")}
                <img
                    src={`${basePath || ""}/assets/azure-openai-logo.png`}
                    alt="azure openai logo"
                    style={{ height: 20 }}
                    height="20px"
                />
            </div>
        </div>
    );
}
