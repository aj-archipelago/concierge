import { Modal } from "@/components/ui/modal";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, X, Settings } from "lucide-react";
import { useUpdateAiOptions } from "../../app/queries/options";
import { useUpdateCurrentUser } from "../../app/queries/users";
import { AuthContext } from "../App";
import { LanguageContext } from "../contexts/LanguageProvider";
import axios from "../../app/utils/axios-client";
import MemoryEditor from "./MemoryEditor";

const UserOptions = ({ show, handleClose }) => {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";
    const profilePictureInputRef = useRef();

    const [profilePicture, setProfilePicture] = useState(
        user?.profilePicture || null,
    );
    const [aiName, setAiName] = useState(user.aiName || "Labeeb");
    const [aiStyle, setAiStyle] = useState(user.aiStyle || "OpenAI");
    const [useCustomEntities, setUseCustomEntities] = useState(
        user.useCustomEntities || false,
    );
    const [aiMemorySelfModify, setAiMemorySelfModify] = useState(
        user.aiMemorySelfModify || false,
    );
    const [uploadingProfilePicture, setUploadingProfilePicture] =
        useState(false);
    const [error, setError] = useState("");
    const [showMemoryEditor, setShowMemoryEditor] = useState(false);

    const updateAiOptionsMutation = useUpdateAiOptions();
    const updateCurrentUserMutation = useUpdateCurrentUser();

    useEffect(() => {
        if (user) {
            setProfilePicture(user.profilePicture || null);
            setAiName(user.aiName || "Labeeb");
            setAiStyle(user.aiStyle || "OpenAI");
            setUseCustomEntities(user.useCustomEntities || false);
            setAiMemorySelfModify(user.aiMemorySelfModify || false);
        }
    }, [user]);

    const handleProfilePictureSelect = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

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
                await updateCurrentUserMutation.mutateAsync({
                    data: { profilePicture: response.data.url },
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

    const handleRemoveProfilePicture = async () => {
        try {
            await axios.delete("/api/users/me/profile-picture");
            setProfilePicture(null);
            await updateCurrentUserMutation.mutateAsync({
                data: { profilePicture: "" },
            });
            if (profilePictureInputRef.current) {
                profilePictureInputRef.current.value = "";
            }
        } catch (error) {
            console.error("Error removing profile picture:", error);
            setError(
                error.response?.data?.error ||
                    error.message ||
                    t("Failed to remove profile picture"),
            );
        }
    };

    const saveOptions = async (updates) => {
        if (!user?.userId) {
            console.error("UserId not found");
            return;
        }

        try {
            await updateAiOptionsMutation.mutateAsync({
                userId: user.userId,
                contextId: user.contextId,
                aiMemorySelfModify:
                    updates.aiMemorySelfModify ?? aiMemorySelfModify,
                aiName: updates.aiName ?? aiName,
                aiStyle: updates.aiStyle ?? aiStyle,
                useCustomEntities:
                    updates.useCustomEntities ?? useCustomEntities,
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
        <>
            <Modal
                widthClassName="max-w-2xl"
                title={t("Options")}
                show={show}
                onHide={handleClose}
            >
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
                                            <img
                                                src={profilePicture}
                                                alt={t("Profile picture")}
                                                className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700"
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
                                                className="absolute -top-0.5 -start-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
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
                                            <img
                                                src={profilePicture}
                                                alt={t("Profile picture")}
                                                className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700"
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
                                                className="absolute -top-0.5 -end-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
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
                                    htmlFor="aiStyle"
                                >
                                    {t("AI Style")}
                                </label>
                                <select
                                    id="aiStyle"
                                    value={aiStyle}
                                    onChange={(e) => {
                                        setAiStyle(e.target.value);
                                        saveOptions({
                                            aiStyle: e.target.value,
                                        });
                                    }}
                                    className="lb-input w-full text-sm"
                                    dir={direction}
                                >
                                    <option value="OpenAI_Preview">
                                        {t("OpenAI Preview (GPT-5.1)")}
                                    </option>
                                    <option value="OpenAI">
                                        {t("OpenAI (GPT-5)")}
                                    </option>
                                    <option value="OpenAI_Legacy">
                                        {t("OpenAI Legacy (GPT-4.1/O3)")}
                                    </option>
                                    <option value="XAI">
                                        {t("XAI (Grok)")}
                                    </option>
                                    <option value="Anthropic">
                                        {t("Anthropic (Claude)")}
                                    </option>
                                    <option value="Google">
                                        {t("Google (Gemini)")}
                                    </option>
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

                    {/* Separator */}
                    <hr className="border-gray-200 dark:border-gray-700" />

                    {/* Memory Section */}
                    <section className="space-y-2">
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
                            className="lb-outline-secondary text-sm w-full sm:w-auto"
                        >
                            <Settings className="w-3.5 h-3.5 inline me-1.5" />
                            {t("Edit Memory")}
                        </button>
                    </section>

                    {/* Footer */}
                    <div
                        className={`flex gap-2 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700 ${isRTL ? "flex-row-reverse justify-start" : "justify-end"}`}
                    >
                        <button
                            type="button"
                            className="lb-primary text-xs flex-1 sm:flex-initial"
                            onClick={handleClose}
                        >
                            {t("Close")}
                        </button>
                    </div>
                </div>
            </Modal>

            <MemoryEditor
                show={showMemoryEditor}
                onClose={() => setShowMemoryEditor(false)}
                user={user}
                aiName={aiName}
            />
        </>
    );
};

export default UserOptions;
