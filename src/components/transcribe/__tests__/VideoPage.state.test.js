/**
 * @jest-environment jsdom
 */

import React, { useCallback, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import VideoPage, { getLiveOverlayTextAtTime } from "../VideoPage";
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
let mockRealtimeAudioLiveControlsProps = null;
let mockTranscriptViewProps = null;

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

jest.mock("../RealtimeAudioLiveControls", () => ({
    __esModule: true,
    default: (props) => {
        mockRealtimeAudioLiveControlsProps = props;
        return <div>Realtime audio live controls</div>;
    },
}));

jest.mock("../TaxonomySelector", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../TranscriptView", () => ({
    __esModule: true,
    default: (props) => {
        mockTranscriptViewProps = props;
        return <div>Transcript view</div>;
    },
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
        mockRealtimeAudioLiveControlsProps = null;
        mockTranscriptViewProps = null;
        URL.createObjectURL = jest.fn(() => "blob:mock-vtt");
        URL.revokeObjectURL = jest.fn();
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
            <>
                <video data-testid="unrelated-video" />
                <StatefulAuthProvider
                    initialTranscribe={{
                        activeTranscript: 0,
                        transcripts: [{ format: "txt", text: "caption" }],
                        url: videoUrl,
                        videoInformation: {
                            transcriptionUrl: null,
                            videoUrl,
                        },
                    }}
                    updates={updates}
                >
                    <VideoPage />
                </StatefulAuthProvider>
            </>,
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

        act(() => mockTranscriptViewProps.onSeek(15.678));
        expect(
            mockRealtimeAudioLiveControlsProps.mediaElementRef.current
                .currentTime,
        ).toBe(15.678);
        expect(screen.getByTestId("unrelated-video").currentTime).toBe(0);
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

    test("locks audio-track changes while a live session is active", async () => {
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
                        videoLanguages: [
                            {
                                code: "original",
                                label: "Original",
                                url: videoUrl,
                            },
                            {
                                code: "ar",
                                label: "Arabic",
                                url: "https://example.com/video-ar.mp4",
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
            expect(screen.getByRole("button", { name: "Arabic" })).toBeTruthy();
        });
        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveSessionActiveChange(true);
        });

        expect(screen.getByRole("button", { name: "Arabic" }).disabled).toBe(
            true,
        );
        expect(
            screen.getByRole("button", { name: "Add audio track" }).disabled,
        ).toBe(true);

        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveTrackUpdate(
                {
                    format: "vtt",
                    isLive: true,
                    liveTrackId: "live-track-lock",
                    name: "Live captions",
                    text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nlive words",
                },
                { activate: true },
            );
        });
        act(() => {
            mockRealtimeAudioLiveControlsProps.onClearLiveTrack(
                "live-track-lock",
            );
        });
        expect(screen.getByRole("button", { name: "Arabic" }).disabled).toBe(
            true,
        );

        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveSessionActiveChange(false);
        });
        expect(screen.getByRole("button", { name: "Arabic" }).disabled).toBe(
            false,
        );
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

    test("clears stopped live subtitles from the player without deleting the transcript", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const updates = [];

        render(
            <StatefulAuthProvider
                initialTranscribe={{
                    activeTranscript: 1,
                    transcripts: [
                        {
                            format: "text",
                            name: "Existing transcript",
                            text: "saved text",
                        },
                        {
                            format: "vtt",
                            isLive: true,
                            liveTrackId: "live-track-1",
                            name: "Live captions",
                            previewText: "live words",
                            showOnVideo: true,
                            text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nlive words",
                        },
                    ],
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
            expect(mockRealtimeAudioLiveControlsProps.activeLiveTrackId).toBe(
                "live-track-1",
            );
        });
        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveSessionActiveChange(true);
            mockRealtimeAudioLiveControlsProps.onLiveTrackUpdate({
                format: "vtt",
                isLive: true,
                liveTrackId: "live-track-1",
                name: "Live captions",
                previewText: "live words",
                showOnVideo: true,
                text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nlive words",
            });
        });
        await waitFor(() => {
            expect(screen.getByText("live words")).toBeTruthy();
        });
        // eslint-disable-next-line testing-library/no-node-access
        expect(document.querySelector("track")).toBeNull();

        act(() => {
            mockRealtimeAudioLiveControlsProps.onClearLiveTrack("live-track-1");
        });

        await waitFor(() => {
            expect(screen.queryByText("live words")).toBeNull();
        });
        expect(screen.getAllByText("Live captions").length).toBeGreaterThan(0);
        expect(screen.getByText("Transcript view")).toBeTruthy();
    });

    test("ignores late live-track updates after Start over", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const updates = [];
        jest.spyOn(window, "confirm").mockReturnValue(true);

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
            expect(mockRealtimeAudioLiveControlsProps).toBeTruthy();
        });
        const lateLiveUpdate =
            mockRealtimeAudioLiveControlsProps.onLiveTrackUpdate;

        act(() => {
            screen.getByRole("button", { name: "Start over" }).click();
        });
        act(() => {
            lateLiveUpdate(
                {
                    format: "vtt",
                    isLive: false,
                    liveTrackId: "stale-live-track",
                    name: "Live captions",
                    previewText: "stale words",
                    text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nstale words",
                },
                { activate: true },
            );
        });

        await waitFor(() => {
            expect(screen.getByText("Initial view")).toBeTruthy();
        });
        expect(screen.queryByText("stale words")).toBeNull();
        expect(updates.at(-1)?.transcribe?.transcripts).toEqual([]);
    });

    test("restores interrupted live tracks as completed tracks", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const updates = [];

        render(
            <StatefulAuthProvider
                initialTranscribe={{
                    activeTranscript: 0,
                    transcripts: [
                        {
                            format: "vtt",
                            isLive: true,
                            liveStatus: "live",
                            liveTrackId: "interrupted-live-track",
                            name: "Live captions",
                            text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nsaved words",
                        },
                    ],
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
            expect(mockRealtimeAudioLiveControlsProps.activeLiveTrackId).toBe(
                "interrupted-live-track",
            );
        });
        expect(screen.queryByText("saved words")).toBeNull();
        // eslint-disable-next-line testing-library/no-node-access
        expect(document.querySelector("track")).toBeTruthy();
    });

    test("suppresses stale player subtitles while a new live session is preparing", async () => {
        const videoUrl = "https://example.com/video.mp4";
        const updates = [];

        render(
            <StatefulAuthProvider
                initialTranscribe={{
                    activeTranscript: 0,
                    transcripts: [
                        {
                            format: "vtt",
                            name: "Offline captions",
                            text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\noffline words",
                        },
                    ],
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
            // eslint-disable-next-line testing-library/no-node-access
            expect(document.querySelector("track")).toBeTruthy();
        });

        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveSessionActiveChange(true);
        });

        // eslint-disable-next-line testing-library/no-node-access
        expect(document.querySelector("track")).toBeNull();

        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveTrackUpdate(
                {
                    format: "vtt",
                    isLive: true,
                    liveTrackId: "live-track-2",
                    name: "Live captions",
                    previewText: "live words",
                    showOnVideo: true,
                    text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nlive words",
                },
                { activate: true },
            );
        });

        await waitFor(() => {
            expect(mockRealtimeAudioLiveControlsProps.activeLiveTrackId).toBe(
                "live-track-2",
            );
        });
        await waitFor(() => {
            // eslint-disable-next-line testing-library/no-node-access
            expect(document.querySelector("track")).toBeNull();
        });
        expect(screen.getByText("live words")).toBeTruthy();
    });

    test("keeps native subtitle track suppressed while live VTT text changes", async () => {
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

        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveSessionActiveChange(true);
            mockRealtimeAudioLiveControlsProps.onLiveTrackUpdate(
                {
                    format: "vtt",
                    isLive: true,
                    liveTrackId: "live-track-revision",
                    name: "Live captions",
                    previewText: "live words",
                    showOnVideo: true,
                    text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nlive words",
                },
                { activate: true },
            );
        });

        await waitFor(() => {
            // eslint-disable-next-line testing-library/no-node-access
            expect(document.querySelector("track")).toBeNull();
        });

        act(() => {
            mockRealtimeAudioLiveControlsProps.onLiveTrackUpdate({
                format: "vtt",
                isLive: true,
                liveTrackId: "live-track-revision",
                name: "Live captions",
                previewText: "newer live words",
                showOnVideo: true,
                text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nnewer live words",
            });
        });

        await waitFor(() => {
            // eslint-disable-next-line testing-library/no-node-access
            expect(document.querySelector("track")).toBeNull();
        });
        expect(screen.getByText("newer live words")).toBeTruthy();
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

