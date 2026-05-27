import mongoose from "mongoose";
import sanitizeHtml from "sanitize-html";
import Automation from "../models/automation.js";
import {
    deleteMediaFile,
    hashBuffer,
    listAutomationFiles,
    readBlobContent,
    uploadBufferToMediaService,
} from "../utils/media-service-utils.js";
import { createAutomationStorageTarget } from "../../../src/utils/storageTargets.js";

export const AUTOMATION_MD = "AUTOMATION.md";
export const AUTOMATION_TASK_TYPE = "automation-run";
const ACTIVE_TASK_STATUSES = ["pending", "in_progress"];

function stripJsonFence(value) {
    return String(value || "")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function extractBalancedJsonObject(text) {
    const start = text.indexOf("{");
    if (start < 0) return "";

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
        const char = text[index];

        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = inString;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === "{") {
            depth += 1;
        } else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, index + 1);
            }
        }
    }

    return "";
}

function getJsonParseCandidates(text) {
    const candidates = [stripJsonFence(text)];
    const fencedJson = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fencedJson) {
        candidates.push(fencedJson);
    }
    const balancedJson = extractBalancedJsonObject(text);
    if (balancedJson) {
        candidates.push(balancedJson);
    }

    return [...new Set(candidates.filter(Boolean))];
}

