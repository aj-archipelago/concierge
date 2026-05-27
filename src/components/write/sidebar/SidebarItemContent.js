import * as amplitude from "@amplitude/analytics-browser";
import { useApolloClient } from "@apollo/client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, RotateCcw } from "lucide-react";

const INPUT_THRESHOLD = 1;

export default function SidebarItemContent({
    inputText,
    name,
    icon,
    output = "",
    query,
    Options,
    onGenerate,
    defaultParameters,
    renderOutput,
    autoLoad = false,
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const client = useApolloClient();
    const [inputParameters, setInputParameters] = useState(
        defaultParameters || {},
    );
    const [loadingComplete, setLoadingComplete] = useState(false);

    const haveEnoughText = inputText && inputText.length > INPUT_THRESHOLD;

    const request = useCallback(async () => {
        if (haveEnoughText) {
            setLoading(true);
            client
                .query({
                    query: query.query,
                    variables: Object.assign(
                        {},
                        query.variables,
                        inputParameters,
                    ),
                    fetchPolicy: "network-only",
                })
                .then(({ data }) => {
                    amplitude.track("Query Completed", {
                        name,
                    });
                    setLoading(false);
                    onGenerate(data);
                    setLoadingComplete(true);
                });
        } else {
            onGenerate(null);
            setLoadingComplete(false);
        }
    }, [
        client,
        haveEnoughText,
        inputParameters,
        onGenerate,
        query.query,
        query.variables,
        name,
    ]);

    useEffect(() => {
        if (
            inputText &&
            inputText.length > INPUT_THRESHOLD &&
            autoLoad &&
            !loading &&
            !loadingComplete
        ) {
            request();
        }
    }, [inputText, autoLoad, loading, loadingComplete, request]);

    let message = null;

    if (loading) {
        message = t("Loading");
    } else {
        const outputLength = Array.isArray(output)
            ? output.length
            : output
              ? output.length
              : 0;
        if (outputLength === 0 && (loadingComplete || !haveEnoughText)) {
            message = t("No data");
        }
    }

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 items-center">
                    {icon}
                    <span className="font-medium">{t(name)}</span>
                </div>
                {(loading ||
                    (Array.isArray(output)
                        ? output.length > 0
                        : output && output.length > 0)) && (
                    <button
                        className="refresh-button cursor-pointer p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            request();
                        }}
                        disabled={loading}
                    >
                        {loading ? (
                            <Loader2Icon size={15} className="animate-spin" />
                        ) : (
                            <RotateCcw className="text-gray-500" size={15} />
                        )}
                    </button>
                )}
            </div>
            {Options && (
                <div className="mb-4">
                    <Options
                        value={inputParameters}
                        onChange={(v) =>
                            setInputParameters(
                                Object.assign({}, inputParameters, v),
                            )
                        }
                        onCommit={() => request()}
                        loading={loading}
                    />
                </div>
            )}
            {message && <div className="loading-container py-4">{message}</div>}
            {loadingComplete &&
                (Array.isArray(output)
                    ? output.length > 0
                    : output && output.length > 0) && (
                    <div className="max-h-[60vh] overflow-auto">
                        {renderOutput(output)}
                    </div>
                )}
        </div>
    );
}
