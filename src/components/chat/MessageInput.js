import "highlight.js/styles/github.css";
import { useContext, useState } from "react";
import { RiSendPlane2Fill } from "react-icons/ri";
import TextareaAutosize from "react-textarea-autosize";
import classNames from "../../../app/utils/class-names";
import dynamic from "next/dynamic";
import { v4 as uuidv4 } from "uuid";
import { useApolloClient } from "@apollo/client";
import { COGNITIVE_INSERT, CODE_HUMAN_INPUT } from "../../graphql";
import { useDispatch } from "react-redux";
import {
    setFileLoading,
    clearFileLoading,
    loadingError,
} from "../../stores/fileUploadSlice";
import { FaFileCirclePlus } from "react-icons/fa6";
import { IoCloseCircle } from "react-icons/io5";
import { getFilename, isDocumentUrl, isMediaUrl } from "./MyFilePond";
import { AuthContext } from "../../App";
import { useAddDocument } from "../../../app/queries/uploadedDocs";
import {
    useGetActiveChat,
    useGetActiveChatId,
} from "../../../app/queries/chats";

const DynamicFilepond = dynamic(() => import("./MyFilePond"), {
    ssr: false,
});

// Displays the list of messages and a message input box.
function MessageInput({
    onSend,
    loading,
    enableRag,
    placeholder,
    viewingReadOnlyChat,
}) {
    const [inputValue, setInputValue] = useState("");
    const [urlsData, setUrlsData] = useState([]);
    const [files, setFiles] = useState([]);
    const [showFileUpload, setShowFileUpload] = useState(false);
    const client = useApolloClient();
    const { user } = useContext(AuthContext);
    const contextId = user?.contextId;
    const dispatch = useDispatch();
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const addDocument = useAddDocument();
    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };
    const activeChatId = useGetActiveChatId();
    const activeChat = useGetActiveChat().data;
    const codeRequestId = activeChat?.codeRequestId;
    const apolloClient = useApolloClient();

    const prepareMessage = (inputText) => {
        return [
            JSON.stringify({ type: "text", text: inputText }),
            ...(urlsData || [])?.map(({ url, gcs }) => {
                const obj = {
                    type: "image_url",
                };

                if (gcs) {
                    obj.gcs = gcs;
                    obj.url = url;
                    obj.image_url = {
                        url: gcs,
                    };
                } else {
                    obj.image_url = { url };
                }

                return JSON.stringify(obj);
            }),
        ];
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();
        if (codeRequestId && inputValue) {
            apolloClient.query({
                query: CODE_HUMAN_INPUT,
                variables: {
                    codeRequestId,
                    text: inputValue,
                },
                fetchPolicy: "network-only",
            });

            setInputValue("");
            return;
        }
        if (!loading && inputValue) {
            const message = prepareMessage(inputValue);
            onSend(urlsData && urlsData.length > 0 ? message : inputValue);
            setInputValue("");
            setFiles([]);
            setUrlsData([]);
        }
    };

    const addUrl = (urlData) => {
        const { url } = urlData;
        const fetchData = async (url) => {
            if (!url) return;

            try {
                const docId = uuidv4();
                const filename = getFilename(url);

                dispatch(setFileLoading());

                console.log("Cognitive insert", activeChatId);

                client
                    .query({
                        query: COGNITIVE_INSERT,
                        variables: {
                            file: url,
                            privateData: true,
                            contextId,
                            docId,
                            chatId: activeChatId,
                        },
                        fetchPolicy: "network-only",
                    })
                    .then(() => {
                        // completed successfully
                        addDocument.mutateAsync({
                            docId,
                            filename,
                            chatId: activeChatId,
                        });
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
            //media urls, will be sent with active message
            if (isMediaUrl(url)) {
                setUrlsData((prevUrlsData) => [...prevUrlsData, urlData]);
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
                    setIsUploadingMedia={setIsUploadingMedia}
                />
            )}
            <div className="rounded-md border dark:border-zinc-200">
                <form
                    onSubmit={handleFormSubmit}
                    className="flex items-center rounded-md dark:bg-zinc-100"
                >
                    {enableRag && (
                        <div className="rounded-s pt-4 [.docked_&]:pt-3.5 ps-4 pe-3 dark:bg-zinc-100 self-stretch flex">
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
                                placeholder={
                                    codeRequestId
                                        ? "Send a message to active coding agent 🤖"
                                        : placeholder || "Send a message"
                                }
                                value={inputValue}
                                onChange={handleInputChange}
                                autoComplete="on"
                                autoCapitalize="sentences"
                                autoCorrect="on"
                                spellCheck="true"
                                inputMode="text"
                            />
                        </div>
                    </div>
                    <div className=" pe-4 ps-3 dark:bg-zinc-100 self-stretch flex rounded-e">
                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={
                                    codeRequestId
                                        ? false
                                        : loading ||
                                          inputValue === "" ||
                                          isUploadingMedia ||
                                          viewingReadOnlyChat
                                }
                                className={classNames(
                                    "text-base rtl:rotate-180 text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100",
                                )}
                            >
                                <RiSendPlane2Fill />
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default MessageInput;
