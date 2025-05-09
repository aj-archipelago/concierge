import Task from "../../models/task.mjs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import { checkAndUpdateAbandonedTask } from "../../utils/task-utils.mjs";

export async function GET(request, { params }) {
    try {
        const user = await getCurrentUser();
        const { id } = params;

        // Find the notification by ID and ensure it belongs to the current user
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

        const updatedTask = await checkAndUpdateAbandonedTask(task);
        return NextResponse.json(updatedTask);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
