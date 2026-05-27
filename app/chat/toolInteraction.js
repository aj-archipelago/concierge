function interpolateToolText(text, options = {}) {
    if (!text || !options) {
        return text;
    }

    return text.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => {
        const value = options[key];
        return value == null ? "" : String(value);
    });
}

export function translateToolText(context, key, options) {
    if (typeof context?.t === "function") {
        return context.t(key, options);
    }

    return interpolateToolText(key, options);
}

function getConfirmationHandler(context) {
    if (typeof context?.toolInteraction?.confirm === "function") {
        return context.toolInteraction.confirm;
    }

    if (typeof context?.confirmAction === "function") {
        return context.confirmAction;
    }

    return null;
}

/**
 * Serialize confirmation requests so destructive tool dialogs do not overwrite
 * each other when multiple client-side tools ask for confirmation at once.
 */
export function createQueuedConfirmationHandler(requestConfirmation) {
    let activeChain = Promise.resolve();

    return (options = {}) => {
        const queuedRequest = activeChain
            .catch(() => {})
            .then(() => requestConfirmation(options));

        activeChain = queuedRequest.then(
            () => undefined,
            () => undefined,
        );

        return queuedRequest;
    };
}

/**
 * Ask the user to confirm a client-side tool action.
 * This uses the shared tool interaction bridge when available and falls back
 * to the browser confirm dialog outside the chat tool runtime.
 */
export async function requestToolConfirmation(context, options = {}) {
    const confirmationHandler = getConfirmationHandler(context);
    const { fallbackMessage, ...confirmationOverrides } = options;
    const confirmationOptions = {
        title: translateToolText(context, "Confirm Action"),
        description: "",
        confirmLabel: translateToolText(context, "Confirm"),
        cancelLabel: translateToolText(context, "Cancel"),
        destructive: false,
        ...confirmationOverrides,
    };

    if (confirmationHandler) {
        return !!(await confirmationHandler(confirmationOptions));
    }

    const message =
        fallbackMessage ||
        confirmationOptions.description ||
        confirmationOptions.title;

    return window.confirm(message);
}
