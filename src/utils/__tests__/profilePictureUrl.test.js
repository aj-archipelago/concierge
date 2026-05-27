import { normalizeProfilePictureUrl } from "../profilePictureUrl";

describe("normalizeProfilePictureUrl", () => {
    test("builds an image proxy URL from blobPath and contextId", () => {
        expect(
            normalizeProfilePictureUrl(null, {
                blobPath: "profiles/user-1/avatar.jpg",
                contextId: "context-123",
            }),
        ).toBe(
            "/api/image-proxy?blobPath=profiles%2Fuser-1%2Favatar.jpg&contextId=context-123&fileScope=profile",
        );
    });

    test("extracts blobPath from a raw blob URL", () => {
        const url =
            "https://customerstorage.blob.core.windows.net/cortexfiles-dev/profiles/user-1/avatar.jpg?sv=2025-05-05&sig=abc123";

        expect(
            normalizeProfilePictureUrl(url, {
                contextId: "context-123",
            }),
        ).toBe(
            "/api/image-proxy?blobPath=profiles%2Fuser-1%2Favatar.jpg&contextId=context-123&fileScope=profile",
        );
    });

    test("extracts blobPath from an old image-proxy URL", () => {
        const url =
            "/api/image-proxy?url=https%3A%2F%2Fcustomerstorage.blob.core.windows.net%2Fcortexfiles-dev%2Fprofiles%2Fuser-1%2Favatar.jpg";

        expect(
            normalizeProfilePictureUrl(url, {
                contextId: "context-123",
            }),
        ).toBe(
            "/api/image-proxy?blobPath=profiles%2Fuser-1%2Favatar.jpg&contextId=context-123&fileScope=profile",
        );
    });

    test("canonicalizes current profile picture proxy URLs", () => {
        const url =
            "/api/profile-picture-proxy?blobPath=profiles%2Fuser-1%2Favatar.jpg&contextId=context-123&url=https%3A%2F%2Fcustomerstorage.blob.core.windows.net%2Fcortexfiles-dev%2Fprofiles%2Fuser-1%2Favatar.jpg";

        expect(
            normalizeProfilePictureUrl(url, {
                contextId: "context-123",
            }),
        ).toBe(
            "/api/image-proxy?blobPath=profiles%2Fuser-1%2Favatar.jpg&contextId=context-123&fileScope=profile",
        );
    });

    test("leaves non-blob URLs unchanged", () => {
        const url = "https://example.com/avatar.jpg?size=128";

        expect(
            normalizeProfilePictureUrl(url, {
                contextId: "context-123",
            }),
        ).toBe(url);
    });
});
