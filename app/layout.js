import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import config from "../config";
import App from "../src/App";
import Providers from "./Providers";
import { getCurrentUser } from "./api/utils/auth";
import classNames from "./utils/class-names";

const font = Inter({ subsets: ["latin"] });
const serverUrl = process.env.SERVER_URL || "http://localhost:3000";

export default async function RootLayout({ children }) {
    const { getLogo } = config.global;

    const cookieStore = cookies();
    const language = cookieStore.get("i18next")?.value || "en";
    const theme = cookieStore.get("theme")?.value || "light";
    let user = await getCurrentUser();

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
                <Providers>
                    <App
                        theme={theme}
                        language={language}
                        user={user}
                        serverUrl={serverUrl}
                    >
                        {children}
                    </App>
                </Providers>
            </body>
        </html>
    );
}
