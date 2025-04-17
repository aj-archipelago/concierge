# Concierge

Concierge is an open-source web application that provides AI applications to enterprise customers for a company's internal use. Concierge encapsulates functions like document translation, copy editing, summarization, headline generation, tagging, entity extraction, etc. into easy-to-use task-specific interfaces rather than just making the functionality available through a chat-style prompting interface. Concierge is a one-stop shop for LLM-based AI functionality at our network. Concierge is built on top of [Cortex](https://github.com/aj-archipelago/cortex) - our open-source graphQL middle tier for AI.

## Environment setup

### Envrionment variables

The following environment variables are required to configure Concierge to connect to Cortex and the Media Helper app:

- `CORTEX_GRAPHQL_API_URL`: the full GraphQL URL of the Cortex deployment, e.g. `https://<site>.azure-api.net/graphql?subscription-key=<key>`
- `CORTEX_MEDIA_API_URL`: the full URL of the Cortex media helper app, e.g. `https://<site>.azure-api.net/media-helper?subscription-key=<key>`

The following environment variable is needed to deliver user feedback to Slack:

- `SLACK_WEBHOOK_URL` - the is the URL of the Slack webhook you've configured to deliver the message to whichever channel you want to deliver it to.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

# Offline Tasks in Concierge

The Concierge system includes a robust background task processing system that allows you to run time-consuming operations asynchronously. Here's how the offline task system works and how to define a new task.

## How Offline Tasks Work

Concierge uses a queuing system based on BullMQ to handle background tasks. Here's the general flow:

1. **Task Creation**: When a task is initiated, a record is created in the database with a "pending" status
2. **Task Queueing**: The task is added to a Redis-backed queue for processing
3. **Task Execution**: A worker picks up the task and executes it
4. **Task Completion**: Upon completion, the task status is updated in the database
5. **Client-Side Handling**: React components can monitor task status and respond to completion

Tasks support both synchronous and asynchronous execution modes, with progress tracking, error handling, and configurable timeouts.

## Defining a New Task

To create a new task type in Concierge, follow these steps:

### 1. Create a Task Handler

Create a new file in the `jobs/tasks/` directory. Each task handler should extend the `BaseTask` class:

```javascript:jobs/tasks/new-task-name.mjs
import { BaseTask } from './base-task.mjs';

class NewTaskHandler extends BaseTask {
    constructor() {
        super();
    }

    // Required: Provide a human-readable name for the task
    get displayName() {
        return "New Task Type";
    }

    // Required: Implement the task execution logic
    async startRequest(job) {
        const { taskId, userId, metadata } = job.data;

        try {
            // Update task to in_progress
            await this.updateTaskStatus(taskId, "in_progress");

            // Your task implementation goes here
            // ...

            // Update progress as needed
            await this.updateTaskProgress(taskId, 50, "Processing data...");

            // Final result
            const result = { /* your result data */ };

            // Mark as completed
            await this.updateTaskStatus(taskId, "completed", result);
            return result;
        } catch (error) {
            // Handle errors
            console.error("Task failed:", error);
            await this.updateTaskStatus(taskId, "failed", null, error.message);
            throw error;
        }
    }

    // Optional: Custom completion handler
    async handleCompletion(taskId, dataObject, metadata, client) {
        // Custom logic after task completes
        // For example, update other data, send notifications, etc.
        return dataObject;
    }
}

export default new NewTaskHandler();
```

### 2. Register Client-Side Completion Handler

If your task needs to trigger client-side actions when completed, add a handler to the `clientSideCompletionHandlers` object in `queries/notifications.js`:

```javascript:app/queries/notifications.js
// ... existing code ...
const clientSideCompletionHandlers = {
    // ... existing handlers ...
    "new-task-name": async ({ task, queryClient, refetchUserState }) => {
        // Perform client-side actions after completion
        // For example:
        queryClient.invalidateQueries({ queryKey: ["some-related-data"] });
        refetchUserState();
    },
};
// ... existing code ...
```

### 3. Use the Existing Task Hook

Concierge provides a built-in hook called `useRunTask()` for initiating background tasks. Use this hook in your components:

```jsx
import { useRunTask } from "../../app/queries/notifications";
import { useNotificationsContext } from "../../src/contexts/NotificationContext";

function YourComponent() {
    const runTask = useRunTask();
    const { openNotifications } = useNotificationsContext();

    const handleStartTask = async () => {
        try {
            // The type property identifies which task handler to use
            const result = await runTask.mutateAsync({
                type: "new-task-name",
                // Your task parameters
                parameter1: "value1",
                parameter2: "value2",
                // Optional: specify the source for tracking
                source: "your_component",
            });

            // Optional: open notifications panel to show task progress
            openNotifications();

            return result;
        } catch (error) {
            console.error("Task failed:", error);
        }
    };

    return (
        <div>
            <button onClick={handleStartTask} disabled={runTask.isPending}>
                {runTask.isPending ? "Starting..." : "Start Task"}
            </button>
        </div>
    );
}
```

### 4. Monitor Task Status

You can monitor the status of a task using the `useTask` hook:

```jsx
import { useRunTask, useTask } from "../../app/queries/notifications";

function YourComponent() {
    const runTask = useRunTask();
    const [taskId, setTaskId] = useState(null);
    const { data: taskStatus } = useTask(taskId);

    const handleStartTask = async () => {
        const result = await runTask.mutateAsync({
            type: "new-task-name",
            // Task parameters...
        });

        setTaskId(result.taskId);
    };

    return (
        <div>
            <button onClick={handleStartTask}>Start Task</button>

            {taskStatus && (
                <div>
                    Status: {taskStatus.status}
                    {taskStatus.statusText && <p>{taskStatus.statusText}</p>}
                    {taskStatus.progress > 0 && (
                        <progress value={taskStatus.progress} max="100" />
                    )}
                </div>
            )}
        </div>
    );
}
```

## Best Practices

1. **Keep Tasks Focused**: Each task should do one thing well
2. **Handle Errors Gracefully**: Always update task status on errors
3. **Provide Progress Updates**: When possible, update progress periodically
4. **Timeout Handling**: Set appropriate timeouts for long-running tasks
5. **Clean Up Resources**: Release any resources in the completion handler

The task system in Concierge provides a flexible way to handle background processing while maintaining a responsive user experience.
