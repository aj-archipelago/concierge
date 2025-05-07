import Task from "../../../models/task.mjs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import { retryTask } from "../../../utils/task-utils"; // We'll assume this exists

export async function POST(request, { params }) {
    try {
        const user = await getCurrentUser();
        const { id } = params;

        // Find the task and ensure it belongs to the current user
        const task = await Task.findOne({
            _id: id,
            owner: user._id,
        });

        if (!task) {
            return NextResponse.json(
                { error: "task not found" },
                { status: 404 },
            );
        }

        // Retry the task (implement retryTask in your utils)
        const retriedTask = await retryTask(task);

        // Convert to plain object and include virtuals
        const retriedTaskObj = retriedTask.toObject({ virtuals: true });

        return NextResponse.json(retriedTaskObj);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
