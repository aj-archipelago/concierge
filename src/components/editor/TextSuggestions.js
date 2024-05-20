"use client";

import { useQuery, useSubscription, useApolloClient } from "@apollo/client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import stringcase from "stringcase";
import ProgressTimer from "react-progress-timer";
import ReactTimeAgo from "react-time-ago";
import { MUTATIONS, QUERIES, SUBSCRIPTIONS } from "../../graphql";
import Diff from "./Diff";
import LoadingButton from "./LoadingButton";
import StyleGuideDiff from "./StyleGuideDiff";
import * as amplitude from "@amplitude/analytics-browser";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en.json";
import ar from "javascript-time-ago/locale/ar.json";

if (typeof document !== "undefined") {
    TimeAgo.addDefaultLocale(document.documentElement.lang === "ar" ? ar : en);
}

const DebugInfo = ({ prompt, temperature }) => {
    const [showDebug, setShowDebug] = useState(false);

    if (localStorage.getItem("ai_debug") === "true") {
        if (!showDebug) {
            return (
                <div className="text-right">
                    <Button variant="link" onClick={() => setShowDebug(true)}>
                        Show debug info
                    </Button>
                </div>
            );
        } else {
            return (
                <div>
                    <div>
                        <strong>Prompt:</strong>
                        <pre className="whitespace-pre-wrap break-words font-mono p-2 bg-gray-200">
                            {prompt}
                        </pre>
                    </div>
                    <div>
                        <strong>Temperature:</strong> {temperature || "-"}
                    </div>
                    <div className="text-right">
                        <Button
                            variant="link"
                            onClick={() => setShowDebug(false)}
                        >
                            Hide debug info
                        </Button>
                    </div>
                </div>
            );
        }
    }
};

const asyncQueries = ["GRAMMAR", "STYLE_GUIDE", "TRANSLATE"];

