"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

function getDuration(audio) {
    return Number.isFinite(audio?.duration) ? audio.duration : 0;
}

function getCurrentTime(audio) {
    return Number.isFinite(audio?.currentTime) ? audio.currentTime : 0;
}

export default function SyncedAudioControl({
    mediaId,
    src,
    surface,
    playback,
    onPlaybackChange,
    className,
    ariaLabel,
    onError,
    audioRef: externalAudioRef,
    ignorePauseRef,
}) {
    const audioRef = useRef(null);
    const suppressNextPauseRef = useRef(false);
    const isActive = playback?.activeSurface
        ? playback.activeSurface === surface
        : surface === "tile";
    const setAudioRef = useCallback(
        (node) => {
            audioRef.current = node;
            if (typeof externalAudioRef === "function") {
                externalAudioRef(node);
            } else if (externalAudioRef) {
                externalAudioRef.current = node;
            }
        },
        [externalAudioRef],
    );

    useLayoutEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const targetTime = playback?.currentTime;
        if (
            Number.isFinite(targetTime) &&
            Math.abs(getCurrentTime(audio) - targetTime) > 0.75
        ) {
            const maxTime = getDuration(audio) || targetTime;
            audio.currentTime = Math.max(0, Math.min(targetTime, maxTime));
        }

        if (!isActive || !playback?.playing) {
            if (!audio.paused) {
                suppressNextPauseRef.current = true;
                audio.pause();
            }
            return;
        }

        if (audio.paused) {
            const playPromise = audio.play();
            if (playPromise?.catch) {
                playPromise.catch(() => {
                    onPlaybackChange?.(mediaId, {
                        playing: false,
                        activeSurface: surface,
                        currentTime: getCurrentTime(audio),
                        duration: getDuration(audio),
                    });
                });
            }
        }
    }, [
        isActive,
        mediaId,
        onPlaybackChange,
        playback?.activeSurface,
        playback?.currentTime,
        playback?.playing,
        playback?.updatedAt,
        surface,
    ]);

    const publishState = (patch = {}, options) => {
        const audio = audioRef.current;
        if (!audio || !mediaId) return;
        onPlaybackChange?.(
            mediaId,
            {
                currentTime: getCurrentTime(audio),
                duration: getDuration(audio),
                ...patch,
            },
            options,
        );
    };

    return (
        <audio
            ref={setAudioRef}
            className={className}
            src={src}
            controls
            autoPlay={Boolean(isActive && playback?.playing)}
            preload="metadata"
            aria-label={ariaLabel}
            onLoadedMetadata={() => {
                const targetTime = playback?.currentTime;
                if (Number.isFinite(targetTime)) {
                    audioRef.current.currentTime = Math.max(
                        0,
                        Math.min(targetTime, getDuration(audioRef.current)),
                    );
                }
                publishState({ playing: playback?.playing || false });
            }}
            onPlay={() =>
                publishState({
                    playing: true,
                    activeSurface: surface,
                })
            }
            onPause={() => {
                if (ignorePauseRef?.current) {
                    return;
                }
                if (suppressNextPauseRef.current) {
                    suppressNextPauseRef.current = false;
                    return;
                }
                if (
                    playback?.playing &&
                    playback?.activeSurface &&
                    playback.activeSurface !== surface
                ) {
                    return;
                }
                publishState({ playing: false, activeSurface: surface });
            }}
            onTimeUpdate={() => {
                if (isActive)
                    publishState(
                        { playing: !audioRef.current.paused },
                        { silent: true },
                    );
            }}
            onSeeked={() =>
                publishState({
                    playing: !audioRef.current.paused,
                    activeSurface: surface,
                })
            }
            onEnded={() =>
                publishState({
                    playing: false,
                    activeSurface: surface,
                    currentTime: 0,
                })
            }
            onError={onError}
        />
    );
}
