"use client";
import { ApolloProvider } from "@apollo/client";
import React, { useContext } from "react";
import { client } from "./graphql";
import "./i18n";

import * as amplitude from "@amplitude/analytics-browser";
import i18next from "i18next";
import classNames from "../app/utils/class-names";
import "./App.scss";
import StoreProvider from "./StoreProvider";
import { LanguageContext, LanguageProvider } from "./contexts/LanguageProvider";
import { ThemeProvider } from "./contexts/ThemeProvider";
import Layout from "./layout/Layout";
import "./tailwind.css";
import dynamic from "next/dynamic";

const { NEXT_PUBLIC_AMPLITUDE_API_KEY } = process.env;

if (typeof document !== "undefined") {
    amplitude.init(NEXT_PUBLIC_AMPLITUDE_API_KEY, {
        defaultTracking: true,
    });
}

const App = ({ children, language, theme }) => {
    if (i18next.language !== language) {
        i18next.changeLanguage(language);
    }

    return (
        <ApolloProvider client={client}>
            <StoreProvider>
                <ThemeProvider savedTheme={theme}>
                    <LanguageProvider savedLanguage={language}>
                        <React.StrictMode>
                            <Layout>
                                <Body>{children}</Body>
                            </Layout>
                        </React.StrictMode>
                    </LanguageProvider>
                </ThemeProvider>
            </StoreProvider>
        </ApolloProvider>
    );
};

const Body = ({ children, tosTimestamp }) => {
    const Tos = dynamic(() => import("./components/Tos"), {
        ssr: false,
    });
    const containerStyles = {};
    const { language } = useContext(LanguageContext);

    return (
        <div
            dir={language === "ar" ? "rtl" : "ltr"}
            className={classNames("h-full")}
            style={containerStyles}
        >
            {children}
            <Tos />
        </div>
    );
};

export default App;
