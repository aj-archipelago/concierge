/** @jest-environment node */
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { getUsageCostDetails } from "../../../admin/usage/usageMetrics";
import { buildSlicePipeline, queryUsage, parseUsageQuery } from "./usageQuery";
let server, client, collection;
beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    client = new MongoClient(server.getUri());
    await client.connect();
}, 60000);
afterAll(async () => {
    if (client) await client.close();
    if (server) await server.stop();
});
beforeEach(async () => {
    collection = client.db().collection(`usage_${Date.now()}_${Math.random()}`);
});
const options = {
    startDate: new Date("2026-06-01T00:00:00Z"),
    endDate: new Date("2026-06-15T00:00:00Z"),
    groupBy: "overview",
    apiKeyId: null,
};
it("counts cache tokens once, retains provider totals, and excludes the upper boundary", async () => {
    await collection.insertMany([
        {
            timestamp: options.startDate,
            api_key_id: "a",
            model: "claude",
            input_tokens: 10,
            output_tokens: 20,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 30,
            total_tokens: 30,
        },
        {
            timestamp: new Date("2026-06-07T12:01:00Z"),
            api_key_id: "a",
            model: "gpt",
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 90,
            total_tokens: 105,
        },
        {
            timestamp: new Date("2026-06-08T12:01:00Z"),
            api_key_id: "b",
            model: "gpt",
            input_tokens: 3,
            output_tokens: 2,
        },
        {
            timestamp: options.endDate,
            api_key_id: "a",
            model: "gpt",
            input_tokens: 100000,
        },
    ]);
    const result = await queryUsage(collection, options);
    for (const view of [result.byModel, result.byKey, result.byDay]) {
        expect(view.reduce((sum, row) => sum + row.requests, 0)).toBe(3);
        expect(view.reduce((sum, row) => sum + row.metered_tokens, 0)).toBe(
            270,
        );
        expect(view.reduce((sum, row) => sum + row.total_tokens, 0)).toBe(140);
    }
    expect(
        result.byKey.find((row) => row._id === "a").model_breakdown,
    ).toHaveLength(2);
    const filtered = await queryUsage(collection, {
        ...options,
        groupBy: "hour",
        apiKeyId: "a",
    });
    expect(filtered.reduce((sum, row) => sum + row.requests, 0)).toBe(2);
});
it("puts requests on both sides of a 15-minute boundary into correct UTC buckets", async () => {
    await collection.insertMany(
        ["12:14:59", "12:15:00"].map((time) => ({
            timestamp: new Date(`2026-06-02T${time}Z`),
            api_key_id: "a",
            model: "gpt",
            input_tokens: 1,
        })),
    );
    const result = await queryUsage(collection, {
        ...options,
        groupBy: "15m",
        apiKeyId: "a",
    });
    expect(result.map((row) => row._id).sort()).toEqual([
        "2026-06-02 12:00",
        "2026-06-02 12:15",
    ]);
    expect(
        JSON.stringify(buildSlicePipeline({ ...options, granularity: "15m" })),
    ).not.toContain("$dateTrunc");
});
it("coalesces simultaneous queries and reuses short-lived cached slices", async () => {
    const spy = jest.spyOn(collection, "aggregate");
    const results = await Promise.all([
        queryUsage(collection, options),
        queryUsage(collection, options),
    ]);
    expect(results[0]).toEqual(results[1]);
    const calls = spy.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(3);
    await queryUsage(collection, options);
    expect(spy).toHaveBeenCalledTimes(calls);
});
it("never caches a failed slice or returns partial results", async () => {
    let fail = true;
    const col = {
        aggregate: jest.fn(() => ({
            toArray: async () => {
                if (fail) throw new Error("timeout");
                return [];
            },
        })),
    };
    await expect(queryUsage(col, options)).rejects.toThrow("timeout");
    fail = false;
    expect((await queryUsage(col, options)).byKey).toEqual([]);
});
it("defaults to a bounded window", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const parsed = parseUsageQuery(new URLSearchParams(), now);
    expect(+parsed.endDate - +parsed.startDate).toBe(30 * 86400000);
});

it("retains total-only legacy usage mixed with modern events", async () => {
    await collection.insertMany([
        {
            timestamp: options.startDate,
            api_key_id: "a",
            model: "gpt",
            total_tokens: 50,
        },
        {
            timestamp: options.startDate,
            api_key_id: "a",
            model: "gpt",
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
        },
    ]);
    const result = await queryUsage(collection, options);
    expect(result.byKey[0].metered_tokens).toBe(65);
    expect(result.byModel[0].metered_tokens).toBe(65);
    for (const rows of [result.byModel, result.byKey, result.byDay]) {
        expect(rows[0].unbucketed_requests).toBe(1);
        expect(
            getUsageCostDetails(rows[0], { gpt: { input: 5, output: 30 } }),
        ).toEqual({
            cost: 0.0002,
            complete: false,
            unpricedRequests: 1,
            unpricedModels: ["gpt"],
        });
    }
    // Regrouping different days and seven-day query slices retains partial costs.
    await collection.insertOne({
        timestamp: new Date("2026-06-14T12:00:00Z"),
        api_key_id: "a",
        model: "gpt",
        input_tokens: 1_000_000,
    });
    const refreshed = await queryUsage(
        client.db().collection(collection.collectionName),
        options,
    );
    expect(refreshed.byModel[0].unbucketed_requests).toBe(1);
    expect(refreshed.byModel[0].requests).toBe(3);
    expect(
        getUsageCostDetails(refreshed.byModel[0], {
            gpt: { input: 5, output: 30 },
        }).cost,
    ).toBeCloseTo(5.0002);
});

it("retries transient Cosmos throttling within a bounded read budget", async () => {
    const toArray = jest
        .fn()
        .mockRejectedValueOnce(
            Object.assign(new Error("RetryAfterMs=1"), { code: 16500 }),
        )
        .mockResolvedValue([]);
    const col = { aggregate: jest.fn(() => ({ toArray })) };
    const single = { ...options, endDate: new Date(+options.startDate + 1000) };
    expect((await queryUsage(col, single)).byKey).toEqual([]);
    expect(toArray).toHaveBeenCalledTimes(2);
});