export const ProgressUpdate = ({
    requestId,
    setFinalData,
    initialText = "Processing...",
}) => {
    const { data } = useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [requestId] },
    });

    const [progress, setProgress] = useState(10);
    const [completionTime, setCompletionTime] = useState(10);
    const progressRef = useRef();
    progressRef.current = progress;

    useEffect(() => {
        setProgress(10);
        setCompletionTime(null);
    }, [requestId]);

    useEffect(() => {
        const result = data?.requestProgress?.data;
        const completionTime = data?.requestProgress?.completionTime;
        const newProgress = Math.max(
            (data?.requestProgress?.progress || 0) * 100,
            progress,
        );

        if (result) {
            setFinalData(JSON.parse(result));
        }

        setProgress(newProgress);
        setCompletionTime(completionTime);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const result = data?.requestProgress?.data;

    if (!result) {
        return (
            <>
                <div className="mb-2">
                    <Progress value={progress} />
                </div>
                <ProgressTimer
                    initialText={initialText}
                    percentage={progress}
                    calculateByAverage={true}
                    rollingWindowAverageSize={3}
                    decreaseTime={false}
                />
                {completionTime && (
                    <div>
                        Completing in <ReactTimeAgo date={completionTime} />
                    </div>
                )}
            </>
        );
    } else {
        return null;
    }
};

export function getTextSuggestionsComponent({
    query,
    outputTitle = "Suggestion",
    outputType = "readonly",
    getPrompt,
    defaultInputParameters = {},
    redoText,
    showLoadingMessage = true,
    QueryParameters = () => null,
    SuggestionInput = getSuggestionInputComponent({}),
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
        requestIdRef.current = requestId;

        const onSelectCallback = useCallback(
            (text) => {
                onSelect(text);
            },
            [onSelect],
        );

        const variables = Object.assign({}, inputParameters, {
            text: getPrompt ? getPrompt(inputText) : inputText,
            async,
            ...args,
        });

        const { loading, error, data, refetch } = useQuery(QUERIES[query], {
            variables,
            notifyOnNetworkStatusChange: true,
            fetchPolicy: "network-only",
        });

        let redo = null;
        let output;

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
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [data, error]);

        const client = useApolloClient();

        useEffect(() => {
            // on unmount cancel request
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
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        useEffect(() => {
            setInputText(text);
        }, [text]);

        if (loading || (!finalData && !error)) {
            output = showLoadingMessage && (
                <div>
                    <p>
                        <span className="animate-spin">Loading</span>
                    </p>
                    {requestId && (
                        <ProgressUpdate
                            requestId={requestId}
                            setFinalData={setFinalData}
                        />
                    )}
                </div>
            );
        } else {
            if (error) {
                output = (
                    <div>
                        An error was received from the API server:{" "}
                        <pre className="font-mono">
                            {JSON.stringify(error, null, 2)}
                        </pre>
                    </div>
                );
            } else {
                let outputText;

                if (finalData) {
                    const response = finalData;
                    if (response.error) {
                        output = (
                            <p>
                                An error was received from the API server:{" "}
                                <pre className="font-mono">
                                    {response.error}
                                </pre>
                            </p>
                        );
                    } else {
                        outputText = response;

                        if (outputType === "diff") {
                            output = (
                                <DiffComponent
                                    inputText={inputText}
                                    outputText={outputText}
                                    setSelectedText={onSelectCallback}
                                />
                            );
                        } else if (outputType === "diff-styleguide") {
                            output = (
                                <DiffComponent
                                    inputText={inputText}
                                    outputText={outputText}
                                    setSelectedText={onSelectCallback}
                                    type="style-guide"
                                />
                            );
                        } else if (OutputRenderer) {
                            output = (
                                <OutputRenderer
                                    queryArgs={args}
                                    value={response}
                                    query={query}
                                    originalText={text}
                                />
                            );
                        } else {
                            if (outputType !== "list") {
                                onSelect(outputText);
                            }

                            output = getSuggestionOutputComponent({
                                outputType,
                                value: outputText,
                                onChange: (t) => onSelect(t),
                            });
                        }
                    }

                    if (loadingButtonVisible) {
                        redo = (
                            <LoadingButton
                                loading={loading}
                                onClick={() => {
                                    refetch();
                                }}
                            >
                                {redoText}
                            </LoadingButton>
                        );
                    }
                }
            }
        }

        return (
            <div className="h-full">
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
                {outputType !== "diff" && (
                    <SuggestionInput
                        value={inputText}
                        onChange={(t) => setInputText(t)}
                    />
                )}
                {outputType !== "diff" && <h5>{outputTitle}</h5>}
                <div className="h-full">{output}</div>
                {redo}
            </div>
        );
    };
}

function DiffComponent({
    inputText,
    outputText,
    setSelectedText,
    type = "default",
}) {
    const setSelectedTextCallback = useCallback(
        (text) => {
            setSelectedText(text);
        },
        [setSelectedText],
    );

    // replace opening and closing quotes with neutral quotes in inputText
    // so that they are not counted as different from the quotes in outputText
    inputText = inputText.replace(/“|”/g, '"');

    // do the same for single opening and closing quotes
    inputText = inputText.replace(/‘|’/g, "'");

    if (type === "style-guide") {
        return (
            <>
                <StyleGuideDiff
                    styleGuideResult={outputText}
                    setSelectedText={setSelectedTextCallback}
                />
            </>
        );
    } else {
        return (
            <>
                <Diff
                    string1={inputText}
                    string2={outputText}
                    setSelectedText={setSelectedTextCallback}
                />
            </>
        );
    }
}

function getSuggestionOutputComponent({ outputType, value, onChange }) {
    let output;

    if (outputType === "readonly") {
        output = <p>{value}</p>;
    } else if (outputType === "editable") {
        output = (
            <textarea
                dir="auto"
                rows={10}
                className="form-textarea"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    } else if (outputType === "list") {
        output = (
            <div
                onChange={(e) => onChange(e.target.labels[0].innerText)}
                className="bg-white mb-3"
            >
                {value.slice(0, Math.min(5, value.length)).map((label, i) => (
                    <div key={`output-list-${i}`} className="mb-3">
                        <label>
                            <input
                                type="radio"
                                name={`output-list-radio`}
                                id={`output-list-${i}`}
                                className="mr-2"
                            />
                            {label.replace(/^"+|[".]+$/g, "")}
                        </label>
                    </div>
                ))}
            </div>
        );
    } else {
        output = null;
    }
    return output;
}

export function getSuggestionInputComponent({
    inputTitle = "Input",
    inputType = "readonly",
    editCommitText = "Get results",
}) {
    return ({ value, onChange, visible }) => {
        const [tempText, setTempText] = useState(value);

        let input;

        if (inputType === "editable") {
            input = (
                <>
                    <div className="mb-2">
                        <textarea
                            dir="auto"
                            rows={10}
                            className="form-textarea"
                            value={tempText}
                            onChange={(e) => setTempText(e.target.value)}
                        />
                    </div>
                    <Button
                        className="mb-5"
                        disabled={tempText === value}
                        onClick={() => onChange(tempText)}
                    >
                        {editCommitText}
                    </Button>
                </>
            );
        } else if (visible) {
            input = <p>{value}</p>;
        }

        if (input) {
            return (
                <>
                    <h5>{inputTitle}</h5>
                    <div>{input}</div>
                </>
            );
        } else {
            return null;
        }
    };
}
