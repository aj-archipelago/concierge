import { Menu, Transition } from "@headlessui/react";
import { Fragment, useContext } from "react";
import classNames from "../../app/utils/class-names";
import { LanguageContext } from "../contexts/LanguageProvider";
import { useTranslation } from "react-i18next";
import React from "react";
import { SignOutButton } from "../components/SignOutButton";
import UserAvatar from "../components/UserAvatar";

export default function ProfileDropdown({
    user,
    handleShowOptions,
    setShowTos,
}) {
    const { initials, name } = user;
    const { direction } = useContext(LanguageContext);
    const { t } = useTranslation();

    return (
        <Menu as="div" className="relative inline-block text-start">
            <div>
                <Menu.Button className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 overflow-hidden">
                    <UserAvatar
                        src={user?.profilePicture}
                        blobPath={user?.profilePictureBlobPath}
                        contextId={user?.contextId}
                        name={name || "User"}
                        initials={initials}
                        className="h-full w-full bg-gray-500 text-white"
                        initialsClassName="text-sm font-medium leading-none"
                        iconClassName="h-4 w-4"
                    />
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
                        "absolute z-10 mt-2 w-56 max-w-[calc(100vw-1rem)] origin-top-right overflow-hidden rounded-md border bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:border-gray-600 dark:bg-gray-800",
                    )}
                >
                    <div className="py-1">
                        <Menu.Item>
                            {({ active }) => (
                                <div className="min-w-0 max-w-full overflow-hidden px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                    <div className="truncate text-xs text-gray-400 dark:text-gray-500">
                                        {t("Signed in as")}
                                    </div>
                                    <div
                                        className="max-w-full truncate font-medium text-gray-900 dark:text-gray-100"
                                        title={name}
                                    >
                                        {name}
                                    </div>
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
                                            ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                            : "text-gray-700 dark:text-gray-300",
                                    )}
                                >
                                    <a
                                        className={classNames(
                                            "block w-full px-4 py-2 text-start text-sm",
                                        )}
                                        href="."
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleShowOptions();
                                        }}
                                    >
                                        {t("Settings")}
                                    </a>
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
                                            ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                            : "text-gray-700 dark:text-gray-300",
                                    )}
                                >
                                    <a
                                        className={classNames(
                                            "block w-full px-4 py-2 text-start text-sm",
                                        )}
                                        href="."
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setShowTos(true);
                                        }}
                                    >
                                        {t("Terms of Service")}
                                    </a>
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
                                            ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                            : "text-gray-700 dark:text-gray-300",
                                        "block w-full px-4 py-2 text-start text-sm",
                                    )}
                                >
                                    <SignOutButton className="w-full text-start justify-start bg-transparent border-0 hover:bg-transparent hover:text-gray-900 p-0 h-auto" />
                                </div>
                            )}
                        </Menu.Item>
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    );
}
