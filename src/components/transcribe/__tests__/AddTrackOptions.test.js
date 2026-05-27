import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AuthContext, ServerContext } from "../../../App";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import TranscribeVideo from "../AddTrackOptions";

const mockMutateAsync = jest.fn(async () => ({ taskId: "task-1" }));

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

const renderTranscribeVideo = () =>
    render(
        <AuthContext.Provider value={{ debouncedUpdateUserState: jest.fn() }}>
            <ServerContext.Provider
                value={{
                    neuralspaceEnabled: true,
                    xaiTranscribeEnabled: true,
                    xaiTranscribeDefaultEnabled: false,
                }}
            >
                <LanguageContext.Provider value={{ direction: "ltr" }}>
                    <TranscribeVideo
                        url="https://example.com/audio.mp3"
                        onClose={jest.fn()}
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
}) => {
    renderTranscribeVideo();

    const [modelSelect, formatSelect, transcriptionTypeSelect] =
        screen.getAllByRole("combobox");

    fireEvent.change(modelSelect, { target: { value: model } });
    fireEvent.change(formatSelect, { target: { value: format } });

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
        "submits Gemini %s subtitles without word timestamps",
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
});
