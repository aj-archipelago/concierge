import mongoose from "mongoose";
// MONGO_URI: the MongoDB connection string
// MONGO_ENCRYPTION_KEY: the base64-encoded encryption key, if provided uses encryption
// MONGO_DATAKEY_UUID: the UUID of the data key, if given in advance uses the provided key,
// otherwise chooses the first key in the key vault if available, if not creates a new key
const { MONGO_URI, MONGO_ENCRYPTION_KEY, MONGO_DATAKEY_UUID } = process.env;

// Default connection options - using only supported options
const DEFAULT_CONNECTION_OPTIONS = {
    serverSelectionTimeoutMS: 30000, // Increase server selection timeout
    socketTimeoutMS: 45000, // Increase socket timeout
    connectTimeoutMS: 30000, // Increase connection timeout
    maxPoolSize: 10, // Control the maximum number of connections in the pool
    bufferCommands: false, // Prevent buffering commands when disconnected
};

export async function connectToDatabase() {
    if (!MONGO_ENCRYPTION_KEY) {
        await mongoose.connect(MONGO_URI, DEFAULT_CONNECTION_OPTIONS);
        console.log(
            "MONGO_ENCRYPTION_KEY not found. Connected to MongoDB in development mode (no encryption)",
        );
        return;
    }

    let autoEncryptionOptions = {};
    let _key;

    // Import the required modules for encryption
    const { ClientEncryption, UUID } = await import("mongodb");
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

    if (MONGO_DATAKEY_UUID) {
        console.log("Using provided key");
        _key = new UUID(MONGO_DATAKEY_UUID);
    } else {
        let conn;
        try {
            conn = await mongoose
                .createConnection(MONGO_URI, {
                    ...DEFAULT_CONNECTION_OPTIONS,
                    autoEncryption: autoEncryptionOptions,
                })
                .asPromise();
        } catch (e) {
            console.error(
                "Error connecting to MongoDB with encryption: ",
                e.message,
            );
            process.exit(1);
        }

        const encryption = new ClientEncryption(conn.client, {
            keyVaultNamespace,
            kmsProviders,
        });

        const existingKeys = await encryption.getKeys().toArray();

        if (existingKeys && existingKeys.length > 0) {
            console.log("Using existing key");
            _key = existingKeys[0]._id;
        } else {
            console.log("Creating new key");
            _key = await encryption.createDataKey("local");
        }

        await conn.close();
    }

    // Extract database name from MONGO_URI
    const dbName = new URL(MONGO_URI).pathname.split("/")[1];

    const schemaMap = {
        [`${dbName}.users`]: {
            bsonType: "object",
            properties: {
                aiMemory: {
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

    await mongoose.connect(MONGO_URI, encryptionConnectionOptions);
}

export async function closeDatabaseConnection() {
    await mongoose.disconnect();
}
