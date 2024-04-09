import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { MdOutlineSdStorage } from "react-icons/md";
import { Popover } from '@headlessui/react'
import { IoIosTrash } from "react-icons/io";
import {
    BsFiletypeDocx,
    BsFiletypePdf,
    BsFiletypeTxt,
    BsFiletypeXlsx,
} from "react-icons/bs";
import { COGNITIVE_DELETE } from "../../graphql";
import { useLazyQuery } from "@apollo/client";
import {
    removeDoc,
    removeDocs,
} from "../../stores/docSlice";
import { useState } from "react";
import Loader from "../../../app/components/loader";

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

const DELETE_ALL_UPLOADS_STR = "__ALL__";

function ChatTopMenu() {
    const dispatch = useDispatch();
    const docs = useSelector((state) => state.doc.docs);
    const { t } = useTranslation();
    const contextId = useSelector((state) => state.chat.contextId);
    const [currentlyDeletingDocId, setCurrentlyDeletingDocId] = useState(null);
    const mainPaneIndexerLoading = useSelector((state) => state.mainPaneIndexer.isLoading);
    const fileUploaderLoading = useSelector((state) => state.fileUpload?.isLoading);
    const currentlyIndexing = fileUploaderLoading || mainPaneIndexerLoading;

    const [cognitiveDelete, { loading: loadingCD }] = useLazyQuery(
        COGNITIVE_DELETE,
        {
            fetchPolicy: "network-only",
        },
    );

    const handleDelete = (id) => {
        setCurrentlyDeletingDocId(id);
        cognitiveDelete({ variables: { contextId, docId: id } }).then(() => {
            setCurrentlyDeletingDocId(null);
            dispatch(removeDoc(id));
        });
    };

    const handleDeleteAll = () => {
        setCurrentlyDeletingDocId(DELETE_ALL_UPLOADS_STR);
        cognitiveDelete({ variables: { contextId } }).then(() => {
            setCurrentlyDeletingDocId(null);
            dispatch(removeDocs());
        });
    }

    return (
        <div className="flex justify-center rounded shadow-lg items-center px-0 text-xs [.docked_&]:flex">
            {(!docs || docs?.length === 0) ? <>
                <span className="text-gray-400">{t("No active files")}</span>
            </> :
            <Popover className="relative">

            {/* bg-slate-50  hover:bg-slate-300 */}
            <Popover.Button className="flex gap-0 focus:outline-none items-center rounded-md underline hover:text-sky-500 active:text-sky-700">
                <MdOutlineSdStorage />
                {t("Files active")} ({docs?.length})

                {currentlyIndexing && <div className="px-2" ><Loader size="small"/></div> }
            </Popover.Button>

            <Popover.Panel className="absolute z-10 bg-slate-950 p-4 rounded" >
                <div>
                    {docs?.map(({docId: id, filename}) => {
                        const isCurrentlyGettingDeleted = loadingCD && (currentlyDeletingDocId===id || currentlyDeletingDocId===DELETE_ALL_UPLOADS_STR);
                        return (
                            <div key={id} className={`flex border justify-between items-center mx-1 my-2 py-1 px-1 rounded cursor-default ${isCurrentlyGettingDeleted ? 'bg-red-400' : 'bg-gray-100'}`}>
                                <div className="flex gap-1 items-center">
                                    {getFileIcon(filename)}
                                    <span className="text-nowrap" >{isCurrentlyGettingDeleted ? (<span style={{fontSize:"8px"}}>{t("Deleting...")} {filename}</span>) : filename}</span>
                                </div>
                                {!isCurrentlyGettingDeleted &&
                                    <button onClick={() => handleDelete(id)} >
                                        <IoIosTrash className="text-lg" />
                                    </button>
                                }
                            </div>
                        );
                    })}
                </div>

                <div className="chat-option text-center justify-center pt-2.5" onClick={() => handleDeleteAll()}>
                    {t("Delete all uploads")}
                </div>

            </Popover.Panel>
            </Popover>
            }

        </div>
    );
}

export default ChatTopMenu;