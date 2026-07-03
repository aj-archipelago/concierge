import { NextResponse } from "next/server";
import { getClient, QUERIES, SUBSCRIPTIONS } from "../../../../src/graphql";
import { getCurrentUser } from "../../utils/auth.js";
import {
    createGraphqlProgressSseResponse,
    extractTextFromProgressData,
} from "../../utils/graphql-progress-sse.js";
import { validateAppletAccess } from "../access.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../sdk-guard.js";

const SOURCE_QA_STREAM_TIMEOUT_MS = 295000;

function parseJsonObject(value) {
    if (!value) {
        return {};
    }
    if (typeof value === "object" && !Array.isArray(value)) return value;
    if (typeof value !== "string") return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch (error) {
        console.error("Error parsing source Q&A metadata:", error);
        return {};
    }
}

function normalizeContextText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.map(normalizeContextText).filter(Boolean).join("\n");
    }
    if (typeof value === "object") {
        if (typeof value.text === "string") return value.text.trim();
        if (typeof value.content === "string") return value.content.trim();
        if (typeof value.message === "string") return value.message.trim();
        if (typeof value.answer === "string") return value.answer.trim();
        if (typeof value.question === "string") return value.question.trim();
        return JSON.stringify(value);
    }
    return "";
}

function normalizeContextTurn(turn) {
    if (!turn || typeof turn !== "object") {
        return normalizeContextText(turn);
    }
    const role = typeof turn.role === "string" ? turn.role.trim() : "";
    const content = normalizeContextText(
        turn.content ??
            turn.text ??
            turn.message ??
            turn.answer ??
            turn.question,
    );
    if (!content) return "";
    return role ? `${role}: ${content}` : content;
}

function formatSourceQaContextInfo(contextInfo) {
    if (typeof contextInfo === "string") return contextInfo.trim();
    if (!contextInfo || typeof contextInfo !== "object") return "";

    const lines = [];
    const addField = (label, value) => {
        const text = normalizeContextText(value);
        if (text) lines.push(`${label}: ${text}`);
    };

    addField("Current topic", contextInfo.topic ?? contextInfo.currentTopic);
    addField("Previous question", contextInfo.previousQuestion);
    addField("Previous answer", contextInfo.previousAnswer);
    addField("User intent", contextInfo.userIntent ?? contextInfo.intent);

    const turns = contextInfo.turns ?? contextInfo.conversationTurns;
    if (Array.isArray(turns) && turns.length) {
        const formattedTurns = turns.map(normalizeContextTurn).filter(Boolean);
        if (formattedTurns.length) {
            lines.push(`Prior conversation:\n${formattedTurns.join("\n")}`);
        }
    }

    const notes = contextInfo.notes ?? contextInfo.additionalContext;
    if (Array.isArray(notes)) {
        const formattedNotes = notes.map(normalizeContextText).filter(Boolean);
        if (formattedNotes.length) {
            lines.push(`Additional context:\n${formattedNotes.join("\n")}`);
        }
    } else {
        addField("Additional context", notes);
    }

    return lines.join("\n").trim();
}

function hasKeys(value) {
    return value && typeof value === "object" && Object.keys(value).length > 0;
}

function normalizeSourceQaResponse(data) {
    const rawInfo = data?.info || null;
    const infoData = parseJsonObject(rawInfo);
    const infoResultData = parseJsonObject(infoData.resultData);
    const resultDataFromResponse = parseJsonObject(data?.resultData);
    const resultData = hasKeys(resultDataFromResponse)
        ? resultDataFromResponse
        : hasKeys(infoResultData)
          ? infoResultData
          : infoData;
    const toolData = parseJsonObject(data?.tool);
    const metadata = hasKeys(resultData) ? resultData : toolData;
    const citations = Array.isArray(metadata.citations)
        ? metadata.citations.filter(Boolean)
        : [];
    const followUpQuestions = Array.isArray(metadata.followUpQuestions)
        ? metadata.followUpQuestions.filter(Boolean)
        : [];
    const confidence =
        typeof metadata.confidence === "string" ? metadata.confidence : null;
    const coverage =
        metadata.coverage &&
        typeof metadata.coverage === "object" &&
        !Array.isArray(metadata.coverage)
            ? metadata.coverage
            : null;

    return {
        result: data?.result || "",
        citations,
        followUpQuestions,
        confidence,
        coverage,
        metadata,
        resultData,
        tool: toolData,
        rawResultData: data?.resultData || null,
        rawTool: data?.tool || null,
        warnings: data?.warnings || [],
        errors: data?.errors || [],
    };
}

