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
    const [targetLocale, setTargetLocale] = useState("ar-QA");

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
                        <option value="ar-AE">ar-AE</option>
                        <option value="ar-BH">ar-BH</option>
                        <option value="ar-DZ">ar-DZ</option>
                        <option value="ar-EG">ar-EG</option>
                        <option value="ar-IL">ar-IL</option>
                        <option value="ar-IQ">ar-IQ</option>
                        <option value="ar-JO">ar-JO</option>
                        <option value="ar-KW">ar-KW</option>
                        <option value="ar-LB">ar-LB</option>
                        <option value="ar-LY">ar-LY</option>
                        <option value="ar-MA">ar-MA</option>
                        <option value="ar-OM">ar-OM</option>
                        <option value="ar-PS">ar-PS</option>
                        <option value="ar-QA">ar-QA</option>
                        <option value="ar-SA">ar-SA</option>
                        <option value="ar-SY">ar-SY</option>
                        <option value="ar-TN">ar-TN</option>
                        <option value="ar-YE">ar-YE</option>
                        <option value="cs-CZ">cs-CZ</option>
                        <option value="da-DK">da-DK</option>
                        <option value="de-AT">de-AT</option>
                        <option value="de-CH">de-CH</option>
                        <option value="de-DE">de-DE</option>
                        <option value="en-AU">en-AU</option>
                        <option value="en-CA">en-CA</option>
                        <option value="en-GB">en-GB</option>
                        <option value="en-GH">en-GH</option>
                        <option value="en-HK">en-HK</option>
                        <option value="en-IE">en-IE</option>
                        <option value="en-IN">en-IN</option>
                        <option value="en-KE">en-KE</option>
                        <option value="en-NG">en-NG</option>
                        <option value="en-NZ">en-NZ</option>
                        <option value="en-PH">en-PH</option>
                        <option value="en-SG">en-SG</option>
                        <option value="en-TZ">en-TZ</option>
                        <option value="en-US">en-US</option>
                        <option value="en-ZA">en-ZA</option>
                        <option value="es-BO">es-BO</option>
                        <option value="es-CL">es-CL</option>
                        <option value="es-CO">es-CO</option>
                        <option value="es-CR">es-CR</option>
                        <option value="es-ES">es-ES</option>
                        <option value="es-GQ">es-GQ</option>
                        <option value="es-GT">es-GT</option>
                        <option value="es-HN">es-HN</option>
                        <option value="es-MX">es-MX</option>
                        <option value="es-NI">es-NI</option>
                        <option value="es-PA">es-PA</option>
                        <option value="es-PE">es-PE</option>
                        <option value="es-PR">es-PR</option>
                        <option value="es-PY">es-PY</option>
                        <option value="es-SV">es-SV</option>
                        <option value="es-UY">es-UY</option>
                        <option value="fi-FI">fi-FI</option>
                        <option value="fr-FR">fr-FR</option>
                        <option value="he-IL">he-IL</option>
                        <option value="hi-IN">hi-IN</option>
                        <option value="id-ID">id-ID</option>
                        <option value="it-IT">it-IT</option>
                        <option value="ja-JP">ja-JP</option>
                        <option value="ko-KR">ko-KR</option>
                        <option value="pa-IN">pa-IN</option>
                        <option value="pl-PL">pl-PL</option>
                        <option value="pt-BR">pt-BR</option>
                        <option value="pt-PT">pt-PT</option>
                        <option value="ru-RU">ru-RU</option>
                        <option value="sv-SE">sv-SE</option>
                        <option value="th-TH">th-TH</option>
                        <option value="tr-TR">tr-TR</option>
                        <option value="ur-IN">ur-IN</option>
                        <option value="zh-CN">zh-CN</option>
                        <option value="zh-HK">zh-HK</option>
                        <option value="zh-TW">zh-TW</option>
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
                        <option value="ar-AE">ar-AE</option>
                        <option value="ar-BH">ar-BH</option>
                        <option value="ar-DZ">ar-DZ</option>
                        <option value="ar-EG">ar-EG</option>
                        <option value="ar-IL">ar-IL</option>
                        <option value="ar-IQ">ar-IQ</option>
                        <option value="ar-JO">ar-JO</option>
                        <option value="ar-KW">ar-KW</option>
                        <option value="ar-LB">ar-LB</option>
                        <option value="ar-LY">ar-LY</option>
                        <option value="ar-MA">ar-MA</option>
                        <option value="ar-OM">ar-OM</option>
                        <option value="ar-PS">ar-PS</option>
                        <option value="ar-QA">ar-QA</option>
                        <option value="ar-SA">ar-SA</option>
                        <option value="ar-SY">ar-SY</option>
                        <option value="ar-TN">ar-TN</option>
                        <option value="ar-YE">ar-YE</option>
                        <option value="cs-CZ">cs-CZ</option>
                        <option value="da-DK">da-DK</option>
                        <option value="de-AT">de-AT</option>
                        <option value="de-CH">de-CH</option>
                        <option value="de-DE">de-DE</option>
                        <option value="en-AU">en-AU</option>
                        <option value="en-CA">en-CA</option>
                        <option value="en-GB">en-GB</option>
                        <option value="en-GH">en-GH</option>
                        <option value="en-HK">en-HK</option>
                        <option value="en-IE">en-IE</option>
                        <option value="en-IN">en-IN</option>
                        <option value="en-KE">en-KE</option>
                        <option value="en-NG">en-NG</option>
                        <option value="en-NZ">en-NZ</option>
                        <option value="en-PH">en-PH</option>
                        <option value="en-SG">en-SG</option>
                        <option value="en-TZ">en-TZ</option>
                        <option value="en-US">en-US</option>
                        <option value="en-ZA">en-ZA</option>
                        <option value="es-BO">es-BO</option>
                        <option value="es-CL">es-CL</option>
                        <option value="es-CO">es-CO</option>
                        <option value="es-CR">es-CR</option>
                        <option value="es-ES">es-ES</option>
                        <option value="es-GQ">es-GQ</option>
                        <option value="es-GT">es-GT</option>
                        <option value="es-HN">es-HN</option>
                        <option value="es-MX">es-MX</option>
                        <option value="es-NI">es-NI</option>
                        <option value="es-PA">es-PA</option>
                        <option value="es-PE">es-PE</option>
                        <option value="es-PR">es-PR</option>
                        <option value="es-PY">es-PY</option>
                        <option value="es-SV">es-SV</option>
                        <option value="es-UY">es-UY</option>
                        <option value="fi-FI">fi-FI</option>
                        <option value="fr-FR">fr-FR</option>
                        <option value="he-IL">he-IL</option>
                        <option value="hi-IN">hi-IN</option>
                        <option value="id-ID">id-ID</option>
                        <option value="it-IT">it-IT</option>
                        <option value="ja-JP">ja-JP</option>
                        <option value="ko-KR">ko-KR</option>
                        <option value="pa-IN">pa-IN</option>
                        <option value="pl-PL">pl-PL</option>
                        <option value="pt-BR">pt-BR</option>
                        <option value="pt-PT">pt-PT</option>
                        <option value="ru-RU">ru-RU</option>
                        <option value="sv-SE">sv-SE</option>
                        <option value="th-TH">th-TH</option>
                        <option value="tr-TR">tr-TR</option>
                        <option value="ur-IN">ur-IN</option>
                        <option value="zh-CN">zh-CN</option>
                        <option value="zh-HK">zh-HK</option>
                        <option value="zh-TW">zh-TW</option>
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
