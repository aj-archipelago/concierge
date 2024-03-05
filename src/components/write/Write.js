"use client";

import React, { useCallback, useMemo, useState } from "react";
import "react-quill/dist/quill.snow.css";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { setWriteInputText } from "../../stores/writeSlice";
import AIModal from "../AIModal";
import actions from "../editor/AIEditorActions";
import HeadlineEditor from "../editor/headline/HeadlineEditor";
import Editor from "./Editor";
import Sidebar from "./Sidebar";
import Toolbar from "./Toolbar";
import { indexMainPaneText } from "../../utils/indexMainPaneText";
import * as amplitude from "@amplitude/analytics-browser";
import { useApolloClient } from "@apollo/client";

const WriteTab = styled.div`
    display: flex;
    gap: 20px;
    min-height: calc(100vh - 170px);
    padding-top: 10px;
`;

const EditorPane = styled.div`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
`;

const SidebarPane = styled.div`
    flex-basis: 40%;
`;

function Write() {
    const inputText = useSelector((state) => state.write?.inputText);
    const contextId = useSelector((state) => state.chat.contextId);
    const [selection, setSelection] = useState(null);
    const dispatch = useDispatch();
    const [headline, setHeadline] = useState("");
    const [subhead, setSubhead] = useState("");
    const client = useApolloClient();

    // The action is the AI action that the user has selected.
    // It triggers the AI modal.
    const [action, setAction] = useState(null);
    const [args, setArgs] = useState(null);

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

            dispatch(setWriteInputText(getUpdatedText(t)));
            indexMainPaneText(getUpdatedText(t), contextId, dispatch, client);
        },
        [dispatch, action, inputText, selection, contextId],
    );

    const handleEditorSelect = React.useCallback(
        (selection) => {
            setSelection(selection);
        },
        [setSelection],
    );

    const handleEditorChange = React.useCallback(
        (text) => {
            dispatch(setWriteInputText(text));
            indexMainPaneText(text, contextId, dispatch, client);
        },
        [dispatch, contextId],
    );

    const editorPane = useMemo(() => {
        return (
            <>
                <EditorPane>
                    <div className="mb-2">
                        <HeadlineEditor
                            headline={headline}
                            subhead={subhead}
                            onChange={(h) => {
                                setHeadline(h.headline);
                                setSubhead(h.subhead);
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
                </EditorPane>
                <SidebarPane>
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
                </SidebarPane>
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
    ]);

    return (
        <>
            <div
                style={{
                    display: "flex",
                    gap: 10,
                    width: "100%",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <div style={{ flex: 1, width: "100%" }}>
                    <WriteTab>{editorPane}</WriteTab>
                </div>
            </div>
        </>
    );
}

export default Write;
