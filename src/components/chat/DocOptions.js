import { useLazyQuery } from "@apollo/client";
import { Popover, Transition } from "@headlessui/react";
import { Fragment, useState } from "react";
import { Form, ListGroup, Spinner } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { AiOutlineClose } from "react-icons/ai";
import {
    BsFiletypeDocx,
    BsFiletypePdf,
    BsFiletypeTxt,
    BsFiletypeXlsx,
} from "react-icons/bs";
import { IoIosTrash } from "react-icons/io";
import { useDispatch, useSelector } from "react-redux";
import config from "../../../config";
import { COGNITIVE_DELETE } from "../../graphql";
import {
    addSource,
    removeDoc,
    removeDocs,
    removeSource,
} from "../../stores/docSlice";
import FileUploadComponent from "./FileUploadComponent";
import { FiSettings } from "react-icons/fi";

export const dataSources = [
    {
        key: "mydata",
        name: `My uploads and ${config?.global?.siteTitle} UI`,
        description: "use my uploaded files and the write pane",
    },
    ...config?.chat?.dataSources,
];

function getFileIcon(filename) {
    const extension = filename?.split(".").pop().toLowerCase();
    switch (extension) {
        case "pdf":
            return <BsFiletypePdf />;
        case "docx":
        case "doc":
            return <BsFiletypeDocx />;
        case "xlsx":
        case "xls":
            return <BsFiletypeXlsx />;
        default:
            return <BsFiletypeTxt />;
    }
}

