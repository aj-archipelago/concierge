import { useEffect } from "react";
import { useState } from "react";
import { Form, ListGroup } from "react-bootstrap";
import Subheads from "./Subheads";

export default function GeneratedHeadlines({
    loading,
    headlines,
    text,
    onSelect,
}) {
    const [selectedHeadline, setSelectedHeadline] = useState(null);

    useEffect(() => {
        setSelectedHeadline(null);
    }, [headlines]);

    if (loading) {
        return <p>Loading</p>;
    }

    if (headlines.length === 0 && !loading) {
        return <p>No headlines generated</p>;
    }

    if (selectedHeadline) {
        return (
            <>
                <ListGroup>
                    <SelectableListItem
                        loading={loading}
                        headline={selectedHeadline}
                        checked={true}
                        onSelect={(checked) => {
                            onSelect(null);
                            if (checked) {
                                setSelectedHeadline(selectedHeadline);
                            } else {
                                setSelectedHeadline(null);
                            }
                        }}
                    ></SelectableListItem>
                    <ListGroup.Item>
                        <h6 className="fw-bold mt-2 mb-0">Subheads</h6>
                        <p className="text-muted">
                            <small>Max length: 120 characters</small>
                        </p>
                        <Subheads
                            headline={selectedHeadline}
                            text={text}
                            onSelect={(subhead) =>
                                onSelect({
                                    headline: selectedHeadline,
                                    subhead,
                                })
                            }
                        />
                    </ListGroup.Item>
                </ListGroup>
            </>
        );
    } else {
        return (
            <>
                <ListGroup>
                    {headlines.map((headline) => (
                        <SelectableListItem
                            loading={loading}
                            key={headline}
                            headline={headline}
                            checked={false}
                            onSelect={() => setSelectedHeadline(headline)}
                        ></SelectableListItem>
                    ))}
                </ListGroup>
            </>
        );
    }
}

function SelectableListItem({ loading, checked = false, onSelect, headline }) {
    return (
        <ListGroup.Item className={loading ? "text-muted" : "pe-5"}>
            <div className="d-flex gap-3 headline-display">
                <Form.Check
                    checked={checked}
                    onChange={(e) => onSelect(e.target.checked)}
                    style={{ marginTop: 1 }}
                ></Form.Check>{" "}
                {headline}
            </div>
        </ListGroup.Item>
    );
}
