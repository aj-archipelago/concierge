import Automation from "../../app/api/models/automation.js";
import Task from "../../app/api/models/task.mjs";
import User from "../../app/api/models/user.mjs";
import { QUERIES } from "../graphql.mjs";
import { DEFAULT_CHAT_MODEL } from "../../src/utils/constants.js";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../src/utils/fileAccessPlanUtils.js";
import {
    buildHtmlPreview,
    calculateNextRunAt,
    listAutomationSupportingFiles,
    parseAutomationResult,
    readAutomationContent,
    sanitizeGeneratedHtml,
    writeAutomationOutputFile,
} from "../../app/api/automations/utils.js";
import { buildMcpAgentConfigForUser } from "../../app/api/utils/mcp-agent-config.js";
import { readBlobContent } from "../../app/api/utils/media-service-utils.js";
import { createAutomationStorageTarget } from "../../src/utils/storageTargets.js";
import { BaseTask } from "./base-task.mjs";

const TEXT_FILE_EXTENSIONS = new Set([
    ".md",
    ".txt",
    ".json",
    ".csv",
    ".tsv",
    ".yaml",
    ".yml",
    ".xml",
    ".html",
    ".css",
    ".js",
    ".mjs",
    ".ts",
    ".py",
]);
const MAX_SUPPORTING_FILE_CHARS = 12000;

