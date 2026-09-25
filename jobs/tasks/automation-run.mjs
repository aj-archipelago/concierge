import { issueAgentToolsToken } from "../../app/api/utils/agent-tool-capabilities.mjs";
import { requireColleague } from "../../app/api/utils/colleagues.js";
import Automation from "../../app/api/models/automation.js";
import Task from "../../app/api/models/task.mjs";
import User from "../../app/api/models/user.mjs";
import { QUERIES, MUTATIONS } from "../graphql.mjs";
import { DEFAULT_CHAT_MODEL } from "../../src/utils/constants.js";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../src/utils/fileAccessPlanUtils.js";
import {
    buildHtmlPreview,
    calculateNextRunAt,
    listAutomationSupportingFiles,
    buildAutomationHtmlOutputContract,
    parseAutomationResult,
    readAutomationContent,
    sanitizeGeneratedHtml,
    writeAutomationOutputFile,
} from "../../app/api/automations/utils.js";
import { prepareFileContentForLLM } from "../../app/api/utils/llm-file-utils.js";
import { buildMcpAgentConfigForUser } from "../../app/api/utils/mcp-agent-config.js";
import { checkMediaFile } from "../../app/api/utils/media-service-utils.js";
import { StreamAccumulator } from "../../app/api/utils/stream-accumulator.mjs";
import {
    createAutomationStorageTarget,
    resolveStorageTarget,
} from "../../src/utils/storageTargets.js";
import { BaseTask } from "./base-task.mjs";
import { assertNewAutomationCitations } from "../../app/api/utils/html-citation-review.js";
import {
    prepareAssistantTurn,
    parkAssistantTurn,
} from "../../app/api/utils/assistant-coordination.mjs";

const MAX_PREVIOUS_RUN_CHARS = 12000;

function getExtension(filename = "") {
    const index = filename.lastIndexOf(".");
    return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function getFilenameFromPath(path = "") {
    return String(path || "")
        .split("/")
        .filter(Boolean)
        .pop();
}

function isImageAttachment(file = {}) {
    const mimeType = file.mimeType || file.contentType || "";
    if (mimeType.startsWith("image/")) {
        return true;
    }
    return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"].includes(
        getExtension(file.filename || file.name || file.url || ""),
    );
}

function normalizeAutomationFile(file, overrides = {}) {
    const blobPath = file.blobPath || file.name || overrides.blobPath || "";
    const filename =
        overrides.filename ||
        file.filename ||
        file.originalName ||
        getFilenameFromPath(blobPath) ||
        "file";

    return {
        ...file,
        ...overrides,
        blobPath,
        filename,
        originalName: file.originalName || filename,
        displayFilename:
            overrides.displayFilename || file.displayFilename || filename,
        mimeType:
            overrides.mimeType ||
            file.mimeType ||
            file.contentType ||
            file.type ||
            null,
    };
}

function formatFileList(files = []) {
    if (!files.length) {
        return "No supporting reference files were provided.";
    }

    return files
        .map((file) => {
            const details = [
                file.mimeType,
                Number.isFinite(file.size) ? `${file.size} bytes` : null,
            ].filter(Boolean);
            return `- ${file.displayFilename}${details.length ? ` (${details.join(", ")})` : ""}`;
        })
        .join("\n");
}

function truncateText(value, limit = MAX_PREVIOUS_RUN_CHARS) {
    const text = coerceAutomationResultText(value);
    if (!text) {
        return "";
    }
    return text.length > limit
        ? `${text.slice(0, limit)}\n\n[Truncated]`
        : text;
}

function normalizePreparedAttachment(payload, sourceFile) {
    let attachment;
    try {
        attachment = JSON.parse(payload);
    } catch {
        return payload;
    }

    const imageAttachment = isImageAttachment(sourceFile);
    attachment.type = imageAttachment ? "image_url" : "file";
    attachment.url =
        attachment.url || attachment.image_url?.url || attachment.file;
    if (imageAttachment) {
        attachment.image_url = { url: attachment.url };
        delete attachment.file;
    } else {
        attachment.file = attachment.url;
        delete attachment.image_url;
    }

    attachment.displayFilename = sourceFile.displayFilename;
    attachment.filename = sourceFile.filename;
    if (sourceFile.automationFileRole) {
        attachment.automationFileRole = sourceFile.automationFileRole;
    }
    if (sourceFile.automationFileNote) {
        attachment.automationFileNote = sourceFile.automationFileNote;
    }

    return JSON.stringify(attachment);
}

