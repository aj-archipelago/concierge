import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import config from "../config";
import App from "../src/App";
import { getRecentChatsOfCurrentUser } from "./api/chats/_lib";
import { getCurrentUser } from "./api/utils/auth";
import Providers from "./providers";
import classNames from "./utils/class-names";
import {
    getTranscribeAlternateModelOption,
    getTranscribeDefaultModelOption,
    isXaiTranscribeDefaultEnabled,
    isXaiTranscribeEnabled,
} from "./api/utils/transcribe-model-options";
import {
    HydrationBoundary,
    QueryClient,
    dehydrate,
} from "@tanstack/react-query";
import { headers } from "next/headers";

const font = Inter({ subsets: ["latin"] });
const neuralspaceEnabled = process.env.ENABLE_NEURALSPACE === "true";
const xaiTranscribeEnabled = isXaiTranscribeEnabled();
const xaiTranscribeDefaultEnabled = isXaiTranscribeDefaultEnabled();
const transcribeDefaultModelOption = getTranscribeDefaultModelOption();
const transcribeAlternateModelOption = getTranscribeAlternateModelOption();

const SOCIAL_DESCRIPTION =
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "Concierge - AI workspace for research, writing, and collaboration.";

export async function generateMetadata() {
    const cookieStore = await cookies();
    const language = cookieStore.get("i18next")?.value || "en";
    const { getLogo, siteTitle } = config.global;

    const headerList = await headers();
    const host =
        headerList.get("x-forwarded-host") ||
        headerList.get("host") ||
        "localhost:3000";
    const protocol = headerList.get("x-forwarded-proto") || "https";
    const siteUrl = `${protocol}://${host}`;
    const ogLogoPath = getLogo(language, "light");
    const faviconPath = getLogo(language, "dark");
    const ogImageUrl = new URL(ogLogoPath, `${siteUrl}/`).href;

    return {
        metadataBase: new URL(siteUrl),
        title: { default: siteTitle, template: `%s | ${siteTitle}` },
        description: SOCIAL_DESCRIPTION,
        icons: {
            icon: [{ url: faviconPath, type: "image/png" }],
            shortcut: [{ url: faviconPath, type: "image/png" }],
            apple: [{ url: faviconPath, type: "image/png" }],
        },
        openGraph: {
            type: "website",
            locale: language === "ar" ? "ar_AR" : "en_US",
            url: siteUrl,
            siteName: siteTitle,
            title: siteTitle,
            description: SOCIAL_DESCRIPTION,
            images: [
                {
                    url: ogImageUrl,
                    alt: siteTitle,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: siteTitle,
            description: SOCIAL_DESCRIPTION,
            images: [ogImageUrl],
        },
    };
}

export default async function RootLayout({ children }) {
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host");
    const protocol = headerList.get("x-forwarded-proto");
    const serverUrl = `${protocol}://${host}`;
    const useBlueGraphQL = !!process.env.CORTEX_GRAPHQL_API_BLUE_URL;
    const graphQLPublicEndpoint = config.global.getPublicGraphQLEndpoint(
        process.env.CORTEX_GRAPHQL_API_URL || "http://localhost:4000/graphql",
    );

    const cookieStore = await cookies();
    const language = cookieStore.get("i18next")?.value || "en";
    const theme = cookieStore.get("theme")?.value || "light";

    // This is optional, but it will make the initial load faster
    // The approach is outlined here (look at the app router example, not the pages router example )
    // https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr#prefetching-and-dehydrating-data
    const queryClient = new QueryClient();
    let initialActiveChats;
    await queryClient.prefetchQuery({
        queryKey: ["currentUser"],
        queryFn: async () => {
            return (await getCurrentUser()).toJSON();
        },
        staleTime: Infinity,
    });

    try {
        const activeChats = await getRecentChatsOfCurrentUser();
        initialActiveChats = activeChats
            ? JSON.parse(JSON.stringify(activeChats))
            : activeChats;
    } catch (error) {
        console.warn("Failed to prefetch active chats:", error);
        initialActiveChats = undefined;
    }

    return (
        <html lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
            <head>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap"
                />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css?family=Playfair Display"
                />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500;600;700&family=Noto+Sans+Arabic:wght@300;400;500;700&display=swap"
                />
            </head>
            <body
                id="concierge-root"
                className={classNames(theme, font.className)}
            >
                <Providers>
                    <HydrationBoundary state={dehydrate(queryClient)}>
                        <App
                            theme={theme}
                            language={language}
                            serverUrl={serverUrl}
                            graphQLPublicEndpoint={graphQLPublicEndpoint}
                            neuralspaceEnabled={neuralspaceEnabled}
                            xaiTranscribeEnabled={xaiTranscribeEnabled}
                            xaiTranscribeDefaultEnabled={
                                xaiTranscribeDefaultEnabled
                            }
                            transcribeDefaultModelOption={
                                transcribeDefaultModelOption
                            }
                            transcribeAlternateModelOption={
                                transcribeAlternateModelOption
                            }
                            useBlueGraphQL={useBlueGraphQL}
                            initialActiveChats={initialActiveChats}
                        >
                            {children}
                        </App>
                    </HydrationBoundary>
                </Providers>
            </body>
        </html>
    );
}