function coerceAutomationText(value) {
    if (value === undefined || value === null || value === "") {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function parseAutomationResult(
    rawResult,
    producesHtml = false,
    depth = 0,
) {
    if (depth > 4) {
        return { summary: coerceAutomationText(rawResult), html: "" };
    }

    if (rawResult && typeof rawResult === "object") {
        const html =
            coerceAutomationText(
                rawResult.html ||
                    rawResult.htmlOutput ||
                    rawResult.outputHtml ||
                    rawResult.renderedHtml,
            ) || "";
        const nestedCandidate =
            rawResult.result ||
            rawResult.output ||
            rawResult.payload ||
            rawResult.content ||
            "";
        const nested = nestedCandidate
            ? parseAutomationResult(nestedCandidate, producesHtml, depth + 1)
            : { summary: "", html: "" };

        return {
            summary:
                coerceAutomationText(rawResult.summary) ||
                nested.summary ||
                (!html ? coerceAutomationText(nestedCandidate) : ""),
            html: html || nested.html,
        };
    }

    const text = String(rawResult || "").trim();
    if (!text) {
        return { summary: "", html: "" };
    }

    for (const candidate of getJsonParseCandidates(text)) {
        try {
            const parsed = JSON.parse(candidate);
            return parseAutomationResult(parsed, producesHtml, depth + 1);
        } catch {
            // Keep trying more specific candidates before falling back to text/HTML parsing.
        }
    }

    if (!producesHtml) {
        return { summary: text, html: "" };
    }

    const htmlMatch = text.match(/<!doctype html[\s\S]*|<html[\s\S]*/i);
    const looksLikeHtml =
        /<[a-z][\w:-]*(?:\s[^>]*)?>[\s\S]*<\/[a-z][\w:-]*>/i.test(text);
    return {
        summary: htmlMatch
            ? text.slice(0, htmlMatch.index).trim()
            : looksLikeHtml
              ? "Automation completed."
              : text,
        html: htmlMatch ? htmlMatch[0].trim() : looksLikeHtml ? text : "",
    };
}

export function parseAutomationTaskOutput(taskOrData) {
    const data = taskOrData?.data || taskOrData || {};
    const candidates = [
        data?.html,
        data?.summary,
        data?.result,
        data?.payload,
        data?.output,
        data?.content,
        data,
    ].filter((candidate) => candidate !== undefined && candidate !== null);
    let summary = "";

    for (const candidate of candidates) {
        const parsed = parseAutomationResult(candidate, true);
        if (!summary && parsed.summary) {
            summary = parsed.summary;
        }
        if (parsed.html) {
            return {
                summary: parsed.summary || summary,
                html: parsed.html,
            };
        }
    }

    return { summary, html: "" };
}

const BASE_ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.filter(
    (tag) => !["script", "iframe", "object", "embed"].includes(tag),
);
const DOCUMENT_TAGS = [
    "html",
    "head",
    "body",
    "title",
    "meta",
    "link",
    "style",
];
/** sanitize-html defaults allow figure/figcaption but not img — include img so hero images persist. */
const AUTOMATION_EXTRA_TAGS = ["img"];
const COMMON_ATTRIBUTES = {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": [
        "class",
        "id",
        "title",
        "style",
        "role",
        "aria-label",
        "aria-hidden",
        "data-theme",
    ],
    a: ["href", "name", "target", "rel"],
    img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
    meta: ["charset", "name", "content", "http-equiv"],
    link: ["rel", "href", "type", "media"],
    html: ["lang", "dir", "data-theme"],
};
const COMMON_OPTIONS = {
    allowedAttributes: COMMON_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto", "tel", "data"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
};
const FRAGMENT_OPTIONS = {
    ...COMMON_OPTIONS,
    allowedTags: [...BASE_ALLOWED_TAGS, ...AUTOMATION_EXTRA_TAGS],
};
const DOCUMENT_OPTIONS = {
    ...COMMON_OPTIONS,
    allowedTags: [
        ...BASE_ALLOWED_TAGS,
        ...AUTOMATION_EXTRA_TAGS,
        ...DOCUMENT_TAGS,
    ],
    allowVulnerableTags: true,
};

export function sanitizeGeneratedHtml(html) {
    const input = String(html || "");
    const isFullDocument = /<html[\s>]/i.test(input);

    if (isFullDocument) {
        return sanitizeHtml(input, DOCUMENT_OPTIONS);
    }

    const sanitized = sanitizeHtml(input, FRAGMENT_OPTIONS);

    return `<!doctype html>
<html data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; }
    html[data-theme="dark"] { color-scheme: dark; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 1rem; color: #111827; background: #ffffff; }
    html[data-theme="dark"] body { color: #f3f4f6; background: #111827; }
    @media (prefers-color-scheme: dark) {
      html:not([data-theme="light"]) { color-scheme: dark; }
      html:not([data-theme="light"]) body { color: #f3f4f6; background: #111827; }
    }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${sanitized}
</body>
</html>`;
}

export function applyAutomationHtmlTheme(html, theme = "light") {
    const safeTheme = theme === "dark" ? "dark" : "light";
    const themeStyle = `<style id="concierge-automation-theme">
:root { color-scheme: light; }
html[data-theme="dark"] { color-scheme: dark; }
html[data-theme="dark"] body { background: #0f172a !important; color: #e5e7eb !important; }
html[data-theme="dark"] article,
html[data-theme="dark"] section,
html[data-theme="dark"] aside,
html[data-theme="dark"] table,
html[data-theme="dark"] pre,
html[data-theme="dark"] code,
html[data-theme="dark"] .card { background-color: #111827 !important; color: #e5e7eb !important; border-color: #374151 !important; }
html[data-theme="dark"] h1,
html[data-theme="dark"] h2,
html[data-theme="dark"] h3,
html[data-theme="dark"] h4,
html[data-theme="dark"] h5,
html[data-theme="dark"] h6 { color: #f9fafb; }
html[data-theme="dark"] a { color: #7dd3fc; }
html[data-theme="dark"] input,
html[data-theme="dark"] textarea,
html[data-theme="dark"] select,
html[data-theme="dark"] button { background-color: #1f2937; color: #f9fafb; border-color: #4b5563; }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) { color-scheme: dark; }
  html:not([data-theme="light"]) body { background: #0f172a !important; color: #e5e7eb !important; }
}
</style>`;
    let themedHtml = String(html || "");

    if (/<html\b[^>]*>/i.test(themedHtml)) {
        themedHtml = themedHtml.replace(/<html\b([^>]*)>/i, (_match, attrs) => {
            const normalizedAttrs = String(attrs || "").replace(
                /\sdata-theme=(["']).*?\1/i,
                "",
            );
            return `<html${normalizedAttrs} data-theme="${safeTheme}">`;
        });
    }

    if (/<\/head>/i.test(themedHtml)) {
        themedHtml = themedHtml.replace(/<\/head>/i, `${themeStyle}</head>`);
    } else if (/<html\b[^>]*>/i.test(themedHtml)) {
        themedHtml = themedHtml.replace(
            /<html\b[^>]*>/i,
            (match) => `${match}<head>${themeStyle}</head>`,
        );
    }

    return themedHtml;
}

export function buildHtmlPreview(html) {
    return String(html || "")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);
}

export function normalizeAutomationSlug(value) {
    const collapsed = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 64);
    let start = 0;
    let end = collapsed.length;
    while (start < end && collapsed.charCodeAt(start) === 45) start += 1;
    while (end > start && collapsed.charCodeAt(end - 1) === 45) end -= 1;
    return collapsed.slice(start, end);
}

export function validateAutomationSlug(slug) {
    return /^[a-z0-9][a-z0-9-]*$/.test(slug) && slug.length <= 64;
}

export function sanitizeAutomationFilename(raw) {
    const basename = raw?.split(/[/\\]/).pop();
    if (!basename || basename === "." || basename === "..") return null;
    return basename;
}

function isValidScheduleTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

function normalizeScheduleTimes(input) {
    const source = Array.isArray(input.times) ? input.times : [input.time];
    const times = [
        ...new Set(
            source
                .map((value) => String(value || "").trim())
                .filter(isValidScheduleTime),
        ),
    ].sort();
    return times.length > 0 ? times : ["09:00"];
}

function normalizeScheduleDays(input) {
    const source = Array.isArray(input.daysOfWeek)
        ? input.daysOfWeek
        : [input.dayOfWeek];
    const days = [
        ...new Set(
            source
                .map((value) => Number.parseInt(value, 10))
                .filter(
                    (value) =>
                        Number.isInteger(value) && value >= 0 && value <= 6,
                ),
        ),
    ].sort((a, b) => a - b);
    return days.length > 0 ? days : [1];
}

export function normalizeSchedule(input = {}) {
    const frequency = ["manual", "hourly", "daily", "weekly"].includes(
        input.frequency,
    )
        ? input.frequency
        : "manual";

    const interval = Math.max(1, Number.parseInt(input.interval, 10) || 1);
    const times = normalizeScheduleTimes(input);
    const daysOfWeek = normalizeScheduleDays(input);
    const hourlyMode = input.hourlyMode === "clock" ? "clock" : "interval";
    const parsedMinute = Number.parseInt(input.minute, 10);
    const minute =
        Number.isInteger(parsedMinute) &&
        parsedMinute >= 0 &&
        parsedMinute <= 59
            ? parsedMinute
            : 0;

    return {
        frequency,
        interval,
        time: times[0],
        times,
        dayOfWeek: daysOfWeek[0],
        daysOfWeek,
        hourlyMode,
        minute,
    };
}

/** Manual schedules are never polled; coerce off so APIs stay consistent */
export function automationEffectiveEnabled(enabled, schedule) {
    if (schedule?.frequency === "manual") {
        return false;
    }
    return Boolean(enabled);
}

function getTimeZoneParts(date, timezone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);

    return Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, Number(part.value)]),
    );
}

