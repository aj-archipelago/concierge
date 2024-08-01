import mongoose from "mongoose";
import LLM from "./app/api/models/llm";
import config from "./config/index";

const { MONGO_URI, ENCRYPTION_KEY } = process.env;

export async function register() {
    if (!mongoose?.connect) return;
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { ClientEncryption } = await import("mongodb");
    await import("mongodb-client-encryption");

    const keyVaultNamespace = "encryption.__keyVault";
    const kmsProviders = {
        local: {
            key: Buffer.from(ENCRYPTION_KEY, "base64"),
        },
    };

    const autoEncryptionOptions = {
        keyVaultNamespace,
        kmsProviders,
    };

    if (process.env.MONGOCRYPT_PATH) {
        autoEncryptionOptions.extraOptions = {
            cryptSharedLibPath: process.env.MONGOCRYPT_PATH,
        };
    }
    const conn = await mongoose
        .createConnection(MONGO_URI, {
            autoEncryption: autoEncryptionOptions,
        })
        .asPromise();

    const encryption = new ClientEncryption(conn.client, {
        keyVaultNamespace,
        kmsProviders,
    });

    let _key;
    const existingKeys = await encryption.getKeys().toArray();

    if (existingKeys && existingKeys.length > 0) {
        console.log("Using existing key");
        _key = existingKeys[0]._id;
    } else {
        console.log("Creating new key");
        _key = await encryption.createDataKey("local");
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
                jira: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                translate: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                transcribe: {
                    encrypt: {
                        bsonType: "string",
                        algorithm: "AEAD_AES_256_CBC_HMAC_SHA_512-Random",
                    },
                },
                write: {
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
    };

    await mongoose.connect(MONGO_URI, {
        autoEncryption: {
            keyVaultNamespace,
            kmsProviders,
            schemaMap,
        },
    });

    console.log("Connected to MongoDB");
    console.log("Seeding data");
    await seed();

    config.global.initialize();
}

async function seed() {
    for (const llm of config.data.llms) {
        await LLM.findOneAndUpdate({ name: llm.name }, llm, { upsert: true });
    }
}
