import { fireEvent, render, screen } from "@testing-library/react";
import SyncedAudioControl from "../SyncedAudioControl";

function mockAudioElement(
    audio,
    { currentTime = 0, duration = 30, paused = true } = {},
) {
    const state = { currentTime, duration, paused };

    Object.defineProperty(audio, "currentTime", {
        configurable: true,
        get: () => state.currentTime,
        set: (value) => {
            state.currentTime = value;
        },
    });
    Object.defineProperty(audio, "duration", {
        configurable: true,
        get: () => state.duration,
    });
    Object.defineProperty(audio, "paused", {
        configurable: true,
        get: () => state.paused,
    });

    audio.play = jest.fn(() => {
        state.paused = false;
        return Promise.resolve();
    });
    audio.pause = jest.fn(() => {
        state.paused = true;
    });

    return state;
}

describe("SyncedAudioControl", () => {
    test("moves active playback to the requested timestamp and starts playback", () => {
        const onPlaybackChange = jest.fn();
        const { rerender } = render(
            <SyncedAudioControl
                mediaId="audio-1"
                src="/clip.mp3"
                surface="modal"
                playback={{
                    activeSurface: "modal",
                    currentTime: 0,
                    playing: false,
                }}
                onPlaybackChange={onPlaybackChange}
                ariaLabel="Play generated audio"
            />,
        );

        const audio = screen.getByLabelText("Play generated audio");
        mockAudioElement(audio, { currentTime: 0, duration: 30 });

        rerender(
            <SyncedAudioControl
                mediaId="audio-1"
                src="/clip.mp3"
                surface="modal"
                playback={{
                    activeSurface: "modal",
                    currentTime: 8,
                    playing: true,
                    updatedAt: 1,
                }}
                onPlaybackChange={onPlaybackChange}
                ariaLabel="Play generated audio"
            />,
        );

        expect(audio.currentTime).toBe(8);
        expect(audio.play).toHaveBeenCalledTimes(1);
    });

    test("time updates publish silently to avoid parent re-render churn", () => {
        const onPlaybackChange = jest.fn();
        render(
            <SyncedAudioControl
                mediaId="audio-1"
                src="/clip.mp3"
                surface="tile"
                playback={{
                    activeSurface: "tile",
                    currentTime: 4,
                    playing: false,
                }}
                onPlaybackChange={onPlaybackChange}
                ariaLabel="Play generated audio"
            />,
        );

        const audio = screen.getByLabelText("Play generated audio");
        mockAudioElement(audio, {
            currentTime: 12,
            duration: 30,
            paused: false,
        });

        fireEvent.timeUpdate(audio);

        expect(onPlaybackChange).toHaveBeenCalledWith(
            "audio-1",
            expect.objectContaining({
                currentTime: 12,
                duration: 30,
                playing: true,
            }),
            { silent: true },
        );
    });

    test("internal surface handoff pause does not publish a user pause", () => {
        const onPlaybackChange = jest.fn();
        const { rerender } = render(
            <SyncedAudioControl
                mediaId="audio-1"
                src="/clip.mp3"
                surface="tile"
                playback={{
                    activeSurface: "tile",
                    currentTime: 4,
                    playing: false,
                }}
                onPlaybackChange={onPlaybackChange}
                ariaLabel="Play generated audio"
            />,
        );

        const audio = screen.getByLabelText("Play generated audio");
        mockAudioElement(audio, {
            currentTime: 4,
            duration: 30,
            paused: false,
        });

        rerender(
            <SyncedAudioControl
                mediaId="audio-1"
                src="/clip.mp3"
                surface="tile"
                playback={{
                    activeSurface: "modal",
                    currentTime: 4,
                    playing: true,
                    updatedAt: 2,
                }}
                onPlaybackChange={onPlaybackChange}
                ariaLabel="Play generated audio"
            />,
        );

        fireEvent.pause(audio);

        expect(audio.pause).toHaveBeenCalledTimes(1);
        expect(onPlaybackChange).not.toHaveBeenCalledWith(
            "audio-1",
            expect.objectContaining({ playing: false }),
            expect.anything(),
        );
    });
});