function logSourceQaResponseSummary(label, response, raw = {}) {
    if (process.env.NODE_ENV !== "development") return;

    const metadata = response?.metadata || {};
    const resultData = response?.resultData || {};
    console.info(`[applet-source-qa] ${label}`, {
        resultLength: response?.result?.length || 0,
        citationCount: Array.isArray(response?.citations)
            ? response.citations.length
            : 0,
        confidence: response?.confidence || null,
        hasCoverage: Boolean(response?.coverage),
        followUpQuestionCount: Array.isArray(response?.followUpQuestions)
            ? response.followUpQuestions.length
            : 0,
        metadataKeys: Object.keys(metadata).sort(),
        resultDataKeys: Object.keys(resultData).sort(),
        rawInfoKeys: Object.keys(parseJsonObject(raw.info)).sort(),
        rawToolKeys: Object.keys(parseJsonObject(raw.tool)).sort(),
    });
}

function collectSourceQaStreamingResult({ graphqlClient, variables }) {
    return new Promise(async (resolve, reject) => {
        let accumulated = "";
        let latestMetadata = null;
        let subscription = null;
        let settled = false;

        const cleanup = () => {
            if (
                subscription &&
                typeof subscription.unsubscribe === "function"
            ) {
                try {
                    subscription.unsubscribe();
                } catch (error) {
                    console.error(
                        "[applet-source-qa] Error unsubscribing:",
                        error,
                    );
                }
            }
            subscription = null;
        };

        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            cleanup();
            callback(value);
        };

        const fail = (error) => {
            const normalizedError =
                error instanceof Error
                    ? error
                    : new Error(String(error || "source Q&A streaming failed"));
            finish(reject, normalizedError);
        };

        const timeoutId = setTimeout(() => {
            fail(new Error("source Q&A request timed out before completion"));
        }, SOURCE_QA_STREAM_TIMEOUT_MS);

        try {
            const response = await graphqlClient.query({
                query: QUERIES.SOURCE_QA,
                variables: { ...variables, stream: true },
                fetchPolicy: "network-only",
            });
            const sourceQa = response.data?.ask_aj;
            const subscriptionId = sourceQa?.result;

            if (!subscriptionId) {
                fail(new Error("Cortex did not start source Q&A streaming"));
                return;
            }

            subscription = graphqlClient
                .subscribe({
                    query: SUBSCRIPTIONS.REQUEST_PROGRESS,
                    variables: { requestIds: [subscriptionId] },
                })
                .subscribe({
                    next: (result) => {
                        try {
                            const requestProgress =
                                result?.data?.requestProgress;
                            if (!requestProgress) return;

                            const {
                                progress,
                                data: resultData,
                                info,
                                error,
                            } = requestProgress;

                            if (error) {
                                fail(new Error(error));
                                return;
                            }

                            const textContent =
                                extractTextFromProgressData(resultData);
                            if (textContent) {
                                accumulated += textContent;
                            }
                            if (info && progress !== 1) {
                                latestMetadata = normalizeSourceQaResponse({
                                    result: accumulated,
                                    info,
                                    resultData: info,
                                    tool: sourceQa?.tool || null,
                                    warnings: sourceQa?.warnings || [],
                                    errors: sourceQa?.errors || [],
                                });
                            }

                            if (progress === 1) {
                                const finalResponse = normalizeSourceQaResponse(
                                    {
                                        result: accumulated,
                                        info,
                                        resultData: info || null,
                                        tool: sourceQa?.tool || null,
                                        warnings: sourceQa?.warnings || [],
                                        errors: sourceQa?.errors || [],
                                    },
                                );
                                finish(resolve, {
                                    ...latestMetadata,
                                    ...finalResponse,
                                });
                            }
                        } catch (error) {
                            fail(error);
                        }
                    },
                    error: fail,
                    complete: () => {
                        fail(
                            new Error(
                                "source Q&A stream ended before the final result was produced",
                            ),
                        );
                    },
                });
        } catch (error) {
            fail(error);
        }
    });
}

