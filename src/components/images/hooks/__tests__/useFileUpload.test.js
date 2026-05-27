/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, renderHook } from "@testing-library/react";
import { uploadFileToMediaHelper } from "../../../../utils/fileUploadUtils";
import { AuthContext } from "../../../../App";
import { useFileUpload } from "../useFileUpload";

jest.mock("../../../../utils/fileUploadUtils", () => ({
    uploadFileToMediaHelper: jest.fn(),
}));

jest.mock("../../../../App", () => {
    const React = require("react");
    return {
        AuthContext: React.createContext({}),
    };
});

describe("useFileUpload", () => {
    const wrapper = ({ children }) => (
        <AuthContext.Provider value={{ user: { contextId: "user-context" } }}>
            {children}
        </AuthContext.Provider>
    );

    const renderUploadHook = () => {
        const createMediaItem = {
            mutateAsync: jest.fn(),
        };
        const setSelectedImages = jest.fn();
        const setSelectedImagesObjects = jest.fn();
        const promptRef = { current: { focus: jest.fn() } };

        const view = renderHook(
            () =>
                useFileUpload({
                    createMediaItem,
                    settings: { quality: "high" },
                    t: (key) => key,
                    promptRef,
                    setSelectedImages,
                    setSelectedImagesObjects,
                }),
            { wrapper },
        );

        return {
            ...view,
            createMediaItem,
            setSelectedImages,
            setSelectedImagesObjects,
            promptRef,
        };
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("uploads every selected file and selects all created media items", async () => {
        uploadFileToMediaHelper
            .mockResolvedValueOnce({
                url: "https://storage.example/one.png",
                gcs: "gs://bucket/one.png",
                hash: "hash-one",
                blobPath: "media/one.png",
            })
            .mockResolvedValueOnce({
                url: "https://storage.example/two.png",
                gcs: "gs://bucket/two.png",
                hash: "hash-two",
                blobPath: "media/two.png",
            });

        const {
            result,
            createMediaItem,
            setSelectedImages,
            setSelectedImagesObjects,
        } = renderUploadHook();

        createMediaItem.mutateAsync
            .mockResolvedValueOnce({ cortexRequestId: "upload-one" })
            .mockResolvedValueOnce({ cortexRequestId: "upload-two" });

        const files = [
            new File(["one"], "one.png", { type: "image/png" }),
            new File(["two"], "two.png", { type: "image/png" }),
        ];

        await act(async () => {
            await result.current.handleFilesUpload(files);
        });

        expect(uploadFileToMediaHelper).toHaveBeenCalledTimes(2);
        expect(uploadFileToMediaHelper).toHaveBeenNthCalledWith(
            1,
            files[0],
            expect.objectContaining({
                checkHash: false,
                serverUrl: "/media-helper",
            }),
        );
        expect(createMediaItem.mutateAsync).toHaveBeenCalledTimes(2);
        expect(createMediaItem.mutateAsync).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                prompt: "Uploaded image",
                type: "image",
                model: "upload",
                status: "completed",
                url: "https://storage.example/one.png",
                azureUrl: "https://storage.example/one.png",
                gcsUrl: "gs://bucket/one.png",
                hash: "hash-one",
                blobPath: "media/one.png",
            }),
        );
        expect(Array.from(setSelectedImages.mock.calls[0][0])).toEqual([
            "upload-one",
            "upload-two",
        ]);
        expect(setSelectedImagesObjects).toHaveBeenCalledWith([
            { cortexRequestId: "upload-one" },
            { cortexRequestId: "upload-two" },
        ]);
        expect(result.current.isUploading).toBe(false);
    });

    test("uploads audio files as audio media items", async () => {
        uploadFileToMediaHelper.mockResolvedValueOnce({
            url: "https://storage.example/voice.mp3",
            gcs: "gs://bucket/voice.mp3",
            hash: "hash-audio",
            blobPath: "media/voice.mp3",
        });

        const { result, createMediaItem } = renderUploadHook();
        createMediaItem.mutateAsync.mockResolvedValueOnce({
            cortexRequestId: "upload-audio",
        });

        const file = new File(["audio"], "voice.mp3", { type: "audio/mpeg" });

        await act(async () => {
            await result.current.handleFilesUpload([file]);
        });

        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "Uploaded audio",
                type: "audio",
                model: "upload",
                status: "completed",
                url: "https://storage.example/voice.mp3",
                azureUrl: "https://storage.example/voice.mp3",
                gcsUrl: "gs://bucket/voice.mp3",
                hash: "hash-audio",
                blobPath: "media/voice.mp3",
            }),
        );
    });

    test("detects audio uploads by extension when the browser omits MIME type", async () => {
        uploadFileToMediaHelper.mockResolvedValueOnce({
            url: "https://storage.example/source.wav",
        });

        const { result, createMediaItem } = renderUploadHook();
        createMediaItem.mutateAsync.mockResolvedValueOnce({
            cortexRequestId: "upload-audio",
        });

        const file = new File(["audio"], "source.wav", { type: "" });

        await act(async () => {
            await result.current.handleFilesUpload([file]);
        });

        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "Uploaded audio",
                type: "audio",
            }),
        );
    });

    test("uploads video files as video media items", async () => {
        uploadFileToMediaHelper.mockResolvedValueOnce({
            url: "https://storage.example/clip.mp4",
            gcs: "gs://bucket/clip.mp4",
            hash: "hash-video",
            blobPath: "media/clip.mp4",
        });

        const { result, createMediaItem } = renderUploadHook();
        createMediaItem.mutateAsync.mockResolvedValueOnce({
            cortexRequestId: "upload-video",
        });

        const file = new File(["video"], "clip.mp4", { type: "video/mp4" });

        await act(async () => {
            await result.current.handleFilesUpload([file]);
        });

        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "Uploaded video",
                type: "video",
                model: "upload",
                status: "completed",
                url: "https://storage.example/clip.mp4",
                azureUrl: "https://storage.example/clip.mp4",
                gcsUrl: "gs://bucket/clip.mp4",
                hash: "hash-video",
                blobPath: "media/clip.mp4",
            }),
        );
    });

    test("detects video uploads by extension when the browser omits MIME type", async () => {
        uploadFileToMediaHelper.mockResolvedValueOnce({
            url: "https://storage.example/source.mov",
        });

        const { result, createMediaItem } = renderUploadHook();
        createMediaItem.mutateAsync.mockResolvedValueOnce({
            cortexRequestId: "upload-video",
        });

        const file = new File(["video"], "source.mov", { type: "" });

        await act(async () => {
            await result.current.handleFilesUpload([file]);
        });

        expect(createMediaItem.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "Uploaded video",
                type: "video",
            }),
        );
    });

    test("clears the file input value after selection so the same files can be chosen again", async () => {
        uploadFileToMediaHelper.mockResolvedValueOnce(null);
        const { result } = renderUploadHook();
        const event = {
            target: {
                files: [new File(["one"], "one.png", { type: "image/png" })],
                value: "C:\\fakepath\\one.png",
            },
        };

        await act(async () => {
            await result.current.handleFileSelect(event);
        });

        expect(event.target.value).toBe("");
    });
});
