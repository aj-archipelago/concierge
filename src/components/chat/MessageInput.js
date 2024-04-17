import "highlight.js/styles/github.css";
import { useState } from "react";
import { Form } from "react-bootstrap";
import { RiSendPlane2Fill } from "react-icons/ri";
import TextareaAutosize from "react-textarea-autosize";
import classNames from "../../../app/utils/class-names";
import dynamic from "next/dynamic";
import { v4 as uuidv4 } from "uuid";
import { useApolloClient } from "@apollo/client";
import { COGNITIVE_INSERT } from "../../graphql";
import { useDispatch, useSelector } from "react-redux";
import { addDoc, addSource } from "../../stores/docSlice";
import {
    setFileLoading,
    clearFileLoading,
    loadingError,
} from "../../stores/fileUploadSlice";
import { FaFileCirclePlus } from "react-icons/fa6";
import { IoCloseCircle } from "react-icons/io5";
import { isDocumentUrl, isImageUrl } from "./MyFilePond";

const DynamicFilepond = dynamic(() => import("./MyFilePond"), {
    ssr: false,
});

// Displays the list of messages and a message input box.
function MessageInput({ onSend, loading, enableRag, placeholder }) {
    const [inputValue, setInputValue] = useState("");
    const [urls, setUrls] = useState([]);
    const [files, setFiles] = useState([]);
    const [showFileUpload, setShowFileUpload] = useState(false);
    const client = useApolloClient();
    const contextId = useSelector((state) => state.chat.contextId);
    const dispatch = useDispatch();

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    const prepareMessage = (inputText) => {
        return [
            JSON.stringify({ type: "text", text: inputText }),
            ...(urls || [])?.map((url) =>
                JSON.stringify({
                    type: "image_url",
                    image_url: {
                        url,
                    },
                }),
            ),
        ];
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();
        if (!loading && inputValue) {
            const message = prepareMessage(inputValue);
            onSend(urls && urls.length > 0 ? message : inputValue);
            setInputValue("");
            setFiles([]);
            setUrls([]);
        }
    };

    const addUrl = (url) => {
        const fetchData = async (url) => {
            if (!url) return;

            try {
                const docId = uuidv4();
                const filename = url
                    .split("/")
                    .pop()
                    .split("_")
                    .slice(1)
                    .join("_");

                dispatch(setFileLoading());

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
                        dispatch(addDoc({ docId, filename }));
                        dispatch(addSource("mydata"));
                        dispatch(clearFileLoading());
                    })
                    .catch((err) => {
                        console.error(err);
                        dispatch(loadingError(err.toString()));
                    });
            } catch (err) {
                console.warn("Error in file upload", err);
                dispatch(loadingError(err.toString()));
            }
        };

        //check if url is doc type and process accordingly
        if (isDocumentUrl(url)) {
            fetchData(url);
        } else {
            if (isImageUrl(url)) {
                setUrls([...urls, url]); //rest of it: images
            }
        }
    };

    return (
        <div>
            {showFileUpload && (
                <DynamicFilepond
                    addUrl={addUrl}
                    files={files}
                    setFiles={setFiles}
                />
            )}
            <div className="rounded border dark:border-zinc-200">
                <Form
                    onSubmit={handleFormSubmit}
                    className="flex items-center rounded dark:bg-zinc-100"
                >
                    {enableRag && (
                        <div className="rounded-s pt-3.5 ps-4 pe-3 dark:bg-zinc-100 self-stretch flex">
                            {!showFileUpload ? (
                                <FaFileCirclePlus
                                    onClick={() =>
                                        setShowFileUpload(!showFileUpload)
                                    }
                                    className="text-gray-500 group flex items-center text-base font-medium hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 cursor-pointer"
                                />
                            ) : (
                                <IoCloseCircle
                                    onClick={() =>
                                        setShowFileUpload(!showFileUpload)
                                    }
                                    className="text-gray-500 group flex items-center text-base font-medium hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 cursor-pointer"
                                />
                            )}
                        </div>
                    )}
                    <div className="relative grow">
                        <div className="flex items-center">
                            <TextareaAutosize
                                typeahead="none"
                                className={classNames(
                                    `w-full border-0 outline-none focus:shadow-none [.docked_&]:text-sm focus:ring-0 py-3 resize-none dark:bg-zinc-100`,
                                    enableRag ? "px-1" : "px-3 rounded-s",
                                )}
                                rows={1}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleFormSubmit(e);
                                    }
                                }}
                                placeholder={placeholder || "Send a message"}
                                value={inputValue}
                                onChange={handleInputChange}
                                autoComplete="off"
                                autoCapitalize="off"
                                autoCorrect="off"
                            />
                        </div>
                    </div>
                    <div className=" pe-4 ps-3 dark:bg-zinc-100 self-stretch flex rounded-e">
                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={loading || inputValue === ""}
                                className={classNames(
                                    "text-base rtl:rotate-180 text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100",
                                )}
                            >
                                <RiSendPlane2Fill />
                            </button>
                        </div>
                    </div>
                </Form>
            </div>
        </div>
    );
}

export default MessageInput;
