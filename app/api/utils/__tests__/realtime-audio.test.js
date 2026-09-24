/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import {
    buildRealtimeSessionConfig,
    createRealtimeAudioSession,
    createRealtimeBrokerSession,
    createRealtimeClientSecret,
    getRealtimeAudioPublicConfig,
} from "../realtime-audio";

describe("realtime-audio utils", () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        process.env.AZURE_OPENAI_REALTIME_ENDPOINT = "https://aoai.test";
        process.env.AZURE_OPENAI_REALTIME_API_KEY = "azure-key";
        delete process.env.AZURE_REALTIME_WHISPER_DEPLOYMENT;
        delete process.env.AZURE_OPENAI_REALTIME_WHISPER_DEPLOYMENT;
        delete process.env.AZURE_REALTIME_TRANSLATE_DEPLOYMENT;
        delete process.env.AZURE_OPENAI_REALTIME_TRANSLATE_DEPLOYMENT;
        process.env.CORTEX_API_KEY = "cortex-key";
        process.env.CORTEX_REALTIME_AUDIO_BROKER_URL =
            "https://broker.test/realtime-audio/translate";
        global.fetch = jest.fn();
    });

    afterEach(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    it("builds an Azure realtime transcription session with default deployment names", () => {
        const session = buildRealtimeSessionConfig({
            mode: "transcribe",
            sourceLanguage: "en",
            delay: "low",
        });

        expect(session).toEqual({
            session: {
                type: "transcription",
                audio: {
                    input: {
                        transcription: {
                            model: "gpt-realtime-whisper",
                            language: "en",
                            delay: "low",
                        },
                    },
                },
            },
        });
    });

    it("builds an Azure realtime translation session shape for the broker", () => {
        const session = buildRealtimeSessionConfig({
            mode: "translate",
            sourceLanguage: "en",
            targetLanguage: "ar",
        });

        expect(session).toEqual({
            session: {
                model: "gpt-realtime-translate",
                audio: {
                    output: {
                        language: "ar",
                    },
                    input: {
                        transcription: {
                            model: "gpt-realtime-whisper",
                            language: "en",
                        },
                    },
                },
            },
        });
    });

    it("allows realtime deployment name overrides", () => {
        process.env.AZURE_REALTIME_WHISPER_DEPLOYMENT =
            "whisper-live-deployment";
        process.env.AZURE_REALTIME_TRANSLATE_DEPLOYMENT =
            "translate-live-deployment";

        expect(
            buildRealtimeSessionConfig({
                mode: "translate",
                sourceLanguage: "en",
                targetLanguage: "ar",
            }),
        ).toMatchObject({
            session: {
                model: "translate-live-deployment",
                audio: {
                    input: {
                        transcription: {
                            model: "whisper-live-deployment",
                        },
                    },
                },
            },
        });
    });

    it("creates a transcription client secret without exposing Azure keys to the browser", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: jest.fn().mockResolvedValue(
                JSON.stringify({
                    value: "ephemeral-secret",
                    expires_at: 1782213600,
                }),
            ),
        });

        const result = await createRealtimeClientSecret({
            mode: "transcribe",
            sourceLanguage: "en",
            userId: "user-1",
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "https://aoai.test/openai/v1/realtime/client_secrets",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "api-key": "azure-key",
                    "OpenAI-Safety-Identifier": crypto
                        .createHash("sha256")
                        .update("user-1")
                        .digest("hex")
                        .slice(0, 32),
                }),
            }),
        );
        expect(result).toEqual({
            value: "ephemeral-secret",
            expires_at: 1782213600,
            callsUrl: "https://aoai.test/openai/v1/realtime/calls",
            mode: "transcribe",
        });
    });

    it("uses only the explicit realtime endpoint for Azure sessions", async () => {
        process.env.AZURE_OPENAI_REALTIME_ENDPOINT = "https://realtime.test";
        process.env.AZURE_REALTIME_ENDPOINT = "https://stale.test";
        process.env.AZURE_OPENAI_ENDPOINT = "https://generic.test";
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: jest.fn().mockResolvedValue(
                JSON.stringify({
                    value: "ephemeral-secret",
                    expires_at: 1782213600,
                }),
            ),
        });

        await createRealtimeClientSecret({
            mode: "transcribe",
            sourceLanguage: "en",
            userId: "user-1",
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "https://realtime.test/openai/v1/realtime/client_secrets",
            expect.any(Object),
        );
    });

    it("does not request a browser translation client secret", async () => {
        await expect(
            createRealtimeClientSecret({
                mode: "translate",
                sourceLanguage: "en",
                targetLanguage: "ar",
                userId: "user-1",
            }),
        ).rejects.toMatchObject({
            code: "REALTIME_TRANSLATE_USES_BROKER",
            status: 400,
        });

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("creates a translation broker session without exposing Azure keys", async () => {
        process.env.CORTEX_GRAPHQL_API_URL =
            "https://cortex.test/graphql?cortex-api-key=cortex-key";
        process.env.CORTEX_REALTIME_AUDIO_BROKER_URL =
            "https://cortex.test/realtime-audio/translate";

        const result = await createRealtimeAudioSession({
            mode: "translate",
            sourceLanguage: "en",
            targetLanguage: "ar",
            userId: "user-1",
        });

        const brokerUrl = new URL(result.brokerUrl);
        expect(result.mode).toBe("translate");
        expect(brokerUrl.protocol).toBe("wss:");
        expect(brokerUrl.host).toBe("cortex.test");
        expect(brokerUrl.pathname).toBe("/realtime-audio/translate");
        expect(result.targetLanguage).toBe("ar");
        expect(result.brokerToken).toBeTruthy();
        const tokenPayload = JSON.parse(
            Buffer.from(result.brokerToken.split(".")[0], "base64url").toString(
                "utf8",
            ),
        );
        expect(tokenPayload.jti).toEqual(expect.any(String));
        expect(tokenPayload.exp - tokenPayload.iat).toBeLessThanOrEqual(120);
        expect(brokerUrl.searchParams.get("targetLanguage")).toBeNull();
        expect(brokerUrl.searchParams.get("sourceLanguage")).toBeNull();
        expect(brokerUrl.searchParams.get("userId")).toBeNull();
        expect(brokerUrl.searchParams.get("cortex-api-key")).toBeNull();
        expect(brokerUrl.searchParams.get("brokerToken")).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not publish a broker URL derived from keyed Cortex URLs", async () => {
        process.env.CORTEX_GRAPHQL_API_URL =
            "https://cortex.test/graphql?cortex-api-key=cortex-key";
        delete process.env.CORTEX_REALTIME_AUDIO_BROKER_URL;
        delete process.env.AZURE_REALTIME_TRANSLATION_BROKER_URL;

        expect(getRealtimeAudioPublicConfig()).toMatchObject({
            capabilities: {
                translate: false,
            },
        });
        await expect(
            createRealtimeAudioSession({
                mode: "translate",
                targetLanguage: "ar",
                userId: "user-1",
            }),
        ).rejects.toMatchObject({
            code: "REALTIME_TRANSLATE_NOT_CONFIGURED",
            status: 503,
        });
    });

    it("rejects plaintext non-loopback broker URLs", () => {
        process.env.CORTEX_REALTIME_AUDIO_BROKER_URL =
            "http://cortex.test/realtime-audio";

        expect(getRealtimeAudioPublicConfig()).toMatchObject({
            capabilities: { translate: false },
        });
    });

    it("signs broker tokens with the first Cortex API key when env contains a list", async () => {
        delete process.env.REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_REALTIME_API_KEY;
        process.env.CORTEX_API_KEY = "key-one,key-two";

        const result = await createRealtimeAudioSession({
            mode: "translate",
            targetLanguage: "ar",
            userId: "user-1",
        });
        const [payload, signature] = result.brokerToken.split(".");

        expect(signature).toBe(
            crypto
                .createHmac("sha256", "key-one")
                .update(payload)
                .digest("base64url"),
        );
        expect(signature).not.toBe(
            crypto
                .createHmac("sha256", "key-one,key-two")
                .update(payload)
                .digest("base64url"),
        );
    });

    it("uses the Foundry key binding as broker signing material", async () => {
        delete process.env.REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_API_KEY;
        delete process.env.CORTEX_REALTIME_API_KEY;
        process.env.ARCHIPELAGO_FOUNDRY_RESOURCE_KEY = "foundry-key";

        expect(getRealtimeAudioPublicConfig()).toMatchObject({
            capabilities: {
                translate: true,
            },
        });

        const result = await createRealtimeAudioSession({
            mode: "translate",
            targetLanguage: "ar",
            userId: "user-1",
        });

        expect(result.brokerToken).toBeTruthy();
    });

    it("uses the generic Azure key binding as broker signing material", async () => {
        delete process.env.REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_API_KEY;
        delete process.env.CORTEX_REALTIME_API_KEY;
        delete process.env.ARCHIPELAGO_FOUNDRY_RESOURCE_KEY;
        process.env.AZURE_OPENAI_API_KEY = "generic-azure-key";

        expect(getRealtimeAudioPublicConfig()).toMatchObject({
            capabilities: {
                translate: true,
            },
        });
    });

    it("rejects missing translation target languages", () => {
        expect(() =>
            createRealtimeBrokerSession({
                mode: "translate",
                targetLanguage: "auto",
            }),
        ).toThrow("A target language is required");
    });

    it("uses the unfiltered realtime calls endpoint for transcription deltas", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: jest.fn().mockResolvedValue(
                JSON.stringify({
                    value: "ephemeral-secret",
                }),
            ),
        });

        const result = await createRealtimeClientSecret({
            mode: "transcribe",
            sourceLanguage: "en",
            userId: "user-1",
        });

        expect(result.callsUrl).toBe(
            "https://aoai.test/openai/v1/realtime/calls",
        );
    });

    it("uses default realtime deployment names when deployment overrides are absent", () => {
        delete process.env.AZURE_REALTIME_WHISPER_DEPLOYMENT;
        delete process.env.AZURE_REALTIME_TRANSLATE_DEPLOYMENT;

        expect(getRealtimeAudioPublicConfig()).toEqual({
            enabled: true,
            capabilities: {
                transcribe: true,
                translate: true,
            },
        });

        expect(
            buildRealtimeSessionConfig({
                mode: "transcribe",
                sourceLanguage: "en",
            }),
        ).toMatchObject({
            session: {
                audio: {
                    input: {
                        transcription: {
                            model: "gpt-realtime-whisper",
                        },
                    },
                },
            },
        });
    });

    it("reports transcription unavailable when the Azure realtime endpoint is missing", () => {
        delete process.env.AZURE_OPENAI_REALTIME_ENDPOINT;
        process.env.AZURE_REALTIME_ENDPOINT = "https://stale.test";
        delete process.env.AZURE_OPENAI_ENDPOINT;
        delete process.env.AZURE_RESOURCE;

        expect(getRealtimeAudioPublicConfig()).toEqual({
            enabled: true,
            capabilities: {
                transcribe: false,
                translate: true,
            },
        });

        expect(() =>
            buildRealtimeSessionConfig({
                mode: "transcribe",
                sourceLanguage: "en",
            }),
        ).toThrow("Azure realtime transcription is not configured");
    });

    it("reports transcription unavailable when the Azure key binding is missing", () => {
        delete process.env.AZURE_OPENAI_REALTIME_API_KEY;
        delete process.env.AZURE_OPENAI_API_KEY;
        delete process.env.ARCHIPELAGO_FOUNDRY_RESOURCE_KEY;
        delete process.env.ENABLE_AZURE_REALTIME_AUDIO;

        expect(getRealtimeAudioPublicConfig()).toEqual({
            enabled: true,
            capabilities: {
                transcribe: false,
                translate: true,
            },
        });
    });

    it("reports translation unavailable when broker auth is missing", () => {
        delete process.env.REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_REALTIME_AUDIO_BROKER_TOKEN_SECRET;
        delete process.env.CORTEX_API_KEY;
        delete process.env.CORTEX_REALTIME_API_KEY;
        delete process.env.ARCHIPELAGO_FOUNDRY_RESOURCE_KEY;
        delete process.env.AZURE_OPENAI_API_KEY;
        delete process.env.CORTEX_GRAPHQL_API_URL;
        delete process.env.AZURE_REALTIME_TRANSLATION_BROKER_URL;
        delete process.env.CORTEX_REALTIME_AUDIO_BROKER_URL;

        expect(getRealtimeAudioPublicConfig()).toEqual({
            enabled: true,
            capabilities: {
                transcribe: true,
                translate: false,
            },
        });
    });
});
