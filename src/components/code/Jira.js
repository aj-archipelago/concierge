"use client";

import { useQuery } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";

const ticketTypes = {
    "Auto": "Auto-detect the ticket type based on the content of the story.",
    "User Story": "User stories are short, simple descriptions of a feature told from the perspective of the person who desires the new capability, usually a user or customer of the system. They typically follow the template: \"As a [type of user], I want [some goal] so that [some reason].\"",
    "Bug": "Bugs are used to report errors, flaws, or faults in the software that cause it to produce an incorrect or unexpected result, or to behave in unintended ways. A bug report typically includes steps to reproduce the issue, expected results, actual results, and often the severity of the bug.",
    "Task": "Tasks are used to track work that needs to be done. Unlike user stories, which focus on delivering value to the user, tasks can be any work the team needs to accomplish, such as research, design, development, or documentation tasks.",
    "Epic": "Epics are large bodies of work that can be broken down into smaller tasks or user stories. They are typically used to organize work into bigger themes or features that span across multiple sprints or even multiple projects.",
    "Improvement": "Improvements are used to track enhancements or modifications to existing features or functionalities that are not necessarily fixing a bug. These can include performance enhancements, usability improvements, or adding additional functionality to an existing feature.",
    "New Feature": "New Feature tickets are similar to improvements but are used to track the addition of new functionalities or features that did not previously exist in the system.",
    "Technical Debt": "Technical debt items are used to track work that needs to be done to clean up code, improve performance, or update documentation to make the system more maintainable and efficient.",
    "Spike": "Spikes are used to track research or exploration tasks where the solution or next steps are not yet known. They are often time-boxed and used to gain the knowledge necessary to reduce the risk of a technical approach or to better understand a requirement.",
}

export default function Jira() {
    const [prompt, setPrompt] = useState("");
    const [text, setText] = useState("");
    const [storyCount, setStoryCount] = useState("one");
    const router = useRouter();

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
                data.jira_story.result);

            router.push("/code/jira/create");
        }
    }, [data]);

    return (
        <div className="">
            <div className="flex flex-col gap-4 mb-6">
                <div>
                    In a few sentences, describe the story you want to
                    create in JIRA.
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
                        <div className="whitespace-nowrap font-medium text-sm">How many stories to create</div>
                        <div>
                            <select
                                className="lb-select"
                                value={storyCount}
                                onChange={(e) => {
                                    setStoryCount(e.target.value)
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
                            text="Loading..."
                            loading={loading}
                            onClick={async () => {
                                setPrompt(text);
                            }}
                        >
                            Get JIRA Story Details
                        </LoadingButton>
                    </div>
                </div>
            </div>
            <div>
                {error && (
                    <p>
                        An error occurred: {error.message || error.toString()}
                    </p>
                )}
            </div>
        </div>
    );
}

