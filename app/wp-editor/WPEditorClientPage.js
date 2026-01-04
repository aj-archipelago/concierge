"use client";

import React from "react";
import dynamicImport from "next/dynamic";
import { ApolloNextAppProvider } from "@apollo/experimental-nextjs-app-support/ssr";
import { getClient } from "../../src/graphql";
import { DataProvider } from "./contexts/DataProvider";

// Dynamically import WPEditorApp to avoid SSR issues with window access
const WPEditorApp = dynamicImport(
    () => import("./components/editor/WPEditorApp"),
    { ssr: false },
);

function ApolloWrapper({ children }) {
    const makeClient = () => {
        const apiUrl =
            typeof window !== "undefined" && window.arc_ai_editor_api_url
                ? window.arc_ai_editor_api_url[0]
                : undefined;

        console.log("🔧 API URL:", apiUrl);
        return getClient(apiUrl);
    };

    return (
        <ApolloNextAppProvider makeClient={makeClient}>
            {children}
        </ApolloNextAppProvider>
    );
}

export default function WPEditorClientPage() {
    React.useEffect(() => {
        console.log(
            "🎯 WPEditorClientPage useEffect running - setting up message listener",
        );
        console.log("🔍 window.parent:", window.parent);
        console.log("🔍 window === window.parent:", window === window.parent);

        // Listen for ping messages to confirm this is the WP Editor app
        const handleMessage = (event) => {
            console.log(
                "📨 WPEditorClientPage received message:",
                event.data.type,
                event.data,
            );
            if (event.data.type === "__LABEEB_PING__") {
                console.log(
                    "🏓 Received ping, sending pong back to event.source",
                );
                console.log("🔍 event.source:", event.source);
                console.log("🔍 event.origin:", event.origin);
                event.source.postMessage({ type: "__LABEEB_PONG__" }, "*");
                console.log("✅ Pong sent!");
            }
        };

        window.addEventListener("message", handleMessage);
        console.log("✅ Message listener registered");

        // Check if we're in a popup window (opened via window.open for authentication)
        if (
            typeof window !== "undefined" &&
            window.opener &&
            window.opener !== window
        ) {
            console.log("🪟🪟🪟 Detected we're in a popup window!");
            console.log("📤 Sending auth success message to opener");
            try {
                window.opener.postMessage(
                    { type: "__AUTH_POPUP_SUCCESS__" },
                    "*",
                );
                console.log("✅ Auth success message sent to opener");

                // Auto-close the popup after a short delay
                setTimeout(() => {
                    console.log("🪟 Auto-closing popup in 1 second...");
                    setTimeout(() => {
                        window.close();
                    }, 1000);
                }, 0);
            } catch (e) {
                console.error("❌ Error sending message to opener:", e);
            }
        }

        return () => window.removeEventListener("message", handleMessage);
    }, []);

    return (
        <DataProvider>
            <ApolloWrapper>
                <WPEditorApp />
            </ApolloWrapper>
        </DataProvider>
    );
}
