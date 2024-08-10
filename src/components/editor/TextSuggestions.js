"use client";

import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useQuery, useApolloClient } from "@apollo/client";
import { MUTATIONS, QUERIES } from "../../graphql";
import * as amplitude from "@amplitude/analytics-browser";
import stringcase from "stringcase";
import DebugInfo from "./DebugInfo";
import ProgressUpdate from "./ProgressUpdate";
import ComparisonView from "./ComparisonView";
import DiffComponent from "./DiffComponent";
import SuggestionOutput from "./SuggestionOutput";
import SuggestionInput from "./SuggestionInput";
import LoadingButton from "./LoadingButton";
import { asyncQueries } from "./utils";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";

export function getTextSuggestionsComponent({
    query,
    outputTitle = "Suggestion",
    outputType = "readonly",
    getPrompt,
    defaultInputParameters = {},
    redoText,
    showInput = false,
    showLoadingMessage = true,
    QueryParameters = () => null,
    SuggestionInput: CustomSuggestionInput = SuggestionInput,
    OutputRenderer,
}) {
    const loadingButtonVisible = !!redoText;

    return ({ text, args = {}, onSelect, diffEditorRef }) => {
        const [inputText, setInputText] = useState(text);
        const async = asyncQueries.includes(query);
        const [requestId, setRequestId] = useState(null);
        const [finalData, setFinalData] = useState(null);
        const [inputParameters, setInputParameters] = useState(
            defaultInputParameters,
        );
        const requestIdRef = useRef();
        const [debug, setDebug] = useState(null);
        const { t } = useTranslation();
        const { direction } = useContext(LanguageContext);

        requestIdRef.current = requestId;

        const onSelectCallback = useCallback(
            (text) => {
                onSelect(text);
            },
            [onSelect],
        );

        const variables = {
            ...inputParameters,
            text: getPrompt ? getPrompt(inputText) : inputText,
            async,
            ...args,
        };

        const { loading, error, data, refetch } = useQuery(QUERIES[query], {
            variables,
            notifyOnNetworkStatusChange: true,
            fetchPolicy: "network-only",
        });

        const client = useApolloClient();

        useEffect(() => {
            if (data) {
                const dataObject =
                    data[
                        query === "STYLE_GUIDE"
                            ? "styleguide"
                            : stringcase.snakecase(query) ||
                              stringcase.camelcase(query)
                    ];
                const actualData = dataObject?.result;

                if (dataObject?.debug && typeof dataObject.debug === "string") {
                    setDebug(JSON.parse(dataObject?.debug)[0]);
                }

                if (async) {
                    setRequestId(actualData);
                } else {
                    setFinalData(actualData);
                }

                amplitude.track("Query Completed", {
                    name: stringcase.sentencecase(query),
                });
            }
        }, [data, error, query, async]);

        useEffect(() => {
            return () => {
                if (!finalData && requestIdRef.current) {
                    client.mutate({
                        mutation: MUTATIONS.CANCEL_REQUEST,
                        variables: {
                            requestId: requestIdRef.current,
                        },
                    });
                }
            };
        }, [client, finalData]);

        useEffect(() => {
            setInputText(text);
        }, [text]);

        let output;
        let redo = null;

        if (loading || (!finalData && !error)) {
            output = showLoadingMessage && (
                <div>
                    <p>
                        <span className="animate-spin">{t("Loading")}</span>
                    </p>
                    {requestId && (
                        <ProgressUpdate
                            requestId={requestId}
                            setFinalData={setFinalData}
                        />
                    )}
                </div>
            );
        } else if (error) {
            output = (
                <div>
                    {t("An error was received from the API server:")}{" "}
                    <pre className="font-mono">
                        {JSON.stringify(error, null, 2)}
                    </pre>
                </div>
            );
        } else if (finalData) {
            const response = finalData;
            if (response.error) {
                output = (
                    <p>
                        {t("An error was received from the API server:")}{" "}
                        <pre className="font-mono">{response.error}</pre>
                    </p>
                );
            } else {
                output = renderOutput(
                    outputType,
                    inputText,
                    onSelectCallback,
                    OutputRenderer,
                    args,
                    query,
                    text,
                    onSelect,
                    setFinalData,
                    finalData,
                    t
                );

                if (loadingButtonVisible) {
                    redo = (
                        <LoadingButton
                            loading={loading}
                            onClick={() => refetch()}
                        >
                            {t(redoText)}
                        </LoadingButton>
                    );
                }
            }
        }

        return (
            <div className="overflow-hidden h-full w-full">
                {debug && (
                    <DebugInfo
                        prompt={debug.prompt}
                        temperature={debug.temperature}
                    />
                )}
                <QueryParameters
                    loading={loading}
                    value={inputParameters}
                    onChange={(e) => setInputParameters(e)}
                />
                {renderContent(
                    outputType,
                    output,
                    inputText,
                    setInputText,
                    CustomSuggestionInput,
                    t(outputTitle),
                    loading,
                    refetch,
                    t(redoText),
                    showInput,
                    loadingButtonVisible,
                    redo,
                    t,
                    direction
                )}
            </div>
        );
    };
}

