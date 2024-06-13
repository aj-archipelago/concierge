"use client";

import {
    ChatBubbleLeftIcon,
    CodeBracketIcon,
    GlobeAltIcon,
    MicrophoneIcon,
    PencilSquareIcon,
    PhotoIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineWorkspaces } from "react-icons/md";
import classNames from "../../app/utils/class-names";
import config from "../../config";
import { LanguageContext } from "../contexts/LanguageProvider";
import { HelpCircle } from "lucide-react";
import SendFeedbackModal from "../components/help/SendFeedbackModal";

const navigation = [
    {
        name: "Chat",
        icon: ChatBubbleLeftIcon,
        href: "/chat",
    },
    {
        name: "Translate",
        icon: GlobeAltIcon,
        href: "/translate",
    },
    {
        name: "Transcribe",
        icon: MicrophoneIcon,
        href: "/transcribe",
    },
    {
        name: "Write",
        icon: PencilSquareIcon,
        href: "/write",
    },
    {
        name: "Workspaces",
        icon: MdOutlineWorkspaces,
        href: "/workspaces",
    },
    {
        name: "Images",
        icon: PhotoIcon,
        href: "/images",
    },
    {
        name: "Code",
        icon: CodeBracketIcon,
        children: [
            {
                name: "Knuth",
                href: "/code/knuth",
            },
            {
                name: "JIRA",
                href: "/code/jira",
            },
        ],
    },
];

export default React.forwardRef(function Sidebar(_, ref) {
    const pathname = usePathname();
    const router = useRouter();
    const { getLogo, getSidebarLogo } = config.global;
    const { language } = useContext(LanguageContext);
    const { t } = useTranslation();

    return (
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-5">
            <div className="flex h-16 shrink-0 items-center gap-2">
                <Link className="flex items-center gap-2" href="/">
                    <img
                        className="h-12 w-auto"
                        src={getLogo(language)}
                        alt="Your Company"
                    />
                    {getSidebarLogo(language)}
                </Link>
            </div>
            <nav className="flex flex-1 flex-col">
                <ul className="flex flex-1 flex-col gap-y-7">
                    <li className="grow ">
                        <ul className="-mx-2 space-y-1">
                            {navigation.map((item) => {
                                return (
                                    <li key={item.name}>
                                        {!item.children ? (
                                            <Link
                                                href={item.href || "#"}
                                                className={classNames(
                                                    pathname.includes(item.href)
                                                        ? "bg-gray-100"
                                                        : "hover:bg-gray-100",
                                                    "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold text-gray-700",
                                                )}
                                            >
                                                <item.icon
                                                    className="h-6 w-6 shrink-0 text-gray-400"
                                                    aria-hidden="true"
                                                />
                                                {t(item.name)}
                                            </Link>
                                        ) : (
                                            <div>
                                                <button
                                                    className={classNames(
                                                        pathname.includes(
                                                            item.href,
                                                        )
                                                            ? "bg-gray-100"
                                                            : "hover:bg-gray-100",
                                                        "flex items-center w-full text-start rounded-md p-2 gap-x-3 text-sm leading-6 font-semibold text-gray-700",
                                                    )}
                                                    onClick={() => {
                                                        if (
                                                            item.children
                                                                ?.length > 0
                                                        ) {
                                                            router.push(
                                                                item.children[0]
                                                                    .href,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <item.icon
                                                        className="h-6 w-6 shrink-0 text-gray-400"
                                                        aria-hidden="true"
                                                    />
                                                    {t(item.name)}
                                                </button>
                                                <ul className="mt-1 px-2">
                                                    {item.children?.map(
                                                        (subItem) => (
                                                            <li
                                                                key={
                                                                    subItem.name
                                                                }
                                                            >
                                                                {/* 44px */}
                                                                <Link
                                                                    href={
                                                                        subItem.href
                                                                    }
                                                                    className={classNames(
                                                                        pathname.includes(
                                                                            subItem.href,
                                                                        )
                                                                            ? "bg-gray-100"
                                                                            : "hover:bg-gray-100",
                                                                        "block rounded-md py-2 pe-2 pl-9 text-sm leading-6 text-gray-700",
                                                                    )}
                                                                >
                                                                    {t(
                                                                        subItem.name,
                                                                    )}
                                                                </Link>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </li>
                    <li>
                        <div className="py-3 bg-gray-50 -mx-5 px-5 text-gray-700">
                            <SendFeedbackButton ref={ref} />
                        </div>
                    </li>
                </ul>
            </nav>
        </div>
    );
});

const SendFeedbackButton = React.forwardRef(
    function SendFeedbackButton(_, ref) {
        const [show, setShow] = useState(false);
        const { t } = useTranslation();

        return (
            <>
                <SendFeedbackModal
                    ref={ref}
                    show={show}
                    onHide={() => setShow(false)}
                />
                <button
                    className="flex gap-2 items-center text-sm"
                    onClick={() => setShow(true)}
                >
                    <HelpCircle className="h-6 w-6 shrink-0 text-gray-400" />
                    {t("Send feedback")}
                </button>
            </>
        );
    },
);