function getTimeZoneOffsetMs(date, timezone) {
    const parts = getTimeZoneParts(date, timezone);
    const asUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );
    return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
    { year, month, day, hour = 0, minute = 0, second = 0 },
    timezone,
) {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess), timezone);
    let date = new Date(utcGuess - firstOffset);
    const secondOffset = getTimeZoneOffsetMs(date, timezone);
    if (secondOffset !== firstOffset) {
        date = new Date(utcGuess - secondOffset);
    }
    return date;
}

function addDaysToParts(parts, days) {
    const date = new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0),
    );
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    };
}

function addHoursToParts(parts, hours) {
    const date = new Date(
        Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour + hours,
            0,
            0,
        ),
    );
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
    };
}

function parseScheduleTime(time) {
    const [hour, minute] = time.split(":").map(Number);
    return { hour, minute };
}

function earliestFutureDate(candidates, fromDate) {
    return candidates
        .filter((candidate) => candidate > fromDate)
        .sort((a, b) => a - b)[0];
}

export function calculateNextRunAt(
    scheduleInput,
    timezone = "UTC",
    fromDate = new Date(),
) {
    const schedule = normalizeSchedule(scheduleInput);
    if (schedule.frequency === "manual") return null;

    if (schedule.frequency === "hourly") {
        if (schedule.hourlyMode === "clock") {
            const nowParts = getTimeZoneParts(fromDate, timezone);
            for (
                let hourOffset = 0;
                hourOffset <= 24 * schedule.interval + 1;
                hourOffset += 1
            ) {
                const parts = addHoursToParts(nowParts, hourOffset);
                if (parts.hour % schedule.interval !== 0) {
                    continue;
                }
                const candidate = zonedDateTimeToUtc(
                    { ...parts, minute: schedule.minute, second: 0 },
                    timezone,
                );
                if (candidate > fromDate) {
                    return candidate;
                }
            }
        }

        return new Date(
            fromDate.getTime() + schedule.interval * 60 * 60 * 1000,
        );
    }

    const nowParts = getTimeZoneParts(fromDate, timezone);

    if (schedule.frequency === "daily") {
        for (
            let dayOffset = 0;
            dayOffset <= schedule.interval * 14;
            dayOffset += schedule.interval
        ) {
            const dayParts =
                dayOffset === 0
                    ? nowParts
                    : addDaysToParts(nowParts, dayOffset);
            const candidates = schedule.times.map((time) => {
                const { hour, minute } = parseScheduleTime(time);
                return zonedDateTimeToUtc(
                    { ...dayParts, hour, minute, second: 0 },
                    timezone,
                );
            });
            const next = earliestFutureDate(candidates, fromDate);
            if (next) {
                return next;
            }
        }
        return null;
    }

    const localWeekday = new Date(
        Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day),
    ).getUTCDay();
    const maxDayOffset = 7 * schedule.interval + 6;
    for (let dayOffset = 0; dayOffset <= maxDayOffset; dayOffset += 1) {
        const weekIndex = Math.floor((localWeekday + dayOffset) / 7);
        if (weekIndex % schedule.interval !== 0) {
            continue;
        }
        const candidateWeekday = (localWeekday + dayOffset) % 7;
        if (!schedule.daysOfWeek.includes(candidateWeekday)) {
            continue;
        }
        const dayParts =
            dayOffset === 0 ? nowParts : addDaysToParts(nowParts, dayOffset);
        const candidates = schedule.times.map((time) => {
            const { hour, minute } = parseScheduleTime(time);
            return zonedDateTimeToUtc(
                { ...dayParts, hour, minute, second: 0 },
                timezone,
            );
        });
        const next = earliestFutureDate(candidates, fromDate);
        if (next) {
            return next;
        }
    }

    return null;
}

