import { useContext, useEffect } from "react";
import { useChatModels } from "../../queries/modelMetadata";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";

export default function LLMSelector({
    value,
    onChange,
    defaultModelIdentifier,
    disabled = false,
}) {
    const { data: chatModels, isLoading } = useChatModels();
    const { direction } = useContext(LanguageContext);

    useEffect(() => {
        if (chatModels && chatModels.length > 0 && !value) {
            const defaultModel = chatModels.find((m) =>
                defaultModelIdentifier
                    ? m.modelId === defaultModelIdentifier
                    : m.isDefault,
            );
            if (defaultModel) {
                onChange(defaultModel.modelId);
            } else if (chatModels.length > 0) {
                onChange(chatModels[0].modelId);
            }
        }
    }, [chatModels, value, onChange, defaultModelIdentifier]);

    if (isLoading) return null;

    return (
        <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            dir={direction}
            className="lb-input w-full text-sm"
        >
            {chatModels?.map((model) => (
                <option key={model.modelId} value={model.modelId}>
                    {model.displayName}
                </option>
            ))}
        </select>
    );
}