function getExtension(filename = "") {
    const index = filename.lastIndexOf(".");
    return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

async function readSupportingFiles(userContextId, automation) {
    const storageTarget = createAutomationStorageTarget(userContextId);
    const files = await listAutomationSupportingFiles(
        userContextId,
        automation.slug,
    );
    const readableFiles = files.filter((file) => {
        const name = file.filename || file.name || "";
        return (
            !name.includes("/outputs/") &&
            TEXT_FILE_EXTENSIONS.has(getExtension(name))
        );
    });

    const contents = [];
    for (const file of readableFiles.slice(0, 12)) {
        const blobPath = file.name;
        if (!blobPath) continue;
        const content = await readBlobContent(blobPath, storageTarget);
        if (!content) continue;
        contents.push({
            name: file.filename || blobPath,
            content: content.slice(0, MAX_SUPPORTING_FILE_CHARS),
            truncated: content.length > MAX_SUPPORTING_FILE_CHARS,
        });
    }
    return contents;
}

function buildPrompt({
    automation,
    content,
    supportingFiles,
    inputs,
    trigger,
}) {
    const supportingText =
        supportingFiles.length > 0
            ? supportingFiles
                  .map(
                      (file) => `### ${file.name}

\`\`\`
${file.content}
\`\`\`${file.truncated ? "\n\n[File truncated]" : ""}`,
                  )
                  .join("\n\n")
            : "No readable supporting files were provided.";

    const outputContract = automation.producesHtml
        ? `Return ONLY a JSON object with this shape:
{
  "summary": "short plain-text summary of what you produced",
  "html": "<!doctype html>..."
}

The html field must be a complete, simple, self-contained HTML document. Do not include script tags or inline JavaScript.

The HTML must support both light and dark themes. Use explicit colors for every background, text, border, card, table, form, icon/SVG, and shadow. Include CSS keyed off html[data-theme="dark"], plus an @media (prefers-color-scheme: dark) fallback so the document still works outside Concierge's theme wrapper. Do not rely on browser defaults for readability.`
        : "Return the completed automation output as Markdown or plain text.";

    return `Run the "${automation.name}" automation.

Trigger: ${trigger}
Description: ${automation.description || "No description"}
Inputs:
\`\`\`json
${JSON.stringify(inputs || {}, null, 2)}
\`\`\`

AUTOMATION.md:
\`\`\`markdown
${content}
\`\`\`

Supporting files:
${supportingText}

${outputContract}`;
}

class AutomationRunTask extends BaseTask {
    get displayName() {
        return "Automation run";
    }

    get isRetryable() {
        return true;
    }

    async startRequest(job) {
        const { taskId, userId, metadata } = job.data;
        const automation = await Automation.findOne({
            _id: metadata.automationId,
            owner: userId,
        });

        if (!automation) {
            throw new Error("Automation not found");
        }
        const automationName = automation.name || automation.slug;

        const user = await User.findById(userId);
        if (!user) {
            throw new Error("User not found");
        }

        // metadata is CSFLE-encrypted as a whole object; dotted paths like
        // metadata.automationName are invalid (analyze_query / Error 51102).
        const metadataForTask = {
            ...(metadata && typeof metadata === "object" ? metadata : {}),
            automationName: automation.name,
            automationSlug: automation.slug,
        };
        await Task.findByIdAndUpdate(taskId, {
            $set: {
                metadata: metadataForTask,
                progress: 0.15,
                statusText: `Loading ${automationName} files...`,
                automationRefId: automation._id,
            },
        });

        const [content, supportingFiles, mcpAgentConfig] = await Promise.all([
            readAutomationContent(user.contextId, automation.slug),
            readSupportingFiles(user.contextId, automation),
            buildMcpAgentConfigForUser(user, {
                logPrefix: "[MCP:automation]",
                headless: true,
            }),
        ]);

        await Task.findByIdAndUpdate(taskId, {
            progress: 0.3,
            statusText: `Running ${automationName}...`,
        });

        const fileAccessPlan = buildFileAccessPlan({
            userContextId: user.contextId,
            userContextKey: user.contextKey,
        });
        const runContext = buildRunContext({
            userContextId: user.contextId,
            userContextKey: user.contextKey,
        });
        const prompt = buildPrompt({
            automation,
            content,
            supportingFiles,
            inputs: metadata.inputs || automation.inputs,
            trigger: metadata.trigger || "manual",
        });

        const unavailableMcpServers =
            mcpAgentConfig.unavailableMcpServers || [];
        const headlessMcpNotice =
            unavailableMcpServers.length > 0
                ? `Some connected services are unavailable in this headless automation because their credentials could not be refreshed: ${unavailableMcpServers.map((server) => server.serverKey).join(", ")}. Do not try to connect or re-authenticate services during this run. If the automation depends on one of these services, explain that the user needs to reconnect it before rerunning the automation.`
                : null;
        const systemContent = [
            "You are running a scheduled automation for the user. Complete the task fully. Do not ask follow-up questions.",
        ];
        if (headlessMcpNotice) {
            systemContent.push(headlessMcpNotice);
        }

        const result = await job.client.query({
            query: QUERIES.SYS_ENTITY_AGENT,
            variables: {
                chatHistory: [
                    {
                        role: "system",
                        content: systemContent,
                    },
                    { role: "user", content: [prompt] },
                ],
                fileAccessPlan,
                contextId: runContext.contextId,
                contextKey: runContext.contextKey,
                entityId: user.personalEntityId || "",
                aiName: user.aiName,
                aiMemorySelfModify: user.aiMemorySelfModify,
                model: user.agentModel || DEFAULT_CHAT_MODEL,
                stream: false,
                mcpConfig: mcpAgentConfig.mcpConfig,
                mcpAvailableServers: mcpAgentConfig.mcpAvailableServers,
            },
            fetchPolicy: "network-only",
        });

        const rawResult = result.data?.sys_entity_agent?.result || "";
        const parsed = parseAutomationResult(
            rawResult,
            automation.producesHtml,
        );
        const update = {
            data: {
                summary:
                    parsed.summary ||
                    (parsed.html ? "Automation completed." : rawResult),
                result: rawResult,
                tool: result.data?.sys_entity_agent?.tool || null,
                supportingFiles: supportingFiles.map((file) => file.name),
            },
            progress: 0.9,
            statusText: `Saving ${automationName} output...`,
        };

        if (automation.producesHtml && parsed.html) {
            const html = sanitizeGeneratedHtml(parsed.html);
            const htmlOutputPath = await writeAutomationOutputFile({
                userContextId: user.contextId,
                slug: automation.slug,
                taskId,
                filename: "index.html",
                content: html,
                mimeType: "text/html",
            });

            update["automation.htmlOutputPath"] = htmlOutputPath;
            update["automation.htmlOutputPreview"] = buildHtmlPreview(html);
            update["automation.outputPath"] =
                `automations/${automation.slug}/outputs/${taskId}`;

            await Automation.findByIdAndUpdate(automation._id, {
                latestRunTaskId: taskId,
                latestHtmlOutputPath: htmlOutputPath,
            });
        }

        await Task.findByIdAndUpdate(taskId, update);

        await Automation.findByIdAndUpdate(automation._id, {
            lastRunAt: new Date(),
            nextRunAt: automation.enabled
                ? calculateNextRunAt(automation.schedule, automation.timezone)
                : null,
            $unset: { schedulerLockedAt: 1 },
        });

        return;
    }

    async handleError(taskId, error, metadata) {
        if (metadata?.automationId) {
            await Automation.findByIdAndUpdate(metadata.automationId, {
                $unset: { schedulerLockedAt: 1 },
            }).catch(() => {});
        }
        return { error: error.message || "Automation failed" };
    }
}

const automationRunTask = new AutomationRunTask();

export default automationRunTask;
