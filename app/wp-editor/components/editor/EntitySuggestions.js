import AISuggestions from "./AISuggestions";

export default function EntitySuggestions(props) {
    return (
        <AISuggestions
            {...props}
            renderSuggestions={(entities) => {
                return entities
                    .split(/\d+\. /)
                    .filter((n) => n.trim())
                    .map((entity, i) => {
                        const [name, definition] = entity
                            .split(":")
                            .map((e) => e.trim());

                        return (
                            <div key={`entity-${i}`} className="mb-3">
                                <h6>{name}</h6>
                                <p>{definition}</p>
                            </div>
                        );
                    });
            }}
            field="entities"
        />
    );
}
