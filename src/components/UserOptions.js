import { Modal } from "@/components/ui/modal";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, X, Settings, KeyRound } from "lucide-react";
import { useUpdateAiOptions } from "../../app/queries/options";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext } from "../App";
import { LanguageContext } from "../contexts/LanguageProvider";
import axios from "../../app/utils/axios-client";
import { MemoryEditorContent } from "./MemoryEditor";
import SecretsEditor from "./SecretsEditor";
import UserAvatar from "./UserAvatar";
import {
    getReasoningEffortLevelsForModel,
    normalizeReasoningEffortForModel,
    reasoningEffortLevelLabelKey,
} from "../utils/reasoningEffortI18n";
import { useResolvedAgentModel } from "../hooks/useResolvedAgentModel";

const UserOptions = ({ show, handleClose }) => {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const profilePictureInputRef = useRef();
    const queryClient = useQueryClient();

    const { agentModels, resolvedAgentModel, persistResolvedAgentModel } =
        useResolvedAgentModel(user);

    const [profilePicture, setProfilePicture] = useState(
        user?.profilePicture || null,
    );
    const [aiName, setAiName] = useState(user.aiName || "Concierge");
    const [agentModel, setAgentModel] = useState(resolvedAgentModel);
    const [useCustomEntities, setUseCustomEntities] = useState(
        user.useCustomEntities || false,
    );
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(
        user.aiMemorySelfModify || false,
    );
    const [reasoningEffort, setReasoningEffort] = useState(
        user.reasoningEffort || "low",
    );
    const [uploadingProfilePicture, setUploadingProfilePicture] =
        useState(false);
    const [error, setError] = useState("");
    const [showMemoryEditor, setShowMemoryEditor] = useState(false);
    const [showSecretsEditor, setShowSecretsEditor] = useState(false);
    const selectedAgentModel = agentModels?.find(
        (model) => model.modelId === agentModel,
    );
    const reasoningEffortLevels =
        getReasoningEffortLevelsForModel(selectedAgentModel);
    const displayedReasoningEffort = normalizeReasoningEffortForModel(
        selectedAgentModel,
        reasoningEffort,
    );

    const updateAiOptionsMutation = useUpdateAiOptions();
    useEffect(() => {
        if (reasoningEffort !== displayedReasoningEffort) {
            setReasoningEffort(displayedReasoningEffort);
        }
    }, [reasoningEffort, displayedReasoningEffort]);

    useEffect(() => {
        if (user) {
            setProfilePicture(user.profilePicture || null);
            setAiName(user.aiName || "Concierge");
            setAgentModel(resolvedAgentModel);
            setUseCustomEntities(user.useCustomEntities || false);
            setAiMemorySelfModify(user.aiMemorySelfModify || false);
            setReasoningEffort(
                normalizeReasoningEffortForModel(
                    agentModels?.find(
                        (model) => model.modelId === resolvedAgentModel,
                    ),
                    user.reasoningEffort,
                ),
            );
            persistResolvedAgentModel(resolvedAgentModel);
        }
    }, [user, resolvedAgentModel, persistResolvedAgentModel, agentModels]);

    const profilePictureBlobPath =
        profilePicture && profilePicture === user?.profilePicture
            ? user?.profilePictureBlobPath
            : null;

    const handleProfilePictureSelect = async (event) => {
        const file = event.target.files?.[0];
        if (!(file instanceof File)) return;

        if (!file.type.startsWith("image/")) {
            setError(t("Please select an image file"));
            if (profilePictureInputRef.current) {
                profilePictureInputRef.current.value = "";
            }
            return;
        }

        setUploadingProfilePicture(true);
        setError("");

        try {
            const previewUrl = URL.createObjectURL(file);
            setProfilePicture(previewUrl);

            const formData = new FormData();
            formData.append("file", file);

            const response = await axios.post(
                "/api/users/me/profile-picture",
                formData,
                {
                    headers: {
                        "Content-Type": "multipart/form-data",
                    },
                },
            );

            if (response.data?.url) {
                setProfilePicture(response.data.url);
                await queryClient.invalidateQueries({
                    queryKey: ["currentUser"],
                });
            } else {
                throw new Error(t("Upload failed: No URL returned"));
            }
        } catch (error) {
            console.error("Error uploading profile picture:", error);
            setError(
                error.response?.data?.error ||
                    error.message ||
                    t("Failed to upload profile picture"),
            );
            setProfilePicture(user?.profilePicture || null);
            if (profilePictureInputRef.current) {
                profilePictureInputRef.current.value = "";
            }
        } finally {
            setUploadingProfilePicture(false);
        }
    };

    const handleRemoveProfilePicture = () => {
        // Optimistic update - immediately remove from UI
        const oldProfilePicture = profilePicture;
        setProfilePicture(null);
        if (profilePictureInputRef.current) {
            profilePictureInputRef.current.value = "";
        }

        // Fire delete async
        (async () => {
            try {
                await axios.delete("/api/users/me/profile-picture");
                await queryClient.invalidateQueries({
                    queryKey: ["currentUser"],
                });
            } catch (error) {
                console.error("Error removing profile picture:", error);
                // Restore on failure
                setProfilePicture(oldProfilePicture);
                setError(
                    error.response?.data?.error ||
                        error.message ||
                        t("Failed to remove profile picture"),
                );
            }
        })();
    };

    const saveOptions = async (updates) => {
        if (!user?.userId) {
            console.error("UserId not found");
            return;
        }
        const nextAgentModel = updates.agentModel ?? agentModel;
        const nextSelectedAgentModel =
            agentModels?.find((model) => model.modelId === nextAgentModel) ??
            selectedAgentModel;
        const nextReasoningEffort = normalizeReasoningEffortForModel(
            nextSelectedAgentModel,
            updates.reasoningEffort ?? reasoningEffort,
        );

        try {
            await updateAiOptionsMutation.mutateAsync({
                userId: user.userId,
                contextId: user.contextId,
                aiMemorySelfModify:
                    updates.aiMemorySelfModify ?? aiMemorySelfModify,
                aiName: updates.aiName ?? aiName,
                agentModel: nextAgentModel,
                useCustomEntities:
                    updates.useCustomEntities ?? useCustomEntities,
                reasoningEffort: nextReasoningEffort,
            });
            setError("");
        } catch (error) {
            console.error("Error saving options:", error);
            setError(
                error.response?.data?.error ||
                    error.message ||
                    t("Failed to save options"),
            );
        }
    };

    return (
        <Modal
            widthClassName={showMemoryEditor ? "max-w-6xl" : "max-w-2xl"}
            title={
                showMemoryEditor
                    ? t("Memory Editor")
                    : showSecretsEditor
                      ? t("Secrets")
                      : t("Options")
            }
            show={show}
            onHide={handleClose}
        >
            {showMemoryEditor ? (
                <MemoryEditorContent
                    user={user}
                    aiName={aiName}
                    onClose={() => setShowMemoryEditor(false)}
                />
            ) : showSecretsEditor ? (
                <SecretsEditor
                    entityId={user?.personalEntityId}
                    onClose={() => setShowSecretsEditor(false)}
                />
            ) : (
                <div className="flex flex-col gap-4">
                    {error && (
                        <div
                            className={`text-red-500 text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded ${isRTL ? "text-right" : "text-left"}`}
                            dir={direction}
                        >
                            {error}
                        </div>
                    )}

                    {/* Profile Picture Section */}
                    <section>
                        <div
                            className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse justify-end" : ""}`}
                        >
                            {isRTL ? (
                                <>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                profilePictureInputRef.current?.click()
                                            }
                                            disabled={uploadingProfilePicture}
                                            className="lb-outline-secondary text-xs px-2 py-1"
                                        >
                                            {uploadingProfilePicture
                                                ? t("Uploading...")
                                                : profilePicture
                                                  ? t("Change")
                                                  : t("Upload")}
                                        </button>
                                        <input
                                            ref={profilePictureInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={
                                                handleProfilePictureSelect
                                            }
                                            className="hidden"
                                        />
                                    </div>
                                    <div className="relative flex-shrink-0">
                                        {profilePicture ? (
                                            <UserAvatar
                                                src={profilePicture}
                                                blobPath={
                                                    profilePictureBlobPath
                                                }
                                                contextId={user?.contextId}
                                                name={t("Profile picture")}
                                                className="w-12 h-12 rounded-full border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center"
                                                initialsClassName="hidden"
                                                iconClassName="w-6 h-6"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                                                <User className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                                            </div>
                                        )}
                                        {profilePicture && (
                                            <button
                                                type="button"
                                                onClick={
                                                    handleRemoveProfilePicture
                                                }
                                                className="absolute -top-0.5 -start-0.5 w-4 h-4 rounded-full bg-gray-500 dark:bg-gray-600 text-white flex items-center justify-center hover:bg-red-500 dark:hover:bg-red-500 transition-colors"
                                                title={t(
                                                    "Remove profile picture",
                                                )}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="relative flex-shrink-0">
                                        {profilePicture ? (
                                            <UserAvatar
                                                src={profilePicture}
                                                blobPath={
                                                    profilePictureBlobPath
                                                }
                                                contextId={user?.contextId}
                                                name={t("Profile picture")}
                                                className="w-12 h-12 rounded-full border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center"
                                                initialsClassName="hidden"
                                                iconClassName="w-6 h-6"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                                                <User className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                                            </div>
                                        )}
                                        {profilePicture && (
                                            <button
                                                type="button"
                                                onClick={
                                                    handleRemoveProfilePicture
                                                }
                                                className="absolute -top-0.5 -end-0.5 w-4 h-4 rounded-full bg-gray-500 dark:bg-gray-600 text-white flex items-center justify-center hover:bg-red-500 dark:hover:bg-red-500 transition-colors"
                                                title={t(
                                                    "Remove profile picture",
                                                )}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                profilePictureInputRef.current?.click()
                                            }
                                            disabled={uploadingProfilePicture}
                                            className="lb-outline-secondary text-xs px-2 py-1"
                                        >
                                            {uploadingProfilePicture
                                                ? t("Uploading...")
                                                : profilePicture
                                                  ? t("Change")
                                                  : t("Upload")}
                                        </button>
                                        <input
                                            ref={profilePictureInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={
                                                handleProfilePictureSelect
                                            }
                                            className="hidden"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </section>

                    {/* Separator */}
                    <hr className="border-gray-200 dark:border-gray-700" />

                    {/* AI Settings Section */}
                    <section className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label
                                    className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 ${isRTL ? "text-right" : "text-left"}`}
                                    htmlFor="aiName"
                                >
                                    {t("AI Name")}
                                </label>
                                <input
                                    id="aiName"
                                    type="text"
                                    value={aiName}
                                    onChange={(e) => {
                                        setAiName(e.target.value);
                                        saveOptions({ aiName: e.target.value });
                                    }}
                                    className="lb-input w-full text-sm"
                                    placeholder={t("Enter AI Name")}
                                    dir={direction}
                                />
                            </div>

                            <div>
                                <label
                                    className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 ${isRTL ? "text-right" : "text-left"}`}
                                    htmlFor="agentModel"
                                >
                                    {t("Model")}
                                </label>
                                <select
                                    id="agentModel"
                                    value={agentModel}
                                    onChange={(e) => {
                                        const nextAgentModel = e.target.value;
                                        const nextModel = agentModels?.find(
                                            (model) =>
                                                model.modelId ===
                                                nextAgentModel,
                                        );
                                        const nextReasoningEffort =
                                            normalizeReasoningEffortForModel(
                                                nextModel,
                                                reasoningEffort,
                                            );

                                        setAgentModel(nextAgentModel);
                                        setReasoningEffort(nextReasoningEffort);
                                        saveOptions({
                                            agentModel: nextAgentModel,
                                            reasoningEffort:
                                                nextReasoningEffort,
                                        });
                                    }}
                                    className="lb-input w-full text-sm"
                                    dir={direction}
                                >
                                    {agentModels.map((option) => (
                                        <option
                                            key={option.modelId}
                                            value={option.modelId}
                                        >
                                            {t(option.displayName)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div
                            className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse justify-end" : ""}`}
                        >
                            <input
                                type="checkbox"
                                id="useCustomEntities"
                                className={`accent-sky-500 ${isRTL ? "order-2" : ""}`}
                                checked={useCustomEntities}
                                onChange={(e) => {
                                    setUseCustomEntities(e.target.checked);
                                    saveOptions({
                                        useCustomEntities: e.target.checked,
                                    });
                                }}
                            />
                            <label
                                htmlFor="useCustomEntities"
                                className={`text-sm text-gray-900 dark:text-gray-100 cursor-pointer ${isRTL ? "order-1" : ""}`}
                                dir={direction}
                            >
                                {t("Use other custom entities")}
                            </label>
                        </div>
                    </section>

                    {/* Reasoning Effort */}
                    <hr className="border-gray-200 dark:border-gray-700" />
                    <section className="space-y-3">
                        <label
                            className={`block text-xs font-medium text-gray-700 dark:text-gray-300 ${isRTL ? "text-right" : "text-left"}`}
                        >
                            {t("Reasoning Effort")}
                        </label>
                        <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
                            {reasoningEffortLevels.map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => {
                                        setReasoningEffort(level);
                                        saveOptions({
                                            reasoningEffort: level,
                                        });
                                    }}
                                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                                        displayedReasoningEffort === level
                                            ? "bg-sky-500 text-white"
                                            : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                    }`}
                                >
                                    {t(reasoningEffortLevelLabelKey(level))}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Secrets — only when user has a personal entity */}
                    {user?.personalEntityId && (
                        <section>
                            <button
                                type="button"
                                onClick={() => setShowSecretsEditor(true)}
                                className="lb-primary text-sm w-full sm:w-auto"
                            >
                                <KeyRound className="w-4 h-4 inline me-2" />
                                {t("Secrets")}
                            </button>
                        </section>
                    )}

                    {/* Separator */}
                    <hr className="border-gray-200 dark:border-gray-700" />

                    {/* Memory Section */}
                    <section className="space-y-4">
                        <div
                            className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse justify-end" : ""}`}
                        >
                            <input
                                type="checkbox"
                                id="aiMemorySelfModify"
                                className={`accent-sky-500 ${isRTL ? "order-2" : ""}`}
                                checked={aiMemorySelfModify}
                                onChange={(e) => {
                                    setAiMemorySelfModify(e.target.checked);
                                    saveOptions({
                                        aiMemorySelfModify: e.target.checked,
                                    });
                                }}
                            />
                            <label
                                htmlFor="aiMemorySelfModify"
                                className={`text-sm text-gray-900 dark:text-gray-100 cursor-pointer ${isRTL ? "order-1" : ""}`}
                                dir={direction}
                            >
                                {t("Allow the AI to modify its own memory")}
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowMemoryEditor(true)}
                            className="lb-primary text-sm w-full sm:w-auto mt-2"
                        >
                            <Settings className="w-4 h-4 inline me-2" />
                            {t("Edit Memory")}
                        </button>
                    </section>

                    {/* Footer */}
                    <div
                        className={`flex gap-2 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 ${isRTL ? "flex-row-reverse justify-start" : "justify-end"}`}
                    >
                        <button
                            type="button"
                            className="lb-outline-secondary text-xs flex-1 sm:flex-initial"
                            onClick={handleClose}
                        >
                            {t("Done")}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default UserOptions;
