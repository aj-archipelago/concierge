import { MongoClient } from "mongodb";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";

let cachedClient = null;

async function getClient() {
    if (cachedClient) return cachedClient;
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI is not configured");
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
    return cachedClient;
}

function getGroupId(groupBy, timestampField = "timestamp") {
    const timestampPath = `$${timestampField}`;

    switch (groupBy) {
        case "api_key_id":
            return "$api_key_id";
        case "15m":
            return {
                $dateToString: {
                    format: "%Y-%m-%d %H:%M",
                    date: {
                        $dateTrunc: {
                            date: timestampPath,
                            unit: "minute",
                            binSize: 15,
                            timezone: "UTC",
                        },
                    },
                    timezone: "UTC",
                },
            };
        case "hour":
            return {
                $dateToString: {
                    format: "%Y-%m-%d %H:00",
                    date: timestampPath,
                    timezone: "UTC",
                },
            };
        case "day":
            return {
                $dateToString: {
                    format: "%Y-%m-%d",
                    date: timestampPath,
                },
            };
        case "model+day":
            return {
                model: "$model",
                day: {
                    $dateToString: {
                        format: "%Y-%m-%d",
                        date: timestampPath,
                    },
                },
            };
        default:
            return "$model";
    }
}

function buildUsageSums() {
    return {
        input_tokens: { $sum: "$input_tokens" },
        output_tokens: { $sum: "$output_tokens" },
        cache_creation_input_tokens: {
            $sum: "$cache_creation_input_tokens",
        },
        cache_read_input_tokens: {
            $sum: "$cache_read_input_tokens",
        },
        total_tokens: { $sum: "$total_tokens" },
        requests: { $sum: 1 },
    };
}

function getInputOutputTokensExpression(sourcePrefix = "") {
    const prefix = sourcePrefix ? `${sourcePrefix}.` : "";

    return {
        $add: [
            { $ifNull: [`$${prefix}input_tokens`, 0] },
            { $ifNull: [`$${prefix}output_tokens`, 0] },
        ],
    };
}

function getMeteredTokensExpression(sourcePrefix = "") {
    const prefix = sourcePrefix ? `${sourcePrefix}.` : "";

    return {
        $add: [
            ...getInputOutputTokensExpression(sourcePrefix).$add,
            { $ifNull: [`$${prefix}cache_creation_input_tokens`, 0] },
            { $ifNull: [`$${prefix}cache_read_input_tokens`, 0] },
        ],
    };
}

function getTotalTokensExpression(sourcePrefix = "") {
    const prefix = sourcePrefix ? `${sourcePrefix}.` : "";

    return {
        $cond: [
            { $gt: [{ $ifNull: [`$${prefix}total_tokens`, 0] }, 0] },
            { $ifNull: [`$${prefix}total_tokens`, 0] },
            getInputOutputTokensExpression(sourcePrefix),
        ],
    };
}

function buildRawPipeline({ startDate, endDate, groupBy, apiKeyId }) {
    const match = {};
    if (startDate || endDate) {
        match.timestamp = {};
        if (startDate) match.timestamp.$gte = new Date(startDate);
        if (endDate) match.timestamp.$lte = new Date(endDate);
    }
    if (apiKeyId) {
        match.api_key_id = apiKeyId;
    }

    const groupId = getGroupId(groupBy, "timestamp");

    return buildUsagePipeline({ groupBy, groupId, match });
}

function buildUsagePipeline({ groupBy, groupId, match }) {
    const needsModelBreakdown =
        groupBy === "api_key_id" ||
        groupBy === "15m" ||
        groupBy === "day" ||
        groupBy === "hour";
    const pipeline = [{ $match: match }];

    if (needsModelBreakdown) {
        pipeline.push(
            {
                $group: {
                    _id: {
                        group: groupId,
                        model: "$model",
                    },
                    ...buildUsageSums(),
                },
            },
            {
                $group: {
                    _id: "$_id.group",
                    input_tokens: { $sum: "$input_tokens" },
                    output_tokens: { $sum: "$output_tokens" },
                    cache_creation_input_tokens: {
                        $sum: "$cache_creation_input_tokens",
                    },
                    cache_read_input_tokens: {
                        $sum: "$cache_read_input_tokens",
                    },
                    total_tokens: { $sum: "$total_tokens" },
                    requests: { $sum: "$requests" },
                    model_breakdown: {
                        $push: {
                            model: "$_id.model",
                            input_tokens: "$input_tokens",
                            output_tokens: "$output_tokens",
                            cache_creation_input_tokens:
                                "$cache_creation_input_tokens",
                            cache_read_input_tokens: "$cache_read_input_tokens",
                            requests: "$requests",
                            total_tokens: getTotalTokensExpression(),
                            metered_tokens: getMeteredTokensExpression(),
                        },
                    },
                },
            },
        );
    } else {
        pipeline.push({
            $group: {
                _id: groupId,
                ...buildUsageSums(),
            },
        });
    }

    pipeline.push(
        {
            $addFields: {
                total_tokens: getTotalTokensExpression(),
                metered_tokens: getMeteredTokensExpression(),
            },
        },
        { $sort: { requests: -1 } },
    );

    return pipeline;
}

export async function GET(req) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const searchParams = req.nextUrl.searchParams;
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const groupBy = searchParams.get("groupBy") || "model";
        const apiKeyId = searchParams.get("apiKeyId");

        const client = await getClient();
        const db = client.db();
        const rawUsage = db.collection("token_usage");

        const results = await rawUsage
            .aggregate(
                buildRawPipeline({
                    startDate,
                    endDate,
                    groupBy,
                    apiKeyId,
                }),
            )
            .toArray();

        return NextResponse.json(results);
    } catch (error) {
        console.error("Usage API error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic";
