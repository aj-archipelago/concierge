import { useApolloClient } from "@apollo/client";
import { AZURE_VIDEO_TRANSLATE } from "../../graphql";
import ProgressUpdate from "../editor/ProgressUpdate";
import { useState } from "react";

export default function AzureVideoTranslate({ url }) {
    const apolloClient = useApolloClient();
    const [requestId, setRequestId] = useState(null);

    // const [finalData, setFinalData] = useState(null);
    const [outputVideoUrl, setOutputVideoUrl] = useState(null);

    const [sourceLocale, setSourceLocale] = useState("en-US");
    const [targetLocale, setTargetLocale] = useState("tr-TR");

    function setFinalDataPre(data) {
        try {
            const json = JSON.parse(data);
            // setFinalData(json);
            // console.log(json);

            function findOutputVideoFileUrl(obj) {
                if (typeof obj !== "object" || obj === null) return null;
                if ("outputVideoFileUrl" in obj) return obj.outputVideoFileUrl;
                for (let key in obj) {
                    let result = findOutputVideoFileUrl(obj[key]);
                    if (result) return result;
                }
                return null;
            }

            setOutputVideoUrl(findOutputVideoFileUrl(json));
        } catch (e) {
            console.error(e);
            // setFinalData(data || e);
        } finally {
            setRequestId(null);
        }
    }

    return (
        <div className="mt-2 p-2 border-t border-b rounded border-gray-200 pt-4 bg-opacity-90 bg-neutral-100 shadow">
            {outputVideoUrl && (
                <div>
                    <h2>Azure Translated Video:</h2>
                    <video src={outputVideoUrl} controls />
                </div>
            )}

            <h1 className="pb-2">Alternate Azure Video Translate</h1>

            <div className="flex items-end gap-3">
                <div>
                    <label htmlFor="sourceLocaleSelect">Source Locale</label>
                    <select
                        id="sourceLocaleSelect"
                        value={sourceLocale}
                        className="lb-input"
                        onChange={(e) => setSourceLocale(e.target.value)}
                    >
                        <option value="en-US">en-US</option>
                        <option value="ar-AR">ar-AR</option>
                        <option value="fr-FR">fr-FR</option>
                        <option value="es-ES">es-ES</option>
                        {/* Add more options as needed */}
                    </select>
                </div>

                <div>
                    <label htmlFor="targetLocaleSelect">Target Locale</label>
                    <select
                        className="lb-input"
                        id="targetLocaleSelect"
                        value={targetLocale}
                        onChange={(e) => setTargetLocale(e.target.value)}
                    >
                        <option value="tr-TR">tr-TR</option>
                        <option value="en-US">en-US</option>
                        <option value="ar-AR">ar-AR</option>
                        <option value="de-DE">de-DE</option>
                        <option value="it-IT">it-IT</option>
                        {/* Add more options as needed */}
                    </select>
                </div>

                <div className="ml-auto">
                    <button
                        disabled={requestId || !url}
                        className="mb-1 lb-primary lb-sm bg-opacity-80"
                        onClick={async () => {
                            const { data } = await apolloClient.query(
                                {
                                    query: AZURE_VIDEO_TRANSLATE,
                                    variables: {
                                        mode: "uploadvideooraudiofileandcreatetranslation",
                                        sourcelocale: sourceLocale,
                                        targetlocale: targetLocale,
                                        sourcevideooraudiofilepath: url,
                                        // "vscodeshort.mp4",
                                        stream: true,
                                    },
                                },
                                { fetchPolicy: "no-cache" },
                            );
                            setRequestId(data.azure_video_translate.result);
                        }}
                    >
                        Alternate Azure Video Translate
                    </button>
                </div>
            </div>

            {requestId && (
                <ProgressUpdate
                    requestId={requestId}
                    setFinalData={setFinalDataPre}
                    // initialText={t(currentOperation) + "..."}
                />
            )}

            {/* {finalData && (
            <div>
            <h2>Final Data</h2>
            <pre>{JSON.stringify(finalData, null, 2)}</pre>
            </div>
        )} */}
        </div>
    );
}
