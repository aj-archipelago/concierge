"use client";

import { useQuery } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../../App";
import JiraProjectSelect from "./JiraProjectSelect";
import ConnectJiraButton from "./ConnectJiraButton";

export default function Jira({ clientSecret }) {
    const [prompt, setPrompt] = useState("");
    const [text, setText] = useState("");
    const [storyCount, setStoryCount] = useState("one");
    const router = useRouter();
    const { t } = useTranslation();
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const [preferences, setPreferences] = useState(
        JSON.parse(localStorage.getItem("jira_preferences") || "{}"),
    );
    const [token, setToken] = useState(null);

    const variables = {
        text: prompt,
        storyCount: storyCount,
        storyType: preferences?.issueTypes?.join(" | "),
    };

    const { loading, error, data } = useQuery(QUERIES.JIRA_STORY, {
        variables,
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "network-only",
        skip: !prompt,
    });

    useEffect(() => {
        if (userState?.jira?.input) {
            setText(userState.jira.input);
        }
    }, [userState]);

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
            <ol className="list-decimal text-lg font-medium ps-8 flex flex-col gap-4 mb-6">
                <li>
                    <h4 className="mb-2 ">{t("Connect JIRA to Labeeb")}</h4>
                    <div className="ps4">
                        <ConnectJiraButton
                            clientSecret={clientSecret}
                            onTokenChange={setToken}
                        />
                    </div>
                </li>
                <li>
                    <h4 className="mb-2">{t("Enter story details")}</h4>
                    <div className="text-base mb-2 text-gray-500 font-normal">
                        {t(
                            "In a few sentences, describe the story you want to create in JIRA. Alternatively, you can copy-paste an email or a Slack thread to automatically create stories from.",
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <textarea
                            rows={10}
                            className="lb-input"
                            value={text}
                            onChange={(e) => {
                                setText(e.target.value);
                                debouncedUpdateUserState({
                                    jira: { input: e.target.value },
                                });
                            }}
                        />
                        <div className="flex gap-2 items-center">
                            <div className="whitespace-nowrap font-medium text-sm">
                                {t(
                                    "How many stories should the AI extract from the above text?",
                                )}
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
                    </div>
                </li>
                {token && (
                    <>
                        <li>
                            <h4 className="mb-2">
                                {t("Enter JIRA project details")}
                            </h4>

                            <JiraProjectSelect
                                token={token}
                                value={preferences}
                                onChange={(p) => {
                                    localStorage.setItem(
                                        "jira_preferences",
                                        JSON.stringify(p),
                                    );
                                    setPreferences(p);
                                }}
                            />
                            <div className="mb-6">
                                <LoadingButton
                                    variant="primary"
                                    text={t("Loading") + "..."}
                                    loading={loading}
                                    disabled={loading || !text}
                                    onClick={async () => {
                                        setPrompt(text);
                                    }}
                                >
                                    {t("Get JIRA Story Details")}
                                </LoadingButton>
                            </div>
                        </li>
                    </>
                )}
            </ol>
            <div>
                {error && (
                    <p>
                        {t("An error occurred")}:{" "}
                        {error.message || error.toString()}
                    </p>
                )}
            </div>
        </div>
    );
}
