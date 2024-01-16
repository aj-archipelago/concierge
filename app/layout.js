import App from "../src/App";
import { Inter } from "next/font/google";
import classNames from "./utils/class-names";
import config from "../config";
import i18next from "i18next";

const font = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }) {
    const { getLogo } = config.global;
    const { language } = i18next;

    return (
        <html lang="en" dir="ltr">
            <head>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css?family=Playfair Display"
                />
                <link rel="icon" type="image/png" href={getLogo(language)} />
            </head>
            <body
                id="labeeb-root"
                className={classNames("light", font.className)}
            >
                <App>{children}</App>
            </body>
        </html>
    );
}
