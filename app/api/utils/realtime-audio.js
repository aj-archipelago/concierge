import crypto from "node:crypto";

const REALTIME_MODES = new Set(["transcribe", "translate"]);
const TRANSCRIBE_DELAYS = new Set([
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
]);

const DEFAULT_REALTIME_CLIENT_SECRET_PATH =
    "/openai/v1/realtime/client_secrets";
const DEFAULT_REALTIME_CALLS_PATH = "/openai/v1/realtime/calls";
const DEFAULT_AZURE_REALTIME_WHISPER_DEPLOYMENT = "gpt-realtime-whisper";
const DEFAULT_AZURE_REALTIME_TRANSLATE_DEPLOYMENT = "gpt-realtime-translate";
const DEFAULT_REALTIME_BROKER_TOKEN_TTL_SECONDS = 2 * 60;
const REALTIME_BROKER_AUDIENCE = "concierge-realtime-audio-translate";
const BROWSER_BROKER_URL_SECRET_PARAMS = [
    "api-key",
    "brokerToken",
    "cortex-api-key",
    "subscription-key",
];

class RealtimeAudioError extends Error {
    constructor(message, { status = 500, code = "REALTIME_AUDIO_ERROR" } = {}) {
        super(message);
        this.name = "RealtimeAudioError";
        this.status = status;
        this.code = code;
    }
}

function isEnvTrue(value) {
    return String(value).toLowerCase() === "true";
}

