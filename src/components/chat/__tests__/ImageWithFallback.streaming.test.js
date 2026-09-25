/** @jest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImageWithFallback } from "../MediaCard";

jest.mock("../useFilePreview", () => ({
    useFilePreview: () => ({}),
    renderFilePreview: () => null,
}));
jest.mock("../../common/FileManager", () => ({
    FilePreviewDialog: () => null,
}));
jest.mock("../../../contexts/LanguageProvider", () => {
    const React = require("react");
    return { LanguageContext: React.createContext({ direction: "ltr" }) };
});

it("recovers from an incomplete streamed image URL when the full URL arrives", () => {
    const base =
        "https://examplefiles.blob.core.windows.net/files/streaming-regression.jpeg";
    const complete = `${base}?sv=2026-02-06&sp=r&sig=synthetic%2Bsignature%3D`;
    const onLoad = jest.fn();
    const { rerender } = render(
        <ImageWithFallback src={`${base}?sv`} alt="Rose" onLoad={onLoad} />,
    );
    const image = screen.getByRole("img", { name: "Rose" });
    fireEvent.error(image);
    rerender(<ImageWithFallback src={complete} alt="Rose" onLoad={onLoad} />);
    const proxy = new URL(image.getAttribute("src"), "http://localhost");
    expect(proxy.searchParams.get("url")).toBe(complete);
    fireEvent.load(image);
    expect(onLoad).toHaveBeenCalledTimes(1);
});
