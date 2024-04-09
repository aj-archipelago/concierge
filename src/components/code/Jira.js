"use client";

import { useQuery } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import { useTranslation } from "react-i18next";

export default function Jira() {
    const [prompt, setPrompt] = useState("");
    const [text, setText] = useState("");
    const [storyCount, setStoryCount] = useState("one");
    const router = useRouter();
    const { t } = useTranslation();

    const variables = {
        text: prompt,
        storyCount: storyCount,
    };

    const { loading, error, data } = useQuery(QUERIES.JIRA_STORY, {
        variables,
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "network-only",
        skip: !prompt,
    });

    useEffect(() => {
        if (typeof sessionStorage !== "undefined") {
            setText(sessionStorage.getItem("jira_story_text") || "");
        }
    }, []);

    useEffect(() => {
        if (data?.jira_story?.result) {
            sessionStorage.setItem(
                "jira_story_tickets",
                data.jira_story.result,
            );

            router.push("/code/jira/create");
        }
    }, [data, router]);

    return (
        <div className="">
            <div className="flex flex-col gap-4 mb-6">
                <div>
                    {t("In a few sentences, describe the story you want to create in JIRA.")}
                </div>

                <div className="flex flex-col gap-2">
                    <textarea
                        rows={10}
                        className="lb-input"
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            sessionStorage.setItem(
                                "jira_story_text",
                                e.target.value,
                            );
                        }}
                    />
                    <div className="flex gap-2 items-center">
                        {/* <div className="whitespace-nowrap font-medium text-sm">Story type</div>
                            <div>
                                <select
                                    className="lb-input"
                                    value={storyType}
                                    onChange={(e) => setStoryType(e.target.value)}
                                >
                                    {Object.keys(ticketTypes).map((type) => (
                                        <option key={type} value={type}>
                                            {type}
                                        </option>
                                    ))}
                                </select>
                            </div> */}
                        <div className="whitespace-nowrap font-medium text-sm">
                            {t("How many stories to create")}
                        </div>
                        <div>
                            <select
                                className="lb-select"
                                value={storyCount}
                                onChange={(e) => {
                                    setStoryCount(e.target.value);
                                }}
                            >
                                <option value="one">One</option>
                                <option value="multiple">Multiple</option>
                            </select>
                        </div>
                    </div>
                    {/* <div className="rounded bg-gray-50 p-3 text-sm">
                            {ticketTypes[storyType]}
                        </div> */}
                    <div className="mb-6">
                        <LoadingButton
                            variant="primary"
                            text={t("Loading") + "..."}
                            loading={loading}
                            onClick={async () => {
                                setPrompt(text);
                            }}
                        >
                            {t("Get JIRA Story Details")}
                        </LoadingButton>
                    </div>
                </div>
            </div>
            <div>
                {error && (
                    <p>
                        {t("An error occurred")}: {error.message || error.toString()}
                    </p>
                )}
            </div>
        </div>
    );
}
