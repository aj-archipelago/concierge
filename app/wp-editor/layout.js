"use client";

import "../../src/tailwind.css";
import { useEffect } from "react";

/**
 * WordPress Editor Layout
 *
 * Minimal layout without the main Labeeb navigation/sidebar
 * since this will be embedded in WordPress.
 *
 * This layout bypasses the main App authentication to allow
 * WordPress to embed the editor without requiring Labeeb login.
 */
export default function WordPressEditorLayout({ children }) {
    useEffect(() => {
        // Notify parent window/opener that auth is successful
        // Only send this message if we're actually on the /wp-editor page (not redirected)
        const notifyAuthSuccess = () => {
            // Check if we're still on the wp-editor page (not redirected to auth)
            const isOnWpEditorPage =
                window.location.pathname.includes("/wp-editor");

            if (!isOnWpEditorPage) {
                console.log(
                    "🔐 Not on wp-editor page yet, skipping auth success message",
                );
                return;
            }

            const message = { type: "__LABEEB_AUTH_SUCCESS__" };

            // If opened in a popup, notify the opener
            if (window.opener && !window.opener.closed) {
                console.log("🔐 Notifying popup opener of auth success");
                window.opener.postMessage(message, "*");
            }

            // If in an iframe, notify parent
            if (window.parent !== window) {
                console.log("🔐 Notifying iframe parent of auth success");
                window.parent.postMessage(message, "*");
            }
        };

        // Wait longer to ensure auth redirect happens first if needed
        const timer = setTimeout(notifyAuthSuccess, 1500);

        return () => clearTimeout(timer);
    }, []);
    return (
        <>
            <div
                id="wp-editor-portal-root"
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 9999,
                }}
            >
                {/* Portal container for modals - ensures proper fixed positioning in iframe */}
            </div>
            <div className="wp-editor-container">
                {children}
                <style jsx global>{`
                    html,
                    body {
                        height: 100%;
                        width: 100%;
                        margin: 0;
                        padding: 0;
                        overflow: visible;
                    }

                    .wp-editor-container {
                        min-height: 100vh;
                        background: transparent;
                        position: relative;
                    }

                    /* Ensure portal root children can receive pointer events */
                    #wp-editor-portal-root > * {
                        pointer-events: auto;
                    }

                    /* Hide Labeeb main navigation when embedded */
                    body.wp-editor-embedded {
                        margin: 0;
                        padding: 0;
                    }
                `}</style>
            </div>
        </>
    );
}
