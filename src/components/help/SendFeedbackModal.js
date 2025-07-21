import React, { useContext, useState, useRef } from "react";
import { Modal } from "../../../@/components/ui/modal";
import LoadingButton from "../editor/LoadingButton";
import config from "../../../config";
import { ServerContext } from "../../App";
import { useTranslation } from "react-i18next";
import { usePostFeedback } from "../../../app/queries/feedback";
import { ScreenshotCapture } from "../common/ScreenshotCapture";

function dataURItoBlob(dataURI) {
    // convert base64/URLEncoded data component to raw binary data held in a string
    var byteString;
    if (dataURI.split(",")[0].indexOf("base64") >= 0)
        byteString = atob(dataURI.split(",")[1]);
    else byteString = unescape(dataURI.split(",")[1]);

    // separate out the mime component
    var mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

    // write the bytes of the string to a typed array
    var ia = new Uint8Array(byteString.length);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ia], { type: mimeString });
}

export default React.forwardRef(function SendFeedbackModal(
    { show, onHide },
    ref,
) {
    const [loading, setLoading] = useState(false);
    const [sendStatus, setSendStatus] = useState(null);
    const { serverUrl } = useContext(ServerContext);
    const [error, setError] = useState(null);
    const { t } = useTranslation();
    const [message, setMessage] = useState("");
    const [screenshot, setScreenshot] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const postFeedback = usePostFeedback();
    const screenshotCaptureRef = useRef(null);
    const fileInputRef = useRef(null);

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

    // Function to handle file upload and post it to the API
    const handleFileUpload = async (file) => {
        const promise = new Promise((resolve, reject) => {
            // Create FormData object to hold the file data
            const formData = new FormData();
            formData.append("file", file);

            try {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", config.endpoints.mediaHelper(serverUrl), true);

                // Monitor the upload progress
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentage = Math.round(
                            (event.loaded * 100) / event.total,
                        );
                        console.log(`File is ${percentage}% uploaded`);
                    }
                };

                // Handle the upload response
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);
                        resolve(data);
                    } else {
                        reject({
                            error: `${t("File upload failed, response:")} ${xhr.statusText}`,
                        });
                    }
                };

                // Handle any upload errors
                xhr.onerror = (error) => {
                    reject({ error: t("File upload failed") });
                };

                xhr.send(formData);
            } catch (error) {
                reject({ error: t("File upload failed") });
            }
        });

        return promise;
    };

    return (
        <Modal show={show && !isCapturing} onHide={onHide}>
            <div className="p-6">
                <div className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">
                    {t("Send us a message")}
                </div>
                <div className="flex gap-6 mb-6">
                    <div className="basis-1/2">
                        <textarea
                            rows={8}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="lb-input min-h-64 h-full w-full resize-none rounded-lg border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder={t("Type your message here...")}
                        />
                    </div>
                    <div className="basis-1/2">
                        {screenshot && (
                            <div className="mb-4">
                                <div className="relative rounded-lg overflow-hidden border border-gray-200">
                                    <img
                                        width={400}
                                        src={screenshot}
                                        alt={t("Screenshot")}
                                        className="w-full h-auto"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <LoadingButton
                                loading={loading}
                                className="lb-outline-secondary"
                                text={t("Taking screenshot...")}
                                onClick={() => {
                                    setLoading(true);
                                    setError(null);
                                    setIsCapturing(true);
                                    screenshotCaptureRef.current?.captureScreenshot();
                                }}
                            >
                                {screenshot
                                    ? t("Retake screenshot")
                                    : t("Take screenshot")}
                            </LoadingButton>

                            <button
                                className="lb-outline-secondary"
                                onClick={() => {
                                    fileInputRef.current?.click();
                                }}
                            >
                                {t("Upload image")}
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileSelect}
                            />

                            {screenshot && (
                                <button
                                    className="lb-outline-secondary"
                                    onClick={() => {
                                        setScreenshot(null);
                                        setLoading(false);
                                        setError(null);
                                    }}
                                >
                                    {t("Remove")}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-red-500 dark:text-red-400 mb-6 flex items-center justify-between border border-red-100 dark:border-red-800">
                        <span className="text-sm">{error}</span>
                        <button
                            className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition-colors"
                            onClick={() => setError(null)}
                        >
                            ✕
                        </button>
                    </div>
                )}
                <div className="flex gap-3 justify-end">
                    <button className="lb-outline-secondary" onClick={onHide}>
                        {t("Cancel")}
                    </button>
                    <LoadingButton
                        disabled={loading || !message}
                        loading={!!sendStatus}
                        text={sendStatus}
                        className="lb-primary"
                        onClick={async () => {
                            let data;
                            if (screenshot) {
                                console.log("Uploading screenshot...");
                                const blob = dataURItoBlob(screenshot);
                                var file = new File([blob], "screenshot.jpg", {
                                    type: "image/jpeg",
                                });
                                try {
                                    setSendStatus(t("Uploading file..."));
                                    data = await handleFileUpload(file);
                                } catch (error) {
                                    setError(error.error);
                                    setSendStatus(null);
                                    return;
                                }
                            }

                            try {
                                setSendStatus(t("Sending message..."));
                                await postFeedback.mutateAsync({
                                    message,
                                    screenshot: data?.url,
                                });
                                setSendStatus(null);
                            } catch (error) {
                                setError(error.error);
                                setSendStatus(null);
                                return;
                            }

                            onHide();
                        }}
                    >
                        {t("Send message")}
                    </LoadingButton>
                </div>
            </div>

            {/* Add the ScreenshotCapture component */}
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
