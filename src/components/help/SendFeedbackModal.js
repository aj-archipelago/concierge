import React, { useContext, useRef, useState } from "react";
import { Modal } from "../../../@/components/ui/modal";
import LoadingButton from "../editor/LoadingButton";
import config from "../../../config";
import { AuthContext, ServerContext } from "../../App";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { usePostFeedback } from "../../../app/queries/feedback";
import { ScreenshotCapture } from "../common/ScreenshotCapture";
import { uploadFileToMediaHelper } from "../../utils/fileUploadUtils";
import { createUserGlobalStorageTarget } from "../../utils/storageTargets";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { cn } from "@/lib/utils";
import {
    Camera,
    CheckCircle2,
    ImagePlus,
    Lightbulb,
    MessageSquareText,
    Trash2,
    AlertTriangle,
    X,
} from "lucide-react";

const CATEGORY_OPTIONS = [
    {
        id: "bug",
        label: "feedback_category_bug",
        description: "feedback_category_bug_desc",
        icon: AlertTriangle,
    },
    {
        id: "idea",
        label: "feedback_category_idea",
        description: "feedback_category_idea_desc",
        icon: Lightbulb,
    },
    {
        id: "question",
        label: "feedback_category_question",
        description: "feedback_category_question_desc",
        icon: MessageSquareText,
    },
];

function dataURItoBlob(dataURI) {
    let byteString;
    if (dataURI.split(",")[0].indexOf("base64") >= 0) {
        byteString = atob(dataURI.split(",")[1]);
    } else {
        byteString = unescape(dataURI.split(",")[1]);
    }

    const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
    const ia = new Uint8Array(byteString.length);

    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ia], { type: mimeString });
}

function getErrorMessage(error, fallback) {
    return (
        error?.response?.data?.error ||
        error?.error ||
        error?.message ||
        fallback
    );
}

