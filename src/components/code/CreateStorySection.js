"use client";

import axios from "../../../app/utils/axios-client";
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
    const [selectedSite, setSelectedSite] = useState(null);
    const [project, setProject] = useState(preferences?.project);

    useEffect(() => {
        if (!token || !selectedSite?.id) {
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
                    `/api/jira/auth/accessible-resources?token=${encodeURIComponent(token)}`,
                )
                .then((response) => {
                    setSites(response.data);
                    // Set the first site as selected, or the one from preferences if it exists
                    const preferredSite = response.data?.find((s) => s.name === preferences?.site?.name);
                    setSelectedSite(preferredSite || response.data?.[0] || null);
                });
        }
    }, [token, preferences?.site?.name]);

    if (!token) {
        return (
            <div className="mb-4 text-sm italic text-gray-500">
                {t(
                    "To create this issue in Jira, please connect Labeeb to your Jira account.",
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
                            value={selectedSite?.name || ""}
                            onChange={(e) => {
                                const selectedSite = sites.find(s => s.name === e.target.value);
                                setSelectedSite(selectedSite || null);
                            }}
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
                            siteId={selectedSite?.id}
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <IssueFields
                        key={`${issueType}-${project}-${selectedSite?.id}`}
                        value={fieldValues}
                        onChange={setFieldValues}
                        issueTypeId={issueType}
                        projectKey={project}
                        siteId={selectedSite?.id}
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
                                        siteId: selectedSite?.id,
                                        token,
                                        fields: fieldValues,
                                    },
                                );
                                setCreating(false);

                                if (response.data.key) {
                                    setCreatedUrl(
                                        `https://${selectedSite?.name}.atlassian.net/browse/${response.data.key}`,
                                    );
                                } else {
                                    setError(
                                        `An error occurred: ${JSON.stringify(response.data.errors || response.data.error || "")}`,
                                    );
                                }
                            }}
                        >
                            {t("Create issue in Jira")}
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
                                    setFieldValues({});
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
        // Only proceed if issueTypeId is a valid number (not a string name)
        const numericId = Number(issueTypeId);
        if (!issueTypeId || !projectKey || !siteId || !token || isNaN(numericId) || numericId <= 0) {
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
                onChange({});
            })
            .catch((error) => {
                setError(error);
                console.error(error);
                setFields([]);
            })
            .finally(() => {
                setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    <div key={field.key} className="flex gap-2 mb-2">
                        <label className="basis-32 mt-1 text-sm">
                            {field.name}
                        </label>
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
    const expectsArray = field.schema?.type === "array";

    useEffect(() => {
        // Set first value as default if there are allowed values and no value is selected
        if (allowedValues?.length && !value) {
            onChange(
                expectsArray
                    ? [{ id: allowedValues[0].id }]
                    : { id: allowedValues[0].id },
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedValues]);

    if (allowedValues?.length) {
        return (
            <div>
                <div>
                    <select
                        value={
                            expectsArray ? value?.map((v) => v.id) : value?.id
                        }
                        onChange={(e) => {
                            const selectedOptions = Array.from(
                                e.target.selectedOptions,
                            );
                            const selectedValues = selectedOptions.map(
                                (option) => ({ id: option.value }),
                            );
                            onChange(
                                expectsArray
                                    ? selectedValues
                                    : { id: e.target.value },
                            );
                        }}
                        className="lb-input basis-64"
                        multiple={expectsArray}
                    >
                        {allowedValues.map((value) => (
                            <option key={value.id} value={value.id}>
                                {value.value || value.name}
                            </option>
                        ))}
                    </select>
                </div>
                {expectsArray && (
                    <div className="text-xs mt-1 text-gray-500 ml-2">
                        (Hold Ctrl/Cmd to select multiple)
                    </div>
                )}
            </div>
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
                    const foundIssueType = project.issueTypes.find(
                        (t) => t.name === defaultIssueType,
                    );
                    if (foundIssueType?.id) {
                        onChange(foundIssueType.id);
                    } else {
                        // If the default issue type is not found, set the first available issue type as fallback
                        const firstIssueType = project.issueTypes[0];
                        if (firstIssueType?.id) {
                            onChange(firstIssueType.id);
                        }
                    }
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