function createSourceQaStreamingResponse({ graphqlClient, variables }) {
    return createGraphqlProgressSseResponse({
        logPrefix: "applet-source-qa",
        run: async ({
            sendEvent,
            closeStream,
            unsubscribe,
            subscribeToRequestProgress,
        }) => {
            const response = await graphqlClient.query({
                query: QUERIES.SOURCE_QA,
                variables: { ...variables, stream: true },
                fetchPolicy: "network-only",
            });
            const sourceQa = response.data?.ask_aj;
            const subscriptionId = sourceQa?.result;

            if (!subscriptionId) {
                sendEvent("error", {
                    error: "Cortex did not start source Q&A streaming",
                });
                closeStream();
                return;
            }

            let accumulated = "";
            let latestMetadata = null;

            const finishFailure = (message) => {
                sendEvent("error", { error: message });
                unsubscribe();
                closeStream();
            };

            subscribeToRequestProgress(graphqlClient, subscriptionId, {
                next: (requestProgress) => {
                    const {
                        progress,
                        data: resultData,
                        info,
                        error,
                    } = requestProgress;

                    if (error) {
                        finishFailure(error);
                        return;
                    }

                    const textContent = extractTextFromProgressData(resultData);
                    if (textContent) {
                        accumulated += textContent;
                        sendEvent("data", {
                            chunk: textContent,
                            progress,
                            metadata: latestMetadata,
                        });
                    } else if (info && progress !== 1) {
                        latestMetadata = normalizeSourceQaResponse({
                            result: accumulated,
                            info,
                            resultData: info,
                            tool: sourceQa?.tool || null,
                            warnings: sourceQa?.warnings || [],
                            errors: sourceQa?.errors || [],
                        });
                        sendEvent("metadata", latestMetadata);
                    } else if (progress !== undefined) {
                        sendEvent("progress", { progress });
                    }

                    if (progress === 1) {
                        const finalResponse = normalizeSourceQaResponse({
                            result: accumulated,
                            info,
                            resultData: info || null,
                            tool: sourceQa?.tool || null,
                            warnings: sourceQa?.warnings || [],
                            errors: sourceQa?.errors || [],
                        });
                        logSourceQaResponseSummary(
                            "stream complete",
                            finalResponse,
                            {
                                info,
                                tool: sourceQa?.tool,
                            },
                        );
                        sendEvent("complete", finalResponse);
                        unsubscribe();
                        closeStream();
                    }
                },
                error: (subscriptionError) => {
                    console.error(
                        "[applet-source-qa] Subscription error:",
                        subscriptionError,
                    );
                    finishFailure(
                        subscriptionError?.message || "Subscription failed",
                    );
                },
                complete: () => {
                    finishFailure(
                        "source Q&A stream ended before the final result was produced",
                    );
                },
            });
        },
    });
}

export async function POST(request) {
    try {
        const {
            appletId,
            text,
            question,
            contextInfo,
            language,
            maxSearchResults,
            maxRefinementRounds,
            searchInternet,
            maxInternetResults,
            followUpQuestionCount,
            skipAnswerSynthesis,
            stream,
        } = await request.json();
        const queryText = typeof text === "string" ? text : question;

        if (!appletId || typeof appletId !== "string") {
            return NextResponse.json(
                { error: "appletId is required" },
                { status: 400 },
            );
        }
        if (!queryText || typeof queryText !== "string") {
            return NextResponse.json(
                { error: "text is required" },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }

        const variables = {
            text: queryText,
            language: language || "auto",
            maxSearchResults:
                Number.isFinite(Number(maxSearchResults)) &&
                Number(maxSearchResults) > 0
                    ? Math.floor(Number(maxSearchResults))
                    : 12,
            stream: false,
        };
        if (contextInfo !== undefined) {
            variables.contextInfo = formatSourceQaContextInfo(contextInfo);
        }
        if (
            Number.isFinite(Number(maxRefinementRounds)) &&
            Number(maxRefinementRounds) >= 0
        ) {
            variables.maxRefinementRounds = Math.floor(
                Number(maxRefinementRounds),
            );
        }
        if (searchInternet !== undefined) {
            variables.searchInternet = searchInternet !== false;
        }
        if (
            Number.isFinite(Number(maxInternetResults)) &&
            Number(maxInternetResults) > 0
        ) {
            variables.maxInternetResults = Math.floor(
                Number(maxInternetResults),
            );
        }
        if (
            Number.isFinite(Number(followUpQuestionCount)) &&
            Number(followUpQuestionCount) >= 0
        ) {
            variables.followUpQuestionCount = Math.floor(
                Number(followUpQuestionCount),
            );
        }
        if (skipAnswerSynthesis !== undefined) {
            variables.skipAnswerSynthesis = skipAnswerSynthesis === true;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user?._id,
            api: "sourceQa.query",
            limits: APPLET_SDK_LIMITS.sourceQa,
            run: async () => {
                const graphqlClient = getClient();
                if (stream === true) {
                    return createSourceQaStreamingResponse({
                        graphqlClient,
                        variables,
                    });
                }

                const normalized = await collectSourceQaStreamingResult({
                    graphqlClient,
                    variables,
                });
                logSourceQaResponseSummary("query complete", normalized, {
                    info: normalized.rawResultData,
                    tool: normalized.rawTool,
                });
                return NextResponse.json(normalized);
            },
        });
    } catch (error) {
        console.error("Error in applet source-qa:", error);
        return NextResponse.json(
            { error: "Failed to process source Q&A request" },
            { status: 500 },
        );
    }
}
