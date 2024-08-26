import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import config from "../config";
import App from "../src/App";
import { getCurrentUser } from "./api/utils/auth";
import Providers from "./providers";
import classNames from "./utils/class-names";
import {
    HydrationBoundary,
    QueryClient,
    dehydrate,
} from "@tanstack/react-query";
import { headers } from "next/headers";

const font = Inter({ subsets: ["latin"] });
const neuralspaceEnabled = process.env.ENABLE_NEURALSPACE === "true";

export default async function RootLayout({ children }) {
    const { getLogo } = config.global;

    const host = headers().get("x-forwarded-host");
    const protocol = headers().get("x-forwarded-proto");
    const serverUrl = `${protocol}://${host}`;

    const cookieStore = cookies();
    const language = cookieStore.get("i18next")?.value || "en";
    const theme = cookieStore.get("theme")?.value || "light";

    // This is optional, but it will make the initial load faster
    // The approach is outlined here (look at the app router example, not the pages router example )
    // https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr#prefetching-and-dehydrating-data
    const queryClient = new QueryClient();
    await queryClient.prefetchQuery({
        queryKey: ["currentUser"],
        queryFn: async () => {
            return (await getCurrentUser()).toJSON();
        },
        staleTime: Infinity,
    });

    return (
        <html lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
            <head>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css?family=Roboto&display=swap"
                />
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
                    <HydrationBoundary state={dehydrate(queryClient)}>
                        <App
                            theme={theme}
                            language={language}
                            serverUrl={serverUrl}
                            neuralspaceEnabled={neuralspaceEnabled}
                        >
                            {children}
                        </App>
                    </HydrationBoundary>
                </Providers>
            </body>
        </html>
    );
}
