"use client";
import { Dialog, Transition } from "@headlessui/react";
import { X } from "lucide-react";
import { Fragment } from "react";

export function Modal({
    show,
    onHide,
    title,
    children,
    widthClassName = "max-w-6xl",
    initialFocus,
}) {
    return (
        <Transition appear show={show} as={Fragment}>
            <Dialog
                as="div"
                className="relative z-50"
                onClose={() => {}}
                initialFocus={initialFocus}
            >
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/25" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel
                                className={`w-full ${widthClassName} transform overflow-hidden rounded-md bg-white dark:bg-gray-800 dark:border-gray-600 border p-6 text-start align-middle shadow-xl transition-all`}
                            >
                                <Dialog.Title
                                    as="h3"
                                    className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100 mb-4"
                                >
                                    <div className="justify-between flex">
                                        <div>{title}</div>
                                        <div>
                                            <button
                                                onClick={onHide}
                                                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </Dialog.Title>
                                {children}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
