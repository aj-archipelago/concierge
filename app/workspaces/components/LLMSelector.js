import { useEffect } from "react";
import { useLLMs } from "../../queries/llms";

export default function LLMSelector({ value, onChange }) {
    const { data: llms, isLoading } = useLLMs();

    useEffect(() => {
        if (llms && llms.length > 0 && !value) {
            const defaultLLM = llms.find((llm) => llm.isDefault);
            if (defaultLLM) {
                onChange(defaultLLM._id);
            } else {
                onChange(llms[0]._id);
            }
        }
    }, [llms, value, onChange]);

    if (isLoading) return null;

    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="lb-input mb-2"
        >
            {llms?.map((llm) => (
                <option key={llm._id} value={llm._id}>
                    {llm.name}
                </option>
            ))}
        </select>
    );
}