async function prepareExistingAutomationFileReference(file, storageTarget) {
    const resolvedStorageTarget = resolveStorageTarget({ storageTarget });
    const resolved = file.blobPath
        ? await checkMediaFile({
              blobPath: file.blobPath,
              storageTarget,
          })
        : null;
    const fileUrl =
        resolved?.converted?.shortLivedUrl ||
        resolved?.converted?.url ||
        resolved?.shortLivedUrl ||
        resolved?.url ||
        file.url ||
        file.blobPath;
    const attachment = {
        type: isImageAttachment(file) ? "image_url" : "file",
        url: fileUrl,
        blobPath: file.blobPath,
        displayFilename: file.displayFilename,
        filename: file.filename,
        mimeType:
            resolved?.converted?.mimeType ||
            resolved?.mimeType ||
            file.mimeType ||
            null,
        contextId: resolvedStorageTarget.contextId,
        fileScope: resolvedStorageTarget.fileScope,
        userId: resolvedStorageTarget.userContextId,
    };

    if (resolved?.converted?.gcs || resolved?.gcs) {
        attachment.gcs = resolved.converted?.gcs || resolved.gcs;
    }
    if (resolved?.converted?.hash || resolved?.hash) {
        attachment.hash = resolved.converted?.hash || resolved.hash;
    }
    if (file.automationFileRole) {
        attachment.automationFileRole = file.automationFileRole;
    }
    if (file.automationFileNote) {
        attachment.automationFileNote = file.automationFileNote;
    }

    if (attachment.type === "image_url") {
        attachment.image_url = { url: fileUrl };
    } else {
        attachment.file = fileUrl;
    }

    return JSON.stringify(attachment);
}

