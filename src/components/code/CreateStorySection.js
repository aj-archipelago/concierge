"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import LoadingButton from "../editor/LoadingButton";
import { basePath } from "../../utils/constants";
import { useTranslation } from "react-i18next";

export default function CreateStorySection({ token, ticket }) {
    // read parameter code from querystring
    const [sites, setSites] = useState([]);

    const [issueType, setIssueType] = useState(ticket.issueType);
    const [createdUrl, setCreatedUrl] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const [projects, setProjects] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const { title, description } = ticket;
    const [fieldValues, setFieldValues] = useState({});
    const { t } = useTranslation();

    const preferences = JSON.parse(
        localStorage.getItem("jira_preferences") || "{}",
    );
    const [selectedSite, setSelectedSite] = useState(
        sites.find((s) => s.name === preferences?.site?.name) || {},
    );
    const [project, setProject] = useState(preferences?.project);

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
                {t(
                    "To create this issue in JIRA, please connect Labeeb to your JIRA account.",
                )}
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
                    <div className="basis-1/3">
                        <h5 className="text-gray-500 font-medium text-sm mb-1">
                            {t("Issue type")}
                        </h5>
                        <IssueTypes
                            defaultIssueType={ticket.issueType}
                            value={issueType}
                            onChange={setIssueType}
                            projectKey={project}
                            token={token}
                            siteId={selectedSite.id}
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <IssueFields
                        value={fieldValues}
                        onChange={setFieldValues}
                        issueTypeId={issueType}
                        projectKey={project}
                        siteId={selectedSite.id}
                        token={token}
                    />
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
                                        fields: fieldValues,
                                    },
                                );
                                setCreating(false);

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

const SPECIAL_FIELDS = ["summary", "issuetype", "project", "reporter"];

function IssueFields({
    value,
    onChange,
    issueTypeId,
    projectKey,
    siteId,
    token,
}) {
    const [fields, setFields] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const { t } = useTranslation();

    useEffect(() => {
        if (!issueTypeId) {
            return;
        }

        setError(null);
        setFields([]);
        setLoading(true);

        axios
            .get(
                `${window.location.origin}${basePath || ""}/api/jira/projects/${projectKey}/fields?siteId=${siteId}&token=${token}&issueTypeId=${issueTypeId}`,
            )
            .then((response) => {
                const fields = response.data.filter(
                    (f) => !SPECIAL_FIELDS.includes(f.key) && f.required,
                );
                setFields(fields);
            })
            .catch((error) => {
                setError(error);
                console.error(error);
                setFields([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [issueTypeId, projectKey, siteId, token]);

    if (error) {
        return (
            <div className="text-red-500 text-sm">
                <p>
                    An error occurred while trying to get fields for the issue
                    type. Please make sure you have access to create issues in
                    this project.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <p className="text-sm">{t("Checking for required fields")}...</p>
        );
    }

    if (!fields?.length) {
        return <p className="text-sm">{t("No required fields.")}</p>;
    }

    return (
        <div>
            <h5 className="font-medium">{t("Required fields")}</h5>
            {fields
                ?.sort((a, b) => a.name.localeCompare(b.name))
                .map((field) => (
                    <div
                        key={field.key}
                        className="flex gap-2 mb-2 items-center"
                    >
                        <label className="basis-32 text-sm">{field.name}</label>
                        <FieldInput
                            field={field}
                            value={value[field.key]}
                            onChange={(newValue) => {
                                onChange({
                                    ...value,
                                    [field.key]: newValue,
                                });
                            }}
                        />
                    </div>
                ))}
        </div>
    );
}

function FieldInput({ field, value, onChange }) {
    const allowedValues = field.allowedValues;

    if (allowedValues?.length) {
        return (
            <select
                value={value?.id}
                onChange={(e) =>
                    onChange({
                        id: e.target.value,
                    })
                }
                className="lb-input basis-64"
            >
                {allowedValues.map((value) => (
                    <option key={value.id} value={value.id}>
                        {value.value || value.name}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="lb-input basis-64"
            placeholder={field.name}
        />
    );
}

function IssueTypes({
    value,
    onChange,
    projectKey,
    token,
    siteId,
    defaultIssueType,
}) {
    const [issueTypes, setIssueTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
                if (defaultIssueType) {
                    onChange(
                        project.issueTypes.find(
                            (t) => t.name === defaultIssueType,
                        )?.id,
                    );
                }
                setLoading(false);
            })
            .catch((error) => {
                console.error(error);
                setLoading(false);
                setError(error);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    return (
        <select
            className="lb-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            {loading && (
                <option value={value} disabled>
                    Loading issue types...
                </option>
            )}
            {issueTypes
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((type) => (
                    <option key={type.id} value={type.id}>
                        {type.name}
                    </option>
                ))}
        </select>
    );
}
