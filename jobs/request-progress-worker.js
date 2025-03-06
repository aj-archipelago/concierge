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

// Add a helper function for DB operations with retries
async function retryDbOperation(operation, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            console.warn(`DB operation attempt ${attempt}/${maxRetries} failed:`, error.message);
            
            // Check if MongoDB is not connected and try to reconnect
            if ((error.name === 'MongooseError' || error.name === 'MongoError') && 
                error.message && 
                (error.message.includes('buffering') || 
                 error.message.includes('disconnected') ||
                 error.message.includes('timeout'))) {
                console.log('Detected MongoDB connection issue, attempting to reconnect...');
                await ensureDbConnection(true); // Force reconnection
            }
            
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                // Increase delay for next retry (exponential backoff)
                retryDelay *= 2;
            }
        }
    }
    throw lastError;
}

// Ensure the worker has a database connection before starting operations
let dbInitialized = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

async function ensureDbConnection(forceReconnect = false) {
    if (forceReconnect) {
        dbInitialized = false;
    }
    
    if (!dbInitialized) {
        try {
            // Import without using default to handle both ESM and CJS
            const mongooseModule = await import('mongoose');
            const mongoose = mongooseModule.default || mongooseModule;
            
            // Check if already connected
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                console.log('Already connected to MongoDB');
                dbInitialized = true;
                connectionAttempts = 0;
                return;
            }
            
            // If previous connection exists but is disconnected, close it
            if (mongoose.connection && mongoose.connection.readyState !== 0) {
                console.log('Closing existing MongoDB connection before reconnecting...');
                await mongoose.connection.close();
            }
            
            connectionAttempts++;
            console.log(`Connecting to MongoDB (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`);
            
            const { connectToDatabase } = await import("../src/db.mjs");
            await connectToDatabase();
            
            // Verify the connection was successful
            if (mongoose.connection && mongoose.connection.readyState === 1) {
                console.log("Worker successfully connected to MongoDB database");
                dbInitialized = true;
                connectionAttempts = 0;
            } else {
                throw new Error('Failed to establish MongoDB connection even though no errors were thrown');
            }
        } catch (error) {
            console.error(`Failed to connect to database (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}):`, error);
            
            if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
                console.error('Maximum connection attempts reached. Giving up.');
                throw new Error(`Failed to connect to MongoDB after ${MAX_CONNECTION_ATTEMPTS} attempts: ${error.message}`);
            }
            
            // Wait before next attempt with exponential backoff
            const backoffTime = Math.min(1000 * Math.pow(2, connectionAttempts), 30000);
            console.log(`Waiting ${backoffTime/1000}s before next connection attempt...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            
            // Recursive call to retry
            return ensureDbConnection();
        }
    }
}

const worker = new Worker(
    "request-progress",
    async (job) => {
        const { requestId, type, userId, metadata } = job.data;
        const { targetLocaleLabel } = metadata;
        console.log(
            `Starting progress tracking job ${job.id} for ${type} requestId: ${requestId}. userId: ${userId}`,
        );

        // Ensure DB connection is established
        await ensureDbConnection();

        const RequestProgress = (
            await import("../app/api/models/request-progress.mjs")
        ).default;

        // Check if already cancelled
        const request = await retryDbOperation(() => 
            RequestProgress.findOne({ requestId })
        );
        
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
                    try {
                        const updatedRequest = await retryDbOperation(() => 
                            RequestProgress.findOne({ requestId })
                        );
                        
                        if (updatedRequest?.status === "cancelled") {
                            console.log(`Job ${job.id} received cancellation`);
                            clearTimeout(timeoutId);
                            clearInterval(cancellationCheckInterval);
                            subscription?.unsubscribe();
                            resolve(); // Resolve without error since this is an expected cancellation
                            return;
                        }
                    } catch (error) {
                        console.error("Error in cancellation check:", error);
                        // Don't terminate the job on cancellation check errors
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
                            retryDbOperation(() =>
                                RequestProgress.findOneAndUpdate(
                                    { requestId },
                                    {
                                        status: "failed",
                                        error: "Operation timed out after 5 minutes of inactivity",
                                    },
                                ).exec()
                            ).catch(err => console.error("Error updating progress on timeout:", err));
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
                            try {
                                // Check for cancellation before processing updates
                                const currentRequest = await retryDbOperation(() => 
                                    RequestProgress.findOne({ requestId })
                                );
                                
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
                                const currentDoc = await retryDbOperation(() => 
                                    RequestProgress.findOne({ requestId })
                                );
                                
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

                                            await retryDbOperation(() => 
                                                RequestProgress.findOneAndUpdate(
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
                                                )
                                            );

                                            resolve(dataObject);
                                            return;
                                        }
                                    }
                                }

                                // Update progress in database
                                await retryDbOperation(() => 
                                    RequestProgress.findOneAndUpdate(
                                        { requestId },
                                        {
                                            progress,
                                            statusText: data?.requestProgress?.info,
                                            data: dataObject,
                                            status: "in_progress",
                                            metadata: job.data.metadata,
                                        },
                                    )
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

                                    await retryDbOperation(() => 
                                        RequestProgress.findOneAndUpdate(
                                            { requestId },
                                            { status: "completed" },
                                        )
                                    );

                                    clearTimeout(timeoutId);
                                    subscription.unsubscribe();
                                    resolve(dataObject);
                                }

                                job.updateProgress(progress);
                            } catch (error) {
                                console.error("Error in subscription next handler:", error);
                                // Don't fail the job on a single update error
                            }
                        },
                        async error(error) {
                            console.error(
                                `Job ${job.id} subscription error:`,
                                error,
                            );
                            clearTimeout(timeoutId);
                            clearInterval(cancellationCheckInterval);
                            subscription.unsubscribe();
                            try {
                                await retryDbOperation(() => 
                                    RequestProgress.findOneAndUpdate(
                                        { requestId },
                                        { status: "failed", error: error.message },
                                    )
                                );
                            } catch (dbError) {
                                console.error("Failed to update status on error:", dbError);
                            }
                            reject(error);
                        }
                    });
            } catch (error) {
                console.error(
                    `Failed to setup subscription for job ${job.id}:`,
                    error,
                );
                retryDbOperation(() => 
                    RequestProgress.findOneAndUpdate(
                        { requestId },
                        { status: "failed", error: error.message },
                    ).exec()
                ).catch(err => console.error("Error updating progress on setup failure:", err));
                
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
