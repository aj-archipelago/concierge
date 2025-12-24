import { useContext, useEffect } from "react";
import { useLLMs } from "../../queries/llms";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";

export default function LLMSelector({
    value,
    onChange,
    defaultModelIdentifier,
    disabled = false,
}) {
    const { data: llms, isLoading } = useLLMs();
    const { direction } = useContext(LanguageContext);

    // Filter out labeeb-agent type LLMs (they should use agentMode instead)
    const filteredLLMs = llms?.filter(
        (llm) =>
            llm.identifier !== "labeebagent" &&
            llm.identifier !== "labeebresearchagent",
    );

    useEffect(() => {
        if (filteredLLMs && filteredLLMs.length > 0 && !value) {
            const defaultLLM = filteredLLMs.find((llm) =>
                defaultModelIdentifier
                    ? llm.identifier === defaultModelIdentifier
                    : llm.isDefault,
            );
            if (defaultLLM) {
                onChange(defaultLLM._id);
            } else {
                onChange(filteredLLMs[0]._id);
            }
        }
    }, [filteredLLMs, value, onChange, defaultModelIdentifier]);

    if (isLoading) return null;

    return (
        <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            dir={direction}
            className="lb-input w-full text-sm"
        >
            {filteredLLMs?.map((llm) => (
                <option key={llm._id} value={llm._id}>
                    {llm.name}
                </option>
            ))}
        </select>
    );
}
