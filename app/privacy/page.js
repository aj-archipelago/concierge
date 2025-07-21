"use client";

import { useContext } from "react";
import { LanguageContext } from "../../src/contexts/LanguageProvider";
import config from "../../config";
import Script from "next/script";
import { useEffect } from "react";

export default function PrivacyNoticePage() {
    const { language } = useContext(LanguageContext);
    const { getPrivacyContent } = config.global;

    const data = getPrivacyContent(language);
    const {
        markup,
        scripts = [],
        noticeUrls = [],
    } = data && data.markup
        ? data
        : { markup: data, scripts: [], noticeUrls: [] };

    useEffect(() => {
        if (!noticeUrls.length) return;

        function tryLoad() {
            if (window.OneTrust?.NoticeApi?.Initialized) {
                window.OneTrust.NoticeApi.Initialized.then(function () {
                    window.OneTrust.NoticeApi.LoadNotices(noticeUrls);
                });
                return true;
            }
            return false;
        }

        if (!tryLoad()) {
            const i = setInterval(() => {
                if (tryLoad()) clearInterval(i);
            }, 300);
            return () => clearInterval(i);
        }
    }, [noticeUrls]);

    return (
        <div>
            {/* Render dynamic scripts from config */}
            {scripts.map((s) => (
                <Script
                    key={s.id || s.src}
                    src={s.src}
                    id={s.id}
                    strategy={s.strategy || "afterInteractive"}
                    {...(s.attrs || {})}
                />
            ))}

            {markup}
        </div>
    );
}
