import { NextResponse } from "next/server";
import Feedback from "../../../models/feedback";
import { getCurrentUser } from "../../../utils/auth";

const VALID_STATUSES = new Set(["open", "resolved"]);

export async function PATCH(request, { params }) {
    params = await params;
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser || currentUser.role !== "admin") {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 403 },
            );
        }

        const body = await request.json();
        const { status } = body;

        if (!VALID_STATUSES.has(status)) {
            return NextResponse.json(
                { error: "Invalid feedback status" },
                { status: 400 },
            );
        }

        const update =
            status === "resolved"
                ? {
                      $set: {
                          status,
                          resolvedAt: new Date(),
                          resolvedBy: currentUser._id,
                      },
                  }
                : {
                      $set: {
                          status,
                      },
                      $unset: {
                          resolvedAt: 1,
                          resolvedBy: 1,
                      },
                  };

        const feedback = await Feedback.findByIdAndUpdate(params.id, update, {
            new: true,
        })
            .populate("user", "name username")
            .populate("resolvedBy", "name username");

        if (!feedback) {
            return NextResponse.json(
                { error: "Feedback not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true, feedback });
    } catch (error) {
        console.error("Error updating feedback:", error);
        return NextResponse.json(
            { error: "Failed to update feedback" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
