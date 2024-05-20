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
            title={t("Options")}
            show={show}
            onHide={handleClose}
            style={{ fontSize: "0.875rem" }}
        >
            <div style={{ margin: "0.5rem", padding: "0.5rem" }}>
                <label>{t("AI Memory")}</label>
                <input
                    type="text"
                    className="text-muted"
                    style={{ display: "block" }}
                >
                    {t(
                        "You can customize your interactions with the AI assistant by giving it things to remember. You can enter plain text or something more structured like JSON or XML. If you allow it, the AI will periodically modify its own memory to improve its ability to assist you, but it will likely rewrite the memory into a JSON object.",
                    )}
                </input>
                <input
                    type="checkbox"
                    size="sm"
                    label={t("Allow the AI to modify its own memory")}
                    checked={aiMemorySelfModify}
                    onChange={(e) => setAiMemorySelfModify(e.target.checked)}
                    style={{ margin: "0.5rem 0" }}
                />
                <textarea
                    value={aiMemory}
                    onChange={(e) => setAiMemory(e.target.value)}
                    style={{
                        height: "300px",
                        fontFamily: "Courier New, monospace",
                        fontSize: "0.75rem",
                        padding: "10px",
                        margin: "0.5rem 0",
                    }}
                />
            </div>
            <div clsasName="justify-end flex mt-4">
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
