import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MediaPlayback from "../MediaPlayback";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import arabic from "../../../../config/default/locales/ar.json";

jest.mock("../../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) =>
            require("../../../../config/default/locales/ar.json")[key] || key,
    }),
}));

describe("MediaPlayback", () => {
    it("preserves the native player ref, options and load callback", () => {
        const ref = createRef();
        const onLoadedData = jest.fn();
        render(
            <MediaPlayback
                ref={ref}
                src="/video.mp4"
                controls
                muted
                playsInline
                preload="metadata"
                onLoadedData={onLoadedData}
                data-testid="player"
            />,
        );
        const player = screen.getByTestId("player");
        expect(ref.current).toBe(player);
        expect(player).toHaveAttribute("controls");
        expect(player).toHaveAttribute("playsinline");
        expect(player).toHaveAttribute("preload", "metadata");
        expect(player.muted).toBe(true);
        fireEvent.loadedData(player);
        expect(onLoadedData).toHaveBeenCalledTimes(1);
    });

    it("waits for a manual retry and reconnects the forwarded ref", () => {
        jest.useFakeTimers();
        try {
            const ref = createRef();
            const onError = jest.fn();
            render(
                <MediaPlayback
                    ref={ref}
                    src="/missing.mp4"
                    onError={onError}
                    data-testid="player"
                />,
            );
            const originalPlayer = ref.current;
            fireEvent.error(originalPlayer);
            expect(onError).toHaveBeenCalledTimes(1);
            expect(ref.current).toBeNull();
            jest.advanceTimersByTime(60000);
            expect(screen.queryByTestId("player")).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole("button"));
            expect(ref.current).toBe(screen.getByTestId("player"));
            expect(ref.current).not.toBe(originalPlayer);
        } finally {
            jest.useRealTimers();
        }
    });

    it("clears a failure when the source changes, including returning to the old source", () => {
        const { rerender } = render(
            <MediaPlayback src="/first.mp4" data-testid="player" />,
        );
        fireEvent.error(screen.getByTestId("player"));
        expect(screen.getByRole("status")).toBeInTheDocument();
        rerender(<MediaPlayback src="/second.mp4" data-testid="player" />);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getByTestId("player")).toHaveAttribute(
            "src",
            "/second.mp4",
        );
        rerender(<MediaPlayback src="/first.mp4" data-testid="player" />);
        expect(screen.getByTestId("player")).toHaveAttribute(
            "src",
            "/first.mp4",
        );
    });

    it("renders the failure and retry in Arabic with RTL direction", () => {
        render(
            <LanguageContext.Provider value={{ direction: "rtl" }}>
                <MediaPlayback src="/missing.mp4" data-testid="player" />
            </LanguageContext.Provider>,
        );
        fireEvent.error(screen.getByTestId("player"));
        expect(screen.getByRole("status")).toHaveAttribute("dir", "rtl");
        expect(screen.getByRole("status")).toHaveTextContent(
            arabic["Media preview unavailable"],
        );
        expect(
            screen.getByRole("button", { name: arabic["Retry preview"] }),
        ).toBeInTheDocument();
    });
});
