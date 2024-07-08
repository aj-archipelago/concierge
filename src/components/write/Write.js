"use client";

import * as amplitude from "@amplitude/analytics-browser";
import { useApolloClient } from "@apollo/client";
import React, {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import "react-quill/dist/quill.snow.css";
import { useDispatch } from "react-redux";
import classNames from "../../../app/utils/class-names";
import { AuthContext } from "../../App";
import { indexMainPaneText } from "../../utils/indexMainPaneText";
import AIModal from "../AIModal";
import actions from "../editor/AIEditorActions";
import HeadlineEditor from "../editor/headline/HeadlineEditor";
import Editor from "./Editor";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";

function Write() {
    const { user, userState, debouncedUpdateUserState } =
        useContext(AuthContext);
    const contextId = user?.contextId;
    const [selection, setSelection] = useState(null);
    const dispatch = useDispatch();
    const [headline, setHeadline] = useState("");
    const [subhead, setSubhead] = useState("");
    const [inputText, setInputText] = useState("");
    const client = useApolloClient();
    const [open, setOpen] = useState(false);

    // The action is the AI action that the user has selected.
    // It triggers the AI modal.
    const [action, setAction] = useState(null);
    const [args, setArgs] = useState(null);
    const { t } = useTranslation();

    useEffect(() => {
        const stateHeadline = userState?.write?.headline;
        const stateSubhead = userState?.write?.subhead;
        const stateText = userState?.write?.text;
        if (stateHeadline) {
            setHeadline(stateHeadline);
        }
        if (stateSubhead) {
            setSubhead(stateSubhead);
        }
        if (stateText) {
            setInputText(stateText);
        }
    }, [userState]);

    // If the action is a selection, then we want to pass the selected text
    // to the AI modal. Otherwise, we want to pass the entire text.
    const modalInputText =
        actions[action]?.type === "selection" ? selection.text : inputText;

    const onHideCallback = useCallback(() => setAction(null), [setAction]);
    const onCommitCallback = useCallback(
        (t) => {
            // If the action is a selection, then we want to update the selected text
            // with the new text. Otherwise, we want to replace the entire text.
            const getUpdatedText = (text) => {
                if (actions[action]?.type === "selection") {
                    const { start, end } = selection;
                    const before = inputText.substring(0, start);
                    const after = inputText.substring(end);
                    return before + text + after;
                } else {
                    return text;
                }
            };

            setInputText(getUpdatedText(t));
            debouncedUpdateUserState({
                write: {
                    headline: headline,
                    subhead: subhead,
                    text: getUpdatedText(t),
                },
            });
            indexMainPaneText(getUpdatedText(t), contextId, dispatch, client);
        },
        [
            dispatch,
            action,
            inputText,
            selection,
            contextId,
            client,
            debouncedUpdateUserState,
            headline,
            subhead,
        ],
    );

    const handleEditorSelect = React.useCallback(
        (selection) => {
            setSelection(selection);
        },
        [setSelection],
    );

    const handleEditorChange = React.useCallback(
        (text) => {
            setInputText(text);
            debouncedUpdateUserState({
                write: {
                    headline,
                    subhead,
                    text,
                },
            });
            indexMainPaneText(text, contextId, dispatch, client);
        },
        [
            dispatch,
            contextId,
            client,
            debouncedUpdateUserState,
            headline,
            subhead,
        ],
    );

    const editorPane = useMemo(() => {
        return (
            <>
                <div
                    className={classNames(
                        "grow md:basis-2/3 flex flex-col",
                        open ? "hidden md:block" : "",
                    )}
                >
                    <div className="mb-2">
                        <HeadlineEditor
                            headline={headline}
                            subhead={subhead}
                            onChange={(h) => {
                                setHeadline(h.headline);
                                setSubhead(h.subhead);

                                debouncedUpdateUserState({
                                    write: {
                                        headline: h.headline,
                                        subhead: h.subhead,
                                        text: inputText,
                                    },
                                });
                            }}
                            articleText={inputText}
                        />
                    </div>
                    <Toolbar
                        actions={actions}
                        onAction={(a, args) => {
                            amplitude.track("Modal Opened", {
                                type: a,
                            });
                            setAction(a);
                            setArgs(args);
                            if (actions[a].postApply) {
                                switch (actions[a].postApply) {
                                    case "clear-headline":
                                        setHeadline("");
                                        setSubhead("");
                                        debouncedUpdateUserState({
                                            write: {
                                                headline: "",
                                                subhead: "",
                                                text: inputText,
                                            },
                                        });
                                        break;
                                    default:
                                        break;
                                }
                            }
                        }}
                        isTextPresent={!!inputText}
                        isTextSelected={!!selection?.text}
                        inputText={inputText}
                    />
                    <Editor
                        value={inputText}
                        onSelect={handleEditorSelect}
                        onChange={handleEditorChange}
                    ></Editor>
                </div>
                <div
                    className={classNames(
                        "grow md:basis-1/3",
                        open ? "" : "hidden md:block",
                    )}
                >
                    <Sidebar
                        actions={actions}
                        onAction={(a, args) => {
                            setAction(a);
                            setArgs(args);
                        }}
                        isTextPresent={!!inputText}
                        isTextSelected={!!selection?.text}
                        inputText={inputText}
                    />
                </div>
                <AIModal
                    show={!!action}
                    onHide={onHideCallback}
                    action={action}
                    args={args}
                    inputText={modalInputText}
                    onCommit={onCommitCallback}
                />
            </>
        );
    }, [
        headline,
        subhead,
        inputText,
        selection?.text,
        handleEditorSelect,
        handleEditorChange,
        action,
        onHideCallback,
        args,
        modalInputText,
        onCommitCallback,
        open,
        debouncedUpdateUserState,
    ]);

    return (
        <>
            <div className="block md:hidden flex justify-end">
                <button className="" onClick={() => setOpen(!open)}>
                    <span className="text-sm text-sky-500">
                        {open ? t("Show editor") : t("Show AI commands")}
                    </span>
                </button>
            </div>
            <div className="flex gap-8 pt-2 h-full">{editorPane}</div>
        </>
    );
}

export default Write;
