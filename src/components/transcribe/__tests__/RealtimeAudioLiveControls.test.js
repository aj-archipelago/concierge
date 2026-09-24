import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import RealtimeAudioLiveControls, {
    appendRealtimeText,
    buildLiveVtt,
    createLiveTranscriptState,
    formatLiveVttTimestamp,
} from "../RealtimeAudioLiveControls";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../../contexts/LanguageProvider", () => {
    const React = jest.requireActual("react");
    return {
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

const realtimeAudio = {
    enabled: true,
    capabilities: {
        transcribe: true,
        translate: true,
    },
};

function createMediaElement() {
    const mediaElement = document.createElement("video");
    const streams = [];
    let paused = false;
    let ended = false;

    Object.defineProperty(mediaElement, "paused", {
        configurable: true,
        get: () => paused,
    });
    Object.defineProperty(mediaElement, "ended", {
        configurable: true,
        get: () => ended,
    });
    Object.defineProperty(mediaElement, "muted", {
        configurable: true,
        writable: true,
        value: false,
    });

    mediaElement.play = jest.fn(async () => {
        paused = false;
        mediaElement.dispatchEvent(new Event("play"));
    });
    mediaElement.pause = jest.fn(() => {
        paused = true;
        mediaElement.dispatchEvent(new Event("pause"));
    });
    mediaElement.setPaused = (value) => {
        paused = value;
    };
    mediaElement.setEnded = (value) => {
        ended = value;
    };
    mediaElement.captureStream = jest.fn(() => {
        const audioTrack = {
            enabled: true,
            stop: jest.fn(),
        };
        const stream = {
            audioTrack,
            getAudioTracks: jest.fn(() => [audioTrack]),
            getTracks: jest.fn(() => [audioTrack]),
        };
        streams.push(stream);
        return stream;
    });
    mediaElement.streams = streams;

    return mediaElement;
}

function renderLiveControls(mediaElement, props = {}) {
    return render(
        <LanguageContext.Provider value={{ direction: "ltr" }}>
            <RealtimeAudioLiveControls
                mediaElementRef={{ current: mediaElement }}
                realtimeAudio={realtimeAudio}
                {...props}
            />
        </LanguageContext.Provider>,
    );
}

function mockTranslationTransport({
    contextStateImplementation,
    resumeImplementation,
} = {}) {
    const originalWebSocket = global.WebSocket;
    const originalAudioContext = window.AudioContext;
    const originalFetch = global.fetch;

    class MockWebSocket extends EventTarget {
        static CONNECTING = 0;

        static OPEN = 1;

        static CLOSED = 3;

        static instances = [];

        constructor(url) {
            super();
            this.url = url;
            this.readyState = MockWebSocket.CONNECTING;
            this.bufferedAmount = 0;
            this.send = jest.fn();
            this.close = jest.fn(() => {
                this.readyState = MockWebSocket.CLOSED;
                this.dispatchEvent(new Event("close"));
            });
            MockWebSocket.instances.push(this);
        }

        open() {
            this.readyState = MockWebSocket.OPEN;
            this.dispatchEvent(new Event("open"));
        }
    }

    const createConnectableNode = () => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
    });

    class MockAudioContext {
        static instances = [];

        constructor() {
            this.destination = {};
            this.sampleRate = 48000;
            this.state =
                contextStateImplementation?.(
                    MockAudioContext.instances.length,
                ) || "running";
            this.currentTime = 0;
            this.resume = jest.fn(
                () => resumeImplementation?.call(this) ?? Promise.resolve(),
            );
            MockAudioContext.instances.push(this);
        }

        close = jest.fn(async () => {});

        createMediaStreamSource = jest.fn(createConnectableNode);

        createScriptProcessor = jest.fn(createConnectableNode);

        createGain = jest.fn(() => ({
            ...createConnectableNode(),
            gain: { value: 1 },
        }));

        createBuffer = jest.fn(() => ({
            copyToChannel: jest.fn(),
            duration: 0.1,
        }));

        createBufferSource = jest.fn(() => ({
            ...createConnectableNode(),
            start: jest.fn(),
        }));
    }

    global.WebSocket = MockWebSocket;
    window.AudioContext = MockAudioContext;
    global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
            brokerUrl: "ws://broker.test/realtime-audio/translate",
            brokerToken: "broker-token",
            targetLanguage: "ar",
        }),
    }));

    return {
        MockAudioContext,
        MockWebSocket,
        restore() {
            global.WebSocket = originalWebSocket;
            window.AudioContext = originalAudioContext;
            global.fetch = originalFetch;
        },
    };
}

function markTranslationBrokerReady(transport) {
    const websocket = transport.MockWebSocket.instances.at(-1);
    act(() => {
        websocket.open();
        websocket.dispatchEvent(
            new MessageEvent("message", {
                data: JSON.stringify({ type: "broker.ready" }),
            }),
        );
    });
}

