#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const DEFAULT_ENV_FILES = [".env.local", ".env"];
const COLLECTION_NAME = "apikeymappings";

function printUsage() {
    console.log(`Usage:
  node scripts/backfill-api-key-mappings.js [options]

Options:
  --key <raw-api-key>       Raw API key. Can be repeated.
  --hash <api-key-hash>     Precomputed 12-char api_key_id/hash. Can be repeated.
  --label <label>           Label for the most recent --key or --hash.
  --file <path>             JSON file with array of { label, apiKey? | apiKeyHash? }.
  --env-file <path>         Optional env file to read MONGO_URI from.
  --dry-run                 Show planned upserts without writing.
  --help                    Show this help text.

Examples:
  node scripts/backfill-api-key-mappings.js --hash 67cf5bcce234 --label "Example key" --dry-run
  node scripts/backfill-api-key-mappings.js --key raw-api-key-example --label "My key"
  node scripts/backfill-api-key-mappings.js --file ./tmp/api-key-mappings.json
`);
}

function hashApiKey(apiKey) {
    if (!apiKey) return null;
    return crypto
        .createHash("sha256")
        .update(String(apiKey))
        .digest("hex")
        .slice(0, 12);
}

function resolvePath(targetPath) {
    return path.isAbsolute(targetPath)
        ? targetPath
        : path.resolve(process.cwd(), targetPath);
}

function loadEnvFile(filePath) {
    const env = {};
    const contents = fs.readFileSync(filePath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
        if (!line || line.trim().startsWith("#")) continue;

        const eqIndex = line.indexOf("=");
        if (eqIndex === -1) continue;

        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (key) env[key] = value;
    }

    return env;
}

function resolveMongoUri(explicitEnvFile) {
    if (process.env.MONGO_URI) {
        return process.env.MONGO_URI;
    }

    const candidateFiles = explicitEnvFile
        ? [resolvePath(explicitEnvFile)]
        : DEFAULT_ENV_FILES.map((file) => path.resolve(process.cwd(), file));

    for (const file of candidateFiles) {
        if (!fs.existsSync(file)) continue;

        const env = loadEnvFile(file);
        if (env.MONGO_URI) {
            return env.MONGO_URI;
        }
    }

    throw new Error(
        "MONGO_URI is not set. Export it or provide an env file containing it.",
    );
}

function parseFileEntries(filePath) {
    const resolved = resolvePath(filePath);
    const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));

    if (!Array.isArray(parsed)) {
        throw new Error(`Expected array in ${resolved}`);
    }

    return parsed.map((entry, index) => {
        if (!entry || typeof entry !== "object") {
            throw new Error(`Invalid entry at index ${index} in ${resolved}`);
        }

        const label = entry.label?.trim();
        if (!label) {
            throw new Error(`Missing label at index ${index} in ${resolved}`);
        }

        const apiKeyHash = entry.apiKey
            ? hashApiKey(entry.apiKey)
            : entry.apiKeyHash?.trim();

        if (!apiKeyHash) {
            throw new Error(
                `Entry ${index} in ${resolved} must include apiKey or apiKeyHash`,
            );
        }

        return {
            apiKeyHash,
            label,
            source: resolved,
        };
    });
}

function parseArgs(argv) {
    const entries = [];
    const filePaths = [];
    let dryRun = false;
    let envFile = null;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === "--help" || arg === "-h") {
            return { help: true };
        }

        if (arg === "--dry-run") {
            dryRun = true;
            continue;
        }

        if (arg === "--env-file") {
            envFile = argv[++i];
            continue;
        }

        if (arg === "--file") {
            filePaths.push(argv[++i]);
            continue;
        }

        if (arg === "--key") {
            const apiKey = argv[++i];
            if (!apiKey) throw new Error("--key requires a value");

            entries.push({
                apiKeyHash: hashApiKey(apiKey),
                label: null,
                source: "cli:key",
            });
            continue;
        }

        if (arg === "--hash") {
            const apiKeyHash = argv[++i];
            if (!apiKeyHash) throw new Error("--hash requires a value");

            entries.push({
                apiKeyHash,
                label: null,
                source: "cli:hash",
            });
            continue;
        }

        if (arg === "--label") {
            const label = argv[++i]?.trim();
            if (!label) throw new Error("--label requires a value");
            if (entries.length === 0) {
                throw new Error("--label must follow --key or --hash");
            }

            entries[entries.length - 1].label = label;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }

    const fileEntries = filePaths.flatMap(parseFileEntries);
    const allEntries = [...entries, ...fileEntries];

    if (allEntries.length === 0) {
        throw new Error("No mappings provided.");
    }

    const normalized = allEntries.map((entry, index) => {
        const apiKeyHash = entry.apiKeyHash?.trim();
        const label = entry.label?.trim();

        if (!apiKeyHash) {
            throw new Error(`Missing apiKeyHash for entry ${index + 1}`);
        }

        if (!label) {
            throw new Error(`Missing label for entry ${index + 1}`);
        }

        return {
            apiKeyHash,
            label,
            source: entry.source,
        };
    });

    return {
        help: false,
        dryRun,
        envFile,
        entries: normalized,
    };
}

async function upsertMappings({ mongoUri, entries, dryRun }) {
    const client = new MongoClient(mongoUri);
    await client.connect();

    try {
        const db = client.db();
        const collection = db.collection(COLLECTION_NAME);
        const now = new Date();
        const results = [];

        for (const entry of entries) {
            const existing = await collection.findOne(
                { apiKeyHash: entry.apiKeyHash },
                { projection: { _id: 0, apiKeyHash: 1, label: 1 } },
            );

            const action = existing ? "update" : "insert";

            if (!dryRun) {
                await collection.updateOne(
                    { apiKeyHash: entry.apiKeyHash },
                    {
                        $set: {
                            label: entry.label,
                            updatedAt: now,
                        },
                        $setOnInsert: {
                            apiKeyHash: entry.apiKeyHash,
                            createdAt: now,
                        },
                    },
                    { upsert: true },
                );
            }

            results.push({
                ...entry,
                action,
                existingLabel: existing?.label || null,
            });
        }

        return {
            dbName: db.databaseName,
            collectionName: COLLECTION_NAME,
            results,
        };
    } finally {
        await client.close();
    }
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.help) {
        printUsage();
        return;
    }

    const mongoUri = resolveMongoUri(args.envFile);
    const result = await upsertMappings({
        mongoUri,
        entries: args.entries,
        dryRun: args.dryRun,
    });

    console.log(
        `${args.dryRun ? "Dry run" : "Applied"} ${result.results.length} mapping(s) in ${result.dbName}.${result.collectionName}`,
    );

    for (const row of result.results) {
        console.log(
            [
                `${row.action.toUpperCase()}:`,
                row.apiKeyHash,
                `=> "${row.label}"`,
                row.existingLabel ? `(was "${row.existingLabel}")` : "(new)",
                `[${row.source}]`,
            ].join(" "),
        );
    }
}

main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
});
