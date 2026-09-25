/**
 * @jest-environment node
 */

import { execFileSync } from "node:child_process";

it("loads the chat message store in the worker's native Node runtime", () => {
    // Jest and Next resolve extensionless imports that the unbundled worker
    // rejects. Import the real module graph in a fresh native Node process.
    expect(() =>
        execFileSync(
            process.execPath,
            [
                "--input-type=module",
                "--eval",
                'const store = await import("./app/api/chats/message-store.js"); if (typeof store.updateChatMessageByTaskId !== "function") throw new Error("Missing task message updater");',
            ],
            { cwd: process.cwd(), timeout: 15_000, stdio: "pipe" },
        ),
    ).not.toThrow();
});