function coerceAutomationResultText(value) {
    if (value === undefined || value === null || value === "") {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "object") {
        const content =
            value.result ||
            value.output ||
            value.payload ||
            value.content ||
            value.message ||
            value.choices?.[0]?.delta?.content ||
            "";
        if (content) {
            return coerceAutomationResultText(content);
        }
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function buildAutomationToolInfo(accumulatedInfo, fallbackInfo) {
    const info =
        accumulatedInfo && Object.keys(accumulatedInfo).length > 0
            ? accumulatedInfo
            : fallbackInfo;

    if (!info || typeof info !== "object" || Object.keys(info).length === 0) {
        return null;
    }

    try {
        return JSON.stringify({
            ...info,
            citations: info.citations || [],
        });
    } catch {
        return null;
    }
}

async function findPreviousRun(automation, userId, currentTaskId) {
    if (!automation?._id || !userId) {
        return null;
    }

    const previousRun = await Task.findOne({
        owner: userId,
        automationRefId: automation._id,
        status: "completed",
        ...(currentTaskId ? { _id: { $ne: currentTaskId } } : {}),
    })
        .sort({ createdAt: -1 })
        .lean();

    if (previousRun) {
        return previousRun;
    }

    if (
        automation.latestRunTaskId &&
        String(automation.latestRunTaskId) !== String(currentTaskId)
    ) {
        return Task.findOne({
            _id: automation.latestRunTaskId,
            owner: userId,
            status: "completed",
        }).lean();
    }

    return null;
}

async function buildAutomationFileContext({
    userContextId,
    automation,
    userId,
    currentTaskId,
}) {
    const storageTarget = createAutomationStorageTarget(userContextId);
    const supportingFiles = (
        await listAutomationSupportingFiles(userContextId, automation.slug)
    ).map((file) =>
        normalizeAutomationFile(file, {
            automationFileRole: "supporting_file",
        }),
    );
    const previousRun = await findPreviousRun(
        automation,
        userId,
        currentTaskId,
    );
    const previousHtmlOutputPath =
        previousRun?.automation?.htmlOutputPath ||
        automation.latestHtmlOutputPath ||
        "";
    const previousOutputFiles =
        previousRun && previousHtmlOutputPath
            ? [
                  normalizeAutomationFile(
                      {
                          blobPath: previousHtmlOutputPath,
                          name: previousHtmlOutputPath,
                          mimeType: "text/html",
                      },
                      {
                          displayFilename: "previous-run-output.html",
                          filename: getFilenameFromPath(previousHtmlOutputPath),
                          automationFileRole: "previous_run_output",
                          automationFileNote:
                              "HTML output from the previous completed automation run.",
                      },
                  ),
              ]
            : [];
    const preparedSupportingAttachments = await prepareFileContentForLLM(
        supportingFiles,
        {
            storageTarget,
            fetchShortLivedUrls: true,
        },
    );
    const supportingFileContent = preparedSupportingAttachments.map(
        (payload, index) =>
            normalizePreparedAttachment(payload, supportingFiles[index]),
    );
    const previousOutputFileContent = await Promise.all(
        previousOutputFiles.map((file) =>
            prepareExistingAutomationFileReference(file, storageTarget),
        ),
    );
    const previousRunText = previousRun
        ? truncateText(previousRun.data?.summary || previousRun.data?.result)
        : "";

    return {
        supportingFiles,
        previousRun,
        previousRunText,
        previousOutputFiles,
        fileContent: [...supportingFileContent, ...previousOutputFileContent],
    };
}

function buildAutomationFileAccessPlan(user) {
    const plan = buildFileAccessPlan({
        userContextId: user.contextId,
        userContextKey: user.contextKey,
    });

    if (user.contextId) {
        plan.push({
            kind: "user-files",
            userContextId: user.contextId,
            ...(user.contextKey ? { contextKey: user.contextKey } : {}),
        });
    }

    return plan;
}

function buildPrompt({
    automation,
    content,
    supportingFiles,
    previousRun,
    previousRunText,
    previousOutputFiles,
    inputs,
    trigger,
}) {
    const previousRunSummary = previousRun
        ? `Previous completed run: ${previousRun._id}
Completed at: ${previousRun.updatedAt || previousRun.createdAt || "unknown"}
${previousRunText ? `Summary/output:\n${previousRunText}` : "No previous text summary was stored."}
${previousOutputFiles.length ? "The previous run's HTML output is attached as previous-run-output.html. Treat it as prior automation output, not as a new user-provided reference file." : ""}`
        : "No previous completed run was found.";

    const outputContract = automation.producesHtml
        ? buildAutomationHtmlOutputContract()
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
${formatFileList(supportingFiles)}

Previous run context:
${previousRunSummary}

${outputContract}`;
}

class AutomationRunTask extends BaseTask {
    constructor() {
        super();
        this.accumulators = new Map();
    }

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

        const colleague = automation.entityId
            ? await requireColleague(user, automation.entityId, {
                  runnable: true,
              })
            : null;
        metadata.colleagueName = colleague?.name || null;
        metadata.entityId = colleague?.id || null;

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

        const [content, fileContext, mcpAgentConfig] = await Promise.all([
            readAutomationContent(user.contextId, automation.slug),
            buildAutomationFileContext({
                userContextId: user.contextId,
                automation,
                userId,
                currentTaskId: taskId,
            }),
            buildMcpAgentConfigForUser(user, {
                logPrefix: "[MCP:automation]",
                headless: true,
            }),
        ]);
        const supportingFiles = fileContext.supportingFiles;
        const supportingFileNames = supportingFiles.map(
            (file) => file.displayFilename || file.filename || file.blobPath,
        );
        const previousRunOutputFileNames = fileContext.previousOutputFiles.map(
            (file) => file.displayFilename || file.filename || file.blobPath,
        );
        metadata.automationName = automation.name;
        metadata.automationSlug = automation.slug;
        metadata.supportingFileNames = supportingFileNames;
        metadata.previousRunTaskId = fileContext.previousRun?._id || null;
        metadata.previousRunOutputFileNames = previousRunOutputFileNames;

        await Task.findByIdAndUpdate(taskId, {
            $set: {
                metadata: {
                    ...metadataForTask,
                    supportingFileNames,
                    previousRunTaskId: fileContext.previousRun?._id || null,
                    previousRunOutputFileNames,
                },
                progress: 0.3,
                statusText: `Running ${automationName}...`,
            },
        });

        const fileAccessPlan = buildAutomationFileAccessPlan(user);
        const runContext = buildRunContext({
            userContextId: user.contextId,
            userContextKey: user.contextKey,
        });
        const prompt = buildPrompt({
            automation,
            content,
            supportingFiles,
            previousRun: fileContext.previousRun,
            previousRunText: fileContext.previousRunText,
            previousOutputFiles: fileContext.previousOutputFiles,
            inputs: metadata.inputs || automation.inputs,
            trigger: metadata.trigger || "manual",
        });
        const assistantTurn = await prepareAssistantTurn(
            taskId,
            colleague?.id || user.personalEntityId,
            prompt,
        );

        const unavailableMcpServers =
            mcpAgentConfig.unavailableMcpServers || [];
        const headlessMcpNotice =
            unavailableMcpServers.length > 0
                ? `Some connected services are unavailable in this headless automation because their credentials could not be refreshed: ${unavailableMcpServers.map((server) => server.serverKey).join(", ")}. Do not try to connect or re-authenticate services during this run. If the automation depends on one of these services, explain that the user needs to reconnect it before rerunning the automation.`
                : null;
        const watchedFolderNotice =
            automation.schedule?.frequency === "files"
                ? `The watched input folder is ${automation.schedule.watchPath}. Read the changed inputs there and write results outside that folder.`
                : null;
        const systemContent = [
            colleague
                ? `You are ${colleague.name}, carrying out an assigned task. Complete the work using the user's workspace, skills, and connected tools.`
                : "You are running a scheduled task for the user. Complete the work using the user's workspace, skills, and connected tools.",
            "Use ListAssistants and MessageAssistants to delegate work. Put independent requests in one batch; wait for their replies before dependent stages. For a user decision, use AskUser with a checkpoint naming the current stage, completed work, file paths, and what should happen after the answer. Set wait=true to suspend now, or false to continue independent work. A suspended task will resume automatically; do not poll. Save files before handoff and give parallel editors different output paths. Never infer approval from silence. NotifyUser is for updates that do not require a resumable answer.",
        ];
        if (watchedFolderNotice) systemContent.push(watchedFolderNotice);
        if (headlessMcpNotice) {
            systemContent.push(headlessMcpNotice);
        }

        job.signal?.throwIfAborted();
        const result = await job.client.query({
            query: QUERIES.SYS_ENTITY_AGENT,
            variables: {
                chatHistory: [
                    {
                        role: "system",
                        content: systemContent,
                    },
                    {
                        role: "user",
                        content: [
                            JSON.stringify({
                                type: "text",
                                text: assistantTurn.prompt,
                            }),
                            ...fileContext.fileContent,
                        ],
                    },
                ],
                fileAccessPlan,
                contextId: runContext.contextId,
                contextKey: runContext.contextKey,
                entityId: colleague?.id || user.personalEntityId || "",
                agentToolsToken: await issueAgentToolsToken(
                    user,
                    colleague?.id || user.personalEntityId,
                    undefined,
                    { taskId, turn: assistantTurn.turn },
                ),
                aiName: colleague?.name || user.aiName,
                aiMemorySelfModify:
                    colleague?.memoryLearning ?? user.aiMemorySelfModify,
                model:
                    colleague?.model || user.agentModel || DEFAULT_CHAT_MODEL,
                citationFormat: automation.producesHtml ? "mixed" : "markdown",
                stream: true,
                mcpConfig: mcpAgentConfig.mcpConfig,
                mcpAvailableServers: mcpAgentConfig.mcpAvailableServers,
            },
            fetchPolicy: "network-only",
            context: {
                headers: job.deadline
                    ? { "x-cortex-deadline": String(job.deadline) }
                    : {},
                fetchOptions: { signal: job.signal },
            },
        });

        const subscriptionId = result.data?.sys_entity_agent?.result;
        if (!subscriptionId) {
            throw new Error(
                "No request id returned from automation agent service",
            );
        }

        return subscriptionId;
    }

    async cancelRequest(taskId, client) {
        const task = await Task.findById(taskId);
        if (!task?.cortexRequestId) return;
        await client.mutate({
            mutation: MUTATIONS.CANCEL_REQUEST,
            variables: { requestId: task.cortexRequestId },
            context: { fetchOptions: { signal: AbortSignal.timeout(10_000) } },
        });
        this.clearAccumulator(taskId);
    }

    getAccumulator(taskId) {
        if (!this.accumulators.has(taskId)) {
            this.accumulators.set(taskId, new StreamAccumulator());
        }
        return this.accumulators.get(taskId);
    }

    clearAccumulator(taskId) {
        this.accumulators.delete(taskId);
    }

    async handleProgress(taskId, rawData, dataObject, rawInfo, infoObject) {
        const accumulator = this.getAccumulator(taskId);

        if (infoObject && typeof infoObject === "object") {
            accumulator.processInfo(infoObject);
        } else if (rawInfo) {
            accumulator.processInfo(rawInfo);
        }

        if (rawData) {
            accumulator.processResult(rawData);
            return;
        }

        const fallbackResult = coerceAutomationResultText(dataObject);
        if (fallbackResult) {
            accumulator.processResult(JSON.stringify(fallbackResult));
        }
    }

    async saveAutomationResult({ taskId, userId, metadata, rawResult, tool }) {
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

        const parsed = parseAutomationResult(
            rawResult,
            automation.producesHtml,
        );
        if (automation.producesHtml) assertNewAutomationCitations(parsed);
        const update = {
            data: {
                summary:
                    parsed.summary ||
                    (parsed.html ? "Automation completed." : rawResult),
                result: rawResult,
                tool,
                supportingFiles: metadata.supportingFileNames || [],
                previousRunTaskId: metadata.previousRunTaskId || null,
                previousRunOutputFiles:
                    metadata.previousRunOutputFileNames || [],
            },
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

            const automationOutputUpdate = {
                $set: {
                    latestRunTaskId: taskId,
                    latestHtmlOutputPath: htmlOutputPath,
                },
            };

            if (parsed.widgetHtml) {
                const widgetHtml = sanitizeGeneratedHtml(parsed.widgetHtml);
                const widgetHtmlOutputPath = await writeAutomationOutputFile({
                    userContextId: user.contextId,
                    slug: automation.slug,
                    taskId,
                    filename: "widget.html",
                    content: widgetHtml,
                    mimeType: "text/html",
                });
                update["automation.widgetHtmlOutputPath"] =
                    widgetHtmlOutputPath;
                automationOutputUpdate.$set.latestWidgetHtmlOutputPath =
                    widgetHtmlOutputPath;
            } else {
                automationOutputUpdate.$unset = {
                    latestWidgetHtmlOutputPath: 1,
                };
            }

            await Automation.findByIdAndUpdate(
                automation._id,
                automationOutputUpdate,
            );
        }

        await Task.findByIdAndUpdate(taskId, update);

        await Automation.findByIdAndUpdate(automation._id, {
            $set: {
                lastRunAt: new Date(),
                nextRunAt: automation.enabled
                    ? calculateNextRunAt(
                          automation.schedule,
                          automation.timezone,
                      )
                    : null,
            },
            $unset: { schedulerLockedAt: 1 },
        });

        return update.data;
    }

    async handleCompletion(taskId, dataObject, infoObject, metadata) {
        const accumulator = this.accumulators.get(taskId);
        const accumulatedResult = accumulator?.streamingMessage || "";
        const rawResult =
            accumulatedResult || coerceAutomationResultText(dataObject);
        const tool = buildAutomationToolInfo(
            accumulator?.getAccumulatedInfo(),
            infoObject,
        );

        try {
            if (await parkAssistantTurn(taskId, rawResult))
                return { assistantWaiting: true };
            return await this.saveAutomationResult({
                taskId,
                userId: metadata.userId,
                metadata,
                rawResult,
                tool,
            });
        } catch (error) {
            const failure = await this.handleError(taskId, error, metadata);
            // The work already ran. A format failure must not replay agent tools.
            if (error.code === "HTML_CITATION_FORMAT") return failure;
            throw error;
        } finally {
            this.clearAccumulator(taskId);
        }
    }

    async handleError(taskId, error, metadata) {
        this.clearAccumulator(taskId);
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
