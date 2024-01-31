import "highlight.js/styles/github.css";
import { useState } from "react";
import { Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { RiSendPlane2Fill } from "react-icons/ri";
import TextareaAutosize from "react-textarea-autosize";
import classNames from "../../../app/utils/class-names";
import DocOptions from "./DocOptions";

// Displays the list of messages and a message input box.
function MessageInput({ onSend, loading, enableRag, placeholder }) {
    const { t } = useTranslation();

    const [inputValue, setInputValue] = useState("");

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();
        if (!loading && inputValue) {
            onSend(inputValue);
            setInputValue("");
        }
    };

    return (
        <div>
            <div className="rounded border dark:border-zinc-200">
                <Form
                    onSubmit={handleFormSubmit}
                    className="flex items-center rounded"
                >
                    {enableRag && (
                        <div className="rounded-s pt-4 ps-4 pe-3 dark:bg-zinc-100 self-stretch flex">
                            <DocOptions />
                        </div>
                    )}
                    <div className="relative grow">
                        <div className="flex items-center">
                            <TextareaAutosize
                                typeahead="none"
                                className={classNames(
                                    `w-full border-0 outline-none focus:shadow-none [.docked_&]:text-sm focus:ring-0 py-3 resize-none dark:bg-zinc-100`,
                                    enableRag ? "px-1" : "px-3 rounded-s",
                                )}
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
                        </div>
                    </div>
                    <div className=" pe-4 ps-3 dark:bg-zinc-100 self-stretch flex rounded-e">
                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={loading || inputValue === ""}
                                className={classNames(
                                    "text-base rtl:rotate-180 text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100",
                                )}
                            >
                                <RiSendPlane2Fill />
                            </button>
                        </div>
                    </div>
                </Form>
            </div>
        </div>
    );
}

export default MessageInput;
