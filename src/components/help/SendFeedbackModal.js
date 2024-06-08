import html2canvas from "html2canvas";
import React, { useContext, useState } from "react";
import { Modal } from "../../../@/components/ui/modal";
import LoadingButton from "../editor/LoadingButton";
import config from "../../../config";
import { ServerContext } from "../../App";
import { useTranslation } from "react-i18next";
import { usePostFeedback } from "../../../app/queries/feedback";

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
    const getImage = () => {
        setScreenshot(null);
        setLoading(true);
        html2canvas(ref.current).then((canvas) => {
            setScreenshot(canvas.toDataURL());
            setLoading(false);
        });
    };
    const { serverUrl } = useContext(ServerContext);
    const [error, setError] = useState(null);
    const { t } = useTranslation();
    const [message, setMessage] = useState("");
    const [screenshot, setScreenshot] = useState(null);
    const postFeedback = usePostFeedback();

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
        <Modal show={show} onHide={onHide}>
            <div className="text-lg font-semibold mb-4">
                {t("Send us a message")}
            </div>
            <div className="flex gap-4 mb-4">
                <div className="basis-1/2">
                    <textarea
                        rows={8}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="lb-input  min-h-64 h-full"
                        placeholder={t("Message")}
                    />
                </div>
                <div>
                    {screenshot && (
                        <div>
                            <div className="mb-2">
                                <img
                                    width={400}
                                    src={screenshot}
                                    alt={t("Screenshot")}
                                />
                            </div>
                        </div>
                    )}

                    <div className="mb-4 flex gap-2">
                        <LoadingButton
                            loading={loading}
                            className="lb-outline-secondary lb-sm"
                            text={t("Taking screenshot...")}
                            onClick={getImage}
                        >
                            {screenshot
                                ? t("Retake screenshot")
                                : t("Add screenshot")}
                        </LoadingButton>

                        {screenshot && (
                            <button
                                className="lb-outline-secondary lb-sm"
                                onClick={() => {
                                    setScreenshot(null);
                                    setLoading(false);
                                }}
                            >
                                {t("Remove")}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {error && (
                <div className="bg-red-50 p-6 rounded-md text-red-500">
                    {error}
                </div>
            )}
            <div className="flex gap-2">
                <LoadingButton
                    disabled={loading || !message}
                    loading={!!sendStatus}
                    text={sendStatus}
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
                <button className="lb-outline-secondary" onClick={onHide}>
                    {t("Cancel")}
                </button>
            </div>
        </Modal>
    );
});
