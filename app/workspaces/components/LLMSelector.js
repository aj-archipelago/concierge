import { useTranslation } from "react-i18next";
import { useLLMs } from "../../queries/llms";
import { useEffect } from "react";

export default function LLMSelector({ value, onChange }) {
    const { data: llms, isLoading } = useLLMs();

    useEffect(() => {
        if (llms && llms.length > 0 && !value) {
            onChange(llms[0]._id);
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
