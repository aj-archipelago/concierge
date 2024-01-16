"use client";

import { useQuery } from "@apollo/client";
import { useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import stringcase from "stringcase";
import { useApolloClient, useSubscription } from "@apollo/client";
import { useEffect, useRef } from "react";
import { ProgressBar } from "react-bootstrap";
import ProgressTimer from "react-progress-timer";
import ReactTimeAgo from "react-time-ago";
import { MUTATIONS, QUERIES, SUBSCRIPTIONS } from "../../graphql";
import Diff from "./Diff";
import LoadingButton from "./LoadingButton";
import StyleGuideDiff from "./StyleGuideDiff";
import { useCallback } from "react";
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
                <div style={{ textAlign: "end" }}>
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
                        <pre
                            style={{
                                whiteSpace: "pre-wrap",
                                wordWrap: "break-word",
                                fontFamily: "monospace",
                                padding: 10,
                                backgroundColor: "#eee",
                            }}
                        >
                            {prompt}
                        </pre>
                    </div>
                    <div>
                        <strong>Temperature:</strong> {temperature || "-"}
                    </div>
                    <div style={{ textAlign: "end" }}>
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
                <ProgressBar now={progress} />
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
                        <Spinner as="span" animation="border" size="sm" />{" "}
                        Loading
                    </p>
                    {/* <div><Button size="sm" onClick={() => onBackgroundProcess()}>Notify me when this is complete</Button></div> */}
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
                        <pre style={{ fontFamily: "monospace" }}>
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
                                <pre style={{ fontFamily: "monospace" }}>
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
            <Form.Control
                dir="auto"
                as="textarea"
                rows={10}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        );
    } else if (outputType === "list") {
        output = (
            <Form
                onChange={(e) => onChange(e.target.labels[0].innerText)}
                style={{ background: "#fff" }}
                className="mb-3"
            >
                {value.slice(0, Math.min(5, value.length)).map((label, i) => (
                    <div key={`output-list-${i}`} className="mb-3">
                        <Form.Check
                            type={"radio"}
                            name={`output-list-radio`}
                            id={`output-list-${i}`}
                            label={label.replace(/^"+|[".]+$/g, "")}
                        />
                    </div>
                ))}
            </Form>
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
                    <Form.Group style={{ marginBottom: 10 }}>
                        <Form.Control
                            dir="auto"
                            as="textarea"
                            rows={10}
                            value={tempText}
                            onChange={(e) => setTempText(e.target.value)}
                        />
                    </Form.Group>
                    <Button
                        style={{ marginBottom: 20 }}
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
