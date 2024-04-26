import { Menu, Transition } from "@headlessui/react";
import { Fragment, useContext } from "react";
import classNames from "../../app/utils/class-names";
import { LanguageContext } from "../contexts/LanguageProvider";
import { useTranslation } from "react-i18next";
import React from 'react';

export default function ProfileDropdown({ user, handleShowOptions}) {
    const { initials, name } = user;
    const { direction } = useContext(LanguageContext);
    const { t } = useTranslation();

    return (
        <Menu as="div" className="relative inline-block text-start">
            <div>
                <Menu.Button className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-500">
                    <span className="text-sm font-medium leading-none text-white">
                        {initials}
                    </span>
                </Menu.Button>
            </div>

            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items
                    className={classNames(
                        direction === "ltr" ? "right-0" : "left-0",
                        "absolute z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none",
                    )}
                >
                    <div className="py-1">
                        <Menu.Item>
                            {({ active }) => (
                                <div className="px-4 py-2 text-gray-700 text-sm">
                                    <div className="text-xs text-gray-400">
                                        {t("Signed in as")}
                                    </div>
                                    <div className="font-medium">{name}</div>
                                </div>
                            )}
                        </Menu.Item>
                    </div>
                    <div className="py-1">
                        <Menu.Item>
                            {({ active }) => (                              
                                <div
                                    className={classNames(
                                        active
                                            ? "bg-gray-100 text-gray-900"
                                            : "text-gray-700"
                                    )}
                                >
                                    <a
                                        className={classNames(
                                            "block w-full px-4 py-2 text-start text-sm"
                                        )}
                                        href="."
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleShowOptions();
                                        }}
                                    >
                                        {t("Options")}
                                    </a>
                                </div>
                            )}
                        </Menu.Item>
                    </div>
                    <div className="py-1">
                        <Menu.Item>
                            {({ active }) => (
                                <a
                                    className={classNames(
                                        active
                                            ? "bg-gray-100 text-gray-900"
                                            : "text-gray-700",
                                        "block w-full px-4 py-2 text-start text-sm",
                                    )}
                                    href="/.auth/logout"
                                >
                                    {t("Sign out")}
                                </a>
                            )}
                        </Menu.Item>
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    );
}
