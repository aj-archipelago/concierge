import mongoose from "mongoose";
import {
    formatDbErrorForLog,
    getDbRetryDelayMs,
    isCosmosRateLimitError,
} from "../app/api/utils/db-retry.mjs";
// MONGO_URI: the MongoDB connection string
// MONGO_ENCRYPTION_KEY: the base64-encoded encryption key, if provided uses encryption
// Uses the first key in the key vault if available, and creates one if needed.
const { MONGO_URI, MONGO_ENCRYPTION_KEY } = process.env;

// Default connection options - using only supported options
export const DEFAULT_CONNECTION_OPTIONS = {
    serverSelectionTimeoutMS: 30000, // Increase server selection timeout
    socketTimeoutMS: 45000, // Increase socket timeout
    connectTimeoutMS: 30000, // Increase connection timeout
    maxPoolSize: 10, // Control the maximum number of connections in the pool
    bufferCommands: false, // Prevent buffering commands when disconnected
    autoCreate: false, // Keep collection creation in explicit migration/operator paths
    autoIndex: false, // Avoid metadata-heavy index checks during cold start
};

const DEFAULT_STARTUP_RETRY_ATTEMPTS = 5;
const DEFAULT_STARTUP_RETRY_DELAY_MS = 500;
const DEFAULT_STARTUP_RETRY_MAX_DELAY_MS = 10_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStartupRetryAttempts() {
    const parsed = Number(process.env.MONGO_STARTUP_RETRY_ATTEMPTS);
    return Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : DEFAULT_STARTUP_RETRY_ATTEMPTS;
}

export async function withCosmosStartupRetry(
    operation,
    { label = "MongoDB startup operation", attempts, sleepFn = sleep } = {},
) {
    const maxAttempts = attempts || getStartupRetryAttempts();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            const shouldRetry =
                isCosmosRateLimitError(error) && attempt < maxAttempts;
            if (!shouldRetry) {
                throw error;
            }

            const delayMs = getDbRetryDelayMs(
                error,
                DEFAULT_STARTUP_RETRY_DELAY_MS,
                DEFAULT_STARTUP_RETRY_MAX_DELAY_MS,
            );
            console.warn(
                `${label} was rate limited; retrying attempt ${
                    attempt + 1
                }/${maxAttempts} in ${delayMs}ms: ${formatDbErrorForLog(
                    error,
                )}`,
            );
            await sleepFn(delayMs);
        }
    }
}

