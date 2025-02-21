const { Worker } = require("bullmq");
const Redis = require("ioredis");
const {
    ApolloClient,
    InMemoryCache,
    split,
    HttpLink,
    gql,
} = require("@apollo/client");
const { GraphQLWsLink } = require("@apollo/client/link/subscriptions");
const { getMainDefinition } = require("@apollo/client/utilities");
const { createClient } = require("graphql-ws");
const WebSocket = require("ws");

const REQUEST_PROGRESS_SUBSCRIPTION = gql`
    subscription RequestProgress($requestIds: [String!]!) {
        requestProgress(requestIds: $requestIds) {
            progress
            data
            info
        }
    }
`;

const graphqlEndpoint =
    process.env.CORTEX_GRAPHQL_API_URL || "http://localhost:4000/graphql";

const connection = new Redis(
    process.env.REDIS_CONNECTION_STRING || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    },
);

const httpLink = new HttpLink({
    uri: graphqlEndpoint,
});

const wsLink = new GraphQLWsLink(
    createClient({
        url: graphqlEndpoint.replace("http", "ws"),
        webSocketImpl: WebSocket,
    }),
);

const splitLink = split(
    ({ query }) => {
        const definition = getMainDefinition(query);
        return (
            definition.kind === "OperationDefinition" &&
            definition.operation === "subscription"
        );
    },
    wsLink,
    httpLink,
);

const client = new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
});

const worker = new Worker(
    "request-progress",
    async (job) => {
        const { requestId, type, userId, metadata } = job.data;
        const { targetLocaleLabel } = metadata;
        console.log(
            `Starting progress tracking job ${job.id} for ${type} requestId: ${requestId}. userId: ${userId}`,
        );

        const RequestProgress = (
            await import("../app/api/models/request-progress.mjs")
        ).default;

        // Check if already cancelled
        const request = await RequestProgress.findOne({ requestId });
        if (request?.status === "cancelled") {
            console.log(`Job ${job.id} was cancelled`);
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                let timeoutId;
                let subscription;

                // Add a periodic check for cancellation
                const cancellationCheckInterval = setInterval(async () => {
                    const updatedRequest = await RequestProgress.findOne({
                        requestId,
                    });
                    if (updatedRequest?.status === "cancelled") {
                        console.log(`Job ${job.id} received cancellation`);
                        clearTimeout(timeoutId);
                        clearInterval(cancellationCheckInterval);
                        subscription?.unsubscribe();
                        resolve(); // Resolve without error since this is an expected cancellation
                        return;
                    }
                }, 5000);

                const resetIdleTimeout = () => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(
                        () => {
                            console.warn(
                                `Job ${job.id} timed out after 5 minutes of inactivity`,
                            );
                            subscription?.unsubscribe();
                            RequestProgress.findOneAndUpdate(
                                { requestId },
                                {
                                    status: "failed",
                                    error: "Operation timed out after 5 minutes of inactivity",
                                },
                            ).exec();
                            reject(
                                new Error(
                                    "Operation timed out after 5 minutes of inactivity",
                                ),
                            );
                        },
                        5 * 60 * 1000,
                    );
                };

                // Start initial idle timeout
                resetIdleTimeout();

                subscription = client
                    .subscribe({
                        query: REQUEST_PROGRESS_SUBSCRIPTION,
                        variables: { requestIds: [requestId] },
                    })
                    .subscribe({
                        async next(x) {
                            // Check for cancellation before processing updates
                            const currentRequest =
                                await RequestProgress.findOne({ requestId });
                            if (currentRequest?.status === "cancelled") {
                                console.log(
                                    `Job ${job.id} was cancelled during processing`,
                                );
                                clearTimeout(timeoutId);
                                clearInterval(cancellationCheckInterval);
                                subscription.unsubscribe();
                                resolve();
                                return;
                            }

                            const { data } = x;
                            // Reset idle timeout on each progress update
                            resetIdleTimeout();

                            let progress = data?.requestProgress?.progress || 0;

                            // Check current progress and keep higher value
                            const currentDoc = await RequestProgress.findOne({
                                requestId,
                            });
                            if (currentDoc && progress < currentDoc.progress) {
                                console.log(
                                    `Job ${job.id} maintaining higher progress value ${currentDoc.progress} instead of ${progress}`,
                                );
                                progress = currentDoc.progress;
                            }

                            let dataObject;

                            if (data?.requestProgress?.data) {
                                try {
                                    dataObject = JSON.parse(
                                        JSON.parse(data?.requestProgress?.data),
                                    );
                                } catch (e) {
                                    console.log(
                                        "Non-json data",
                                        data?.requestProgress?.data,
                                    );
                                    if (
                                        data?.requestProgress?.data === "[DONE]"
                                    ) {
                                        // error condition
                                        const error =
                                            data.requestProgress.error;

                                        console.error(
                                            "Error in request progress worker",
                                            error,
                                        );

                                        await RequestProgress.findOneAndUpdate(
                                            {
                                                requestId,
                                            },
                                            {
                                                status: "failed",
                                                statusText: error
                                                    ? JSON.stringify(error)
                                                    : "Non-JSON data received: " +
                                                      data?.requestProgress
                                                          ?.data,
                                            },
                                        );

                                        resolve(dataObject);
                                        return;
                                    }
                                }
                            }

                            // Update progress in database
                            await RequestProgress.findOneAndUpdate(
                                { requestId },
                                {
                                    progress,
                                    statusText: data?.requestProgress?.info,
                                    data: dataObject,
                                    status: "in_progress",
                                    metadata: job.data.metadata,
                                },
                            );

                            if (progress === 1 && dataObject) {
                                console.log(
                                    `Job ${job.id} reached 100% completion`,
                                );

                                // Handle video translation completion if needed
                                if (type === "video-translate" && userId) {
                                    try {
                                        const {
                                            handleVideoTranslationCompletion,
                                        } = await import(
                                            "../app/utils/video-state-handler.js"
                                        );
                                        await handleVideoTranslationCompletion(
                                            userId,
                                            dataObject,
                                            targetLocaleLabel,
                                        );
                                    } catch (error) {
                                        console.error(
                                            "Error handling video translation completion:",
                                            error,
                                        );
                                    }
                                }

                                await RequestProgress.findOneAndUpdate(
                                    { requestId },
                                    { status: "completed" },
                                );

                                clearTimeout(timeoutId);
                                subscription.unsubscribe();
                                resolve(dataObject);
                            }

                            job.updateProgress(progress);
                        },
                        async error(error) {
                            console.error(
                                `Job ${job.id} subscription error:`,
                                error,
                            );
                            clearTimeout(timeoutId);
                            clearInterval(cancellationCheckInterval);
                            subscription.unsubscribe();
                            await RequestProgress.findOneAndUpdate(
                                { requestId },
                                { status: "failed", error: error.message },
                            );
                            reject(error);
                        },
                    });
            } catch (error) {
                console.error(
                    `Failed to setup subscription for job ${job.id}:`,
                    error,
                );
                RequestProgress.findOneAndUpdate(
                    { requestId },
                    { status: "failed", error: error.message },
                ).exec();
                reject(error);
            }
        });
    },
    {
        connection,
        autorun: false,
        concurrency: 5,
        stalledInterval: 300000, // 5 minutes in milliseconds
    },
);

worker.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed with result:`, result);
});

worker.on("failed", (job, error) => {
    console.error(`Job ${job.id} failed with error:`, error);
});

module.exports = {
    run: () => worker.run(),
};
