import { useEffect } from "react";
import { useLLMs } from "../../queries/llms";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function LLMSelector({ value, onChange, defaultModelIdentifier }) {
    const { data: llms, isLoading } = useLLMs();

    useEffect(() => {
        if (llms && llms.length > 0 && !value) {
            const defaultLLM = llms.find((llm) => 
                defaultModelIdentifier ? llm.identifier === defaultModelIdentifier : llm.isDefault);
            if (defaultLLM) {
                onChange(defaultLLM._id);
            } else {
                onChange(llms[0]._id);
            }
        }
    }, [llms, value, onChange]);

    if (isLoading) return null;

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {llms?.map((llm) => (
                    <SelectItem key={llm._id} value={llm._id}>
                        {llm.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
