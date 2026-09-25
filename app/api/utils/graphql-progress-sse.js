import { SUBSCRIPTIONS } from "../../../src/graphql";

export function extractTextFromProgressData(resultData) {
    if (!resultData) return "";

    try {
        const parsed = JSON.parse(resultData);
        if (typeof parsed === "string") {
            return parsed;
        }

        const content =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.content ??
            parsed?.message;
        return typeof content === "string" ? content : "";
    } catch {
        return typeof resultData === "string" ? resultData : "";
    }
}

export function createGraphqlProgressSseResponse({
    logPrefix = "graphql-progress-sse",
    run,
    timeoutMs = null,
    timeoutMessage = "Streaming request timed out before completion",
    keepAliveMs = null,
}) {
    const encoder = new TextEncoder();
    let clientConnected = true;
    let graphqlSubscription = null;
    let timeoutId = null;
    let keepAliveId = null;

    const clearTimer = () => {
        if (!timeoutId) return;
        clearTimeout(timeoutId);
        timeoutId = null;
    };

    const clearKeepAlive = () => {
        if (!keepAliveId) return;
        clearInterval(keepAliveId);
        keepAliveId = null;
    };

    const unsubscribe = () => {
        if (!graphqlSubscription) return;

        try {
            if (typeof graphqlSubscription.unsubscribe === "function") {
                graphqlSubscription.unsubscribe();
            }
        } catch (error) {
            console.error(`[${logPrefix}] Error unsubscribing:`, error);
        }

        graphqlSubscription = null;
    };

    const stream = new ReadableStream({
        async start(controller) {
            const sendEvent = (event, data) => {
                if (!clientConnected) return;

                try {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ event, data })}\n\n`,
                        ),
                    );
                } catch (error) {
                    if (error.code === "ERR_INVALID_STATE") {
                        clientConnected = false;
                    }
                }
            };

            const closeStream = () => {
                clearTimer();
                clearKeepAlive();
                if (!clientConnected) return;

                try {
                    controller.close();
                    clientConnected = false;
                } catch (error) {
                    if (error.code !== "ERR_INVALID_STATE") {
                        console.error(
                            `[${logPrefix}] Error closing stream:`,
                            error,
                        );
                    }
                }
            };

            if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    timeoutId = null;
                    sendEvent("error", { error: timeoutMessage });
                    unsubscribe();
                    closeStream();
                }, timeoutMs);
                timeoutId.unref?.();
            }

            if (Number.isFinite(keepAliveMs) && keepAliveMs > 0) {
                keepAliveId = setInterval(() => {
                    if (!clientConnected) return;
                    try {
                        controller.enqueue(encoder.encode(": keepalive\n\n"));
                    } catch (error) {
                        if (error.code === "ERR_INVALID_STATE") {
                            clientConnected = false;
                            clearKeepAlive();
                        }
                    }
                }, keepAliveMs);
                keepAliveId.unref?.();
            }

            const subscribeToRequestProgress = (
                graphqlClient,
                subscriptionId,
                handlers,
            ) => {
                unsubscribe();
                graphqlSubscription = graphqlClient
                    .subscribe({
                        query: SUBSCRIPTIONS.REQUEST_PROGRESS,
                        variables: { requestIds: [subscriptionId] },
                    })
                    .subscribe({
                        next: (result) => {
                            try {
                                if (!result?.data?.requestProgress) return;
                                handlers.next?.(result.data.requestProgress);
                            } catch (error) {
                                console.error(
                                    `[${logPrefix}] Progress handler error:`,
                                    error,
                                );
                                sendEvent("error", {
                                    error:
                                        error?.message ||
                                        "Streaming request failed",
                                });
                                unsubscribe();
                                closeStream();
                            }
                        },
                        error: (error) => {
                            try {
                                handlers.error?.(error);
                            } catch (handlerError) {
                                console.error(
                                    `[${logPrefix}] Subscription error handler failed:`,
                                    handlerError,
                                );
                                sendEvent("error", {
                                    error:
                                        handlerError?.message ||
                                        error?.message ||
                                        "Subscription failed",
                                });
                                unsubscribe();
                                closeStream();
                            }
                        },
                        complete: () => {
                            try {
                                handlers.complete?.();
                            } catch (error) {
                                console.error(
                                    `[${logPrefix}] Subscription completion handler failed:`,
                                    error,
                                );
                                sendEvent("error", {
                                    error:
                                        error?.message ||
                                        "Subscription completed unexpectedly",
                                });
                                unsubscribe();
                                closeStream();
                            }
                        },
                    });

                return graphqlSubscription;
            };

            try {
                await run({
                    sendEvent,
                    closeStream,
                    unsubscribe,
                    subscribeToRequestProgress,
                });
            } catch (error) {
                console.error(`[${logPrefix}] Error setting up stream:`, error);
                sendEvent("error", {
                    error: error?.message || "Streaming request failed",
                });
                unsubscribe();
                closeStream();
            }
        },
        cancel() {
            clearTimer();
            clearKeepAlive();
            clientConnected = false;
            unsubscribe();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
