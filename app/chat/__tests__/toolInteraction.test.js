import {
    createQueuedConfirmationHandler,
    requestToolConfirmation,
} from "../toolInteraction";

function flushPromises() {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe("toolInteraction", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.confirm = jest.fn();
    });

    test("uses toolInteraction.confirm when available", async () => {
        const confirm = jest.fn().mockResolvedValue(true);

        const result = await requestToolConfirmation(
            {
                toolInteraction: { confirm },
            },
            {
                title: "Delete Applet?",
                description: "Delete it?",
                confirmLabel: "Delete",
            },
        );

        expect(result).toBe(true);
        expect(confirm).toHaveBeenCalledWith({
            title: "Delete Applet?",
            description: "Delete it?",
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            destructive: false,
        });
        expect(window.confirm).not.toHaveBeenCalled();
    });

    test("falls back to legacy confirmAction when needed", async () => {
        const confirmAction = jest.fn().mockResolvedValue(false);

        const result = await requestToolConfirmation(
            {
                confirmAction,
            },
            {
                title: "Delete Applet?",
                description: "Delete it?",
            },
        );

        expect(result).toBe(false);
        expect(confirmAction).toHaveBeenCalledWith({
            title: "Delete Applet?",
            description: "Delete it?",
            confirmLabel: "Confirm",
            cancelLabel: "Cancel",
            destructive: false,
        });
        expect(window.confirm).not.toHaveBeenCalled();
    });

    test("falls back to window.confirm when no tool interaction bridge exists", async () => {
        window.confirm.mockReturnValue(true);

        const result = await requestToolConfirmation(null, {
            description: "Delete it?",
        });

        expect(result).toBe(true);
        expect(window.confirm).toHaveBeenCalledWith("Delete it?");
    });

    test("queues confirmation requests so each dialog is shown in order", async () => {
        let resolveFirst;
        let resolveSecond;
        let resolveThird;
        const requestConfirmation = jest
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFirst = resolve;
                    }),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveSecond = resolve;
                    }),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveThird = resolve;
                    }),
            );
        const queuedConfirm =
            createQueuedConfirmationHandler(requestConfirmation);

        const firstRequest = queuedConfirm({ title: "Delete Applet 1?" });
        const secondRequest = queuedConfirm({ title: "Delete Applet 2?" });
        const thirdRequest = queuedConfirm({ title: "Delete Applet 3?" });

        await flushPromises();

        expect(requestConfirmation).toHaveBeenCalledTimes(1);
        expect(requestConfirmation).toHaveBeenNthCalledWith(1, {
            title: "Delete Applet 1?",
        });

        resolveFirst(true);
        await flushPromises();

        expect(requestConfirmation).toHaveBeenCalledTimes(2);
        expect(requestConfirmation).toHaveBeenNthCalledWith(2, {
            title: "Delete Applet 2?",
        });

        resolveSecond(false);
        await flushPromises();

        expect(requestConfirmation).toHaveBeenCalledTimes(3);
        expect(requestConfirmation).toHaveBeenNthCalledWith(3, {
            title: "Delete Applet 3?",
        });

        resolveThird(true);

        await expect(firstRequest).resolves.toBe(true);
        await expect(secondRequest).resolves.toBe(false);
        await expect(thirdRequest).resolves.toBe(true);
    });
});
