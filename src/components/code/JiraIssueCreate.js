"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import ConnectJiraButton from "./ConnectJiraButton";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CreateStorySection from "./CreateStorySection";
import { useTranslation } from "react-i18next";

export default function JiraIssueCreate({ clientSecret }) {
    const [tickets, setTickets] = useState([]);
    const [token, setToken] = useState(null);
    const router = useRouter();
    const { t } = useTranslation();

    useEffect(() => {
        if (typeof sessionStorage !== "undefined") {
            let tickets = [];

            if (sessionStorage.getItem("jira_story_tickets")) {
                tickets = JSON.parse(
                    sessionStorage.getItem("jira_story_tickets"),
                );
                setTickets(tickets);
            }

            if (!tickets?.length) {
                router.push("/code/jira");
            }
        }
    }, [router]);

    return (
        <>
            <div className="flex justify-between gap-4 mb-3">
                <div>
                    <button
                        className="lb-primary"
                        onClick={() => {
                            if (window.confirm("Are you sure?")) {
                                router.push("/code/jira");
                            }
                        }}
                    >
                        <RotateCcw />
                        {t("Start over")}
                    </button>
                </div>
                <ConnectJiraButton
                    onTokenChange={(t) => {
                        setToken(t);
                    }}
                    clientSecret={clientSecret}
                />
            </div>
            <h4 className="font-semibold mb-4">
                {t("Jira Issues suggested by AI")}
            </h4>
            <div className="flex flex-col gap-8">
                {tickets.map((ticket, index) => (
                    <JiraTicketContent
                        key={index}
                        value={ticket}
                        token={token}
                        onDelete={() => {
                            const newTickets = tickets.filter(
                                (t) => t !== ticket,
                            );
                            setTickets(newTickets);
                            sessionStorage.setItem(
                                "jira_story_tickets",
                                JSON.stringify(newTickets),
                            );
                            if (!newTickets?.length) {
                                router.push("/code/jira");
                            }
                        }}
                    />
                ))}
            </div>
        </>
    );
}

function JiraTicketContent({ value, token, onDelete }) {
    const ticket = value;
    const [title, setTitle] = useState(ticket.title);
    const [description, setDescription] = useState(ticket.description);
    const { t } = useTranslation();

    useEffect(() => {
        setTitle(ticket.title);
        setDescription(ticket.description);
    }, [ticket]);

    return (
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md border dark:border-gray-600">
            <div className="flex justify-end">
                <button
                    className="text-gray-400 dark:text-gray-500"
                    onClick={() => {
                        if (window.confirm("Are you sure?")) {
                            onDelete();
                        }
                    }}
                >
                    <Trash2 />
                </button>
            </div>
            <div className="grid grid-cols-[130px_1fr] gap-2 p-4">
                <h6 className="font-medium self-center text-sm text-gray-500">
                    {t("Title")}
                </h6>
                <div className="grow">
                    <input
                        type="text"
                        className="lb-input font-semibold"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>
                <div>
                    <h6 className="font-medium text-sm text-gray-500">
                        {t("Description")}
                    </h6>
                </div>
                <div className="">
                    <textarea
                        rows={5}
                        className="lb-input"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        height={400}
                        preview="live"
                    />
                </div>
                <div>
                    <h6 className="font-medium text-sm text-gray-500">
                        {t("Suggested type")}
                    </h6>
                </div>
                <div className="text-sm">{ticket.issueType}</div>
            </div>

            <div className="p-4">
                <CreateStorySection
                    token={token}
                    ticket={{ ...ticket, title, description }}
                />
            </div>
        </div>
    );
}
