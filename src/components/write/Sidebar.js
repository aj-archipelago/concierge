import { Accordion } from "@/components/ui/accordion";
import { createContext, useState } from "react";
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
import Tags from "./sidebar/Tags";
import Topics from "./sidebar/Topics";

function Highlights({ inputText, onAction }) {
    const [highlights, setHighlights] = useState([]);

    return (
        <SidebarItem
            icon={<BiNews />}
            inputText={inputText}
            name="Highlights"
            output={highlights}
            renderOutput={() => (
                <div className="mb-2">
                    {highlights.map((item, i) => (
                        <div
                            key={`keyword-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <div className="flex justify-between">
                                <div className="flex-1">{item}</div>
                                <div>
                                    <button
                                        className="p-0 text-gray-500 hover:text-gray-700"
                                        onClick={() => {
                                            onAction("remove_content", {
                                                content: item,
                                            });
                                        }}
                                    >
                                        <AiOutlineClose />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
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
        <div className="flex items-center gap-2.5 text-xs mb-3">
            <div>{t("Length")}</div>
            <input
                className="flex-shrink-0 w-20 h-6 text-xs p-1 min-w-[50px] lb-input rounded"
                key="summary-length"
                type="number"
                value={value.targetLength}
                onChange={(e) =>
                    onChange({ targetLength: parseInt(e.target.value) })
                }
            />
            <LoadingButton
                loading={loading}
                disabled={loading}
                className="w-8 h-6 text-xs lb-primary"
                onClick={() => {
                    handleClearSummary();
                    onCommit();
                }}
            >
                {t("Go")}
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
                    <pre className="font-sans text-sm">{summary}</pre>
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
                <div className="mb-2">
                    {keywords.map((item, i) => (
                        <div
                            key={`keyword-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton item={item} />
                            {item}
                        </div>
                    ))}
                </div>
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
                <div className="mb-2">
                    {entities.map((entity, i) => (
                        <div
                            key={`entity-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton
                                item={`${entity.name}: ${entity.definition}`}
                            />
                            <strong>{entity.name}</strong>
                            <br />
                            {entity.definition}
                        </div>
                    ))}
                </div>
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
    const [value, setValue] = useState([]);

    return (
        <SidebarContext.Provider value={{ openItems: value }}>
            <Accordion
                type="multiple"
                className="border rounded-md"
                value={value}
                onValueChange={setValue}
            >
                <Summary inputText={inputText} />
                <Highlights inputText={inputText} onAction={onAction} />
                <SearchKeywords inputText={inputText} />
                <Topics inputText={inputText} />
                <Tags inputText={inputText} />
                <Entities inputText={inputText} />
                <TimelineBox inputText={inputText} />
            </Accordion>
        </SidebarContext.Provider>
    );
}

export const SidebarContext = createContext();
export default Sidebar;
