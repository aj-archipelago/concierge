import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import TranslationOptions from "../TranslationOptions";

const mockMutateAsync = jest.fn(async () => ({ taskId: "task-1" }));
const mockOpenNotifications = jest.fn();
const mockOnClose = jest.fn();

jest.mock("../../../../app/queries/notifications", () => ({
    useRunTask: () => ({ mutateAsync: mockMutateAsync }),
}));

jest.mock("../../../contexts/NotificationContext", () => ({
    useNotificationsContext: () => ({
        openNotifications: mockOpenNotifications,
    }),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, params) => {
            if (key === "{{name}}: {{language}} Translation") {
                return `${params.name}: ${params.language} Translation`;
            }
            const translations = {
                "Roman Urdu": "الأردية بالحروف اللاتينية",
                Punjabi: "البنجابية",
                Hindi: "الهندية",
            };
            if (translations[key]) {
                return translations[key];
            }
            return key;
        },
    }),
}));

const transcripts = [
    {
        name: "English subtitles",
        text: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello",
        format: "vtt",
        timestamp: "2026-01-01T00:00:00.000Z",
    },
];

describe("TranslationOptions", () => {
    beforeEach(() => {
        mockMutateAsync.mockClear();
        mockOpenNotifications.mockClear();
        mockOnClose.mockClear();
    });

    test.each([
        ["Roman Urdu", "الأردية بالحروف اللاتينية"],
        ["Punjabi", "البنجابية"],
        ["Hindi", "الهندية"],
    ])(
        "submits %s as a subtitle translation target",
        async (language, localizedLanguage) => {
            render(
                <TranslationOptions
                    transcripts={transcripts}
                    activeTranscript={0}
                    onClose={mockOnClose}
                />,
            );

            fireEvent.change(screen.getByDisplayValue("Arabic"), {
                target: { value: language },
            });
            fireEvent.click(screen.getByRole("button", { name: /Translate/ }));

            await waitFor(() =>
                expect(mockMutateAsync).toHaveBeenCalledTimes(1),
            );

            expect(mockMutateAsync).toHaveBeenCalledWith({
                type: "subtitle-translate",
                text: transcripts[0].text,
                to: language,
                format: "vtt",
                name: `English subtitles: ${localizedLanguage} Translation`,
                source: "video_page",
            });
            expect(mockOpenNotifications).toHaveBeenCalledTimes(1);
            expect(mockOnClose).toHaveBeenCalledTimes(1);
        },
    );
});