export async function connectToDatabase() {
    if (!MONGO_ENCRYPTION_KEY) {
        await withCosmosStartupRetry(
            () => mongoose.connect(MONGO_URI, DEFAULT_CONNECTION_OPTIONS),
            { label: "MongoDB connection" },
        );
        console.log(
            "MONGO_ENCRYPTION_KEY not found. Connected to MongoDB without encryption",
        );
        return;
    }

    let autoEncryptionOptions = {};
    let _key;

    // Import the required modules for encryption
    const { ClientEncryption } = await import("mongodb");
    // Must import this module as well to avoid a runtime error
    await import("mongodb-client-encryption");

    const keyVaultNamespace = "encryption.__keyVault";
    const kmsProviders = {
        local: {
            key: Buffer.from(MONGO_ENCRYPTION_KEY, "base64"),
        },
    };
    autoEncryptionOptions = {
        keyVaultNamespace,
        kmsProviders,
    };

    if (process.env.MONGOCRYPT_PATH) {
        autoEncryptionOptions.extraOptions = {
            cryptSharedLibPath: process.env.MONGOCRYPT_PATH,
        };
    } else {
        console.warn(
            "No mongocrypt path provided, make sure it's in your PATH or set MONGOCRYPT_PATH or use mongocryptd",
        );
    }

    let conn;
    try {
        conn = await withCosmosStartupRetry(
            () =>
                mongoose
                    .createConnection(MONGO_URI, {
                        ...DEFAULT_CONNECTION_OPTIONS,
                        autoEncryption: autoEncryptionOptions,
                    })
                    .asPromise(),
            { label: "MongoDB data key connection" },
        );
    } catch (e) {
        console.error(
            "Error connecting to MongoDB with encryption: ",
            e.message,
        );
        throw e;
    }

    const encryption = new ClientEncryption(conn.client, {
        keyVaultNamespace,
        kmsProviders,
    });

    try {
        const existingKeys = await withCosmosStartupRetry(
            () => encryption.getKeys().toArray(),
            { label: "MongoDB data key lookup" },
        );

        if (existingKeys && existingKeys.length > 0) {
            console.log("Using existing key");
            _key = existingKeys[0]._id;
        } else {
            console.log("Creating new key");
            _key = await withCosmosStartupRetry(
                () => encryption.createDataKey("local"),
                { label: "MongoDB data key creation" },
            );
        }
    } finally {
        await conn.close();
    }

    // Extract database name from MONGO_URI
    const dbName = new URL(MONGO_URI).pathname.split("/")[1];

    const schemaMap = {
        [`${dbName}.users`]: {
            bsonType: "object",
            properties: {
                contextKey: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                previousContextKey: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                mcpServers: {
                    encrypt: {
                        bsonType: "object",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                mcpOAuthPending: {
                    encrypt: {
                        bsonType: "object",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.chats`]: {
            bsonType: "object",
            properties: {
                title: {
                    encrypt: {
                        bsonType: "string",
                        algorithm:
                            "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
                    },
                },
                messages: {
                    encrypt: {
                        bsonType: "array",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.digests`]: {
            bsonType: "object",
            properties: {
                blocks: {
                    encrypt: {
                        bsonType: "array",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.prompts`]: {
            bsonType: "object",
            properties: {
                title: {
                    encrypt: {
                        bsonType: "string",
                        algorithm:
                            "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
                    },
                },
                text: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.runs`]: {
            bsonType: "object",
            properties: {
                output: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.userstates`]: {
            bsonType: "object",
            properties: {
                serializedState: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.workspaces`]: {
            bsonType: "object",
            properties: {
                name: {
                    encrypt: {
                        bsonType: "string",
                        algorithm:
                            "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
                    },
                },
                slug: {
                    encrypt: {
                        bsonType: "string",
                        algorithm:
                            "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic",
                    },
                },
                systemPrompt: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.workspacestates`]: {
            bsonType: "object",
            properties: {
                inputText: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.appletdatas`]: {
            bsonType: "object",
            properties: {
                data: {
                    encrypt: {
                        bsonType: "object",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.appletshareddatas`]: {
            bsonType: "object",
            properties: {
                value: {
                    encrypt: {
                        bsonType: "object",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.appletshareddatarevisions`]: {
            bsonType: "object",
            properties: {
                value: {
                    encrypt: {
                        bsonType: "object",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.tasks`]: {
            bsonType: "object",
            properties: {
                data: {
                    encrypt: {
                        bsonType: "object",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                statusText: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                error: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                metadata: {
                    encrypt: {
                        bsonType: "object",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
        [`${dbName}.mediaitems`]: {
            bsonType: "object",
            properties: {
                prompt: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                url: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                azureUrl: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                gcsUrl: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                inputImageUrl: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                inputImageUrl2: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                inputImageUrl3: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
            },
            encryptMetadata: {
                keyId: [_key],
            },
        },
    };

    autoEncryptionOptions.schemaMap = schemaMap;

    console.log("Connecting to MongoDB with encryption");
    const encryptionConnectionOptions = {
        ...DEFAULT_CONNECTION_OPTIONS,
        autoEncryption: autoEncryptionOptions,
    };

    await withCosmosStartupRetry(
        () => mongoose.connect(MONGO_URI, encryptionConnectionOptions),
        { label: "Encrypted MongoDB connection" },
    );
}

export async function closeDatabaseConnection() {
    await mongoose.disconnect();
}
