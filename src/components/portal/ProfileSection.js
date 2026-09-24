"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Languages, Palette } from "lucide-react";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { ThemeContext } from "../../contexts/ThemeProvider";
import UserAvatar from "../UserAvatar";
import axios from "../../../app/utils/axios-client";
import { SettingsCard, SettingsChoice } from "./SettingsPrimitives";
import { useQueryClient } from "@tanstack/react-query";

export default function ProfileSection() {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction, language, changeLanguage } = useContext(LanguageContext);
    const { theme, changeTheme } = useContext(ThemeContext);
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
        <div dir={direction} className="space-y-4">
            {error && (
                <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
                >
                    {error}
                </p>
            )}
            <SettingsCard>
                <div className="flex flex-wrap items-center gap-4">
                    <UserAvatar
                        src={profilePicture}
                        blobPath={profilePictureBlobPath}
                        contextId={user?.contextId}
                        name={user?.name || t("Profile picture")}
                        className="h-16 w-16 shrink-0 rounded-2xl border border-gray-200 bg-sky-50 text-xl font-semibold text-sky-800 dark:border-gray-600 dark:bg-sky-400/10 dark:text-sky-200"
                        iconClassName="h-7 w-7"
                    />
                    <div className="min-w-0 flex-1">
                        <h3 className="break-words text-base font-semibold text-gray-900 dark:text-gray-100">
                            {user?.name || t("portal_tab_profile")}
                        </h3>
                        <p className="mb-0 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t("Profile Picture")}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                profilePictureInputRef.current?.click()
                            }
                            disabled={uploadingProfilePicture}
                            className="min-h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                            {uploadingProfilePicture
                                ? t("Uploading...")
                                : profilePicture
                                  ? t("Change")
                                  : t("Upload")}
                        </button>
                        {profilePicture && (
                            <button
                                type="button"
                                onClick={handleRemoveProfilePicture}
                                disabled={uploadingProfilePicture}
                                className="min-h-10 rounded-xl px-3 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                            >
                                {t("Remove profile picture")}
                            </button>
                        )}
                    </div>
                    <input
                        ref={profilePictureInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePictureSelect}
                        className="hidden"
                    />
                </div>
            </SettingsCard>
            <SettingsCard
                icon={Palette}
                title={t("portal_appearance")}
                description={t("portal_appearance_description")}
            >
                <div className="grid grid-cols-2 gap-3">
                    {["light", "dark"].map((mode) => (
                        <SettingsChoice
                            key={mode}
                            selected={theme === mode}
                            onClick={() => changeTheme(mode)}
                            icon={mode === "light" ? Sun : Moon}
                            label={t(
                                mode === "light" ? "Light mode" : "Dark mode",
                            )}
                        >
                            <div
                                aria-hidden="true"
                                className={`mb-3 flex h-20 gap-2 overflow-hidden rounded-lg border p-2 ${mode === "light" ? "border-gray-200 bg-gray-50 dark:border-gray-200 dark:bg-gray-50" : "border-gray-700 bg-gray-900 dark:border-gray-700 dark:bg-gray-900"}`}
                            >
                                <div
                                    className={`w-1/4 rounded ${mode === "light" ? "bg-gray-200 dark:bg-gray-200" : "bg-gray-700 dark:bg-gray-700"}`}
                                />
                                <div className="flex-1 space-y-2 pt-1">
                                    <div
                                        className={`h-1.5 w-3/4 rounded ${mode === "light" ? "bg-gray-300 dark:bg-gray-300" : "bg-gray-500 dark:bg-gray-500"}`}
                                    />
                                    <div
                                        className={`h-5 rounded ${mode === "light" ? "bg-white shadow-sm dark:bg-white" : "bg-gray-800 dark:bg-gray-800"}`}
                                    />
                                    <div className="h-1.5 w-1/2 rounded bg-sky-400/70 dark:bg-sky-400/70" />
                                </div>
                            </div>
                        </SettingsChoice>
                    ))}
                </div>
            </SettingsCard>
            <SettingsCard
                icon={Languages}
                title={t("Language")}
                description={t("portal_language_description")}
            >
                <div className="grid grid-cols-2 gap-3">
                    <SettingsChoice
                        selected={language === "en"}
                        onClick={() => changeLanguage("en")}
                        label={t("portal_language_en")}
                        lang="en"
                    />
                    <SettingsChoice
                        selected={language === "ar"}
                        onClick={() => changeLanguage("ar")}
                        label={t("portal_language_ar")}
                        lang="ar"
                    />
                </div>
            </SettingsCard>
        </div>
    );
}
