import { Modal } from "@/components/ui/modal";
import { useApolloClient, useQuery } from "@apollo/client";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiDownload, FiUpload } from "react-icons/fi";
import { useUpdateAiOptions } from "../../app/queries/options";
import { QUERIES } from "../../src/graphql";
import { AuthContext } from "../App";

const UserOptions = ({ show, handleClose }) => {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const fileInputRef = useRef();
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(
        user.aiMemorySelfModify || false,
    );
    const [aiName, setAiName] = useState(user.aiName || "Labeeb");
    const [aiStyle, setAiStyle] = useState(user.aiStyle || "OpenAI");
    const [streamingEnabled, setStreamingEnabled] = useState(
        user.streamingEnabled || false,
    );
    const [activeMemoryTab, setActiveMemoryTab] = useState("user");
    const [parsedMemory, setParsedMemory] = useState({
        memorySelf: "",
        memoryDirectives: "",
        memoryUser: "",
        memoryTopics: "",
        memoryVersion: "",
    });
    const [uploadError, setUploadError] = useState("");

    const updateAiOptionsMutation = useUpdateAiOptions();
    const apolloClient = useApolloClient();

    // Modified query to fetch aiMemory
    const {
        data: memoryData,
        loading: memoryLoading,
        refetch: refetchMemory,
    } = useQuery(QUERIES.SYS_READ_MEMORY, {
        variables: { contextId: user.contextId },
        skip: !user.contextId,
        fetchPolicy: "network-only", // This ensures we always fetch from the network
    });

    // Effect to refetch memory when modal is shown
    useEffect(() => {
        if (show && user.contextId) {
            refetchMemory();
        }
    }, [show, user.contextId, refetchMemory]);

    useEffect(() => {
        if (memoryData && memoryData.sys_read_memory.result) {
            try {
                const parsed = JSON.parse(memoryData.sys_read_memory.result);
                setParsedMemory({
                    memorySelf: parsed.memorySelf || "",
                    memoryDirectives: parsed.memoryDirectives || "",
                    memoryUser: parsed.memoryUser || "",
                    memoryTopics: parsed.memoryTopics || "",
                    memoryVersion: parsed.memoryVersion || "",
                });
            } catch (e) {
                // If parsing fails, put everything in memoryUser
                setParsedMemory({
                    memorySelf: "",
                    memoryDirectives: "",
                    memoryUser: memoryData.sys_read_memory.result || "",
                    memoryTopics: "",
                    memoryVersion: "",
                });
            }
        }
    }, [memoryData]);

    useEffect(() => {
        setAiMemorySelfModify(user.aiMemorySelfModify || false);
    }, [user]);

    const handleClearMemory = () => {
        setParsedMemory({
            memorySelf: "",
            memoryDirectives: "",
            memoryUser: "",
            memoryTopics: "",
            memoryVersion: "",
        });
    };

    const handleSave = async () => {
        if (!user || !user.userId) {
            console.error("UserId not found");
            return;
        }

        await updateAiOptionsMutation.mutateAsync({
            userId: user.userId,
            contextId: user.contextId,
            aiMemorySelfModify,
            aiName,
            aiStyle,
            streamingEnabled,
        });

        const combinedMemory = JSON.stringify(parsedMemory);

        apolloClient
            .mutate({
                mutation: QUERIES.SYS_SAVE_MEMORY,
                variables: {
                    contextId: user.contextId,
                    aiMemory: combinedMemory,
                },
            })
            .then((result) => {
                console.log("Saved memory to Cortex", result);
            })
            .catch((error) => {
                console.error("Failed to save memory to Cortex", error);
            });

        handleClose();
    };

    const handleDownloadMemory = () => {
        const blob = new Blob([JSON.stringify(parsedMemory, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const now = new Date();
        const date = now.toISOString().split("T")[0];
        const time = now.toTimeString().split(" ")[0].replace(/:/g, "-");
        a.download = `${aiName.toLowerCase()}-memory-${date}-${time}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleUploadMemory = (event) => {
        const file = event.target.files[0];
        setUploadError(""); // Clear any previous errors
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const uploaded = JSON.parse(e.target.result);
                    // Validate the required memory structure
                    if (!uploaded || typeof uploaded !== "object") {
                        throw new Error(t("Invalid memory file format"));
                    }
                    setParsedMemory({
                        memorySelf: uploaded.memorySelf || "",
                        memoryDirectives: uploaded.memoryDirectives || "",
                        memoryUser: uploaded.memoryUser || "",
                        memoryTopics: uploaded.memoryTopics || "",
                        memoryVersion: uploaded.memoryVersion || "",
                    });
                } catch (error) {
                    console.error("Failed to parse memory file:", error);
                    setUploadError(
                        t(
                            "Failed to parse memory file. Please ensure it is a valid JSON file with the correct memory structure.",
                        ),
                    );
                    // Reset the file input so the same file can be selected again
                    if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                    }
                }
            };
            reader.onerror = () => {
                setUploadError(t("Failed to read the file. Please try again."));
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            };
            reader.readAsText(file);
        }
    };

    const memoryTabs = [
        { id: "user", label: "User Memory" },
        { id: "self", label: "Self Memory" },
        { id: "directives", label: "Directives" },
        { id: "topics", label: "Topics" },
    ];

    const getMemoryValueForTab = (tabId) => {
        const mapping = {
            user: "memoryUser",
            self: "memorySelf",
            directives: "memoryDirectives",
            topics: "memoryTopics",
        };
        return parsedMemory[mapping[tabId]];
    };

    const handleMemoryChange = (value, tabId) => {
        const mapping = {
            user: "memoryUser",
            self: "memorySelf",
            directives: "memoryDirectives",
            topics: "memoryTopics",
        };
        setParsedMemory((prev) => ({
            ...prev,
            [mapping[tabId]]: value,
        }));
    };

    return (
        <Modal
            widthClassName="max-w-2xl"
            title={t("Options")}
            show={show}
            onHide={handleClose}
        >
            <div className="text-sm">
                <h4 className="text-base font-semibold mb-2">{t("AI Name")}</h4>
                <input
                    type="text"
                    value={aiName}
                    onChange={(e) => setAiName(e.target.value)}
                    className="lb-input w-full mb-4"
                    placeholder={t("Enter AI Name")}
                />

                <h4 className="text-base font-semibold mb-2">
                    {t("AI Style")}
                </h4>
                <select
                    value={aiStyle}
                    onChange={(e) => setAiStyle(e.target.value)}
                    className="lb-input w-full mb-4"
                >
                    <option value="OpenAI">{t("OpenAI")}</option>
                    <option value="Anthropic">{t("Anthropic")}</option>
                </select>

                <h4 className="text-base font-semibold mb-2">
                    {t("Chat Options")}
                </h4>
                <div className="flex gap-2 items-center mb-4">
                    <input
                        type="checkbox"
                        size="sm"
                        id="streamingEnabled"
                        className="accent-sky-500"
                        checked={streamingEnabled}
                        onChange={(e) => setStreamingEnabled(e.target.checked)}
                        style={{ margin: "0.5rem 0" }}
                    />
                    <label htmlFor="streamingEnabled">
                        {t("Enable streaming responses")}
                    </label>
                </div>

                <h4 className="text-base font-semibold mb-2">
                    {t("AI Memory")}
                </h4>
                <p className="text-gray-600">
                    {t(
                        "You can customize your interactions with the AI assistant by giving it things to remember. You can enter plain text or something more structured like JSON or XML. If you allow it, the AI will periodically modify its own memory to improve its ability to assist you.",
                    )}
                </p>
                <div className="flex gap-2 items-center mb-4">
                    <input
                        type="checkbox"
                        size="sm"
                        id="aiMemorySelfModify"
                        className="accent-sky-500"
                        checked={aiMemorySelfModify}
                        onChange={(e) =>
                            setAiMemorySelfModify(e.target.checked)
                        }
                        style={{ margin: "0.5rem 0" }}
                    />
                    <label htmlFor="aiMemorySelfModify">
                        {t("Allow the AI to modify its own memory")}
                    </label>
                </div>
                <div>
                    <h4 className="text-base font-semibold mb-2">
                        {t("Currently stored memory")}
                    </h4>
                    {memoryLoading ? (
                        <p>{t("Loading memory...")}</p>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex gap-2 items-center">
                                    <button
                                        className="lb-outline-danger"
                                        onClick={handleClearMemory}
                                    >
                                        {t("Clear Memory")}
                                    </button>
                                    <button
                                        className="lb-outline-secondary"
                                        onClick={handleDownloadMemory}
                                        title={t("Download memory backup")}
                                    >
                                        <FiDownload className="w-4 h-4" />
                                    </button>
                                    <button
                                        className="lb-outline-secondary"
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        title={t("Upload memory from backup")}
                                    >
                                        <FiUpload className="w-4 h-4" />
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json"
                                        onChange={handleUploadMemory}
                                        className="hidden"
                                    />
                                </div>
                                <div className="text-sm text-gray-500 flex gap-2 items-center">
                                    <span>
                                        {t("Memory size: {{size}} characters", {
                                            size: JSON.stringify(parsedMemory)
                                                .length,
                                        })}
                                    </span>
                                    {parsedMemory.memoryVersion && (
                                        <span className="text-xs text-gray-400">
                                            (v{parsedMemory.memoryVersion})
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="border-b border-gray-200">
                                <nav className="flex -mb-px">
                                    {memoryTabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            className={`mr-2 py-2 px-4 font-medium text-sm border-b-2 ${
                                                activeMemoryTab === tab.id
                                                    ? "border-sky-500 text-sky-600"
                                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                            }`}
                                            onClick={() =>
                                                setActiveMemoryTab(tab.id)
                                            }
                                        >
                                            {t(tab.label)}
                                        </button>
                                    ))}
                                </nav>
                            </div>
                            <textarea
                                value={getMemoryValueForTab(activeMemoryTab)}
                                onChange={(e) =>
                                    handleMemoryChange(
                                        e.target.value,
                                        activeMemoryTab,
                                    )
                                }
                                className="lb-input font-mono w-full mt-4"
                                rows={10}
                            />
                            {uploadError && (
                                <div className="text-red-500 text-sm mt-2">
                                    {uploadError}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            <div className="justify-end flex gap-2 mt-4">
                <button className="lb-outline-secondary" onClick={handleClose}>
                    {t("Close")}
                </button>
                <button className="lb-primary" onClick={handleSave}>
                    {t("Save changes")}
                </button>
            </div>
        </Modal>
    );
};

export default UserOptions;
