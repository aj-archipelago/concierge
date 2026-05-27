import { createFileId } from "../../fileIdUtils";

describe("createFileId", () => {
    it("prefers blobPath when both blobPath and hash exist", () => {
        const file = {
            _id: "mongo-1",
            hash: "legacy-hash",
            blobPath: "applets/workspace-1/file.txt",
        };

        expect(createFileId(file)).toBe("bp-applets/workspace-1/file.txt");
    });

    it("falls back to _id before hash when blobPath is missing", () => {
        const file = {
            _id: "mongo-2",
            hash: "legacy-hash-2",
        };

        expect(createFileId(file)).toBe("id-mongo-2");
    });
});
