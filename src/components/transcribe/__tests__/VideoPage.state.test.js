/**
 * @jest-environment jsdom
 */

import React, { useCallback, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import VideoPage from "../VideoPage";
import { AuthContext, ServerContext } from "../../../App";
import { LanguageContext } from "../../../contexts/LanguageProvider";

const mockAutoTranscribeState = {
    attemptedAutoTranscribe: true,
    isAutoTranscribing: false,
    markAttempted: jest.fn(),
    setIsAutoTranscribing: jest.fn(),
};
const mockRunTaskMutateAsync = jest.fn();
const mockRunTask = {
    mutateAsync: mockRunTaskMutateAsync,
};
const mockUseTask = jest.fn(() => ({
    data: null,
}));

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
        LanguageContext: React.createContext({
            direction: "ltr",
            language: "en",
        }),
    };
});

jest.mock("../../../contexts/AutoTranscribeContext", () => ({
    useAutoTranscribe: () => mockAutoTranscribeState,
}));

jest.mock("../../../contexts/NotificationContext", () => ({
    useNotificationsContext: () => ({
        openNotifications: jest.fn(),
    }),
}));

jest.mock("@apollo/client", () => ({
    useApolloClient: () => ({}),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("react-toastify", () => ({
    toast: {
        error: jest.fn(),
    },
}));

jest.mock("react-time-ago", () => ({
    __esModule: true,
    default: () => <span>Created recently</span>,
}));

jest.mock("../../../../app/components/loader", () => ({
    __esModule: true,
    default: () => <div>Loading</div>,
}));

jest.mock("../../../../app/queries/notifications", () => ({
    useRunTask: () => mockRunTask,
    useTask: (id) => mockUseTask(id),
}));

jest.mock("../AzureVideoTranslate", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../InitialView", () => ({
    __esModule: true,
    default: () => <div>Initial view</div>,
}));

jest.mock("../TaxonomySelector", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../TranscriptView", () => ({
    __esModule: true,
    default: () => <div>Transcript view</div>,
}));

jest.mock("../VideoInput", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../TranscriptionOptions", () => ({
    AddTrackButton: ({ trigger }) => trigger,
}));

jest.mock("../transcribeQueries", () => ({
    getAlternateTranscribeModelOption: () => "Gemini",
    getDefaultTranscribeModelOption: () => "Gemini",
}));

function StatefulAuthProvider({
    children,
    commandRef,
    initialTranscribe,
    refetchUserState = jest.fn(),
    updates,
}) {
    const [userState, setUserState] = useState({
        preferences: {},
        transcribe: initialTranscribe,
    });

    if (commandRef) {
        commandRef.current = { setUserState };
    }

    const updateUserState = useCallback(
        (value) => {
            updates.push(value);
            setUserState((previousState) => ({
                ...previousState,
                ...value,
            }));
        },
        [updates],
    );

    return (
        <AuthContext.Provider
            value={{
                debouncedUpdateUserState: updateUserState,
                refetchUserState,
                updateUserStateNow: updateUserState,
                userState,
            }}
        >
            <ServerContext.Provider
                value={{
                    transcribeAlternateModelOption: "Gemini",
                    transcribeDefaultModelOption: "Gemini",
                    xaiTranscribeDefaultEnabled: false,
                    xaiTranscribeEnabled: false,
                }}
            >
                <LanguageContext.Provider
                    value={{ direction: "ltr", language: "en" }}
                >
                    {children}
                </LanguageContext.Provider>
            </ServerContext.Provider>
        </AuthContext.Provider>
    );
}

