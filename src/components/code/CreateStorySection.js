"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import LoadingButton from "../editor/LoadingButton";
import { basePath } from "../../utils/constants";
import { useTranslation } from "react-i18next";

export default function CreateStorySection({ token, ticket }) {
    // read parameter code from querystring
    const [sites, setSites] = useState([]);
    const [selectedSite, setSelectedSite] = useState("");
    const [project, setProject] = useState(
        localStorage.getItem("jira_project") || "",
    );
    const [issueType, setIssueType] = useState(ticket.issueType);
    const [createdUrl, setCreatedUrl] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const [projects, setProjects] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const { title, description } = ticket;
    const { t } = useTranslation();

    useEffect(() => {
        if (!token || !selectedSite) {
            return;
        }

        setLoadingProjects(true);
        // load projects
        axios
            .get(
                `${window.location.origin}${basePath || ""}/api/jira/projects?siteId=${selectedSite.id}&token=${token}`,
            )
            .then((response) => {
                const data = response.data;

                // sort by key
                data.sort((a, b) => {
                    if (a.key < b.key) {
                        return -1;
                    }
                    if (a.key > b.key) {
                        return 1;
                    }
                    return 0;
                });

                setLoadingProjects(false);
                setProjects(data);
            })
            .catch((error) => {
                console.error(error);
                setLoadingProjects(false);
            });
    }, [token, selectedSite]);

    useEffect(() => {
        if (token) {
            axios
                .get(
                    "https://api.atlassian.com/oauth/token/accessible-resources",
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    },
                )
                .then((response) => {
                    setSites(response.data);
                    setSelectedSite(response.data?.[0]);
                });
        }
    }, [token]);

    if (!token) {
        return (
            <div className="mb-4 text-sm italic text-gray-500">
                {t("To create this issue in JIRA, please connect Labeeb to your JIRA account.")}
            </div>
        );
    } else {
        return (
            <div className="flex flex-col gap-3 mt-3 mb-4">
                <h4 className="font-semibold">{t("Create Issue")}</h4>
                <div className="flex gap-2">
                    <div className="basis-1/3">
                        <h5 className="text-gray-500 font-medium text-sm mb-1">
                            {t("Jira Site")}
                        </h5>
                        <select
                            className="lb-input"
                            value={selectedSite}
                            onChange={(e) => setSelectedSite(e.target.value)}
                        >
                            {sites.map((site) => (
                                <option key={site.name} value={site.name}>
                                    {site.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="basis-1/3">
                        <h5 className="text-gray-500 font-medium text-sm mb-1">
                            {t("Issue type")}
                        </h5>
                        <select
                            className="lb-input"
                            value={issueType}
                            onChange={(e) => setIssueType(e.target.value)}
                        >
                            <option value="Story">Story</option>
                            <option value="Bug">Bug</option>
                            <option value="Task">Task</option>
                            <option value="Epic">Epic</option>
                        </select>
                    </div>
                    <div className="basis-1/3">
                        <h5 className="text-gray-500 font-medium text-sm mb-1">
                            {t("Project")}
                        </h5>
                        <select
                            className="lb-input"
                            value={project}
                            onChange={(e) => {
                                setProject(e.target.value);
                                localStorage.setItem(
                                    "jira_project",
                                    e.target.value,
                                );
                            }}
                        >
                            {loadingProjects && (
                                <option value={project} disabled>
                                    {t("Loading projects")}...
                                </option>
                            )}
                            {projects.map((project) => (
                                <option key={project.key} value={project.key}>
                                    {project.key}: {project.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {!createdUrl && (
                    <div>
                        <LoadingButton
                            loading={creating}
                            text={t("Creating") + "..."}
                            className="lb-primary"
                            onClick={async () => {
                                setCreating(true);
                                setError(null);

                                const response = await axios.post(
                                    `${window.location.origin}${basePath || ""}/api/jira/issues`,
                                    {
                                        title,
                                        description,
                                        projectKey: project,
                                        issueType: issueType,
                                        siteId: selectedSite.id,
                                        token,
                                    },
                                );
                                setCreating(false);
                                console.log(response);

                                if (response.data.key) {
                                    setCreatedUrl(
                                        `https://${selectedSite.name}.atlassian.net/browse/${response.data.key}`,
                                    );
                                } else {
                                    setError(
                                        `An error occurred: ${JSON.stringify(response.data.errors || response.data.error || "")}`,
                                    );
                                }
                            }}
                        >
                            {t("Create issue in JIRA")}
                        </LoadingButton>
                    </div>
                )}
                {error && (
                    <div className="text-red-500 text-sm">
                        <p>{error}</p>
                    </div>
                )}
                {createdUrl && (
                    <div className="flex flex-col gap-1">
                        <div className="flex gap-2">
                            <a
                                href={createdUrl}
                                rel="noreferrer"
                                target="_blank"
                                className="lb-success"
                            >
                                {t("View created story")}
                            </a>
                            <button
                                className="lb-warning"
                                onClick={() => {
                                    setCreatedUrl("");
                                }}
                            >
                                {t("Create another")}
                            </button>
                        </div>
                        <p className="text-sm">
                            {t("Story created successfully")}:{" "}
                            <a
                                className="lb-link"
                                href={createdUrl}
                                rel="noreferrer"
                                target="_blank"
                            >
                                {createdUrl}
                            </a>
                        </p>
                    </div>
                )}
            </div>
        );
    }
}
