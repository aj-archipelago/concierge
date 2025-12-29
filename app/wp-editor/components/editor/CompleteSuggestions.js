import { useQuery } from "@apollo/client";
import { QUERIES } from "../../../../src/graphql";
import { DiffEditor } from "@monaco-editor/react";
import { Spinner } from "@/components/ui/spinner";
import i18n from "../../../../src/i18n";

export default function CompleteSuggestions({ text, onSelect, diffEditorRef }) {
    const { loading, error, data } = useQuery(QUERIES.PASS, {
        variables: {
            text: `${text}\nFinish writing the above article for me:`,
        },
    });

    if (loading) {
        return (
            <p className="flex items-center gap-2">
                <Spinner size="sm" /> {i18n.t("Loading")}
            </p>
        );
    }

    if (error) {
        return (
            <p>
                {i18n.t("Error")} {error}
            </p>
        );
    }

    function handleEditorDidMount(editor, monaco) {
        diffEditorRef.current = editor;
    }

    const correction = data?.pass?.result?.trim();
    onSelect(correction);

    return (
        <div>
            <h6>{i18n.t("Suggested completion")}</h6>
            <DiffEditor
                height="50vh"
                original={text}
                modified={correction}
                language="text"
                onMount={handleEditorDidMount}
                options={{
                    wordWrap: "on",
                    diffWordWrap: "on",
                }}
            />
        </div>
    );
}