function mockWebRtcTransport({ setRemoteDescriptionImplementation } = {}) {
    const originalRTCPeerConnection = global.RTCPeerConnection;
    const originalWindowRTCPeerConnection = window.RTCPeerConnection;

    class MockDataChannel extends EventTarget {
        close = jest.fn();
    }
    const dataChannel = new MockDataChannel();

    class MockRTCPeerConnection {
        static instances = [];

        constructor() {
            this.connectionState = "new";
            MockRTCPeerConnection.instances.push(this);
        }

        addTrack = jest.fn();

        close = jest.fn();

        createDataChannel = jest.fn(() => dataChannel);

        createOffer = jest.fn(async () => ({ sdp: "offer-sdp" }));

        setLocalDescription = jest.fn(async () => {});

        setRemoteDescription = jest.fn(
            (...args) =>
                setRemoteDescriptionImplementation?.(...args) ??
                Promise.resolve(),
        );
    }

    global.RTCPeerConnection = MockRTCPeerConnection;
    window.RTCPeerConnection = MockRTCPeerConnection;
    global.fetch = jest.fn(async (url) => {
        if (url === "https://realtime.test/calls") {
            return {
                ok: true,
                text: async () => "answer-sdp",
            };
        }

        return {
            ok: true,
            json: async () => ({
                callsUrl: "https://realtime.test/calls",
                value: "session-token",
            }),
        };
    });

    return {
        MockRTCPeerConnection,
        dataChannel,
        restore() {
            global.RTCPeerConnection = originalRTCPeerConnection;
            window.RTCPeerConnection = originalWindowRTCPeerConnection;
        },
    };
}

beforeEach(() => {
    global.fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe("RealtimeAudioLiveControls transcript helpers", () => {
    it("formats live VTT timestamps", () => {
        expect(formatLiveVttTimestamp(0)).toBe("00:00:00.000");
        expect(formatLiveVttTimestamp(65.432)).toBe("00:01:05.432");
        expect(formatLiveVttTimestamp(3661.2)).toBe("01:01:01.200");
    });

    it("builds VTT cues from realtime deltas with media timestamps", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        appendRealtimeText({
            ref,
            setText,
            itemId: "source:item-1",
            delta: "hel",
            currentTime: 3.2,
        });
        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "source:item-1",
            completedText: "hello world",
            currentTime: 4.1,
        });

        expect(snapshot.text).toBe("hello world");
        expect(snapshot.previewText).toBe("hello world");
        expect(snapshot.vtt).toContain("WEBVTT");
        expect(snapshot.vtt).toContain("00:00:02.200 --> 00:00:04.100");
        expect(snapshot.vtt).toContain("hello world");
    });

    it("compensates fallback live timestamps for provider transcript latency", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "source:item-1",
            completedText: "first live words",
            currentTime: 0.993,
        });

        expect(snapshot.vtt).toContain("00:00:00.000 --> 00:00:01.000");
    });

    it("creates sequential fallback cues when events do not include item ids", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        appendRealtimeText({
            ref,
            setText,
            delta: "first",
            currentTime: 1,
        });
        appendRealtimeText({
            ref,
            setText,
            completedText: "first cue",
            currentTime: 1.5,
        });
        const snapshot = appendRealtimeText({
            ref,
            setText,
            delta: "second cue",
            currentTime: 3,
        });

        expect(snapshot.text).toBe("first cue\nsecond cue");
        expect(buildLiveVtt(Array.from(ref.current.items.values()))).toContain(
            "2\n00:00:02.000 --> 00:00:03.000\nsecond cue",
        );
    });

    it("repairs common live translation spacing glitches", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "target:item-1",
            completedText:
                "Belki de biliyorsunuz,VS Code’daalt tuşuna veya command tuşuna basılı tutupbir metoda tıkladığınızda,Bu işlem aynıdır.",
            currentTime: 8,
        });

        expect(snapshot.text).toContain("biliyorsunuz, VS Code’da alt");
        expect(snapshot.text).toContain("basılı tutup bir metoda");
        expect(snapshot.text).toContain("tıkladığınızda, Bu işlem");
        expect(snapshot.vtt).toContain("biliyorsunuz, VS Code’da alt");
    });

    it("does not split valid words while repairing live spacing", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "target:item-1",
            completedText:
                "The profile can improve with an alternative workflow.",
            currentTime: 2,
        });

        expect(snapshot.text).toContain("profile");
        expect(snapshot.text).toContain("improve");
        expect(snapshot.text).toContain("alternative");
        expect(snapshot.text).not.toContain("prof ile");
        expect(snapshot.text).not.toContain("impro ve");
        expect(snapshot.text).not.toContain("alternati ve");
    });

    it("repairs missing spaces between Latin terms and RTL scripts", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "target:item-1",
            completedText:
                "قد تعلم أنه في VS Code، إذا ضغطت باستمرار على Altأو עלCommand ثم تابعت.",
            currentTime: 2,
        });

        expect(snapshot.text).toContain("Alt أو");
        expect(snapshot.text).toContain("על Command");
        expect(snapshot.vtt).toContain("Alt أو");
    });

    it("uses provider timing fields when building live VTT cues", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "source:item-1",
            completedText: "provider timed cue",
            event: { start_ms: 1200, end_ms: 2800 },
            currentTime: 9,
        });

        expect(snapshot.vtt).toContain("00:00:01.200 --> 00:00:02.800");
    });

    it("anchors provider timing fields to the live session media offset", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "source:item-1",
            completedText: "provider timed cue",
            event: { start_ms: 1200, end_ms: 2800 },
            currentTime: 26,
            sessionMediaTimeOffset: 24,
        });

        expect(snapshot.vtt).toContain("00:00:25.200 --> 00:00:26.800");
    });

    it("updates delta-created cues when completion events include provider timing", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        appendRealtimeText({
            ref,
            setText,
            itemId: "source:item-1",
            delta: "provider",
            currentTime: 9,
        });
        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "source:item-1",
            completedText: "provider timed cue",
            event: { start_ms: 1200, end_ms: 2800 },
            currentTime: 10,
        });

        expect(snapshot.vtt).toContain("00:00:01.200 --> 00:00:02.800");
        expect(snapshot.vtt).not.toContain("00:00:09.000");
    });

    it("splits long live cues into multiple timestamped VTT cues", () => {
        const ref = { current: createLiveTranscriptState() };
        const setText = jest.fn();

        const snapshot = appendRealtimeText({
            ref,
            setText,
            itemId: "target:item-1",
            completedText:
                "Belki de biliyorsunuz, VS Code’da alt tuşuna veya command tuşuna basılı tutup bir metoda tıkladığınızda, Bu, Tanıma Git işlemiyle aynıdır, ve tanımın üstünde yaparsanız, Tüm Referansları Bul işlemiyle aynıdır. Ama bilmeyebileceğiniz şey, bunu return ifadelerinin olduğu çok uzun fonksiyonlarda yapabiliyor olmanızdır.",
            currentTime: 24,
        });

        const cueCount = snapshot.vtt.split("-->").length - 1;
        expect(cueCount).toBeGreaterThan(1);
        expect(snapshot.vtt).toContain("2\n");
        expect(snapshot.vtt).toContain("3\n");
    });
});

