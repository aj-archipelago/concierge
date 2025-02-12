import { Modal } from "@/components/ui/modal";
import { useApolloClient, useQuery } from "@apollo/client";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateAiOptions } from "../../app/queries/options";
import { QUERIES } from "../../src/graphql";
import { AuthContext } from "../App";

const UserOptions = ({ show, handleClose }) => {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(
        user.aiMemorySelfModify || false,
    );
    const [aiName, setAiName] = useState(user.aiName || "Labeeb");
    const [aiStyle, setAiStyle] = useState(user.aiStyle || "OpenAI");
    const [streamingEnabled, setStreamingEnabled] = useState(user.streamingEnabled || false);
    const [activeMemoryTab, setActiveMemoryTab] = useState("user");
    const [parsedMemory, setParsedMemory] = useState({
        memorySelf: "",
        memoryDirectives: "",
        memoryUser: "",
        memoryTopics: "",
    });

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
                });
            } catch (e) {
                // If parsing fails, put everything in memoryUser
                setParsedMemory({
                    memorySelf: "",
                    memoryDirectives: "",
                    memoryUser: memoryData.sys_read_memory.result || "",
                    memoryTopics: "",
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

                <h4 className="text-base font-semibold mb-2">{t("Chat Options")}</h4>
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
                                <button
                                    className="lb-outline-danger"
                                    onClick={handleClearMemory}
                                >
                                    {t("Clear Memory")}
                                </button>
                                <span className="text-sm text-gray-500">
                                    {t("Memory size: {{size}} characters", {
                                        size: JSON.stringify(parsedMemory)
                                            .length,
                                    })}
                                </span>
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