function normalizeAzureEndpoint(value) {
    const endpoint = String(value || "").trim();
    if (!endpoint) return "";
    if (/^https?:\/\//i.test(endpoint)) return endpoint.replace(/\/+$/, "");
    return `https://${endpoint.replace(/\/+$/, "")}.openai.azure.com`;
}

function joinAzureUrl(endpoint, path) {
    const normalizedEndpoint = normalizeAzureEndpoint(endpoint);
    const normalizedPath = String(path || "").startsWith("/")
        ? path
        : `/${path}`;
    return `${normalizedEndpoint}${normalizedPath}`;
}

function getBrokerUrlSecret(baseUrl) {
    try {
        return new URL(baseUrl).searchParams.get("cortex-api-key") || "";
    } catch {
        return "";
    }
}

function getFirstConfiguredCortexApiKey(value) {
    return String(value || "")
        .split(",")
        .map((key) => key.trim())
        .find(Boolean);
}

function hasBrowserBrokerUrlSecret(value) {
    try {
        const url = new URL(value);
        return BROWSER_BROKER_URL_SECRET_PARAMS.some((name) =>
            url.searchParams.has(name),
        );
    } catch {
        return false;
    }
}

function getRealtimeBrokerTokenSecret(baseUrl) {
    return (
        process.env.REALTIME_AUDIO_BROKER_TOKEN_SECRET ||
        process.env.CORTEX_REALTIME_AUDIO_BROKER_TOKEN_SECRET ||
        getFirstConfiguredCortexApiKey(process.env.CORTEX_API_KEY) ||
        process.env.CORTEX_REALTIME_API_KEY ||
        process.env.ARCHIPELAGO_FOUNDRY_RESOURCE_KEY ||
        process.env.AZURE_OPENAI_API_KEY ||
        getBrokerUrlSecret(baseUrl)
    );
}

function getRealtimeBrokerTokenTtlSeconds() {
    const parsed = Number(process.env.REALTIME_AUDIO_BROKER_TOKEN_TTL_SECONDS);
    return Number.isFinite(parsed) && parsed > 0
        ? parsed
        : DEFAULT_REALTIME_BROKER_TOKEN_TTL_SECONDS;
}

function base64UrlJson(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signBrokerPayload(payload, secret) {
    return crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
}

function hashSafetyIdentifier(value) {
    if (!value) return undefined;
    return crypto
        .createHash("sha256")
        .update(String(value))
        .digest("hex")
        .slice(0, 32);
}

function createRealtimeBrokerToken({ targetLanguage, userId, baseUrl }) {
    const secret = getRealtimeBrokerTokenSecret(baseUrl);
    if (!secret) return "";

    const now = Math.floor(Date.now() / 1000);
    const payload = base64UrlJson({
        aud: REALTIME_BROKER_AUDIENCE,
        targetLanguage,
        sub: hashSafetyIdentifier(userId),
        jti: crypto.randomUUID(),
        iat: now,
        exp: now + getRealtimeBrokerTokenTtlSeconds(),
    });
    return `${payload}.${signBrokerPayload(payload, secret)}`;
}

function getRealtimeTranslationBrokerBaseUrl() {
    return (
        process.env.AZURE_REALTIME_TRANSLATION_BROKER_URL ||
        process.env.CORTEX_REALTIME_AUDIO_BROKER_URL ||
        ""
    );
}

function getRealtimeTranslationBrokerUrl() {
    const baseUrl = getRealtimeTranslationBrokerBaseUrl();
    if (hasBrowserBrokerUrlSecret(baseUrl)) return "";

    try {
        const url = new URL(baseUrl);
        if (url.protocol === "https:") url.protocol = "wss:";
        if (url.protocol === "http:") url.protocol = "ws:";
        if (!["ws:", "wss:"].includes(url.protocol)) return "";
        if (
            url.protocol === "ws:" &&
            !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
        ) {
            return "";
        }
        return url.toString();
    } catch {
        return "";
    }
}

function normalizeLanguage(value) {
    const language = String(value || "").trim();
    if (!language || language === "auto") return undefined;
    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/i.test(language)) {
        throw new RealtimeAudioError("Unsupported realtime audio language", {
            status: 400,
            code: "INVALID_REALTIME_LANGUAGE",
        });
    }
    return language;
}

function normalizeMode(mode) {
    const normalizedMode = String(mode || "transcribe").toLowerCase();
    if (!REALTIME_MODES.has(normalizedMode)) {
        throw new RealtimeAudioError("Unsupported realtime audio mode", {
            status: 400,
            code: "INVALID_REALTIME_MODE",
        });
    }
    return normalizedMode;
}

function normalizeDelay(delay) {
    const normalizedDelay = String(delay || "low").toLowerCase();
    if (!TRANSCRIBE_DELAYS.has(normalizedDelay)) {
        throw new RealtimeAudioError(
            "Unsupported realtime transcription delay",
            {
                status: 400,
                code: "INVALID_REALTIME_DELAY",
            },
        );
    }
    return normalizedDelay;
}

export function getRealtimeAudioConfig() {
    const endpoint = normalizeAzureEndpoint(
        process.env.AZURE_OPENAI_REALTIME_ENDPOINT,
    );
    const apiKey =
        process.env.AZURE_OPENAI_REALTIME_API_KEY ||
        process.env.ARCHIPELAGO_FOUNDRY_RESOURCE_KEY ||
        process.env.AZURE_OPENAI_API_KEY;
    const whisperDeployment =
        process.env.AZURE_REALTIME_WHISPER_DEPLOYMENT ||
        process.env.AZURE_OPENAI_REALTIME_WHISPER_DEPLOYMENT ||
        DEFAULT_AZURE_REALTIME_WHISPER_DEPLOYMENT;
    const translateDeployment =
        process.env.AZURE_REALTIME_TRANSLATE_DEPLOYMENT ||
        process.env.AZURE_OPENAI_REALTIME_TRANSLATE_DEPLOYMENT ||
        DEFAULT_AZURE_REALTIME_TRANSLATE_DEPLOYMENT;

    const transcribeAvailable = Boolean(
        endpoint && apiKey && whisperDeployment,
    );
    const translationBrokerBaseUrl = getRealtimeTranslationBrokerBaseUrl();
    const translationBrokerUrl = getRealtimeTranslationBrokerUrl();
    const translateAvailable = Boolean(
        translateDeployment &&
            translationBrokerUrl &&
            getRealtimeBrokerTokenSecret(translationBrokerBaseUrl),
    );
    const featureEnabled =
        transcribeAvailable ||
        translateAvailable ||
        isEnvTrue(process.env.ENABLE_AZURE_REALTIME_AUDIO);

    return {
        endpoint,
        apiKey,
        whisperDeployment,
        translateDeployment,
        translationBrokerUrl,
        featureEnabled,
        capabilities: {
            transcribe: transcribeAvailable,
            translate: translateAvailable,
        },
        paths: {
            transcribeClientSecrets:
                process.env.AZURE_OPENAI_REALTIME_CLIENT_SECRET_PATH ||
                DEFAULT_REALTIME_CLIENT_SECRET_PATH,
            transcribeCalls:
                process.env.AZURE_OPENAI_REALTIME_CALLS_PATH ||
                DEFAULT_REALTIME_CALLS_PATH,
        },
    };
}

export function getRealtimeAudioPublicConfig() {
    const config = getRealtimeAudioConfig();

    return {
        enabled: config.featureEnabled,
        capabilities: config.capabilities,
    };
}

export function buildRealtimeSessionConfig({
    mode = "transcribe",
    sourceLanguage,
    targetLanguage = "ar",
    delay = "low",
} = {}) {
    const normalizedMode = normalizeMode(mode);
    const config = getRealtimeAudioConfig();
    const language = normalizeLanguage(sourceLanguage);

    if (normalizedMode === "transcribe") {
        if (!config.capabilities.transcribe) {
            throw new RealtimeAudioError(
                "Azure realtime transcription is not configured",
                { status: 503, code: "REALTIME_TRANSCRIBE_NOT_CONFIGURED" },
            );
        }

        const transcription = {
            model: config.whisperDeployment,
            delay: normalizeDelay(delay),
        };
        if (language) transcription.language = language;

        return {
            session: {
                type: "transcription",
                audio: {
                    input: {
                        transcription,
                    },
                },
            },
        };
    }

    const target = normalizeLanguage(targetLanguage);
    if (!target) {
        throw new RealtimeAudioError("A target language is required", {
            status: 400,
            code: "MISSING_TARGET_LANGUAGE",
        });
    }

    const inputTranscription = {
        model: config.whisperDeployment,
    };
    if (language) inputTranscription.language = language;

    return {
        session: {
            model: config.translateDeployment,
            audio: {
                output: {
                    language: target,
                },
                input: {
                    transcription: inputTranscription,
                },
            },
        },
    };
}

export function createRealtimeBrokerSession({
    mode = "translate",
    targetLanguage = "ar",
    userId,
} = {}) {
    const normalizedMode = normalizeMode(mode);
    const config = getRealtimeAudioConfig();
    if (normalizedMode !== "translate") {
        throw new RealtimeAudioError("Unsupported realtime broker mode", {
            status: 400,
            code: "INVALID_REALTIME_BROKER_MODE",
        });
    }

    if (!config.capabilities.translate) {
        throw new RealtimeAudioError(
            "Azure realtime translation is not configured",
            { status: 503, code: "REALTIME_TRANSLATE_NOT_CONFIGURED" },
        );
    }

    const target = normalizeLanguage(targetLanguage);
    if (!target) {
        throw new RealtimeAudioError("A target language is required", {
            status: 400,
            code: "MISSING_TARGET_LANGUAGE",
        });
    }

    const brokerUrl = new URL(config.translationBrokerUrl);
    const brokerToken = createRealtimeBrokerToken({
        targetLanguage: target,
        userId,
        baseUrl: getRealtimeTranslationBrokerBaseUrl(),
    });

    return {
        mode: normalizedMode,
        brokerUrl: brokerUrl.toString(),
        brokerToken,
        targetLanguage: target,
    };
}

export async function createRealtimeAudioSession({
    mode = "transcribe",
    sourceLanguage,
    targetLanguage,
    delay,
    userId,
} = {}) {
    const normalizedMode = normalizeMode(mode);
    if (normalizedMode === "translate") {
        return createRealtimeBrokerSession({
            mode: normalizedMode,
            targetLanguage,
            userId,
        });
    }

    return createRealtimeClientSecret({
        mode: normalizedMode,
        sourceLanguage,
        targetLanguage,
        delay,
        userId,
    });
}

export async function createRealtimeClientSecret({
    mode = "transcribe",
    sourceLanguage,
    targetLanguage,
    delay,
    userId,
} = {}) {
    const normalizedMode = normalizeMode(mode);
    if (normalizedMode !== "transcribe") {
        throw new RealtimeAudioError(
            "Azure realtime translation uses the Cortex WebSocket broker",
            { status: 400, code: "REALTIME_TRANSLATE_USES_BROKER" },
        );
    }

    const config = getRealtimeAudioConfig();
    const sessionConfig = buildRealtimeSessionConfig({
        mode: normalizedMode,
        sourceLanguage,
        targetLanguage,
        delay,
    });
    const clientSecretPath = config.paths.transcribeClientSecrets;
    const callsPath = config.paths.transcribeCalls;

    const response = await fetch(
        joinAzureUrl(config.endpoint, clientSecretPath),
        {
            method: "POST",
            headers: {
                "api-key": config.apiKey,
                "Content-Type": "application/json",
                ...(userId
                    ? {
                          "OpenAI-Safety-Identifier":
                              hashSafetyIdentifier(userId),
                      }
                    : {}),
            },
            body: JSON.stringify(sessionConfig),
        },
    );

    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { error: text };
    }

    if (!response.ok) {
        throw new RealtimeAudioError(
            data?.error?.message ||
                data?.message ||
                data?.error ||
                "Failed to create Azure realtime session",
            {
                status: response.status,
                code: "REALTIME_CLIENT_SECRET_FAILED",
            },
        );
    }

    if (!data?.value) {
        throw new RealtimeAudioError(
            "Azure realtime session response did not include a client secret",
            {
                status: 502,
                code: "REALTIME_CLIENT_SECRET_MISSING",
            },
        );
    }

    return {
        value: data.value,
        expires_at: data.expires_at,
        callsUrl: joinAzureUrl(config.endpoint, callsPath),
        mode: normalizedMode,
    };
}

export { RealtimeAudioError };
