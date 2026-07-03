import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AuthContext, ServerContext } from "../../../App";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import TranscribeVideo from "../AddTrackOptions";

const mockMutateAsync = jest.fn(async () => ({ taskId: "task-1" }));
const mockUpdateUserStateNow = jest.fn(async (value) =>
    typeof value === "function"
        ? value({
              transcribe: {
                  videoInformation: {
                      videoUrl: "https://example.com/audio.mp3",
                  },
              },
          })
        : value,
);

jest.mock("../../../App", () => {
    const React = require("react");
    return {
        AuthContext: React.createContext({}),
        ServerContext: React.createContext({}),
    };
});

jest.mock("../../../contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("../../../../app/queries/notifications", () => ({
    useRunTask: () => ({ mutateAsync: mockMutateAsync }),
}));

jest.mock("../../../contexts/NotificationContext", () => ({
    useNotificationsContext: () => ({ openNotifications: jest.fn() }),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

const renderTranscribeVideo = (props = {}) =>
    render(
        <AuthContext.Provider
            value={{
                debouncedUpdateUserState: jest.fn(),
                updateUserStateNow: mockUpdateUserStateNow,
            }}
        >
            <ServerContext.Provider
                value={{
                    neuralspaceEnabled: true,
                    xaiTranscribeEnabled: true,
                    xaiTranscribeDefaultEnabled: false,
                    maiTranscribeEnabled: true,
                }}
            >
                <LanguageContext.Provider value={{ direction: "ltr" }}>
                    <TranscribeVideo
                        url="https://example.com/audio.mp3"
                        onClose={jest.fn()}
                        {...props}
                    />
                </LanguageContext.Provider>
            </ServerContext.Provider>
        </AuthContext.Provider>,
    );

const submitSelection = async ({
    model,
    format = "vtt",
    transcriptionType = "phraseLevel",
    wordsPerLine,
    language,
}) => {
    renderTranscribeVideo();

    const [modelSelect, formatSelect, transcriptionTypeSelect, languageSelect] =
        screen.getAllByRole("combobox");

    if (model) {
        fireEvent.change(modelSelect, { target: { value: model } });
    }
    fireEvent.change(formatSelect, { target: { value: format } });
    if (language) {
        fireEvent.change(languageSelect, { target: { value: language } });
    }

    if (format === "vtt") {
        fireEvent.change(transcriptionTypeSelect, {
            target: { value: transcriptionType },
        });

        if (transcriptionType === "wordsPerLine") {
            fireEvent.change(screen.getByRole("spinbutton"), {
                target: { value: String(wordsPerLine) },
            });
        }
    }

    fireEvent.click(screen.getByRole("button", { name: /Transcribe/ }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    const payload = mockMutateAsync.mock.calls[0][0];
    mockMutateAsync.mockClear();
    return payload;
};

describe("AddTrackOptions TranscribeVideo", () => {
    beforeEach(() => {
        mockMutateAsync.mockClear();
        mockUpdateUserStateNow.mockClear();
    });

    test.each([
        [
            "Whisper",
            {
                modelOption: "Whisper",
                wordTimestamped: false,
                maxLineWidth: undefined,
                maxLineCount: undefined,
                maxWordsPerLine: undefined,
            },
        ],
        [
            "NeuralSpace",
            {
                modelOption: "NeuralSpace",
                wordTimestamped: false,
                maxLineWidth: undefined,
                maxLineCount: undefined,
                maxWordsPerLine: undefined,
            },
        ],
        [
            "Gemini",
            {
                modelOption: "Gemini",
                wordTimestamped: false,
                maxLineWidth: undefined,
                maxLineCount: undefined,
                maxWordsPerLine: undefined,
            },
        ],
        [
            "MAI-Transcribe-1.5",
            {
                modelOption: "MAI-Transcribe-1.5",
                wordTimestamped: false,
                maxLineWidth: undefined,
                maxLineCount: undefined,
                maxWordsPerLine: undefined,
            },
        ],
        [
            "xAI",
            {
                modelOption: "xAI",
                wordTimestamped: false,
                maxLineWidth: undefined,
                maxLineCount: undefined,
                maxWordsPerLine: undefined,
            },
        ],
        [
            "xAI + Gemini",
            {
                modelOption: "xAI + Gemini",
                wordTimestamped: false,
                maxLineWidth: undefined,
                maxLineCount: undefined,
                maxWordsPerLine: undefined,
            },
        ],
    ])("submits phrase subtitles for %s", async (model, expected) => {
        await expect(
            submitSelection({ model, transcriptionType: "phraseLevel" }),
        ).resolves.toMatchObject({
            type: "transcribe",
            responseFormat: "vtt",
            ...expected,
        });
    });

    test.each([
        ["Whisper", "wordLevel", { wordTimestamped: true }],
        ["Whisper", "horizontal", { maxLineWidth: 35, maxLineCount: 1 }],
        ["Whisper", "vertical", { maxLineWidth: 25, maxLineCount: 1 }],
        [
            "Whisper",
            "wordsPerLine",
            { wordTimestamped: true, maxWordsPerLine: 2 },
        ],
        ["xAI", "wordLevel", { wordTimestamped: true }],
        ["xAI", "horizontal", { maxLineWidth: 35, maxLineCount: 1 }],
        ["xAI", "vertical", { maxLineWidth: 25, maxLineCount: 1 }],
        ["xAI", "wordsPerLine", { wordTimestamped: true, maxWordsPerLine: 2 }],
        ["xAI + Gemini", "wordLevel", { wordTimestamped: true }],
        ["xAI + Gemini", "horizontal", { maxLineWidth: 35, maxLineCount: 1 }],
        ["xAI + Gemini", "vertical", { maxLineWidth: 25, maxLineCount: 1 }],
        [
            "xAI + Gemini",
            "wordsPerLine",
            { wordTimestamped: true, maxWordsPerLine: 2 },
        ],
    ])(
        "submits %s %s subtitle options",
        async (model, transcriptionType, expected) => {
            const payload = await submitSelection({
                model,
                transcriptionType,
                wordsPerLine: 2,
            });

            expect(payload).toMatchObject({
                modelOption: model,
                responseFormat: "vtt",
                ...expected,
            });
        },
    );

    test.each([
        ["Gemini", "horizontal", { maxLineWidth: 35, maxLineCount: 1 }],
        ["Gemini", "vertical", { maxLineWidth: 25, maxLineCount: 1 }],
    ])(
        "submits %s %s subtitles without word timestamps",
        async (model, transcriptionType, expected) => {
            const payload = await submitSelection({ model, transcriptionType });

            expect(payload).toMatchObject({
                modelOption: model,
                responseFormat: "vtt",
                wordTimestamped: false,
                ...expected,
            });
        },
    );

    test("keeps MAI subtitles at phrase level", async () => {
        const payload = await submitSelection({
            model: "MAI-Transcribe-1.5",
            transcriptionType: "horizontal",
        });

        expect(payload).toMatchObject({
            modelOption: "MAI-Transcribe-1.5",
            responseFormat: "vtt",
            wordTimestamped: false,
            maxLineWidth: undefined,
            maxLineCount: undefined,
            maxWordsPerLine: undefined,
        });
    });

    test.each([
        ["Plain Text transcript", ""],
        ["Formatted Transcript", "formatted"],
        ["Subtitles", "vtt"],
    ])("submits output format %s", async (_label, format) => {
        const payload = await submitSelection({ model: "Whisper", format });

        expect(payload).toMatchObject({
            modelOption: "Whisper",
            responseFormat: format,
        });
    });

    test.each([
        ["Urdu", "ur"],
        ["Punjabi", "pa"],
        ["Hindi", "hi"],
    ])(
        "submits %s as the transcription language hint",
        async (_label, code) => {
            const payload = await submitSelection({
                model: "Whisper",
                language: code,
            });

            expect(payload).toMatchObject({
                type: "transcribe",
                language: code,
                modelOption: "Whisper",
            });
        },
    );

    test("persists the active video snapshot before queueing background transcription", async () => {
        renderTranscribeVideo();

        fireEvent.click(screen.getByRole("button", { name: /Transcribe/ }));

        await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

        expect(mockUpdateUserStateNow).toHaveBeenCalledTimes(1);
        expect(mockUpdateUserStateNow.mock.invocationCallOrder[0]).toBeLessThan(
            mockMutateAsync.mock.invocationCallOrder[0],
        );

        const stateUpdate = mockUpdateUserStateNow.mock.calls[0][0];
        expect(
            stateUpdate({
                transcribe: {
                    videoInformation: {
                        videoUrl: "https://example.com/audio.mp3",
                    },
                },
            }),
        ).toMatchObject({
            transcribe: {
                url: "https://example.com/audio.mp3",
                videoInformation: {
                    videoUrl: "https://example.com/audio.mp3",
                },
                transcripts: [],
            },
        });
    });
});