describe("VideoPage saved state", () => {
    let consoleErrorSpy;

    beforeEach(() => {
        mockAutoTranscribeState.attemptedAutoTranscribe = true;
        mockAutoTranscribeState.isAutoTranscribing = false;
        mockAutoTranscribeState.markAttempted.mockClear();
        mockAutoTranscribeState.markAttempted.mockImplementation((value) => {
            mockAutoTranscribeState.attemptedAutoTranscribe = value;
        });
        mockAutoTranscribeState.setIsAutoTranscribing.mockClear();
        mockRunTaskMutateAsync.mockReset();
        mockUseTask.mockReturnValue({ data: null });
        consoleErrorSpy = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    test("restores a saved video without videoLanguages without an update loop", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const updates = [];

        render(
            <StatefulAuthProvider
                initialTranscribe={{
                    activeTranscript: 0,
                    transcripts: [],
                    url: videoUrl,
                    videoInformation: {
                        transcriptionUrl: null,
                        videoUrl,
                    },
                }}
                updates={updates}
            >
                <VideoPage />
            </StatefulAuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getByText("File Information")).toBeTruthy();
        });
        await waitFor(() => {
            expect(screen.getAllByText("Original").length).toBeGreaterThan(0);
        });

        expect(screen.queryByText("Oops! Something went wrong")).toBeNull();
        expect(updates.length).toBeLessThan(6);
        expect(
            updates.some(
                (update) =>
                    update.transcribe?.videoInformation?.videoLanguages?.[0]
                        ?.url === videoUrl,
            ),
        ).toBe(true);
        expect(
            consoleErrorSpy.mock.calls
                .flat()
                .join("\n")
                .includes("Maximum update depth exceeded"),
        ).toBe(false);
    });

    test("preserves saved translated language tracks for the same video", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const translatedUrl = "https://example.com/video-ar.mp4";
        const updates = [];

        render(
            <StatefulAuthProvider
                initialTranscribe={{
                    activeTranscript: 0,
                    transcripts: [],
                    url: videoUrl,
                    videoInformation: {
                        transcriptionUrl: null,
                        videoLanguages: [
                            {
                                code: "original",
                                label: "Original",
                                url: videoUrl,
                            },
                            {
                                code: "ar",
                                label: "Arabic",
                                url: translatedUrl,
                            },
                        ],
                        videoUrl,
                    },
                }}
                updates={updates}
            >
                <VideoPage />
            </StatefulAuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getAllByText("Original").length).toBeGreaterThan(0);
        });
        expect(screen.getByText("Arabic")).toBeTruthy();

        expect(
            updates.every((update) =>
                update.transcribe?.videoInformation?.videoLanguages
                    ? update.transcribe.videoInformation.videoLanguages.some(
                          (language) => language.url === translatedUrl,
                      )
                    : true,
            ),
        ).toBe(true);
    });

    test("drops stale language tracks when restored state switches to a different video", async () => {
        const firstVideoUrl = "https://example.com/first.mp4";
        const secondVideoUrl = "https://example.com/second.mp4";
        const translatedUrl = "https://example.com/first-ar.mp4";
        const updates = [];
        const commandRef = { current: null };

        render(
            <StatefulAuthProvider
                commandRef={commandRef}
                initialTranscribe={{
                    activeTranscript: 0,
                    transcripts: [],
                    url: firstVideoUrl,
                    videoInformation: {
                        transcriptionUrl: null,
                        videoLanguages: [
                            {
                                code: "original",
                                label: "Original",
                                url: firstVideoUrl,
                            },
                            {
                                code: "ar",
                                label: "Arabic",
                                url: translatedUrl,
                            },
                        ],
                        videoUrl: firstVideoUrl,
                    },
                }}
                updates={updates}
            >
                <VideoPage />
            </StatefulAuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getByText("Arabic")).toBeTruthy();
        });

        act(() => {
            commandRef.current.setUserState({
                preferences: {},
                transcribe: {
                    activeTranscript: 0,
                    transcripts: [],
                    url: secondVideoUrl,
                    videoInformation: {
                        transcriptionUrl: null,
                        videoUrl: secondVideoUrl,
                    },
                },
            });
        });

        await waitFor(() => {
            expect(screen.queryByText("Arabic")).toBeNull();
        });

        expect(
            updates.some((update) => {
                const languages =
                    update.transcribe?.videoInformation?.videoLanguages;
                return (
                    Array.isArray(languages) &&
                    languages.length === 1 &&
                    languages[0].url === secondVideoUrl
                );
            }),
        ).toBe(true);
    });

    test("leaves completed transcription refresh to the global notification handler", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const updates = [];
        const refetchUserState = jest.fn();

        mockAutoTranscribeState.attemptedAutoTranscribe = false;
        mockRunTaskMutateAsync.mockResolvedValue({ taskId: "task-complete" });
        mockUseTask.mockImplementation((id) => ({
            data:
                id === "task-complete"
                    ? {
                          _id: "task-complete",
                          inboxKind: "task",
                          status: "completed",
                          type: "transcribe",
                      }
                    : null,
        }));

        render(
            <StatefulAuthProvider
                initialTranscribe={{
                    activeTranscript: 0,
                    transcripts: [],
                    url: videoUrl,
                    videoInformation: {
                        transcriptionUrl: null,
                        videoUrl,
                    },
                }}
                refetchUserState={refetchUserState}
                updates={updates}
            >
                <VideoPage />
            </StatefulAuthProvider>,
        );

        await waitFor(() => {
            expect(mockRunTaskMutateAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: "video_page",
                    type: "transcribe",
                    url: videoUrl,
                }),
            );
        });
        await waitFor(() => {
            expect(mockUseTask).toHaveBeenCalledWith("task-complete");
        });

        expect(refetchUserState).not.toHaveBeenCalled();
        expect(
            mockAutoTranscribeState.setIsAutoTranscribing,
        ).toHaveBeenCalledWith(true);
        expect(
            mockAutoTranscribeState.setIsAutoTranscribing,
        ).not.toHaveBeenCalledWith(false);
    });

    test("clears transcription pending state after refreshed transcripts land", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const updates = [];
        const commandRef = { current: null };

        render(
            <StatefulAuthProvider
                commandRef={commandRef}
                initialTranscribe={{
                    activeTranscript: 0,
                    transcripts: [],
                    url: videoUrl,
                    videoInformation: {
                        transcriptionUrl: null,
                        videoUrl,
                    },
                }}
                updates={updates}
            >
                <VideoPage />
            </StatefulAuthProvider>,
        );

        act(() => {
            commandRef.current.setUserState({
                preferences: {},
                transcribe: {
                    activeTranscript: 0,
                    transcripts: [
                        {
                            format: "text",
                            name: "Transcript 1",
                            text: "Hello",
                        },
                    ],
                    url: videoUrl,
                    videoInformation: {
                        transcriptionUrl: null,
                        videoUrl,
                    },
                },
            });
        });

        await waitFor(() => {
            expect(
                mockAutoTranscribeState.setIsAutoTranscribing,
            ).toHaveBeenCalledWith(false);
        });
    });
});
