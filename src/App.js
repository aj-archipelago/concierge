"use client";

import { ApolloProvider } from "@apollo/client";
import React, { useContext } from "react";
import { client } from "./graphql";
import "./i18n";

import * as amplitude from "@amplitude/analytics-browser";
import i18next from "i18next";
import { Provider } from "react-redux";
import classNames from "../app/utils/class-names";
import "./App.scss";
import Tos from "./components/Tos";
import { LanguageContext, LanguageProvider } from "./contexts/LanguageProvider";
import { ThemeProvider } from "./contexts/ThemeProvider";
import Layout from "./layout/Layout";
import store from "./store";
import "./tailwind.css";
import { CortexConfigProvider } from "./contexts/CortexConfigProvider";

const { NEXT_PUBLIC_AMPLITUDE_API_KEY } = process.env;

if (typeof document !== "undefined") {
    amplitude.init(NEXT_PUBLIC_AMPLITUDE_API_KEY, {
        defaultTracking: true,
    });
}

const App = ({ children }) => {
    return (
        <CortexConfigProvider>
            <ApolloProvider client={client}>
                <Provider store={store}>
                    <ThemeProvider>
                        <LanguageProvider>
                            <React.StrictMode>
                                <Layout>
                                    <Body>{children}</Body>
                                </Layout>
                            </React.StrictMode>
                        </LanguageProvider>
                    </ThemeProvider>
                </Provider>
            </ApolloProvider>
        </CortexConfigProvider>
    );
};

const Body = ({ children }) => {
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
