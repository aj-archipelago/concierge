import {
    getNotificationNavigationPath,
    getShareNotificationPath,
    isShareNotification,
} from "./shareNotificationUtils";

describe("shareNotificationUtils", () => {
    it("detects resource-shared notifications", () => {
        expect(
            isShareNotification({
                type: "resource-shared",
            }),
        ).toBe(true);
    });

    it("builds navigation paths for shared resources", () => {
        const notification = {
            type: "resource-shared",
            metadata: {
                entityType: "chat",
                entityId: "507f1f77bcf86cd799439011",
            },
        };

        expect(getShareNotificationPath(notification)).toBe(
            "/chat/507f1f77bcf86cd799439011",
        );
        expect(getNotificationNavigationPath(notification)).toBe(
            "/chat/507f1f77bcf86cd799439011",
        );
    });
});
