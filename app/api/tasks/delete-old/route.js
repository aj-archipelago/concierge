import { NextResponse } from "next/server";
import Task from "../../models/task.mjs";
import { getCurrentUser } from "../../utils/auth";
import { deleteTask } from "../../utils/task-utils.mjs";

export async function POST(req) {
    try {
        const user = await getCurrentUser();
        const { days = 7 } = await req.json();

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        // Find all tasks that match our criteria
        const tasksToDelete = await Task.find({
            owner: user._id,
            createdAt: { $lt: cutoffDate },
            status: {
                $in: ["completed", "failed", "cancelled", "abandoned"],
            },
        });

        // Delete each task using our utility method
        let deletedCount = 0;
        for (const task of tasksToDelete) {
            try {
                await deleteTask(task._id, user._id);
                deletedCount++;
            } catch (error) {
                console.error(`Error deleting task ${task._id}:`, error);
                // Continue with other tasks even if one fails
            }
        }

        return NextResponse.json({
            success: true,
            deletedCount,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