function renderOutput(
    outputType,
    inputText,
    onSelectCallback,
    OutputRenderer,
    args,
    query,
    text,
    onSelect,
    setFinalData,
    finalData,
    t,
    direction
) {
    switch (outputType) {
        case "compare":
            onSelect(finalData);
            return (
                <ComparisonView
                    outputText={finalData}
                    onOutputChange={(newText) => {
                        onSelect(newText);
                        setFinalData(newText);
                    }}
                    direction={direction}
                />
            );
        case "diff":
        case "diff-styleguide":
            return (
                <DiffComponent
                    inputText={inputText}
                    outputText={finalData}
                    setSelectedText={onSelectCallback}
                    type={
                        outputType === "diff-styleguide"
                            ? "style-guide"
                            : "default"
                    }
                    direction={direction}
                />
            );
        default:
            if (OutputRenderer) {
                return (
                    <OutputRenderer
                        queryArgs={args}
                        value={finalData}
                        query={query}
                        originalText={text}
                        direction={direction}
                    />
                );
            } else {
                if (outputType !== "list") {
                    onSelect(finalData);
                }
                return (
                    <SuggestionOutput
                        outputType={outputType}
                        value={finalData}
                        onChange={(t) => onSelect(t)}
                        direction={direction}
                    />
                );
            }
    }
}

function renderContent(
    outputType,
    output,
    inputText,
    setInputText,
    CustomSuggestionInput,
    outputTitle,
    loading,
    refetch,
    redoText,
    showInput,
    loadingButtonVisible,
    redo,
    t,
    direction
) {
    if (outputType === "diff" || outputType === "diff-styleguide") {
        return <div className="h-full">{output}</div>;
    }

    const isRTL = direction === "rtl";

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-grow flex flex-col md:flex-row min-h-0 space-y-4 md:space-y-0 md:space-x-4 rtl:space-x-reverse overflow-hidden">
                { showInput && (
                <div className={`flex-1 md:w-1/2 flex flex-col overflow-hidden ${isRTL ? 'md:ml-4' : 'md:mr-4'}`}>
                    <div className="flex-grow overflow-hidden">
                        <CustomSuggestionInput
                            value={inputText}
                            onChange={(t) => setInputText(t)}
                            inputType="readonly"
                            direction={direction}
                        />
                    </div>
                </div>
                )}
                <div className="flex-1 md:w-1/2 flex flex-col overflow-hidden">
                    {outputType === "compare" ? (
                        <div className="flex-grow overflow-hidden">
                            {output}
                        </div>
                    ) : (
                        <>
                            <h5 className={`mb-2 font-bold ${isRTL ? 'text-right' : 'text-left'}`}>{outputTitle}</h5>
                            <div className="flex-grow overflow-hidden">
                                {output}
                            </div>
                        </>
                    )}
                </div>
            </div>
            <div className="mt-4">
                {loadingButtonVisible && (
                    <LoadingButton
                        loading={loading}
                        onClick={() => refetch()}
                        className="lb-primary"
                        text={t("Loading")}
                        direction={direction}
                    >
                        {redoText}
                    </LoadingButton>
                )}
            </div>
        </div>
    );
}