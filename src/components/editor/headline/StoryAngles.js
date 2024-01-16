import { useQuery } from "@apollo/client";
import { Button } from "react-bootstrap";
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
        <div className="mb-3 story-angles">
            <div className="d-flex gap-2 p-3" style={{ flexWrap: "wrap" }}>
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
                        <Button
                            size="sm"
                            onClick={() => onSelect(angle)}
                            variant="outline-secondary"
                            disabled={currentAngle === angle}
                            key={i}
                        >
                            {angle}
                        </Button>
                    ))}
            </div>
        </div>
    );
}

export default StoryAngles;
