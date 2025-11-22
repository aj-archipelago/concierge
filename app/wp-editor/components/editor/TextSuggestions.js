import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@apollo/client";
import { useCallback, useState } from "react";
import stringcase from "stringcase";

import { useApolloClient, useSubscription } from "@apollo/client";
import { useEffect, useRef } from "react";
import ReactProgressTimer from "react-progress-timer";
import ReactTimeAgo from "react-time-ago";
import { MUTATIONS, QUERIES, SUBSCRIPTIONS } from "../../../../src/graphql";
import i18n from "../../../../src/i18n";
import Diff from "./Diff";
import InternalLinksDiff from "./InternalLinksDiff";
import LoadingButton from "./LoadingButton";

const DebugInfo = ({ prompt, temperature }) => {
    const [showDebug, setShowDebug] = useState(false);

    if (localStorage.getItem("ai_debug") === "true") {
        if (!showDebug) {
            return (
                <div className="text-right">
                    <Button variant="link" onClick={() => setShowDebug(true)}>
                        {i18n.t("Show debug info")}
                    </Button>
                </div>
            );
        } else {
            return (
                <div>
                    <div>
                        <strong>{i18n.t("Prompt:")}</strong>
                        <pre className="whitespace-pre-wrap break-words font-mono p-2 bg-gray-100">
                            {prompt}
                        </pre>
                    </div>
                    <div>
                        <strong>{i18n.t("Temperature:")}</strong>{" "}
                        {temperature || "-"}
                    </div>
                    <div className="text-right">
                        <Button
                            variant="link"
                            onClick={() => setShowDebug(false)}
                        >
                            {i18n.t("Hide debug info")}
                        </Button>
                    </div>
                </div>
            );
        }
    }
};

const asyncQueries = ["GRAMMAR", "STYLE_GUIDE", "TRANSLATE"];

export const ProgressUpdate = ({ requestId, setFinalData }) => {
    const { data } = useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [requestId] },
    });

    const ProgressTimer = ReactProgressTimer.default;

    const [progress, setProgress] = useState(10);
    const [completionTime, setCompletionTime] = useState(10);
    const progressRef = useRef();
    progressRef.current = progress;

    useEffect(() => {
        const result = data?.requestProgress?.data;
        const completionTime = data?.requestProgress?.completionTime;
        const newProgress = Math.max(
            (data?.requestProgress?.progress || 0) * 100,
            progress,
        );

        if (result) {
            try {
                const parsedResult = JSON.parse(result);
                setFinalData(parsedResult);
            } catch (error) {
                setFinalData(result);
            }
        }

        setProgress(newProgress);
        setCompletionTime(completionTime);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const result = data?.requestProgress?.data;

    if (!result) {
        return (
            <>
                <Progress value={progress} />
                <ProgressTimer
                    initialText={i18n.t("Processing...")}
                    percentage={progress}
                    calculateByAverage={true}
                    rollingWindowAverageSize={3}
                    decreaseTime={false}
                />
                {completionTime && (
                    <div>
                        {i18n.t("Completing in")}{" "}
                        <ReactTimeAgo date={completionTime} />
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
    outputTitle = i18n.t("Suggestion"),
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

    const SuggestionComponent = ({
        text,
        args = {},
        onSelect,
        diffEditorRef,
    }) => {
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
                    <p className="suggestions-loading flex items-center gap-2">
                        <Spinner size="sm" /> {i18n.t("Loading")}
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
                        {i18n.t("An error was received from the API server:")}{" "}
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
                                {i18n.t(
                                    "An error was received from the API server:",
                                )}{" "}
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
                        } else if (outputType === "diff-internal-links") {
                            output = (
                                <DiffComponent
                                    inputText={inputText}
                                    outputText={outputText}
                                    setSelectedText={onSelectCallback}
                                    type="internal-links"
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
            <div>
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
                <div>{output}</div>
                {redo}
            </div>
        );
    };

    SuggestionComponent.displayName = "SuggestionComponent";
    return SuggestionComponent;
}

function DiffComponent({
    inputText,
    outputText,
    setSelectedText,
    type = "default",
}) {
    // replace opening and closing quotes with neutral quotes in inputText
    // so that they are not counted as different from the quotes in outputText
    inputText = inputText.replace(/"|"/g, '"');

    // do the same for single opening and closing quotes
    inputText = inputText.replace(/'|'/g, "'");

    if (type === "internal-links") {
        return (
            <>
                <InternalLinksDiff
                    string1={inputText}
                    keywords={outputText}
                    setSelectedText={setSelectedText}
                />
            </>
        );
    } else {
        return (
            <>
                <Diff
                    string1={inputText}
                    string2={outputText}
                    setSelectedText={setSelectedText}
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
            <Textarea
                dir="auto"
                rows={10}
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
                    <div
                        key={`output-list-${i}`}
                        className="mb-3 flex items-center gap-2"
                    >
                        <input
                            type="radio"
                            name="output-list-radio"
                            id={`output-list-${i}`}
                            className="h-4 w-4"
                        />
                        <Label htmlFor={`output-list-${i}`}>
                            {label.replace(/^"+|[".]+$/g, "")}
                        </Label>
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
    inputTitle = i18n.t("Input"),
    inputType = "readonly",
    editCommitText = i18n.t("Get results"),
}) {
    const InputComponent = ({ value, onChange, visible }) => {
        const [tempText, setTempText] = useState(value);

        let input;

        if (inputType === "editable") {
            input = (
                <>
                    <div className="mb-2">
                        <Textarea
                            dir="auto"
                            rows={10}
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

    InputComponent.displayName = "InputComponent";
    return InputComponent;
}
