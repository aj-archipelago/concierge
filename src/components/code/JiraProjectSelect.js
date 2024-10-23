"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { basePath } from "../../utils/constants";
import classNames from "../../../app/utils/class-names";

export default function JiraProjectSelect({ token, value, onChange }) {
    // read parameter code from querystring
    const [sites, setSites] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const { t } = useTranslation();
    const selectedSite = value?.site;

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
                    if (!selectedSite && response.data?.length) {
                        onChange({
                            ...value,
                            site: response.data[0],
                        });
                    }
                });
        }
    }, [token]);

    if (!token) {
        return (
            <div className="mb-4 text-sm italic text-gray-500">
                {t(
                    "To create this issue in JIRA, please connect Labeeb to your JIRA account.",
                )}
            </div>
        );
    } else {
        return (
            <div className="flex flex-col gap-3 mt-3 mb-4">
                <div className="flex gap-2">
                    <div className="basis-1/3">
                        <h5 className="text-gray-500 font-medium text-sm mb-1">
                            {t("Jira Site")}
                        </h5>
                        <select
                            className="lb-input"
                            value={selectedSite}
                            onChange={(e) =>
                                onChange({
                                    ...value,
                                    site: sites.find(
                                        (site) => site.name === e.target.value,
                                    ),
                                    project: null,
                                    issueTypes: [],
                                })
                            }
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
                            {t("Project")}
                        </h5>
                        <select
                            className="lb-input"
                            value={value?.project}
                            onChange={(e) => {
                                onChange({
                                    ...value,
                                    project: e.target.value,
                                });
                            }}
                        >
                            {loadingProjects && (
                                <option disabled>
                                    {t("Loading projects")}...
                                </option>
                            )}
                            {projects.map((p) => (
                                <option key={p.key} value={p.key}>
                                    {p.key}: {p.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="">
                    <h5 className="text-gray-500 font-medium text-sm mb-1">
                        {t("Issue types to pick from")}
                    </h5>
                    <IssueTypes
                        value={value?.issueTypes}
                        onChange={(i) => {
                            onChange({
                                ...value,
                                issueTypes: i,
                            });
                        }}
                        projectKey={value?.project}
                        token={token}
                        siteId={selectedSite?.id}
                    />
                </div>
            </div>
        );
    }
}

const DEFAULT_ISSUE_TYPES = ["Bug", "Story", "Task"];

function IssueTypes({ value, onChange, projectKey, token, siteId }) {
    const [issueTypes, setIssueTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        if (!siteId || !token || !projectKey) {
            return;
        }

        setError(null);
        setLoading(true);
        axios
            .get(
                `${window.location.origin}${basePath || ""}/api/jira/projects/${projectKey}?siteId=${siteId}&token=${token}`,
            )
            .then((response) => {
                const project = response.data;
                setIssueTypes(project.issueTypes);
                if (!value?.length) {
                    onChange(
                        project.issueTypes
                            ?.filter((type) =>
                                DEFAULT_ISSUE_TYPES.includes(type.name),
                            )
                            .map((type) => type.name),
                    );
                }

                setLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setLoading(false);
                setError(error);
            });
    }, [siteId, projectKey, token]);

    if (error) {
        return (
            <div className="text-red-500 text-sm">
                <p>
                    An error occurred while trying to get issue types for the
                    project. Please make sure you have access to create issues
                    in this project.
                </p>
            </div>
        );
    }

    if (!siteId || !projectKey || !token) {
        return null;
    }

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {loading && (
                    <div className="text-sm font-normal text-gray-500">
                        Loading issue types...
                    </div>
                )}
                {!loading &&
                    issueTypes
                        .filter(
                            (type) =>
                                expanded ||
                                DEFAULT_ISSUE_TYPES.includes(type.name),
                        )
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((type) => (
                            <label
                                htmlFor={`check-${type.id}`}
                                key={type.id}
                                className={classNames(
                                    "flex",
                                    value.includes(type.name)
                                        ? "bg-green-50"
                                        : "bg-gray-50",
                                    "gap-2 p-2 border rounded-md items-center",
                                    "cursor-pointer",
                                )}
                            >
                                <input
                                    type="checkbox"
                                    id={`check-${type.id}`}
                                    className="focus:ring-0 "
                                    checked={value.includes(type.name)}
                                    onChange={(e) =>
                                        onChange(
                                            [
                                                ...value.filter(
                                                    (v) => v !== type.name,
                                                ),
                                                e.target.checked
                                                    ? type.name
                                                    : null,
                                            ].filter((v) => v),
                                        )
                                    }
                                />
                                <div className="text-sm">
                                    <div>{type.name}</div>
                                    {/* <div className="text-gray-500 font-normal text-xs">{type.description || "(No description)"}</div> */}
                                </div>
                            </label>
                        ))}
            </div>
            {!loading && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-sm text-gray-500 font-medium underline"
                >
                    {expanded ? t("Show less") : t("Show all issue types")}
                </button>
            )}
        </>
    );
}
