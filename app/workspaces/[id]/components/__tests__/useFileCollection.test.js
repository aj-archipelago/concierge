/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useFileCollection } from "../useFileCollection";
import {
    createAppletUserStorageTarget,
    createWorkspacePrivateStorageTarget,
} from "../../../../../src/utils/storageTargets";
import { listUserFolder } from "../../../../../src/utils/fileUploadUtils";

jest.mock("../../../../../src/utils/fileUploadUtils", () => ({
    listUserFolder: jest.fn(),
}));

describe("useFileCollection", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it("merges primary and fallback storage targets for listing", async () => {
        const primaryStorageTarget = createAppletUserStorageTarget(
            "ctx-1",
            "applet-1",
        );
        const fallbackStorageTarget = createWorkspacePrivateStorageTarget(
            "ctx-1",
            "workspace-1",
        );

        listUserFolder
            .mockResolvedValueOnce({
                files: [
                    {
                        hash: "hash-primary",
                        url: "https://files.example.com/primary.pdf",
                        filename: "primary.pdf",
                    },
                ],
            })
            .mockResolvedValueOnce({
                files: [
                    {
                        hash: "hash-fallback",
                        url: "https://files.example.com/fallback.pdf",
                        filename: "fallback.pdf",
                    },
                    {
                        hash: "hash-primary",
                        url: "https://files.example.com/duplicate.pdf",
                        filename: "duplicate.pdf",
                    },
                ],
            });

        const { result } = renderHook(() =>
            useFileCollection({
                contextId: "ctx-1",
                storageTarget: primaryStorageTarget,
                fallbackStorageTargets: [fallbackStorageTarget],
                workspaceId: "workspace-1",
            }),
        );

        await act(async () => {
            jest.advanceTimersByTime(300);
        });

        await waitFor(() => {
            expect(result.current.files).toHaveLength(2);
        });

        expect(listUserFolder).toHaveBeenNthCalledWith(
            1,
            "ctx-1",
            expect.objectContaining({
                storageTarget: primaryStorageTarget,
                workspaceId: "workspace-1",
            }),
        );
        expect(listUserFolder).toHaveBeenNthCalledWith(
            2,
            "ctx-1",
            expect.objectContaining({
                storageTarget: fallbackStorageTarget,
                workspaceId: "workspace-1",
            }),
        );
        expect(result.current.files.map((file) => file.hash)).toEqual([
            "hash-primary",
            "hash-fallback",
        ]);
        expect(result.current.files[0]._storageTarget).toEqual(
            primaryStorageTarget,
        );
        expect(result.current.files[1]._storageTarget).toEqual(
            fallbackStorageTarget,
        );
    });
});
