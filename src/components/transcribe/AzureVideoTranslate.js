import { useApolloClient } from "@apollo/client";
import { LanguagesIcon } from "lucide-react";
import { useState } from "react";
import { useProgress } from "../../contexts/ProgressContext";
import { AZURE_VIDEO_TRANSLATE } from "../../graphql";
import { LOCALES } from "../../utils/constants";

export default function AzureVideoTranslate({ url, onQueued, onComplete }) {
    const apolloClient = useApolloClient();
    const [sourceLocale, setSourceLocale] = useState("en-US");
    const [targetLocale, setTargetLocale] = useState("ar-QA");
    const { addProgressToast } = useProgress();

    async function setFinalDataPre(data) {
        if (data === "[DONE]") {
            console.log("[DONE] received");
            throw new Error(
                "There was an unknown error returned by the translation service. Please try again.",
            );
        }

        data = JSON.parse(data);
        try {
            const defaultSubtitlesUrl = data.outputVideoSubtitleWebVttFileUrl;
            const targetVideoUrl =
                data.targetLocales[targetLocale].outputVideoFileUrl;
            const targetSubtitlesUrl =
                data.targetLocales[targetLocale]
                    .outputVideoSubtitleWebVttFileUrl;

            onComplete?.(targetLocale, targetVideoUrl, {
                original: defaultSubtitlesUrl,
                translated: targetSubtitlesUrl,
            });
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    return (
        <>
            <div className="mt-2 p-2 border-t border-b rounded border-gray-200 pt-4 bg-opacity-90 bg-neutral-100 shadow">
                <div className="flex items-end gap-3">
                    <div>
                        <label htmlFor="sourceLocaleSelect">
                            Source Locale
                        </label>
                        <select
                            id="sourceLocaleSelect"
                            value={sourceLocale}
                            className="lb-input"
                            onChange={(e) => setSourceLocale(e.target.value)}
                        >
                            {Object.entries(LOCALES).map(([code, name]) => (
                                <option key={code} value={code}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="targetLocaleSelect">
                            Target Locale
                        </label>
                        <select
                            className="lb-input"
                            id="targetLocaleSelect"
                            value={targetLocale}
                            onChange={(e) => setTargetLocale(e.target.value)}
                        >
                            {Object.entries(LOCALES).map(([code, name]) => (
                                <option key={code} value={code}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="ml-auto"></div>
                </div>
            </div>
            <div>
                <button
                    disabled={!url}
                    className="lb-primary"
                    onClick={async () => {
                        const { data } = await apolloClient.query(
                            {
                                query: AZURE_VIDEO_TRANSLATE,
                                variables: {
                                    mode: "uploadvideooraudiofileandcreatetranslation",
                                    sourcelocale: sourceLocale,
                                    targetlocale: targetLocale,
                                    sourcevideooraudiofilepath: url,
                                    stream: true,
                                },
                            },
                            { fetchPolicy: "no-cache" },
                        );
                        const requestId = data.azure_video_translate.result;
                        addProgressToast(
                            requestId,
                            `Translating video to ${LOCALES[targetLocale]}`,
                            setFinalDataPre,
                            () => {},
                            60 * 1000, // consider it failed if no heartbeats are received
                        );
                        onQueued?.(requestId);
                    }}
                >
                    <LanguagesIcon className="w-4 h-4 me-1" />
                    Translate Video
                </button>
            </div>
        </>
    );
}