export default function DocOptions() {
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const docs = useSelector((state) => state.doc.docs);
    const selectedSources =
        useSelector((state) => state.doc.selectedSources) || [];
    const contextId = useSelector((state) => state.chat.contextId);
    // check if selectedSources include mydata
    const mydataSelected = useSelector(
        (state) => state.doc.selectedSources,
    )?.includes("mydata");
    //only show loading spinner if mydata is selected
    const mainPaneIndexerLoading =
        useSelector((state) => state.mainPaneIndexer.isLoading) &&
        mydataSelected;
    const mainPaneIndexerError = useSelector(
        (state) => state.mainPaneIndexer.error,
    );
    const fileUploaderLoading = useSelector(
        (state) => state.fileUpload?.isLoading,
    );
    const fileUploaderError = useSelector((state) => state.fileUpload?.error);

    const [cognitiveDelete, { loading: loadingCD }] = useLazyQuery(
        COGNITIVE_DELETE,
        {
            fetchPolicy: "network-only",
        },
    );

    const handleDataSource = (source) => {
        if (selectedSources.includes(source)) {
            dispatch(removeSource(source));
        } else {
            dispatch(addSource(source));
        }
    };

    const handleDelete = (id) => {
        cognitiveDelete({ variables: { contextId, docId: id } });
        dispatch(removeDoc(id));
    };
    return (
        <Popover className="relative">
            {({ open, close }) => (
                <>
                    <Popover.Button
                        className={`
                ${open ? "text-gray-600" : "text-gray-500"}
                group flex items-center text-base font-medium hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75`}
                    >
                        <FiSettings />
                    </Popover.Button>
                    <Transition
                        as={Fragment}
                        enter="transition ease-out duration-200"
                        enterFrom="opacity-0 translate-y-1"
                        enterTo="opacity-100 translate-y-0"
                        leave="transition ease-in duration-150"
                        leaveFrom="opacity-100 translate-y-0"
                        leaveTo="opacity-0 translate-y-1"
                    >
                        <Popover.Panel className="absolute left-0 z-10 -translate-y-full transform lg:max-w-3xl">
                            <div className="overflow-hidden rounded shadow-lg ring-1 ring-black/5 w-64 text-sm">
                                <div className="relative grid gap-4 bg-white p-4 overflow-auto">
                                    <button
                                        onClick={() => close()}
                                        className="absolute top-4 end-4 hover:text-sky-500 active:text-sky-700"
                                    >
                                        <AiOutlineClose />
                                    </button>

                                    <div className="">
                                        <div className="font-medium mb-2">
                                            {t("Data sources")}
                                        </div>
                                        <div className="text-xs">
                                            {dataSources.map((source) => (
                                                <div
                                                    onClick={() =>
                                                        handleDataSource(
                                                            source.key,
                                                        )
                                                    }
                                                    key={source.key}
                                                >
                                                    <Form.Check
                                                        type="checkbox"
                                                        className="flex gap-2 items-center"
                                                        checked={selectedSources.includes(
                                                            source.key,
                                                        )}
                                                        readOnly
                                                        label={t(source.name)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="">
                                            <div className="font-medium mb-2">
                                                {t("Uploads")}
                                            </div>
                                            {docs?.length > 0 && (
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        marginInlineStart:
                                                            "auto",
                                                        fontSize: "0.8em",
                                                    }}
                                                >
                                                    <div
                                                        className="chat-option"
                                                        onClick={() => {
                                                            cognitiveDelete({
                                                                variables: {
                                                                    contextId,
                                                                },
                                                            });
                                                            dispatch(
                                                                removeDocs(),
                                                            );
                                                        }}
                                                    >
                                                        {t(
                                                            "Delete all uploads",
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="chat-option-box-uploads">
                                            <div>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        width: "100%",
                                                    }}
                                                >
                                                    <FileUploadComponent />
                                                </div>
                                            </div>
                                            {docs?.length > 0 && (
                                                <ListGroup
                                                    style={{
                                                        display: "block",
                                                        overflow: "auto",
                                                        maxHeight: "200px",
                                                        overflowY: "auto",
                                                    }}
                                                >
                                                    {docs.map(
                                                        ({
                                                            docId: id,
                                                            filename,
                                                        }) => (
                                                            <ListGroup.Item
                                                                as="div"
                                                                key={id}
                                                                className="d-flex justify-content-between align-items-center"
                                                                style={{
                                                                    marginRight:
                                                                        "5px",
                                                                    marginBottom:
                                                                        "5px",
                                                                    padding:
                                                                        "2px",
                                                                    border: "1px solid #ccc",
                                                                    borderRadius:
                                                                        "5px",
                                                                    overflow:
                                                                        "hidden",
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        fontSize:
                                                                            "1.2em",
                                                                        marginRight:
                                                                            "5px",
                                                                        flex: "0 0 auto",
                                                                    }}
                                                                >
                                                                    {getFileIcon(
                                                                        filename,
                                                                    )}
                                                                </div>
                                                                <span
                                                                    style={{
                                                                        marginRight:
                                                                            "5px",
                                                                        cursor: "default",
                                                                        overflow:
                                                                            "hidden",
                                                                        textOverflow:
                                                                            "ellipsis",
                                                                        whiteSpace:
                                                                            "nowrap",
                                                                        flex: "1 1 auto",
                                                                    }}
                                                                >
                                                                    {filename}
                                                                </span>
                                                                <button
                                                                    className="lb-primary"
                                                                    style={{
                                                                        alignSelf:
                                                                            "center",
                                                                        padding:
                                                                            "0px 0px",
                                                                        fontSize:
                                                                            "1.2em",
                                                                        flex: "0 0 auto",
                                                                    }}
                                                                    onClick={() =>
                                                                        handleDelete(
                                                                            id,
                                                                        )
                                                                    }
                                                                >
                                                                    <IoIosTrash />
                                                                </button>
                                                            </ListGroup.Item>
                                                        ),
                                                    )}
                                                </ListGroup>
                                            )}
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    marginTop: "10px",
                                                }}
                                            >
                                                {mainPaneIndexerError ||
                                                fileUploaderError ? (
                                                    <div
                                                        style={{ color: "red" }}
                                                    >
                                                        {mainPaneIndexerError ||
                                                            fileUploaderError}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <Spinner
                                                            style={{
                                                                position:
                                                                    "relative",
                                                                top: "-2px",
                                                            }}
                                                            animation="border"
                                                            size="sm"
                                                            role="status"
                                                            hidden={
                                                                !loadingCD &&
                                                                !mainPaneIndexerLoading &&
                                                                !fileUploaderLoading
                                                            }
                                                        />
                                                        {(mainPaneIndexerLoading ||
                                                            fileUploaderLoading) && (
                                                            <span
                                                                style={{
                                                                    marginInlineStart:
                                                                        "5px",
                                                                }}
                                                            >
                                                                {t(
                                                                    "Uploading...",
                                                                )}
                                                            </span>
                                                        )}
                                                        {loadingCD && (
                                                            <span
                                                                style={{
                                                                    marginInlineStart:
                                                                        "5px",
                                                                }}
                                                            >
                                                                {t(
                                                                    "Deleting...",
                                                                )}
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Popover.Panel>
                    </Transition>
                </>
            )}
        </Popover>
    );
}
