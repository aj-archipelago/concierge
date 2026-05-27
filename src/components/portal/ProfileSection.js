"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, X, Moon, Sun, Languages } from "lucide-react";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { ThemeContext } from "../../contexts/ThemeProvider";
import UserAvatar from "../UserAvatar";
import axios from "../../../app/utils/axios-client";
import { useQueryClient } from "@tanstack/react-query";

export default function ProfileSection() {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction, language, changeLanguage } = useContext(LanguageContext);
    const { theme, changeTheme } = useContext(ThemeContext);
    const isRTL = direction === "rtl";
    const profilePictureInputRef = useRef();
    const previewUrlRef = useRef(null);
    const queryClient = useQueryClient();

    const [profilePicture, setProfilePicture] = useState(
        user?.profilePicture || null,
    );
    const [uploadingProfilePicture, setUploadingProfilePicture] =
        useState(false);
    const [error, setError] = useState("");

    const revokePreviewUrl = () => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
        }
    };

    useEffect(() => revokePreviewUrl, []);

    const profilePictureBlobPath =
        profilePicture && profilePicture === user?.profilePicture
            ? user?.profilePictureBlobPath
            : null;

    const handleProfilePictureSelect = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setError(t("Please select an image file"));
            if (profilePictureInputRef.current)
                profilePictureInputRef.current.value = "";
            return;
        }

        setUploadingProfilePicture(true);
        setError("");

        try {
            revokePreviewUrl();
            const previewUrl = URL.createObjectURL(file);
            previewUrlRef.current = previewUrl;
            setProfilePicture(previewUrl);

            const formData = new FormData();
            formData.append("file", file);

            const response = await axios.post(
                "/api/users/me/profile-picture",
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                },
            );

            if (response.data?.url) {
                setProfilePicture(response.data.url);
                revokePreviewUrl();
                await queryClient.invalidateQueries({
                    queryKey: ["currentUser"],
                });
            } else {
                throw new Error(t("Upload failed: No URL returned"));
            }
        } catch (err) {
            console.error("Error uploading profile picture:", err);
            setError(
                err.response?.data?.error ||
                    err.message ||
                    t("Failed to upload profile picture"),
            );
            setProfilePicture(user?.profilePicture || null);
            revokePreviewUrl();
            if (profilePictureInputRef.current)
                profilePictureInputRef.current.value = "";
        } finally {
            setUploadingProfilePicture(false);
        }
    };

    const handleRemoveProfilePicture = () => {
        const oldProfilePicture = profilePicture;
        setProfilePicture(null);
        if (profilePictureInputRef.current)
            profilePictureInputRef.current.value = "";

        (async () => {
            try {
                await axios.delete("/api/users/me/profile-picture");
                await queryClient.invalidateQueries({
                    queryKey: ["currentUser"],
                });
            } catch (err) {
                console.error("Error removing profile picture:", err);
                setProfilePicture(oldProfilePicture);
                setError(
                    err.response?.data?.error ||
                        err.message ||
                        t("Failed to remove profile picture"),
                );
            }
        })();
    };

    return (
        <div className="space-y-6">
            {error && (
                <div
                    className={`text-red-500 text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded ${isRTL ? "text-right" : "text-left"}`}
                    dir={direction}
                >
                    {error}
                </div>
            )}

            {/* Avatar */}
            <section>
                <label
                    className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 ${isRTL ? "text-right" : ""}`}
                >
                    {t("Profile Picture")}
                </label>
                <div
                    className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}
                >
                    <div className="relative flex-shrink-0">
                        {profilePicture ? (
                            <UserAvatar
                                src={profilePicture}
                                blobPath={profilePictureBlobPath}
                                contextId={user?.contextId}
                                name={t("Profile picture")}
                                className="w-16 h-16 rounded-full border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center"
                                initialsClassName="hidden"
                                iconClassName="w-8 h-8"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                                <User className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                            </div>
                        )}
                        {profilePicture && (
                            <button
                                type="button"
                                onClick={handleRemoveProfilePicture}
                                className={`absolute -top-0.5 ${isRTL ? "-start-0.5" : "-end-0.5"} w-5 h-5 rounded-full bg-gray-500 dark:bg-gray-600 text-white flex items-center justify-center hover:bg-red-500 dark:hover:bg-red-500 transition-colors`}
                                title={t("Remove profile picture")}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-col gap-1">
                        <button
                            type="button"
                            onClick={() =>
                                profilePictureInputRef.current?.click()
                            }
                            disabled={uploadingProfilePicture}
                            className="lb-outline-secondary text-xs px-3 py-1.5"
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
                            onChange={handleProfilePictureSelect}
                            className="hidden"
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            {user?.name}
                        </p>
                    </div>
                </div>
            </section>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Language */}
            <section>
                <label
                    className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-3 ${isRTL ? "text-right" : ""}`}
                >
                    {t("Language")}
                </label>
                <div
                    className={`flex gap-3 ${isRTL ? "flex-row-reverse" : ""}`}
                >
                    <button
                        type="button"
                        onClick={() => changeLanguage("en")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                            language === "en"
                                ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                                : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        }`}
                    >
                        <Languages className="h-4 w-4" />
                        English
                    </button>
                    <button
                        type="button"
                        onClick={() => changeLanguage("ar")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                            language === "ar"
                                ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                                : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        }`}
                    >
                        <Languages className="h-4 w-4" />
                        عربي
                    </button>
                </div>
            </section>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Theme */}
            <section>
                <label
                    className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-3 ${isRTL ? "text-right" : ""}`}
                >
                    {t("Theme")}
                </label>
                <div
                    className={`flex gap-3 ${isRTL ? "flex-row-reverse" : ""}`}
                >
                    <button
                        type="button"
                        onClick={() => changeTheme("light")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                            theme === "light"
                                ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                                : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        }`}
                    >
                        <Sun className="h-4 w-4" />
                        {t("Light mode")}
                    </button>
                    <button
                        type="button"
                        onClick={() => changeTheme("dark")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                            theme === "dark"
                                ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                                : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        }`}
                    >
                        <Moon className="h-4 w-4" />
                        {t("Dark mode")}
                    </button>
                </div>
            </section>
        </div>
    );
}
