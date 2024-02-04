import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import config from "../config";
import App from "../src/App";
import classNames from "./utils/class-names";

const font = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }) {
    const { getLogo } = config.global;

    const cookieStore = cookies();
    const language = cookieStore.get("i18next")?.value || "en";
    const theme = cookieStore.get("theme")?.value || "light";

    return (
        <html lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
            <head>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css?family=Playfair Display"
                />
                <link rel="icon" type="image/png" href={getLogo(language)} />
            </head>
            <body
                id="labeeb-root"
                className={classNames(theme, font.className)}
            >
                <App theme={theme} language={language}>
                    {children}
                </App>
            </body>
        </html>
    );
}