export default React.forwardRef(function SendFeedbackModal(
    { show, onHide },
    ref,
) {
    const [loading, setLoading] = useState(false);
    const [sendStatus, setSendStatus] = useState(null);
    const { serverUrl } = useContext(ServerContext);
    const { user } = useContext(AuthContext);
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const [error, setError] = useState(null);
    const { t } = useTranslation();
    const [message, setMessage] = useState("");
    const [category, setCategory] = useState("bug");
    const [screenshot, setScreenshot] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const postFeedback = usePostFeedback();
    const screenshotCaptureRef = useRef(null);
    const fileInputRef = useRef(null);
    const messageRef = useRef(null);
    const canSubmit = message.trim().length > 0 && !loading && !sendStatus;

    const resetForm = () => {
        setMessage("");
        setCategory("bug");
        setScreenshot(null);
        setError(null);
        setSendStatus(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleClose = () => {
        setError(null);
        onHide();
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setScreenshot(e.target.result);
                setError(null);
            };
            reader.onerror = () => {
                setError(
                    t(
                        "Failed to read the selected file. Please try another file.",
                    ),
                );
            };
            reader.readAsDataURL(file);
        }
    };

    const handleFileUpload = async (file) => {
        try {
            return await uploadFileToMediaHelper(file, {
                storageTarget: user?.contextId
                    ? createUserGlobalStorageTarget(user.contextId)
                    : null,
                checkHash: false,
                serverUrl: config.endpoints.mediaHelper(serverUrl),
            });
        } catch (error) {
            throw new Error(
                error.message || t("File upload failed. Please try again."),
            );
        }
    };

    const submitFeedback = async () => {
        let data;

        if (screenshot) {
            const blob = dataURItoBlob(screenshot);
            const file = new File([blob], "feedback-screenshot.jpg", {
                type: "image/jpeg",
            });

            try {
                setSendStatus(t("Uploading screenshot..."));
                data = await handleFileUpload(file);
            } catch (error) {
                setError(
                    getErrorMessage(
                        error,
                        t("File upload failed. Please try again."),
                    ),
                );
                setSendStatus(null);
                return;
            }
        }

        try {
            setSendStatus(t("Sending feedback..."));
            await postFeedback.mutateAsync({
                message: message.trim(),
                category,
                screenshot: data?.url,
                pageUrl:
                    typeof window !== "undefined"
                        ? window.location.href
                        : undefined,
                userAgent:
                    typeof navigator !== "undefined"
                        ? navigator.userAgent
                        : undefined,
            });
            resetForm();
            toast.success(t("Feedback sent"));
            onHide();
        } catch (error) {
            setError(
                getErrorMessage(
                    error,
                    t("Failed to send feedback. Try again."),
                ),
            );
            setSendStatus(null);
        }
    };

    return (
        <Modal
            show={show && !isCapturing}
            onHide={handleClose}
            title={t("Send feedback")}
            dir={direction}
            widthClassName="w-[calc(100vw-1rem)] sm:max-w-4xl"
            initialFocus={messageRef}
        >
            <div dir={direction} className="space-y-5">
                <div className="rounded-md border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                    {t("feedback_intro")}
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                {t("What kind of feedback is this?")}
                            </label>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {CATEGORY_OPTIONS.map((option) => {
                                    const Icon = option.icon;
                                    const active = category === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() =>
                                                setCategory(option.id)
                                            }
                                            className={cn(
                                                "min-h-24 rounded-md border p-3 text-start transition-colors",
                                                active
                                                    ? "border-sky-500 bg-sky-50 text-sky-950 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-100"
                                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                                            )}
                                        >
                                            <div className="mb-2 flex items-center gap-2">
                                                <Icon className="h-4 w-4 shrink-0" />
                                                <span className="text-sm font-medium">
                                                    {t(option.label)}
                                                </span>
                                            </div>
                                            <div className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                                                {t(option.description)}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="feedback-message"
                                className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100"
                            >
                                {t("What happened?")}
                            </label>
                            <textarea
                                id="feedback-message"
                                ref={messageRef}
                                rows={8}
                                maxLength={5000}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="lb-input min-h-48 w-full resize-none rounded-md border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                                placeholder={t("feedback_message_placeholder")}
                            />
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                                <span>{t("feedback_context_note")}</span>
                                <span>{message.trim().length}/5000</span>
                            </div>
                        </div>
                    </div>

                    <aside className="space-y-3">
                        <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <Camera className="h-4 w-4" />
                                {t("Screenshot")}
                            </div>

                            {screenshot ? (
                                <div className="mb-3 overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                                    <img
                                        src={screenshot}
                                        alt={t("Screenshot")}
                                        className="max-h-52 w-full object-contain"
                                    />
                                </div>
                            ) : (
                                <div className="mb-3 flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                                    <ImagePlus className="mb-2 h-6 w-6" />
                                    {t("feedback_screenshot_empty")}
                                </div>
                            )}

                            <div className="grid gap-2">
                                {screenshot ? (
                                    <button
                                        type="button"
                                        className="lb-outline-danger flex min-h-10 w-full items-center justify-center gap-2"
                                        onClick={() => {
                                            setScreenshot(null);
                                            setLoading(false);
                                            setError(null);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {t("Remove")}
                                    </button>
                                ) : (
                                    <>
                                        <LoadingButton
                                            loading={loading}
                                            className="lb-outline-secondary min-h-10 w-full justify-center"
                                            text={t("Taking screenshot...")}
                                            onClick={() => {
                                                setLoading(true);
                                                setError(null);
                                                setIsCapturing(true);
                                                screenshotCaptureRef.current?.captureScreenshot();
                                            }}
                                        >
                                            {t("Take screenshot")}
                                        </LoadingButton>

                                        <button
                                            type="button"
                                            className="lb-outline-secondary flex min-h-10 w-full items-center justify-center"
                                            onClick={() => {
                                                fileInputRef.current?.click();
                                            }}
                                        >
                                            {t("Upload image")}
                                        </button>
                                    </>
                                )}

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                            </div>
                        </div>

                        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            <div className="mb-1 flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                {t("feedback_context_title")}
                            </div>
                            {t("feedback_context_detail")}
                        </div>
                    </aside>
                </div>

                {error ? (
                    <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                        <span className="text-sm">{error}</span>
                        <button
                            type="button"
                            className="rounded-full p-1 text-red-600 hover:bg-red-100 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-900/40 dark:hover:text-red-100"
                            onClick={() => setError(null)}
                            aria-label={t("Dismiss error")}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : null}

                <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        className="lb-outline-secondary min-h-10 justify-center"
                        onClick={handleClose}
                    >
                        {t("Cancel")}
                    </button>
                    <LoadingButton
                        disabled={!canSubmit}
                        loading={!!sendStatus}
                        text={sendStatus}
                        className="lb-primary min-h-10 justify-center"
                        onClick={submitFeedback}
                    >
                        {t("Send feedback")}
                    </LoadingButton>
                </div>
            </div>

            <ScreenshotCapture
                ref={screenshotCaptureRef}
                visible={false}
                displaySurface="window"
                onCapture={(imageData) => {
                    setScreenshot(imageData);
                    setLoading(false);
                    setIsCapturing(false);
                }}
                onError={(error) => {
                    setError(t(error));
                    setLoading(false);
                    setIsCapturing(false);
                }}
            />
        </Modal>
    );
});
