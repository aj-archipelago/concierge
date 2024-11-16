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
    const [aiMemory, setAiMemory] = useState("");
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(
        user.aiMemorySelfModify || false,
    );
    const [aiName, setAiName] = useState(user.aiName || "Labeeb");
    const [aiStyle, setAiStyle] = useState(user.aiStyle || "OpenAI");

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
            setAiMemory(memoryData.sys_read_memory.result);
        }
    }, [memoryData]);

    useEffect(() => {
        setAiMemorySelfModify(user.aiMemorySelfModify || false);
    }, [user]);

    const handleClearMemory = () => {
        setAiMemory("");
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
        });

        apolloClient
            .mutate({
                mutation: QUERIES.SYS_SAVE_MEMORY,
                variables: {
                    contextId: user.contextId,
                    aiMemory: aiMemory,
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

    return (
        <Modal
            widthClassName="max-w-2xl"
            title={t("Options")}
            show={show}
            onHide={handleClose}
            style={{ fontSize: "0.875rem" }}
        >
            <div>
                <h4 className="font-semibold mb-2">{t("AI Name")}</h4>
                <input
                    type="text"
                    value={aiName}
                    onChange={(e) => setAiName(e.target.value)}
                    className="lb-input w-full mb-4"
                    placeholder={t("Enter AI Name")}
                />

                <h4 className="font-semibold mb-2">{t("AI Style")}</h4>
                <select
                    value={aiStyle}
                    onChange={(e) => setAiStyle(e.target.value)}
                    className="lb-input w-full mb-4"
                >
                    <option value="OpenAI">{t("OpenAI")}</option>
                    <option value="Anthropic">{t("Anthropic")}</option>
                </select>

                <h4 className="font-semibold mb-2">{t("AI Memory")}</h4>
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
                    <h4 className="font-semibold mb-2">
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
                                        size: aiMemory.length,
                                    })}
                                </span>
                            </div>
                            <textarea
                                value={aiMemory}
                                onChange={(e) => setAiMemory(e.target.value)}
                                className="lb-input font-mono w-full"
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
