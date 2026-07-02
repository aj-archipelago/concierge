import RequestProgress from "../models/request-progress.mjs";
import Task from "../models/task.mjs";

/* RequestProgress is deprecated. This function migrates the tasks
   to the new Task model. */
export async function migrateTasks(userId) {
    const requestProgresses = await RequestProgress.find({ owner: userId });
    for (const requestProgress of requestProgresses) {
        const task = requestProgress.toJSON();
        try {
            const sanitizedTask = {
                ...task,
                data: task.data || {},
                metadata: task.metadata || {},
                statusText: task.statusText || "",
                error: task.error || "",
            };

            await Task.findOneAndUpdate({ _id: task._id }, sanitizedTask, {
                upsert: true,
                new: true,
            });
        } catch (error) {
            console.error(`Error migrating task ${task._id}`, error);
        }
    }
}
