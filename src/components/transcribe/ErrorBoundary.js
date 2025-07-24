import { useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import SendFeedbackModal from "../help/SendFeedbackModal";

export default function ApplicationErrorBoundary({ children }) {
    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            {children}
        </ErrorBoundary>
    );
}

function ErrorFallback({ error, resetErrorBoundary }) {
    const [showFeedback, setShowFeedback] = useState(false);
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
                <div className="text-6xl mb-4">😕</div>
                <h2 className="text-3xl font-semibold mb-6">
                    Oops! Something went wrong
                </h2>
                <p>Here's what we know about the error:</p>
                <pre className="rounded bg-neutral-100 dark:bg-gray-700 p-2 mb-4">
                    {error.message}
                </pre>

                <p className="text-gray-600 mb-3 mt-12">
                    {t("Need help? Our team is here to assist you.")}
                </p>
                <button
                    onClick={() => setShowFeedback(true)}
                    className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors"
                >
                    {t("Contact Support")}
                </button>
            </div>

            <SendFeedbackModal
                show={showFeedback}
                onHide={() => setShowFeedback(false)}
                initialMessage={`Error: ${error.message}\n\nWhat were you doing when this happened?\n\n`}
            />
        </div>
    );
}
