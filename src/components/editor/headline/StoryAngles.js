import { useQuery } from "@apollo/client";
import { Button } from "@/components/ui/button"; // Adjust the import path based on your project structure
import { QUERIES } from "../../../graphql";
import LoadingButton from "../LoadingButton";

function StoryAngles({ text, onSelect, currentAngle }) {
    const query = "STORY_ANGLES";
    const { loading, error, data } = useQuery(QUERIES[query], {
        variables: { text },
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "network-only",
    });

    if (error) {
        console.error("error", error);
        return <p>Error loading story angles</p>;
    }

    const angles = data?.[query.toLowerCase()]?.result || [];

    return (
        <div className="mb-3 story-angles text-sm">
            <div className="flex gap-2 flex-wrap">
                {loading && (
                    <LoadingButton
                        size="sm"
                        variant="outline-secondary"
                        className="mb-3"
                        disabled={true}
                        text="Loading suggestions"
                        loading={loading}
                    >
                        Loading suggestions
                    </LoadingButton>
                )}
                {!loading &&
                    angles.map((angle, i) => (
                        <button
                            className="lb-sm lb-outline-secondary"
                            variant="outline"
                            onClick={() => onSelect(angle)}
                            disabled={currentAngle === angle}
                            key={i}
                        >
                            {angle}
                        </button>
                    ))}
            </div>
        </div>
    );
}

export default StoryAngles;
