"use client";

import { useEffect, useContext } from "react";
import { LanguageContext } from "../../src/contexts/LanguageProvider";
import PrivacyNoticePageAr from "./page.ar";

export default function PrivacyNoticeRouter() {
    const { language } = useContext(LanguageContext);
    return language === "ar" ? <PrivacyNoticePageAr /> : <PrivacyNoticePage />;
}

function PrivacyNoticePage() {
    useEffect(() => {
        // Dynamically add the OneTrust privacy notice script only on the client.
        const script = document.createElement("script");
        script.src =
            "https://privacyportalde-cdn.onetrust.com/privacy-notice-scripts/otnotice-1.0.min.js";
        script.id = "otprivacy-notice-script";
        script.type = "text/javascript";
        script.charSet = "UTF-8";
        script.setAttribute(
            "settings",
            "eyJjYWxsYmFja1VybCI6Imh0dHBzOi8vZHNwb3J0YWwuYWxqYXplZXJhLm5ldC9yZXF1ZXN0L3YxL3ByaXZhY3lOb3RpY2VzL3N0YXRzL3ZpZXdzIn0=",
        );
        document.body.appendChild(script);

        script.onload = () => {
            if (window.OneTrust?.NoticeApi) {
                window.OneTrust.NoticeApi.Initialized.then(function () {
                    window.OneTrust.NoticeApi.LoadNotices([
                        "https://privacyportalde-cdn.onetrust.com/15894e16-5fd4-4170-9dfc-9fb1d34b6c3c/privacy-notices/e7d5c184-8792-450c-bdbc-b765b6250a0c.json",
                    ]);
                });
            }
        };

        // Cleanup script on unmount
        return () => {
            document.body.removeChild(script);
        };
    }, []);

    return (
        <main className="min-h-screen bg-gray-100 py-8">
            <section className="w-full">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="mb-8 text-center">
                        <h1 className="text-xl font-medium mb-3 text-gray-800">Privacy Notice</h1>
                    </div>
                    <div className="flex flex-wrap justify-center">
                        <div className="w-full">
                            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-md">
                                {/* OneTrust Privacy Notice start */}
                                {/* Language Drop-down elements that will control in which language notice is displayed */}
                                <div
                                    className="otnotice-language-dropdown-container"
                                    style={{ display: "none" }}
                                >
                                    <select
                                        id="otnotice-language-dropdown"
                                        aria-label="language selector"
                                    ></select>
                                </div>

                                {/* Container in which the privacy notice will be rendered */}
                                <div
                                    id="otnotice-e7d5c184-8792-450c-bdbc-b765b6250a0c"
                                    className="otnotice"
                                ></div>

                                <script
                                    src="https://privacyportalde-cdn.onetrust.com/privacy-notice-scripts/otnotice-1.0.min.js"
                                    type="text/javascript"
                                    charSet="UTF-8"
                                    id="otprivacy-notice-script"
                                    settings="eyJjYWxsYmFja1VybCI6Imh0dHBzOi8vZHNwb3J0YWwuYWxqYXplZXJhLm5ldC9yZXF1ZXN0L3YxL3ByaXZhY3lOb3RpY2VzL3N0YXRzL3ZpZXdzIn0="
                                ></script>

                                <script type="text/javascript" charSet="UTF-8">{`
                                    // To ensure external settings are loaded, use the Initialized promise:
                                    OneTrust.NoticeApi.Initialized.then(function() {
                                        OneTrust.NoticeApi.LoadNotices([
                                            "https://privacyportalde-cdn.onetrust.com/15894e16-5fd4-4170-9dfc-9fb1d34b6c3c/privacy-notices/e7d5c184-8792-450c-bdbc-b765b6250a0c.json"
                                        ]);
                                    });
                                `}</script>

                                {/* OneTrust Privacy Notice end */}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            {/* Override OneTrust default styles so the menu scrolls with page instead of being fixed */}
            <style jsx global>{`
                /* --- OneTrust notice layout overrides --- */
                .otnotice-content {
                    padding: 0 !important;
                    position: relative !important;
                    text-align: left !important;
                }

                /* side menu */
                .otnotice-menu {
                    width: 310px !important;
                    max-height: 80% !important;
                    overflow-y: auto !important;
                    background: #F8F8F8 !important;
                    border: 1px solid #EEEEEE !important;
                    box-shadow: 0px 7px 10px 0px rgba(124, 124, 124, 0.2) !important;
                    padding: 25px !important;
                    margin: 0 !important;
                    position: absolute !important;
                    top: 0;
                    left: 0;
                }

                /* menu items */
                .otnotice-menu > .otnotice-menu-section {
                    width: 100% !important;
                    margin-bottom: 25px !important;
                }

                /* content sections */
                .otnotice-sections {
                    margin-left: 335px !important;
                    margin-right: 0 !important;
                }

                /* Responsive adjustments (simple mobile view) */
                @media (max-width: 768px) {
                    .mobile-view .otnotice-menu {
                        position: relative !important;
                        width: 100% !important;
                    }

                    .mobile-view .otnotice-sections {
                        margin: 0 !important;
                    }
                }

                /* Dark mode adjustments */
                body.dark .otnotice-menu {
                    background: #1f2937 !important;
                    border-color: #374151 !important;
                }
                body.dark .otnotice-menu > .otnotice-menu-section a {
                    color: #e5e7eb !important;
                }
                body.dark .otnotice-sections > .otnotice-section > h2.otnotice-section-header {
                    color: #e5e7eb !important;
                }
            `}</style>
        </main>
    );
}