describe("VideoPage live overlay timing", () => {
    test("shows only the active live VTT cue instead of accumulated preview text", () => {
        const liveTrack = {
            isLive: true,
            previewText: "first cue second cue third cue",
            showOnVideo: true,
            text: [
                "WEBVTT",
                "",
                "1",
                "00:00:00.000 --> 00:00:02.000",
                "first cue",
                "",
                "2",
                "00:00:02.000 --> 00:00:04.000",
                "second cue",
                "",
                "3",
                "00:00:04.000 --> 00:00:06.000",
                "third cue",
            ].join("\n"),
        };

        expect(getLiveOverlayTextAtTime(liveTrack, 2.5)).toBe("second cue");
        expect(getLiveOverlayTextAtTime(liveTrack, 5.5)).toBe("third cue");
    });

    test("keeps the most recent live cue briefly while it is still being updated", () => {
        const liveTrack = {
            isLive: true,
            previewText: "latest live cue",
            showOnVideo: true,
            text: [
                "WEBVTT",
                "",
                "1",
                "00:00:10.000 --> 00:00:11.000",
                "latest live cue",
            ].join("\n"),
        };

        expect(getLiveOverlayTextAtTime(liveTrack, 12)).toBe("latest live cue");
        expect(getLiveOverlayTextAtTime(liveTrack, 14)).toBe("");
    });
});
