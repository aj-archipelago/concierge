import { getClient, SUBSCRIPTIONS, MUTATIONS } from "../graphql.mjs";
import { redactSensitiveText } from "../../app/api/utils/log-redaction.mjs";

// Cortex starts an async request when the client subscribes to its request ID.
// Keep the model response non-streaming; only the transport is asynchronous.
export async function runDigestQuery({
    query,
    field,
    variables,
    timeoutMs,
    logger,
    logContext = [],
    signal,
    deadline,
}) {
    const client = await getClient(undefined, { keepAlive: 30_000 });
    const startedAt = Date.now();
    const controller = new AbortController();
    const registrationTimeout = setTimeout(() => controller.abort(), 30_000);
    let requestId;
    let subscription;
    let completionTimeout;
    let rejectCompletion;
    const abort = () => {
        controller.abort(signal?.reason);
        rejectCompletion?.(signal?.reason || new Error("Task cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });

    try {
        signal?.throwIfAborted();
        const response = await client.query({
            query,
            variables: { ...variables, async: true },
            fetchPolicy: "no-cache",
            context: {
                fetchOptions: { signal: controller.signal },
                headers: deadline
                    ? { "x-cortex-deadline": String(deadline) }
                    : {},
            },
        });
        clearTimeout(registrationTimeout);
        const initial = response.data?.[field];
        if (response.errors?.length || initial?.errors?.length) {
            throw new Error("Cortex rejected digest generation");
        }
        requestId = initial?.result;
        if (
            typeof requestId !== "string" ||
            !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)
        ) {
            requestId = null;
            throw new Error("Cortex did not return a digest request ID");
        }
        logger.log(
            `[Digest] ${field} started; requestId=${requestId}`,
            ...logContext,
        );

        signal?.throwIfAborted();
        return await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error, result) => {
                if (settled) return;
                settled = true;
                if (error) reject(error);
                else resolve(result);
            };
            rejectCompletion = (error) => finish(error);
            completionTimeout = setTimeout(
                () => {
                    finish(
                        new Error(
                            "Digest generation timed out before completion",
                        ),
                    );
                },
                Math.max(
                    1,
                    Math.min(
                        timeoutMs,
                        deadline ? deadline - Date.now() : timeoutMs,
                    ),
                ),
            );
            subscription = client
                .subscribe({
                    query: SUBSCRIPTIONS.REQUEST_PROGRESS,
                    variables: { requestIds: [requestId] },
                })
                .subscribe({
                    next: ({ data, errors }) => {
                        if (settled) return;
                        if (errors?.length) {
                            finish(
                                new Error("Cortex digest subscription failed"),
                            );
                            return;
                        }
                        const update = data?.requestProgress;
                        // Tool progress can contain recoverable errors and partial data.
                        // Only a terminal event is the result of this generation.
                        if (update?.progress !== 1) return;
                        if (update.error) {
                            finish(
                                new Error(redactSensitiveText(update.error)),
                            );
                            return;
                        }
                        try {
                            const result = JSON.parse(update.data);
                            if (typeof result !== "string" || !result.trim()) {
                                throw new Error(
                                    "Cortex returned empty digest content",
                                );
                            }
                            const info = update.info
                                ? JSON.parse(update.info)
                                : {};
                            // Match the legacy GraphQL `tool` field used by digest cards.
                            const tool = JSON.stringify(
                                Object.fromEntries(
                                    [
                                        "hideFromModel",
                                        "toolCallbackName",
                                        "title",
                                        "search",
                                        "toolCallbackId",
                                        "toolUsed",
                                        "citations",
                                    ]
                                        .filter(
                                            (key) => info?.[key] !== undefined,
                                        )
                                        .map((key) => [key, info[key]]),
                                ),
                            );
                            finish(null, { result, tool });
                        } catch {
                            finish(
                                new Error(
                                    "Cortex returned invalid or empty digest content",
                                ),
                            );
                        }
                    },
                    error: (error) => finish(error),
                    complete: () =>
                        finish(
                            new Error(
                                "Digest subscription ended before completion",
                            ),
                        ),
                });
        });
    } catch (error) {
        clearTimeout(completionTimeout);
        subscription?.unsubscribe();
        subscription = null;
        // Do not replay agent requests: tools may already have performed work.
        if (requestId) {
            const cancelController = new AbortController();
            const cancelTimeout = setTimeout(
                () => cancelController.abort(),
                10_000,
            );
            try {
                await client.mutate({
                    mutation: MUTATIONS.CANCEL_REQUEST,
                    variables: { requestId },
                    context: {
                        fetchOptions: { signal: cancelController.signal },
                    },
                });
            } catch {
                // Cancellation is best effort; never start a replacement request.
            } finally {
                clearTimeout(cancelTimeout);
            }
        }
        const message = redactSensitiveText(
            error?.message || "Digest generation failed",
        );
        logger.log(
            `[Digest] ${field} failed; requestId=${requestId || "unassigned"}; elapsedMs=${Date.now() - startedAt}; ${message}`,
            ...logContext,
        );
        throw new Error(message);
    } finally {
        signal?.removeEventListener("abort", abort);
        clearTimeout(registrationTimeout);
        clearTimeout(completionTimeout);
        subscription?.unsubscribe();
        client.stop();
    }
}
