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
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineWorkspaces } from "react-icons/md";
import classNames from "../../app/utils/class-names";
import config from "../../config";
import { LanguageContext } from "../contexts/LanguageProvider";

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

export default function Sidebar() {
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
                    <li>
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
                    {/* <li className="-mx-6 mt-auto">
            <Link
              href="#"
              className="flex items-center gap-x-4 px-6 py-3 text-sm font-semibold leading-6 text-gray-900 hover:bg-gray-100"
            >
              <img
                className="h-8 w-8 rounded-full bg-gray-100"
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                alt=""
              />
              <span className="sr-only">Your profile</span>
              <span aria-hidden="true">Tom Cook</span>
            </Link>
          </li> */}
                </ul>
            </nav>
        </div>
    );
}
