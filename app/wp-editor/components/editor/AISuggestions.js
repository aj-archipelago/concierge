import { useQuery } from "@apollo/client";
import { Spinner } from "@/components/ui/spinner";
import { QUERIES } from "../../../../src/graphql";
import LoadingButton from "./LoadingButton";
import i18n from "../../../../src/i18n";

export default function AISuggestions({
    text,
    onSelect,
    regenerateText,
    field,
    renderSuggestions,
}) {
    const { loading, error, data, refetch } = useQuery(QUERIES.ENTITIES, {
        notifyOnNetworkStatusChange: true,
        variables: { text },
    });

    if (loading && !data) {
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

    const suggestion = data[field]?.trim();
    onSelect(suggestion);

    return (
        <div>
            <p>{renderSuggestions(suggestion)}</p>
            {regenerateText && (
                <LoadingButton
                    loading={loading}
                    onClick={() => {
                        refetch();
                    }}
                >
                    {regenerateText}
                </LoadingButton>
            )}
        </div>
    );
}
