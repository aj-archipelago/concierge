import { ListGroup } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { BiNews } from "react-icons/bi";
import { BsArrowsExpand, BsBook } from "react-icons/bs";
import { FaEdit, FaLanguage, FaSpellCheck, FaVideo } from "react-icons/fa";
import {
    MdOutlineListAlt,
    MdOutlineSummarize,
    MdOutlineTopic,
} from "react-icons/md";
import config from "../../../config";
import CopyButton from "../CopyButton";
import TranscribePage from "../transcribe/TranscribePage";
import ExpandStoryContent from "./ExpandStoryContent";
import {
    getSuggestionInputComponent,
    getTextSuggestionsComponent,
} from "./TextSuggestions";
import TranslateModalContent from "./TranslateModalContent";
import HeadlineModal from "./headline/HeadlineModal";

const ListRenderer = ({ value }) => {
    value.sort();

    return (
        <ListGroup style={{ marginBottom: 20 }}>
            {value.map((item) => (
                <ListGroup.Item>
                    <CopyButton item={item} />
                    {item}
                </ListGroup.Item>
            ))}
        </ListGroup>
    );
};

const customActions = config.write?.actions || {};

const actions = {
    grammar: {
        Icon: FaSpellCheck,
        title: "Spelling and grammar",
        dialogClassName: "modal-wide",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "GRAMMAR",
            outputType: "diff",
        }),
        commitLabel: "Use Corrected Version",
    },
    headline: {
        Icon: BiNews,
        title: "Headline creator",
        dialogClassName: "modal-wide",
        SuggestionsComponent: HeadlineModal,
        commitLabel: "Use selected headline and subhead",
    },
    styleguide: {
        Icon: BsBook,
        title: "Apply style guide",
        dialogClassName: "modal-wide",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "STYLE_GUIDE",
            outputType: "diff-styleguide",
            outputTitle: "",
        }),
        commitLabel: "Use Corrected Text",
    },
    summarize: {
        Icon: MdOutlineSummarize,
        title: "Summarize",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "SUMMARIZE_TURBO",
            outputTitle: "Summary",
            redoText: "Write another summary",
            busyMessage: "Writing summary...",
            SuggestionInput: getSuggestionInputComponent({
                inputType: "none",
            }),
            QueryParameters: ({ value, onChange }) => {
                const { t } = useTranslation();
                value.targetLength = value.targetLength || 500;

                function getTargetLength(event) {
                    const returnValue = parseInt(event.target.value, 10);
                    if (
                        isNaN(returnValue) ||
                        returnValue < 0 ||
                        returnValue > 9999
                    ) {
                        return 500;
                    }
                    return returnValue;
                }

                return (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: 20,
                            marginTop: -10,
                        }}
                    >
                        <div
                            style={{ fontWeight: "bold", marginRight: "10px" }}
                        >
                            {t("Length")}:
                        </div>
                        <div style={{}}>
                            <input
                                type="number"
                                min="0"
                                max="9999"
                                pattern="\d{1,4}"
                                maxLength="4"
                                defaultValue={value.targetLength}
                                onBlur={(e) => {
                                    onChange({
                                        targetLength: getTargetLength(e),
                                    });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        onChange({
                                            targetLength: getTargetLength(e),
                                        });
                                    }
                                }}
                            />
                        </div>
                        <div style={{ marginInlineStart: "10px" }}>
                            {t("characters")}
                        </div>
                    </div>
                );
            },
        }),
    },
    paraphrase: {
        Icon: FaEdit,
        title: "Rewrite text",
        dialogClassName: "modal-narrow",
        type: "selection",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "PARAPHRASE",
            outputTitle: "Revised Version",
            redoText: "Rewrite this again",
            SuggestionInput: getSuggestionInputComponent({
                inputTitle: "Original Text",
            }),
        }),
        commitLabel: "Use Updated Text",
    },
    remove_content: {
        Icon: FaSpellCheck,
        title: "Remove content",
        dialogClassName: "modal-wide",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "REMOVE_CONTENT",
            outputType: "diff",
        }),
        commitLabel: "Use Updated Version",
    },
    transcribe: {
        Icon: FaVideo,
        title: "Import from media",
        dialogClassName: "modal-narrow",
        commitLabel: "Use transcribed text",
        type: "always-available",
        SuggestionsComponent: TranscribePage,
        postApply: "clear-headline",
    },
    topics: {
        Icon: MdOutlineTopic,
        title: "Get topics",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "TOPICS",
            OutputRenderer: ListRenderer,
            outputTitle: "Topics relevant to this article",
        }),
    },
    keywords: {
        Icon: MdOutlineTopic,
        title: "Get search keywords",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "KEYWORDS",
            OutputRenderer: ListRenderer,
            outputTitle: "Keywords relevant to this article",
        }),
    },
    tags: {
        Icon: MdOutlineTopic,
        title: "Get tags",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "TAGS",
            OutputRenderer: ListRenderer,
            outputTitle: "Tags relevant to this article",
        }),
    },
    translate: {
        Icon: FaLanguage,
        title: "Translate",
        dialogClassName: "modal-narrow",
        commitLabel: "Use Translated Text",
        SuggestionsComponent: TranslateModalContent,
        postApply: "clear-headline",
    },
    entities: {
        Icon: MdOutlineListAlt,
        title: "Extract entities",
        dialogClassName: "modal-narrow",
        SuggestionsComponent: getTextSuggestionsComponent({
            query: "ENTITIES",
            OutputRenderer: ({ value }) => {
                return (
                    <ListGroup>
                        {value.map((entity) => (
                            <ListGroup.Item>
                                <CopyButton
                                    item={`${entity.name}: ${entity.definition}`}
                                />
                                <strong>{entity.name}</strong>
                                <br></br>
                                {entity.definition}
                            </ListGroup.Item>
                        ))}
                    </ListGroup>
                );
            },
            outputTitle: "Entities extracted from text",
        }),
    },
    expand: {
        Icon: BsArrowsExpand,
        title: "Expand this story",
        dialogClassName: "modal-wide",
        SuggestionsComponent: ExpandStoryContent,
    },
    ...customActions,
};

export default actions;
