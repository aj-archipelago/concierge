import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import { getUsageDatabase } from "../database";
import { hasValidRequestOrigin } from "./requestOrigin";
import {
    getDefaultWeeklyUsd,
    describeBudget,
    validateLimitUpdate,
} from "./budgets";

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (user?.role !== "admin")
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const db = await getUsageDatabase();
        const policyRows = await db
            .collection("api_key_cost_limits")
            .find(
                {},
                {
                    projection: {
                        _id: 1,
                        weeklyUsd: 1,
                        anchorAt: 1,
                        updatedAt: 1,
                    },
                    maxTimeMS: 5000,
                },
            )
            .limit(10_001)
            .toArray();
        const policies = policyRows.slice(0, 10_000);
        const now = new Date();
        const budgets = policies.map((policy) =>
            describeBudget(policy, null, now),
        );
        const periodIds = budgets
            .map((budget) => budget.periodId)
            .filter(Boolean);
        const periods = periodIds.length
            ? await db
                  .collection("api_key_cost_periods")
                  .find(
                      { _id: { $in: periodIds } },
                      {
                          projection: {
                              _id: 1,
                              spentMicros: 1,
                              requests: 1,
                              fallbackRequests: 1,
                              snapshotAt: 1,
                          },
                          maxTimeMS: 5000,
                      },
                  )
                  .toArray()
            : [];
        const usage = new Map(periods.map((period) => [period._id, period]));
        return NextResponse.json(
            {
                defaultWeeklyUsd: getDefaultWeeklyUsd(),
                generatedAt: now.toISOString(),
                truncated: policyRows.length > policies.length,
                budgets: Object.fromEntries(
                    policies.map((policy, index) => [
                        policy._id,
                        describeBudget(
                            policy,
                            usage.get(budgets[index].periodId),
                            now,
                        ),
                    ]),
                ),
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    } catch (error) {
        console.error("Budget read failed", {
            name: error.name,
            code: error.code,
        });
        return NextResponse.json(
            { error: "Unable to load weekly limits" },
            { status: 503 },
        );
    }
}

export async function PATCH(req) {
    try {
        const user = await getCurrentUser();
        if (user?.role !== "admin")
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        if (!hasValidRequestOrigin(req))
            return NextResponse.json(
                { error: "Invalid origin" },
                { status: 403 },
            );
        let body;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON" },
                { status: 400 },
            );
        }
        if (!validateLimitUpdate(body))
            return NextResponse.json(
                {
                    error: "Expected an API key fingerprint and a nonnegative dollar amount with at most two decimal places, or null for unlimited",
                },
                { status: 400 },
            );
        const db = await getUsageDatabase();
        const collection = db.collection("api_key_cost_limits");
        const now = new Date();
        const update = {
            $set: {
                weeklyUsd: body.weeklyUsd,
                updatedAt: now,
                updatedBy: String(user._id),
            },
            $setOnInsert: { anchorAt: null, createdAt: now },
        };
        try {
            await collection.updateOne({ _id: body.apiKeyId }, update, {
                upsert: true,
            });
        } catch (error) {
            // First request admission can create the default at the same time.
            if (error.code !== 11000) throw error;
            await collection.updateOne({ _id: body.apiKeyId }, update);
        }
        return NextResponse.json({
            apiKeyId: body.apiKeyId,
            weeklyUsd: body.weeklyUsd,
        });
    } catch (error) {
        console.error("Budget update failed", {
            name: error.name,
            code: error.code,
        });
        return NextResponse.json(
            { error: "Unable to save weekly limit" },
            { status: 503 },
        );
    }
}
export const dynamic = "force-dynamic";