describe("RealtimeAudioLiveControls media edge cases", () => {
    it("shows target language for live audio without unsupported latency controls", () => {
        const mediaElement = createMediaElement();
        renderLiveControls(mediaElement);

        fireEvent.click(screen.getByRole("button", { name: /Audio/ }));

        expect(screen.getByLabelText("Target language")).toBeTruthy();
        expect(screen.queryByLabelText("Latency")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));

        expect(screen.getByLabelText("Target language")).toBeTruthy();
        expect(screen.queryByLabelText("Latency")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /Captions/ }));

        expect(screen.getByLabelText("Source language")).toBeTruthy();
        expect(screen.getByLabelText("Latency")).toBeTruthy();
    });

    it("syncs the live playback button with the video player", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });

            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });

            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
            expect(mediaElement.pause).toHaveBeenCalledTimes(2);
            expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();

            mediaElement.setPaused(false);
            fireEvent(mediaElement, new Event("play"));
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            mediaElement.setPaused(true);
            fireEvent(mediaElement, new Event("pause"));
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Play$/ }),
                ).toBeTruthy();
            });

            mediaElement.setPaused(false);
            fireEvent(mediaElement, new Event("play"));
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });
        } finally {
            transport.restore();
        }
    });

    it("stops live captions after repeated pause and resume", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });

            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });

            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
            fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
            fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
            fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
            fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));

            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /Start live/ }),
                ).toBeTruthy();
            });
            expect(transport.dataChannel.close).toHaveBeenCalled();
            expect(
                transport.MockRTCPeerConnection.instances[0].close,
            ).toHaveBeenCalled();
            expect(mediaElement.streams[0].audioTrack.stop).toHaveBeenCalled();
            expect(mediaElement.paused).toBe(true);

            act(() => {
                transport.dataChannel.dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "conversation.item.input_audio_transcription.completed",
                            item_id: "late-source",
                            transcript: "late caption",
                        }),
                    }),
                );
            });

            expect(screen.queryByText("late caption")).toBeNull();
        } finally {
            transport.restore();
        }
    });

    it("completes Stop without waiting for the remote session", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        transport.dataChannel.readyState = "open";
        transport.dataChannel.send = jest.fn();

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });

            fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));

            expect(
                screen.getByRole("button", { name: /Start live/ }),
            ).toBeTruthy();
            expect(transport.dataChannel.close).toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });

    it("rebases WebRTC caption timestamps after a media pause", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        const onLiveTrackUpdate = jest.fn();
        mediaElement.currentTime = 10;

        try {
            renderLiveControls(mediaElement, { onLiveTrackUpdate });
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            jest.useFakeTimers({ now: 1000 });
            act(() => mediaElement.pause());
            act(() => jest.advanceTimersByTime(5000));
            await act(async () => mediaElement.play());
            act(() => {
                transport.dataChannel.dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "conversation.item.input_audio_transcription.completed",
                            item_id: "after-pause",
                            transcript: "after pause",
                            start_ms: 6000,
                            end_ms: 7000,
                        }),
                    }),
                );
            });

            expect(onLiveTrackUpdate).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    text: expect.stringContaining(
                        "00:00:11.000 --> 00:00:12.000",
                    ),
                }),
                expect.any(Object),
            );
        } finally {
            transport.restore();
        }
    });

    it("allows a transient WebRTC disconnect to recover", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => transport.dataChannel.dispatchEvent(new Event("open")));
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            jest.useFakeTimers();
            const peer = transport.MockRTCPeerConnection.instances[0];
            act(() => {
                peer.connectionState = "disconnected";
                peer.onconnectionstatechange();
                jest.advanceTimersByTime(4000);
            });
            expect(
                screen.getByRole("button", { name: /^Pause$/ }),
            ).toBeTruthy();

            act(() => {
                peer.connectionState = "connected";
                peer.onconnectionstatechange();
                jest.advanceTimersByTime(2000);
            });
            expect(
                screen.getByRole("button", { name: /^Pause$/ }),
            ).toBeTruthy();
        } finally {
            transport.restore();
        }
    });

    it("cleans up when WebRTC remains connecting after a disconnect", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => transport.dataChannel.dispatchEvent(new Event("open")));
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            jest.useFakeTimers();
            const peer = transport.MockRTCPeerConnection.instances[0];
            act(() => {
                peer.connectionState = "disconnected";
                peer.onconnectionstatechange();
                peer.connectionState = "connecting";
                peer.onconnectionstatechange();
                jest.advanceTimersByTime(5100);
            });

            expect(
                screen.getByRole("button", { name: /Start live/ }),
            ).toBeTruthy();
        } finally {
            transport.restore();
        }
    });

    it("cleans up when the WebRTC data channel closes", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => transport.dataChannel.dispatchEvent(new Event("open")));
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            act(() => transport.dataChannel.dispatchEvent(new Event("close")));
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /Start live/ }),
                ).toBeTruthy();
            });
            expect(mediaElement.streams[0].audioTrack.stop).toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });

    it("stops translation when the broker socket backlog is too large", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            markTranslationBrokerReady(transport);
            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /^Pause$/ }),
                ).toBeTruthy();
            });

            const websocket = transport.MockWebSocket.instances[0];
            websocket.bufferedAmount = 2 * 1024 * 1024 + 1;
            const processor =
                transport.MockAudioContext.instances[0].createScriptProcessor
                    .mock.results[0].value;
            act(() => {
                processor.onaudioprocess({
                    inputBuffer: {
                        getChannelData: () => new Float32Array(4096),
                    },
                });
            });

            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /Start live/ }),
                ).toBeTruthy();
            });
            expect(websocket.close).toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });

    it("waits to play paused media until WebRTC setup is ready", async () => {
        let resolveRemoteDescription;
        const transport = mockWebRtcTransport({
            setRemoteDescriptionImplementation: () =>
                new Promise((resolve) => {
                    resolveRemoteDescription = resolve;
                }),
        });
        const mediaElement = createMediaElement();
        mediaElement.setPaused(true);

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(
                    transport.MockRTCPeerConnection.instances[0]
                        ?.setRemoteDescription,
                ).toHaveBeenCalled();
            });
            expect(mediaElement.play).not.toHaveBeenCalled();

            await act(async () => {
                resolveRemoteDescription();
            });
            expect(mediaElement.play).not.toHaveBeenCalled();

            act(() => {
                transport.MockRTCPeerConnection.instances[0].connectionState =
                    "connected";
                transport.MockRTCPeerConnection.instances[0].onconnectionstatechange();
            });
            expect(mediaElement.play).not.toHaveBeenCalled();

            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
        } finally {
            transport.restore();
        }
    });

    it("pauses already-playing media until WebRTC setup is ready", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(false);

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(mediaElement.pause).toHaveBeenCalledTimes(1);
            });
            expect(mediaElement.play).not.toHaveBeenCalled();

            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
        } finally {
            transport.restore();
        }
    });

    it("restarts completed media from the beginning before going live", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        mediaElement.currentTime = 30;
        mediaElement.setEnded(true);
        mediaElement.setPaused(true);

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            expect(mediaElement.currentTime).toBe(0);
            fireEvent.seeking(mediaElement);
            mediaElement.setEnded(false);
            fireEvent.seeked(mediaElement);
            await waitFor(() => {
                expect(
                    transport.MockRTCPeerConnection.instances[0]
                        ?.setRemoteDescription,
                ).toHaveBeenCalled();
            });
            expect(
                mediaElement.streams[0].audioTrack.stop,
            ).not.toHaveBeenCalled();
            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
        } finally {
            transport.restore();
        }
    });

    it("restores playing media when WebRTC startup fails", async () => {
        const transport = mockWebRtcTransport({
            setRemoteDescriptionImplementation: () =>
                Promise.reject(new Error("setup failed")),
        });
        const mediaElement = createMediaElement();
        mediaElement.setPaused(false);

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(mediaElement.pause).toHaveBeenCalledTimes(1);
            });
            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
            expect(
                screen.getByRole("button", { name: /Start live/ }),
            ).toBeTruthy();
        } finally {
            transport.restore();
        }
    });

    it("restores playing media when WebRTC fails during startup", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(false);

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(mediaElement.pause).toHaveBeenCalledTimes(1);
            });
            act(() => {
                const peer = transport.MockRTCPeerConnection.instances[0];
                peer.connectionState = "failed";
                peer.onconnectionstatechange();
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
            expect(
                screen.getByRole("button", { name: /Start live/ }),
            ).toBeTruthy();
        } finally {
            transport.restore();
        }
    });

    it("restores playing media when translation closes during startup", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(false);

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(mediaElement.pause).toHaveBeenCalledTimes(1);
            });
            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            act(() => transport.MockWebSocket.instances[0].close());

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
            expect(
                screen.getByRole("button", { name: /Start live/ }),
            ).toBeTruthy();
        } finally {
            transport.restore();
        }
    });

    it("keeps media paused when play settles after Stop", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(true);
        let resolvePlay;
        mediaElement.play = jest.fn(
            () =>
                new Promise((resolve) => {
                    resolvePlay = () => {
                        mediaElement.setPaused(false);
                        resolve();
                    };
                }),
        );

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => transport.dataChannel.dispatchEvent(new Event("open")));
            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });

            fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));
            await act(async () => resolvePlay());

            expect(mediaElement.pause).toHaveBeenCalledTimes(1);
            expect(mediaElement.paused).toBe(true);
        } finally {
            transport.restore();
        }
    });

    it("does not let stale startup pause a restarted live session", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(true);
        let resolveFirstPlay;
        mediaElement.play = jest
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFirstPlay = () => {
                            mediaElement.setPaused(false);
                            resolve();
                        };
                    }),
            )
            .mockImplementationOnce(async () => {
                mediaElement.setPaused(false);
            });

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => transport.dataChannel.dispatchEvent(new Event("open")));
            await waitFor(() =>
                expect(mediaElement.play).toHaveBeenCalledTimes(1),
            );

            fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(2);
            });
            act(() => transport.dataChannel.dispatchEvent(new Event("open")));
            await waitFor(() =>
                expect(mediaElement.play).toHaveBeenCalledTimes(2),
            );

            await act(async () => resolveFirstPlay());
            expect(mediaElement.paused).toBe(false);
        } finally {
            transport.restore();
        }
    });

    it("keeps stale startup play paused after a seek", async () => {
        jest.useFakeTimers();
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(true);
        let resolvePlay;
        mediaElement.play = jest.fn(
            () =>
                new Promise((resolve) => {
                    resolvePlay = () => {
                        mediaElement.setPaused(false);
                        resolve();
                    };
                }),
        );

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => transport.dataChannel.dispatchEvent(new Event("open")));
            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });

            fireEvent.seeking(mediaElement);
            fireEvent.seeked(mediaElement);
            await act(async () => jest.advanceTimersByTime(150));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(2);
            });
            await act(async () => resolvePlay());

            expect(mediaElement.pause).toHaveBeenCalledTimes(1);
            expect(mediaElement.paused).toBe(true);

            fireEvent.seeking(mediaElement);
            fireEvent.seeked(mediaElement);
            await act(async () => jest.advanceTimersByTime(150));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(3);
            });
        } finally {
            transport.restore();
        }
    });

    it("restores the completed position when startup from EOF fails", async () => {
        const transport = mockWebRtcTransport({
            setRemoteDescriptionImplementation: () =>
                Promise.reject(new Error("setup failed")),
        });
        const mediaElement = createMediaElement();
        mediaElement.currentTime = 30;
        mediaElement.setEnded(true);
        mediaElement.setPaused(true);

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(
                    screen.getByRole("button", { name: /Start live/ }),
                ).toBeTruthy();
            });
            expect(mediaElement.currentTime).toBe(30);
            expect(mediaElement.play).not.toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });

    it("syncs idle mode to the selected live caption track", () => {
        const mediaElement = createMediaElement();
        const { rerender } = renderLiveControls(mediaElement, {
            activeLiveTrackRole: "target",
        });

        expect(
            screen
                .getByRole("button", { name: /Audio/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");

        rerender(
            <LanguageContext.Provider value={{ direction: "ltr" }}>
                <RealtimeAudioLiveControls
                    mediaElementRef={{ current: mediaElement }}
                    realtimeAudio={realtimeAudio}
                    activeLiveTrackRole="source"
                />
            </LanguageContext.Provider>,
        );

        expect(
            screen
                .getByRole("button", { name: /Captions/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");
    });

    it("emits WebRTC provider-timed caption cues from the ready media time", async () => {
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        const onLiveTrackUpdate = jest.fn();
        mediaElement.currentTime = 24;

        try {
            renderLiveControls(mediaElement, { onLiveTrackUpdate });

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(
                    transport.MockRTCPeerConnection.instances[0]
                        ?.setRemoteDescription,
                ).toHaveBeenCalled();
            });

            mediaElement.currentTime = 26;
            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });

            await waitFor(() => {
                expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
            });

            mediaElement.currentTime = 30;
            act(() => {
                transport.dataChannel.dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "conversation.item.input_audio_transcription.completed",
                            item_id: "source-1",
                            transcript: "provider timed caption",
                            start_ms: 1200,
                            end_ms: 2800,
                        }),
                    }),
                );
            });

            await waitFor(() => {
                expect(onLiveTrackUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        text: expect.stringContaining(
                            "00:00:27.200 --> 00:00:28.800",
                        ),
                    }),
                    expect.any(Object),
                );
            });
        } finally {
            transport.restore();
        }
    });

    it("waits to play paused media until the translation broker is ready", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(true);
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            expect(mediaElement.play).not.toHaveBeenCalled();

            act(() => {
                transport.MockWebSocket.instances[0].open();
            });

            await waitFor(() => {
                expect(
                    transport.MockWebSocket.instances[0].send,
                ).toHaveBeenCalledWith(
                    JSON.stringify({
                        type: "auth",
                        capability: "translate",
                        brokerToken: "broker-token",
                        targetLanguage: "ar",
                    }),
                );
            });
            expect(mediaElement.play).not.toHaveBeenCalled();

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
        } finally {
            transport.restore();
        }
    });

    it("pauses already-playing media until the translation broker is ready", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(false);
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(mediaElement.pause).toHaveBeenCalledTimes(1);
            });
            expect(mediaElement.play).not.toHaveBeenCalled();

            act(() => {
                transport.MockWebSocket.instances[0].open();
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
        } finally {
            transport.restore();
        }
    });

    it("does not miss broker readiness when the broker responds immediately", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(true);
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });

            act(() => {
                transport.MockWebSocket.instances[0].open();
            });

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
        } finally {
            transport.restore();
        }
    });

    it("marks live when broker readiness arrives before audio context resume completes", async () => {
        let resumeCaptureContext;
        let resumePromise;
        const transport = mockTranslationTransport({
            resumeImplementation() {
                if (!resumePromise) {
                    const audioContext = this;
                    audioContext.state = "suspended";
                    resumePromise = new Promise((resolve) => {
                        resumeCaptureContext = () => {
                            audioContext.state = "running";
                            resolve();
                        };
                    });
                }
                return resumePromise;
            },
        });
        const mediaElement = createMediaElement();
        mediaElement.setPaused(true);
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            act(() => {
                transport.MockWebSocket.instances[0].open();
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
            });

            await waitFor(() => {
                expect(screen.getByText("Connecting...")).not.toBeNull();
            });
            expect(
                screen.getByRole("button", { name: /^Play$/ }).disabled,
            ).toBe(true);
            expect(mediaElement.play).not.toHaveBeenCalled();

            await act(async () => {
                resumeCaptureContext();
            });

            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });
            expect(screen.queryByText("Connecting...")).toBeNull();
        } finally {
            transport.restore();
        }
    });

    it("emits provider-timed cues at video time when live starts mid-video", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        const onLiveTrackUpdate = jest.fn();
        mediaElement.currentTime = 24;
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));

        try {
            renderLiveControls(mediaElement, { onLiveTrackUpdate });

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });

            act(() => {
                transport.MockWebSocket.instances[0].open();
            });

            await waitFor(() => {
                expect(
                    transport.MockAudioContext.instances[0]
                        .createScriptProcessor,
                ).toHaveBeenCalled();
            });
            const audioProcessor =
                transport.MockAudioContext.instances[0].createScriptProcessor
                    .mock.results[0].value;
            await waitFor(() => {
                expect(typeof audioProcessor.onaudioprocess).toBe("function");
            });

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
            });

            await waitFor(() => {
                expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
            });

            mediaElement.currentTime = 26;
            act(() => {
                audioProcessor.onaudioprocess({
                    inputBuffer: {
                        getChannelData: () => new Float32Array([0, 0]),
                    },
                });
            });
            expect(
                transport.MockWebSocket.instances[0].send,
            ).toHaveBeenCalledWith(expect.stringContaining('"type":"audio"'));
            mediaElement.currentTime = 30;
            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_transcript.done",
                            response_id: "target-1",
                            text: "provider timed translation",
                            start_ms: 1200,
                            end_ms: 2800,
                        }),
                    }),
                );
            });

            await waitFor(() => {
                expect(onLiveTrackUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        text: expect.stringContaining(
                            "00:00:27.200 --> 00:00:28.800",
                        ),
                    }),
                    expect.any(Object),
                );
            });
        } finally {
            transport.restore();
        }
    });

    it("does not resume media or repopulate preview after stopping translation while connecting", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        const onLiveTrackUpdate = jest.fn();
        mediaElement.setPaused(true);
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));

        try {
            renderLiveControls(mediaElement, { onLiveTrackUpdate });

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });

            fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_transcript.delta",
                            response_id: "target-1",
                            delta: "late words",
                        }),
                    }),
                );
            });

            await waitFor(() => {
                expect(screen.queryByText("Connecting...")).toBeNull();
            });
            expect(mediaElement.play).not.toHaveBeenCalled();
            expect(screen.queryByText("late words")).toBeNull();
        } finally {
            transport.restore();
        }
    });

    it("asks the parent to clear the active live track on explicit stop", async () => {
        const mediaElement = createMediaElement();
        const onClearLiveTrack = jest.fn();
        renderLiveControls(mediaElement, {
            activeLiveTrackId: "live-track-id",
            onClearLiveTrack,
        });

        fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
        await waitFor(() => {
            expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole("button", { name: /Stop/ }));

        expect(onClearLiveTrack).toHaveBeenCalledWith("live-track-id");
    });

    it("notifies the parent while a fresh live session is preparing", async () => {
        const mediaElement = createMediaElement();
        const onLiveSessionActiveChange = jest.fn();
        renderLiveControls(mediaElement, { onLiveSessionActiveChange });

        fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

        await waitFor(() => {
            expect(onLiveSessionActiveChange).toHaveBeenCalledWith(true);
        });

        fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));

        await waitFor(() => {
            expect(onLiveSessionActiveChange).toHaveBeenLastCalledWith(false);
        });
    });

    it("clears the local live preview after stop completes", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        const onLiveTrackUpdate = jest.fn();
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));

        try {
            renderLiveControls(mediaElement, { onLiveTrackUpdate });

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });

            act(() => {
                transport.MockWebSocket.instances[0].open();
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_transcript.delta",
                            response_id: "target-1",
                            delta: "live words",
                        }),
                    }),
                );
            });

            await waitFor(() => {
                expect(screen.getByText("live words")).toBeTruthy();
            });

            fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));

            await waitFor(() => {
                expect(screen.queryByText("live words")).toBeNull();
            });

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_transcript.delta",
                            response_id: "target-1",
                            delta: "late words",
                        }),
                    }),
                );
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "session.closed" }),
                    }),
                );
            });
            expect(screen.queryByText("late words")).toBeNull();
            expect(onLiveTrackUpdate).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    isLive: false,
                    text: expect.not.stringContaining("late words"),
                }),
                expect.any(Object),
            );
        } finally {
            transport.restore();
        }
    });

    it("ignores a live translation track first seen after stopping", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();
        const onLiveTrackUpdate = jest.fn();

        try {
            renderLiveControls(mediaElement, { onLiveTrackUpdate });

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            markTranslationBrokerReady(transport);
            await waitFor(() => {
                expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
            });

            fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_transcript.done",
                            response_id: "target-1",
                            transcript: "late only words",
                        }),
                    }),
                );
            });

            expect(screen.queryByText("late only words")).toBeNull();
            expect(onLiveTrackUpdate).not.toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });

    it("restarts live captions after seeking during setup and playback", async () => {
        jest.useFakeTimers();
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        const onLiveSessionActiveChange = jest.fn();

        try {
            renderLiveControls(mediaElement, { onLiveSessionActiveChange });

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });

            mediaElement.currentTime = 8;
            mediaElement.dispatchEvent(new Event("seeking"));
            mediaElement.dispatchEvent(new Event("seeked"));
            await act(async () => jest.advanceTimersByTime(150));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(2);
            });

            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });
            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });

            mediaElement.dispatchEvent(new Event("seeking"));
            expect(onLiveSessionActiveChange).toHaveBeenCalledWith(false);
            mediaElement.dispatchEvent(new Event("seeked"));

            await act(async () => {
                jest.advanceTimersByTime(150);
            });

            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(3);
            });
            expect(mediaElement.streams[1].audioTrack.stop).toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });

    it("stops translated audio immediately while a session is still connecting", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            expect(mediaElement.muted).toBe(false);

            fireEvent.click(screen.getByRole("button", { name: /Stop/ }));

            await waitFor(() => {
                expect(mediaElement.muted).toBe(false);
            });
            expect(mediaElement.streams[0].audioTrack.stop).toHaveBeenCalled();
            expect(
                screen.getByRole("button", { name: /Start live/ }),
            ).toBeTruthy();
        } finally {
            transport.restore();
        }
    });

    it("keeps original video audio muted while translated audio restarts after seeking", async () => {
        jest.useFakeTimers();
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            markTranslationBrokerReady(transport);
            await waitFor(() => {
                expect(mediaElement.muted).toBe(true);
            });
            expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_audio.delta",
                            delta: "AAA=",
                        }),
                    }),
                );
            });
            const firstOutputContext =
                transport.MockAudioContext.instances.at(-1);
            await waitFor(() => {
                expect(firstOutputContext.createGain).toHaveBeenCalledTimes(1);
            });
            const firstOutputGain =
                firstOutputContext.createGain.mock.results[0].value;

            mediaElement.dispatchEvent(new Event("seeking"));
            expect(mediaElement.muted).toBe(true);
            mediaElement.dispatchEvent(new Event("seeked"));

            await act(async () => {
                jest.advanceTimersByTime(150);
            });

            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(2);
            });
            await Promise.resolve();
            markTranslationBrokerReady(transport);
            await waitFor(() => {
                expect(mediaElement.muted).toBe(true);
            });
            expect(mediaElement.streams[0].audioTrack.stop).toHaveBeenCalled();
            act(() => {
                transport.MockWebSocket.instances.at(-1).dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_audio.delta",
                            delta: "AAA=",
                        }),
                    }),
                );
            });
            const restartedOutputContext =
                transport.MockAudioContext.instances.at(-1);
            await waitFor(() => {
                expect(restartedOutputContext.createGain).toHaveBeenCalledTimes(
                    1,
                );
            });
            expect(
                restartedOutputContext.createGain.mock.results[0].value,
            ).not.toBe(firstOutputGain);

            fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
            await waitFor(() => {
                expect(mediaElement.muted).toBe(false);
            });
        } finally {
            transport.restore();
        }
    });

    it("keeps original video audio muted if native controls unmute during translation", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            markTranslationBrokerReady(transport);
            await waitFor(() => {
                expect(mediaElement.muted).toBe(true);
            });

            mediaElement.muted = false;
            fireEvent(mediaElement, new Event("volumechange"));
            expect(mediaElement.muted).toBe(true);

            fireEvent.click(screen.getByRole("button", { name: /^Pause$/ }));
            await waitFor(() => {
                expect(mediaElement.muted).toBe(false);
            });
        } finally {
            transport.restore();
        }
    });

    it("uses player volume and a live mute control for translated audio", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            markTranslationBrokerReady(transport);
            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalled();
            });

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_audio.delta",
                            delta: "AAA=",
                        }),
                    }),
                );
            });

            const outputContext = transport.MockAudioContext.instances.at(-1);
            await waitFor(() => {
                expect(outputContext.createGain).toHaveBeenCalledTimes(1);
            });
            const outputGain = outputContext.createGain.mock.results[0].value;

            mediaElement.volume = 0.25;
            fireEvent(mediaElement, new Event("volumechange"));
            expect(outputGain.gain.value).toBe(0.25);

            fireEvent.click(
                screen.getByRole("button", { name: "Mute live audio" }),
            );
            expect(outputGain.gain.value).toBe(0);
            fireEvent.click(
                screen.getByRole("button", { name: "Unmute live audio" }),
            );
            expect(outputGain.gain.value).toBe(0.25);
        } finally {
            transport.restore();
        }
    });

    it("ignores an audio delta resumed after its output context was closed", async () => {
        let resumeStaleOutput;
        const transport = mockTranslationTransport({
            contextStateImplementation: (index) =>
                index >= 2 ? "suspended" : "running",
            resumeImplementation() {
                if (this.state !== "suspended") return Promise.resolve();
                return new Promise((resolve) => {
                    resumeStaleOutput = resolve;
                });
            },
        });
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);
            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            markTranslationBrokerReady(transport);
            await waitFor(() => expect(mediaElement.play).toHaveBeenCalled());

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({
                            type: "session.output_audio.delta",
                            delta: "AAA=",
                        }),
                    }),
                );
            });
            const staleOutputContext =
                transport.MockAudioContext.instances.at(-1);
            await waitFor(() => expect(resumeStaleOutput).toBeDefined());

            mediaElement.pause();
            await act(async () => resumeStaleOutput());

            expect(staleOutputContext.createGain).not.toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });

    it("restores original audio when a paused translation seek stays paused", async () => {
        jest.useFakeTimers();
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });
            markTranslationBrokerReady(transport);
            await waitFor(() => {
                expect(mediaElement.muted).toBe(true);
            });

            mediaElement.setPaused(true);
            mediaElement.dispatchEvent(new Event("pause"));
            await waitFor(() => {
                expect(mediaElement.muted).toBe(false);
            });

            mediaElement.dispatchEvent(new Event("seeking"));
            mediaElement.dispatchEvent(new Event("seeked"));

            await act(async () => {
                jest.advanceTimersByTime(500);
            });

            expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            expect(mediaElement.muted).toBe(false);
        } finally {
            transport.restore();
        }
    });

    it("does not keep a stale seek restart after seeking into a paused state", async () => {
        jest.useFakeTimers();
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });

            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });
            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });

            mediaElement.setPaused(true);
            mediaElement.dispatchEvent(new Event("pause"));
            mediaElement.dispatchEvent(new Event("seeking"));
            mediaElement.dispatchEvent(new Event("seeked"));

            await act(async () => {
                jest.advanceTimersByTime(500);
            });

            expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(2);
            });

            await act(async () => {
                jest.advanceTimersByTime(500);
            });

            expect(mediaElement.captureStream).toHaveBeenCalledTimes(2);
        } finally {
            transport.restore();
        }
    });

    it("restarts after a live seek when the browser leaves playing media paused", async () => {
        jest.useFakeTimers();
        const transport = mockWebRtcTransport();
        const mediaElement = createMediaElement();
        mediaElement.setPaused(false);

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));
            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            act(() => {
                transport.dataChannel.dispatchEvent(new Event("open"));
            });
            await waitFor(() => {
                expect(mediaElement.play).toHaveBeenCalledTimes(1);
            });

            mediaElement.setPaused(false);
            mediaElement.dispatchEvent(new Event("seeking"));
            mediaElement.setPaused(true);
            mediaElement.dispatchEvent(new Event("seeked"));

            await act(async () => {
                jest.advanceTimersByTime(150);
            });

            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(2);
            });
        } finally {
            transport.restore();
        }
    });

    it("gracefully closes translation sessions when media naturally ends", async () => {
        const transport = mockTranslationTransport();
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                brokerUrl: "ws://broker.test/realtime-audio/translate",
                brokerToken: "broker-token",
                targetLanguage: "ar",
            }),
        }));
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(transport.MockWebSocket.instances).toHaveLength(1);
            });

            act(() => {
                transport.MockWebSocket.instances[0].open();
            });

            act(() => {
                transport.MockWebSocket.instances[0].dispatchEvent(
                    new MessageEvent("message", {
                        data: JSON.stringify({ type: "broker.ready" }),
                    }),
                );
            });

            expect(
                transport.MockWebSocket.instances[0].send,
            ).toHaveBeenCalledWith(
                JSON.stringify({
                    type: "auth",
                    capability: "translate",
                    brokerToken: "broker-token",
                    targetLanguage: "ar",
                }),
            );

            mediaElement.setEnded(true);
            mediaElement.dispatchEvent(new Event("ended"));

            await waitFor(() => {
                expect(
                    transport.MockWebSocket.instances[0].send,
                ).toHaveBeenCalledWith(JSON.stringify({ type: "close" }));
            });
            expect(mediaElement.muted).toBe(false);
        } finally {
            transport.restore();
        }
    });

    it("primes translation audio contexts from the start click", async () => {
        const transport = mockTranslationTransport();
        const mediaElement = createMediaElement();

        try {
            renderLiveControls(mediaElement);

            fireEvent.click(screen.getByRole("button", { name: /Audio/ }));
            fireEvent.click(screen.getByRole("button", { name: /Start live/ }));

            await waitFor(() => {
                expect(mediaElement.captureStream).toHaveBeenCalledTimes(1);
            });
            expect(window.AudioContext.instances).toHaveLength(2);
            expect(window.AudioContext.instances[0].resume).toHaveBeenCalled();
            expect(window.AudioContext.instances[1].resume).toHaveBeenCalled();
        } finally {
            transport.restore();
        }
    });
});
