"use client";
import { Dialog, Transition } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IoIosChatbubbles } from "react-icons/io";
import { useDispatch, useSelector } from "react-redux";
import { setChatBoxPosition } from "../stores/chatSlice";
import Footer from "./Footer";
import Sidebar from "./Sidebar";

export default function Layout({ children }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [position, setPosition] = useState("closed");
    const statePosition = useSelector((state) => state.chat?.chatBox?.position);
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const ChatBox = dynamic(() => import("../components/chat/ChatBox"), {
        ssr: false,
    });

    useEffect(() => {
        setPosition(statePosition);
    }, [statePosition]);

    return (
        <>
            <div>
                <Transition.Root show={sidebarOpen} as={Fragment}>
                    <Dialog
                        as="div"
                        className="relative z-50 lg:hidden"
                        onClose={setSidebarOpen}
                    >
                        <Transition.Child
                            as={Fragment}
                            enter="transition-opacity ease-linear duration-300"
                            enterFrom="opacity-0"
                            enterTo="opacity-100"
                            leave="transition-opacity ease-linear duration-300"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                        >
                            <div className="fixed inset-0 bg-gray-900/80" />
                        </Transition.Child>

                        <div className="fixed inset-0 flex">
                            <Transition.Child
                                as={Fragment}
                                enter="transition ease-in-out duration-300 transform"
                                enterFrom="-translate-x-full"
                                enterTo="translate-x-0"
                                leave="transition ease-in-out duration-300 transform"
                                leaveFrom="translate-x-0"
                                leaveTo="-translate-x-full"
                            >
                                <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                                    <Transition.Child
                                        as={Fragment}
                                        enter="ease-in-out duration-300"
                                        enterFrom="opacity-0"
                                        enterTo="opacity-100"
                                        leave="ease-in-out duration-300"
                                        leaveFrom="opacity-100"
                                        leaveTo="opacity-0"
                                    >
                                        <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                                            <button
                                                type="button"
                                                className="-m-2.5 p-2.5"
                                                onClick={() =>
                                                    setSidebarOpen(false)
                                                }
                                            >
                                                <span className="sr-only">
                                                    Close sidebar
                                                </span>
                                                <XMarkIcon
                                                    className="h-6 w-6 text-white"
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </div>
                                    </Transition.Child>
                                    {/* Sidebar component, swap this element with another sidebar if you like */}
                                    <Sidebar />
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </Dialog>
                </Transition.Root>

                {/* Static sidebar for desktop */}
                <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-56 lg:flex-col">
                    {/* Sidebar component, swap this element with another sidebar if you like */}
                    <Sidebar />
                </div>

                <div className="lg:ps-56">
                    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
                        <button
                            type="button"
                            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <span className="sr-only">Open sidebar</span>
                            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
                        </button>

                        {/* Separator */}
                        <div
                            className="h-6 w-px bg-gray-900/10 lg:hidden"
                            aria-hidden="true"
                        />

                        <div className="flex flex-1 gap-x-4 justify-end lg:gap-x-6">
                            <div>
                                <button
                                    className="lb-sm lb-primary"
                                    onClick={() => {
                                        dispatch(
                                            setChatBoxPosition({
                                                position: "docked",
                                            }),
                                        );
                                    }}
                                >
                                    <IoIosChatbubbles /> {t("Chat")}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="relative flex-col">
                        <main className="p-2 bg-slate-50 flex gap-2">
                            <div
                                className={`${"grow"} bg-white dark:border-gray-200 rounded border p-3 lg:p-4 overflow-auto`}
                                style={{ height: "calc(100vh - 118px)" }}
                            >
                                {children}
                            </div>
                            {position !== "closed" && (
                                <div className="basis-[302px] h-[calc(100vh-118px)]">
                                    <ChatBox />
                                </div>
                            )}
                        </main>
                        <Footer />
                    </div>
                </div>
            </div>
        </>
    );
}
