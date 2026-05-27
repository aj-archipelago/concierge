import { NextResponse } from "next/server";
import Feedback from "../../models/feedback";
import { getCurrentUser } from "../../utils/auth";

const VALID_STATUSES = new Set(["open", "resolved"]);

export async function GET(request) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const status = request.nextUrl.searchParams.get("status") || "open";
        const selected = request.nextUrl.searchParams.get("selected");
        const limit = Math.min(
            parseInt(request.nextUrl.searchParams.get("limit") || "50", 10),
            100,
        );
        const query = {};

        if (VALID_STATUSES.has(status)) {
            query.status = status;
        }

        const [items, counts, selectedFeedback] = await Promise.all([
            Feedback.find(query)
                .populate("user", "name username")
                .populate("resolvedBy", "name username")
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            Feedback.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ]),
            selected
                ? Feedback.findById(selected)
                      .populate("user", "name username")
                      .populate("resolvedBy", "name username")
                      .lean()
                : null,
        ]);

        const selectedMatchesFilter =
            selectedFeedback &&
            (!VALID_STATUSES.has(status) || selectedFeedback.status === status);

        return NextResponse.json({
            feedback: items,
            selectedFeedback: selectedMatchesFilter ? selectedFeedback : null,
            counts: counts.reduce(
                (acc, row) => ({
                    ...acc,
                    [row._id]: row.count,
                }),
                { open: 0, resolved: 0 },
            ),
        });
    } catch (error) {
        console.error("Error fetching feedback:", error);
        return NextResponse.json(
            { error: "Failed to fetch feedback" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