export async function readAutomationContent(userContextId, slug) {
    const storageTarget = createAutomationStorageTarget(userContextId);
    return (
        (await readBlobContent(
            `automations/${slug}/${AUTOMATION_MD}`,
            storageTarget,
        )) || ""
    );
}

export async function writeAutomationContent(userContextId, slug, content) {
    const buffer = Buffer.from(content || "", "utf-8");
    const hash = await hashBuffer(buffer);
    const storageTarget = createAutomationStorageTarget(userContextId);
    return uploadBufferToMediaService(
        buffer,
        { filename: AUTOMATION_MD, mimeType: "text/markdown", hash },
        { storageTarget, subPath: slug },
    );
}

export async function writeAutomationOutputFile({
    userContextId,
    slug,
    taskId,
    filename,
    content,
    mimeType = "text/plain",
}) {
    const safeName = sanitizeAutomationFilename(filename);
    if (!safeName) {
        throw new Error("Invalid output filename");
    }

    const buffer = Buffer.from(content || "", "utf-8");
    const hash = await hashBuffer(buffer);
    const storageTarget = createAutomationStorageTarget(userContextId);
    const subPath = `${slug}/outputs/${taskId}`;
    const uploadResult = await uploadBufferToMediaService(
        buffer,
        { filename: safeName, mimeType, hash },
        { storageTarget, subPath },
    );

    if (uploadResult.error) {
        throw new Error("Failed to save automation output");
    }

    return `automations/${subPath}/${safeName}`;
}

export async function listAutomationSupportingFiles(userContextId, slug) {
    const files = await listAutomationFiles(userContextId, slug);
    return files.filter((file) => {
        const name = file.name || file.filename || "";
        return (
            !name.endsWith(`/${AUTOMATION_MD}`) &&
            file.filename !== AUTOMATION_MD
        );
    });
}

export async function deleteAutomationFolder(userContextId, slug) {
    const storageTarget = createAutomationStorageTarget(userContextId);
    const files = await listAutomationFiles(userContextId, slug);
    await Promise.all(
        files.map((file) =>
            file.name
                ? deleteMediaFile({ blobPath: file.name, storageTarget })
                : Promise.resolve(),
        ),
    );
}

export async function findAutomationForUser(idOrSlug, ownerId) {
    const query = mongoose.Types.ObjectId.isValid(idOrSlug)
        ? { _id: idOrSlug, owner: ownerId }
        : { slug: String(idOrSlug || "").toLowerCase(), owner: ownerId };
    return Automation.findOne(query);
}

/**
 * Best-effort: copy automation.automationId onto automationRefId so CSFLE-safe
 * queries work (libmongocrypt analyze_query can fail on nested path filters).
 */
export function scheduleAutomationRefIdBackfill(docs) {
    if (!Array.isArray(docs) || docs.length === 0) return;
    void import("../models/task.mjs").then(({ default: Task }) => {
        for (const d of docs) {
            const nested = d?.automation?.automationId;
            if (!nested || d.automationRefId) continue;
            void Task.updateOne(
                { _id: d._id },
                { $set: { automationRefId: nested } },
            ).catch(() => {});
        }
    });
}

export async function hasActiveAutomationRun(automationId, ownerId) {
    const { default: Task } = await import("../models/task.mjs");
    const idStr = String(automationId);
    if (
        await Task.exists({
            owner: ownerId,
            type: AUTOMATION_TASK_TYPE,
            status: { $in: ACTIVE_TASK_STATUSES },
            automationRefId: automationId,
        })
    ) {
        return true;
    }

    const legacy = await Task.find({
        owner: ownerId,
        type: AUTOMATION_TASK_TYPE,
        status: { $in: ACTIVE_TASK_STATUSES },
    })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

    scheduleAutomationRefIdBackfill(legacy);

    return legacy.some(
        (t) =>
            String(t.automationRefId || t.automation?.automationId || "") ===
            idStr,
    );
}

export function serializeAutomation(automation, extra = {}) {
    const obj =
        typeof automation?.toObject === "function"
            ? automation.toObject()
            : automation;
    return { ...obj, ...extra };
}
