import { getCurrentUser } from "../../utils/auth.js";
import MediaItem from "../../models/media-item.mjs";
import Task from "../../models/task.mjs";

/**
 * Cleans up orphaned pending media items that are associated with
 * cancelled, failed, or abandoned tasks.
 */
export async function POST(req) {
    const user = await getCurrentUser();

    try {
        // Find all pending media items for this user
        const pendingMediaItems = await MediaItem.find({
            user: user._id,
            status: "pending",
        });

        let cleanedCount = 0;
        const errors = [];

        for (const mediaItem of pendingMediaItems) {
            try {
                // Find the associated task
                const task = await Task.findOne({
                    _id: mediaItem.taskId,
                    owner: user._id,
                });

                // If task doesn't exist or is in a terminal state, update media item
                if (
                    !task ||
                    task.status === "cancelled" ||
                    task.status === "failed" ||
                    task.status === "abandoned"
                ) {
                    const updateData = {
                        status: "failed",
                        error: {
                            code:
                                task?.status === "cancelled"
                                    ? "TASK_CANCELLED"
                                    : task?.status === "abandoned"
                                      ? "TASK_ABANDONED"
                                      : "TASK_FAILED",
                            message:
                                task?.status === "cancelled"
                                    ? "Task was cancelled"
                                    : task?.status === "abandoned"
                                      ? "Task was abandoned"
                                      : "Task failed or no longer exists",
                        },
                    };

                    await MediaItem.findOneAndUpdate(
                        { _id: mediaItem._id },
                        updateData,
                        { new: true, runValidators: true },
                    );

                    cleanedCount++;
                }
            } catch (error) {
                console.error(
                    `Error cleaning up media item ${mediaItem._id}:`,
                    error,
                );
                errors.push({
                    mediaItemId: mediaItem._id.toString(),
                    error: error.message,
                });
            }
        }

        return Response.json({
            success: true,
            cleanedCount,
            totalPending: pendingMediaItems.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error("Error cleaning up orphaned media items:", error);
        return Response.json(
            { error: "Failed to clean up orphaned media items" },
            { status: 500 },
        );
    }
}
