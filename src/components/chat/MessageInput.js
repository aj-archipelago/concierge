import "highlight.js/styles/github.css";
import { useState } from "react";
import { Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { RiSendPlaneFill } from "react-icons/ri";
import { useSelector } from "react-redux";
import TextareaAutosize from "react-textarea-autosize";
import classNames from "../../../app/utils/class-names";
import config from "../../../config";

// Displays the list of messages and a message input box.
function MessageInput({
    size = "docked",
    onSend,
    loading,
    placeholder,
    container = "chatpage",
    displayState = "closed",
}) {
    const codeBotName = config?.code?.botName;
    const chatBotName = config?.chat?.botName;

    // const includeAJArticles = useSelector(state => state.chat.includeAJArticles);
    const dataSourcesSelected = useSelector(
        (state) => state.doc.selectedSources,
    );
    const typingString =
        container === "codepage"
            ? `${codeBotName} is typing`
            : `${chatBotName} is typing`;
    const researchString =
        container === "codepage"
            ? `${codeBotName} is typing`
            : `${chatBotName} is researching`;
    const { t } = useTranslation();
    const typingIndicator = (
        <div className="typing-indicator">
            {t(dataSourcesSelected?.length > 0 ? researchString : typingString)}
        </div>
    );

    const [inputValue, setInputValue] = useState("");

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();
        if (inputValue) {
            onSend(inputValue);
            setInputValue("");
        }
    };

    let buttonWidthClass = size === "full" ? "w-20" : "w-12";

    return (
        <div className="message-input">
            {loading && <>{typingIndicator}</>}
            <Form onSubmit={handleFormSubmit} className="d-flex mb-0 border-t">
                <TextareaAutosize
                    typeahead="none"
                    className={`message-input-textarea outline-0`}
                    rows={1}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleFormSubmit(e);
                        }
                    }}
                    placeholder={placeholder || "Send a message"}
                    value={inputValue}
                    onChange={handleInputChange}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                />
                <button
                    type="submit"
                    className={classNames(
                        "py-3 hover:bg-zinc-100 active:bg-zinc-300 shadow-inner flex justify-center items-center",
                        buttonWidthClass,
                    )}
                >
                    <RiSendPlaneFill />
                </button>
            </Form>
        </div>
    );
}

export default MessageInput;
