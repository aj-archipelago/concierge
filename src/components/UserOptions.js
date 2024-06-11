import { Modal } from "@/components/ui/modal";
import { useApolloClient } from "@apollo/client";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateAiMemory } from "../../app/queries/options";
import { QUERIES } from "../../src/graphql";
import { AuthContext } from "../App";

const UserOptions = ({ show, handleClose }) => {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const [aiMemory, setAiMemory] = useState(user.aiMemory || "");
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(
        user.aiMemorySelfModify || false,
    );

    const updateAiMemoryMutation = useUpdateAiMemory();
    const apolloClient = useApolloClient();

    useEffect(() => {
        setAiMemory(user.aiMemory || "");
        setAiMemorySelfModify(user.aiMemorySelfModify || false);
    }, [user]);

    const handleSave = async () => {
        if (!user || !user.userId) {
            console.error("UserId not found");
            return;
        }

        await updateAiMemoryMutation.mutateAsync({
            userId: user.userId,
            contextId: user.contextId,
            aiMemory,
            aiMemorySelfModify,
        });

        // update the Cortex copy
        const variables = {
            contextId: user.contextId,
            aiMemory: aiMemory,
        };

        apolloClient
            .query({
                query: QUERIES.RAG_SAVE_MEMORY,
                variables,
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
                <h4 className="font-semibold mb-2">{t("AI Memory")}</h4>
                <p className="text-gray-600">
                    {t(
                        "You can customize your interactions with the AI assistant by giving it things to remember. You can enter plain text or something more structured like JSON or XML. If you allow it, the AI will periodically modify its own memory to improve its ability to assist you, but it will likely rewrite the memory into a JSON object.",
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
                    <label for="aiMemorySelfModify">
                        {t("Allow the AI to modify its own memory")}
                    </label>
                </div>
                <div>
                    <h4 className="font-semibold mb-2">
                        {t("Currently stored memory")}
                    </h4>
                    <textarea
                        value={aiMemory}
                        onChange={(e) => setAiMemory(e.target.value)}
                        className="lb-input font-mono"
                        rows={10}
                    />
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
