import { useState } from "react";
import { Accordion, Button, Form, ListGroup } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { AiOutlineClose } from "react-icons/ai";
import { BiNews } from "react-icons/bi";
import { MdOutlineListAlt, MdOutlineSummarize, MdSearch } from "react-icons/md";
import { RiTimeLine } from "react-icons/ri";
import { QUERIES } from "../../graphql";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";
import Timeline from "./Timeline";
import SidebarItem from "./sidebar/SidebarItem";
import Topics from "./sidebar/Topics";
import Tags from "./sidebar/Tags";

function Highlights({ inputText, onAction }) {
    const [highlights, setHighlights] = useState([]);

    return (
        <SidebarItem
            icon={<BiNews />}
            inputText={inputText}
            name="Highlights"
            output={highlights}
            renderOutput={() => (
                <ListGroup className="mb-2">
                    {highlights.map((item, i) => (
                        <ListGroup.Item key={`keyword-${i}`}>
                            <div style={{ display: "flex" }}>
                                <div style={{ flex: 1 }}>{item}</div>
                                <div>
                                    <Button
                                        variant="link"
                                        className="p-0"
                                        style={{ color: "#999" }}
                                        onClick={() => {
                                            onAction("remove_content", {
                                                content: item,
                                            });
                                        }}
                                    >
                                        <AiOutlineClose />
                                    </Button>
                                </div>
                            </div>
                        </ListGroup.Item>
                    ))}
                </ListGroup>
            )}
            query={{
                query: QUERIES.HIGHLIGHTS,
                variables: {
                    text: inputText,
                },
            }}
            onGenerate={(data) => {
                try {
                    setHighlights(
                        data?.highlights?.result
                            ?.split("\n\n")
                            .map((v) => JSON.parse(v))
                            .flat(),
                    );
                } catch (e) {
                    console.error(e);
                    setHighlights([]);
                }
            }}
        />
    );
}

function TimelineBox({ inputText }) {
    const [timeline, setTimeline] = useState([]);

    return (
        <SidebarItem
            icon={<RiTimeLine />}
            inputText={inputText}
            name="Timeline"
            output={timeline}
            renderOutput={() => <Timeline timeline={timeline} />}
            query={{
                query: QUERIES.TIMELINE,
                variables: {
                    text: inputText,
                },
            }}
            onGenerate={(data) => {
                try {
                    setTimeline(
                        data?.timeline?.result
                            ?.split("\n\n")
                            .map((k) => {
                                try {
                                    return JSON.parse(k);
                                } catch (e) {
                                    // Due to chunking, we may get a response that's not parseable
                                    console.error(e, k);
                                    return [];
                                }
                            })
                            .flat(),
                    );
                } catch (e) {
                    console.error(e);
                    setTimeline([]);
                }
            }}
        />
    );
}

const SummaryOptions = ({
    value,
    loading,
    onChange,
    onCommit,
    handleClearSummary,
}) => {
    const { t } = useTranslation();

    return (
        <div
            style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                fontSize: "12px",
            }}
            className="mb-3"
        >
            <div>{t("Length")}</div>
            <Form.Control
                style={{
                    flexBasis: "20%",
                    height: "25px",
                    fontSize: "12px",
                    padding: "5px",
                    minWidth: "50px",
                }}
                key="summary-length"
                size="sm"
                type="number"
                value={value.targetLength}
                onChange={(e) =>
                    onChange({ targetLength: parseInt(e.target.value) })
                }
            ></Form.Control>
            <LoadingButton
                text={t("Generating")}
                loading={loading}
                disabled={loading}
                variant="secondary"
                style={{ fontSize: "10px", padding: "2px 5px" }}
                onClick={() => {
                    handleClearSummary();
                    onCommit();
                }}
            >
                {t("Generate")}
            </LoadingButton>
        </div>
    );
};

function Summary({ inputText }) {
    const [summary, setSummary] = useState("");

    return (
        <SidebarItem
            inputText={inputText}
            name="Summary"
            icon={<MdOutlineSummarize />}
            output={summary}
            defaultParameters={{ targetLength: 120 }}
            Options={(props) => (
                <SummaryOptions
                    {...props}
                    handleClearSummary={() => setSummary("")}
                />
            )}
            renderOutput={() => (
                <div>
                    <pre
                        style={{ fontFamily: "sans-serif", fontSize: "0.9rem" }}
                    >
                        {summary}
                    </pre>
                </div>
            )}
            query={{
                query: QUERIES.SUMMARIZE_TURBO,
                variables: { text: inputText },
            }}
            onGenerate={(data) => setSummary(data?.summarize_turbo?.result)}
        />
    );
}

function SearchKeywords({ inputText }) {
    const [keywords, setKeywords] = useState([]);

    return (
        <SidebarItem
            icon={<MdSearch />}
            inputText={inputText}
            name="Search keywords"
            output={keywords}
            renderOutput={() => (
                <ListGroup className="mb-2">
                    {keywords.map((item, i) => (
                        <ListGroup.Item key={`keyword-${i}`}>
                            <CopyButton item={item} />
                            {item}
                        </ListGroup.Item>
                    ))}
                </ListGroup>
            )}
            query={{
                query: QUERIES.KEYWORDS,
                variables: { text: inputText },
            }}
            onGenerate={(data) => setKeywords(data?.keywords?.result)}
        />
    );
}

function Entities({ inputText }) {
    const [entities, setEntities] = useState([]);

    return (
        <SidebarItem
            icon={<MdOutlineListAlt />}
            inputText={inputText}
            name="Entities"
            output={entities}
            renderOutput={() => (
                <ListGroup className="mb-2">
                    {entities.map((entity, i) => (
                        <ListGroup.Item key={`entity-${i}`}>
                            <CopyButton
                                item={`${entity.name}: ${entity.definition}`}
                            />
                            <strong>{entity.name}</strong>
                            <br></br>
                            {entity.definition}
                        </ListGroup.Item>
                    ))}
                </ListGroup>
            )}
            query={{
                query: QUERIES.ENTITIES,
                variables: { text: inputText },
            }}
            onGenerate={(data) => setEntities(data?.entities?.result)}
        />
    );
}

function Sidebar({ onAction, inputText }) {
    return (
        <Accordion variant="sm" alwaysOpen>
            <Summary inputText={inputText} />
            <Highlights inputText={inputText} onAction={onAction} />
            <SearchKeywords inputText={inputText} />
            <Topics inputText={inputText} />
            <Tags inputText={inputText} />
            <Entities inputText={inputText} />
            <TimelineBox inputText={inputText} />
        </Accordion>
    );
}

export default Sidebar;
