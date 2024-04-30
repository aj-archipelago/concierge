import { Form } from "react-bootstrap";
import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { COGNITIVE_INSERT } from "../../graphql";
import { useApolloClient } from "@apollo/client";
import { useDispatch, useSelector } from "react-redux";
import { addDoc, addSource } from "../../stores/docSlice";
import {
    setFileLoading,
    clearFileLoading,
    loadingError,
} from "../../stores/fileUploadSlice";
import config from "../../../config";
import { ServerContext } from "../../App";

function FileUploadComponent({ text }) {
    const [url, setUrl] = useState(null);
    const [filename, setFilename] = useState(null);
    const { t } = useTranslation();
    const contextId = useSelector((state) => state.chat.contextId);
    const dispatch = useDispatch();
    const [isLoading, setIsLoading] = useState(false);
    const client = useApolloClient();
    // eslint-disable-next-line
    const [data, setData] = useState(null);
    const { serverUrl } = useContext(ServerContext);

    const setLoadingState = (isLoading) => {
        setIsLoading(isLoading);
        dispatch(isLoading ? setFileLoading() : clearFileLoading());
        dispatch(loadingError(null));
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!url || !isLoading) return;

            try {
                const docId = uuidv4();

                client
                    .query({
                        query: COGNITIVE_INSERT,
                        variables: {
                            file: url,
                            privateData: true,
                            contextId,
                            docId,
                        },
                        fetchPolicy: "network-only",
                    })
                    .then(() => {
                        // completed successfully
                        setLoadingState(false);
                        setData(true);
                        dispatch(addDoc({ docId, filename }));
                        dispatch(addSource("mydata"));
                        setUrl(null);
                    })
                    .catch((err) => {
                        setLoadingState(false);
                        console.error(err);
                        dispatch(loadingError(err.toString()));
                        setUrl(null);
                    });
            } catch (err) {
                setLoadingState(false);
                console.warn("Error in file upload", err);
                dispatch(loadingError(err.toString()));
                setUrl(null);
            }
        };

        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, isLoading]);

    // Function to handle file upload and post it to the API
    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file || !file.name) return;

        setLoadingState(true);
        setData(null);
        setFilename(file.name);

        const setNewUrl = ({ url, error }) => {
            // setFileUploading(false);
            if (error) {
                console.error(error);
                // setFileUploadError({ message: error });
            }
            setUrl(url || ``);
        };

        // Create FormData object to hold the file data
        const formData = new FormData();
        formData.append("file", file);

        try {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", config.endpoints.mediaHelper(serverUrl), true);

            // Monitor the upload progress
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    // const percentage = Math.round((event.loaded * 100) / event.total);
                    // setUrl(`${t("Uploading file...")} ${percentage}%`);
                }
            };

            // Handle the upload response
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    setNewUrl(data);
                } else {
                    setNewUrl({
                        error: `${t("File upload failed, response:")} ${xhr.statusText}`,
                    });
                }
            };

            // Handle any upload errors
            xhr.onerror = (error) => {
                setNewUrl({ error: t("File upload failed") });
            };

            // Send the file
            // setCurrentOperation(t("Uploading"));
            xhr.send(formData);
            event.target.value = "";
        } catch (error) {
            setNewUrl({ error: t("File upload failed") });
        }
    };

    const handleUrlChange = (url) => {
        setFilename(url);
        setUrl(url);
    };

    const handleUrlEnter = (url) => {
        if (!url) return;
        setData(null);
        setFilename(url);
        setLoadingState(true);
        setUrl(url);
    };

    return (
        <div className="file-upload-component" style={{ width: "100%" }}>
            {text}
            <div style={{ paddingTop: 10 }}>
                <Form.Group controlId="fileChooser">
                    <input
                        disabled={isLoading}
                        size="sm"
                        type="file"
                        accept=".pdf,.docx,.xlsx,.txt"
                        className="rounded mb-2 bg-white border w-full"
                        onChange={handleFileUpload}
                    />
                    <div style={{ padding: "2px 5px" }}>
                        {t("Or enter URL:")}
                    </div>
                    <input
                        disabled={isLoading}
                        className="lb-input text-xs"
                        placeholder={t(
                            "Paste URL e.g. http://example.com/2942.PDF",
                        )}
                        value={url || ""}
                        type="url"
                        onChange={(e) => handleUrlChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleUrlEnter(e.target.value);
                            }
                        }}
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                    />
                </Form.Group>
            </div>
        </div>
    );
}

export default FileUploadComponent;
