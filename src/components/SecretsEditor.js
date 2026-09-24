import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApolloClient } from "@apollo/client";
import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { SYS_GET_ENTITIES } from "../graphql";
import { LanguageContext } from "../contexts/LanguageProvider";

const API_ERROR_I18N_KEY = {
    "Entity not found": "secrets_error_entity_not_found",
    "Failed to load secrets": "secrets_error_load_failed",
    "Failed to save secrets": "secrets_error_save_failed",
};

const SECRET_NAME_REGEX = /^[A-Z_][A-Z0-9_]*$/;
const MASKED_SECRET_VALUE = "********";
const buildSecretRows = (secretKeys = []) =>
    (secretKeys || []).map((key) => ({
        name: key,
        value: MASKED_SECRET_VALUE,
        isExisting: true,
        isMasked: true,
        showValue: false,
        changed: false,
    }));

const normalizeSecretKeys = (secretKeys = []) =>
    [...new Set((secretKeys || []).filter(Boolean))].sort();

const sameSecretKeys = (left = [], right = []) => {
    const normalizedLeft = normalizeSecretKeys(left);
    const normalizedRight = normalizeSecretKeys(right);

    if (normalizedLeft.length !== normalizedRight.length) {
        return false;
    }

    return normalizedLeft.every((key, index) => key === normalizedRight[index]);
};

const fetchEntitySecretKeys = async (entityId) => {
    const res = await fetch(`/api/entities/${entityId}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed to load secrets");
    }

    return data.secretKeys || [];
};

export default function SecretsEditor({
    entityId,
    onClose,
    onSaved,
    closeOnSave = true,
}) {
    const apolloClient = useApolloClient();
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [secrets, setSecrets] = useState([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    useEffect(() => {
        let cancelled = false;

        if (!entityId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError("");
        setSuccessMessage("");

        (async () => {
            try {
                const secretKeys = await fetchEntitySecretKeys(entityId);
                if (!cancelled) {
                    setSecrets(buildSecretRows(secretKeys));
                }
            } catch (err) {
                console.error("Failed to load secrets:", err);
                if (!cancelled) {
                    const msg = err.message || "Failed to load secrets";
                    const i18nKey = API_ERROR_I18N_KEY[msg];
                    setError(i18nKey ? t(i18nKey) : msg);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [entityId, t]);

    const addSecret = () => {
        setSuccessMessage("");
        setSecrets((prev) => [
            ...prev,
            {
                name: "",
                value: "",
                isExisting: false,
                showValue: true,
                changed: true,
                isMasked: false,
            },
        ]);
    };

    const removeSecret = (index) => {
        setSuccessMessage("");
        const secret = secrets[index];
        if (secret.isExisting) {
            setSecrets((prev) =>
                prev.map((s, i) =>
                    i === index ? { ...s, deleted: true, changed: true } : s,
                ),
            );
        } else {
            setSecrets((prev) => prev.filter((_, i) => i !== index));
        }
    };

    const undoDelete = (index) => {
        setSuccessMessage("");
        setSecrets((prev) =>
            prev.map((s, i) =>
                i === index ? { ...s, deleted: false, changed: false } : s,
            ),
        );
    };

    const updateSecret = (index, field, value) => {
        setSuccessMessage("");
        setSecrets((prev) =>
            prev.map((s, i) =>
                i === index
                    ? {
                          ...s,
                          [field]: value,
                          changed: field === "showValue" ? s.changed : true,
                          isMasked: field === "value" ? false : s.isMasked,
                      }
                    : s,
            ),
        );
    };

    const clearMaskedValue = (index) => {
        setSecrets((prev) =>
            prev.map((s, i) =>
                i === index && s.isMasked
                    ? { ...s, value: "", isMasked: false }
                    : s,
            ),
        );
    };

    const hasChanges = secrets.some((s) => s.changed);

    const handleSave = async () => {
        setError("");
        setSuccessMessage("");

        for (const secret of secrets) {
            if (secret.deleted) continue;
            if (!secret.name) {
                setError(t("Secret name is required"));
                return;
            }
            if (!SECRET_NAME_REGEX.test(secret.name)) {
                setError(t("Secret names must be UPPER_SNAKE_CASE"));
                return;
            }
            if (secret.isExisting && secret.changed && !secret.value) {
                setError(t("New value is required for: ") + secret.name);
                return;
            }
            if (!secret.isExisting && !secret.value) {
                setError(t("Secret value is required"));
                return;
            }
        }

        const names = secrets.filter((s) => !s.deleted).map((s) => s.name);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        if (dupes.length > 0) {
            setError(t("Duplicate secret name: ") + dupes[0]);
            return;
        }

        const payload = {};
        for (const secret of secrets) {
            if (secret.deleted) {
                payload[secret.name] = null;
            } else if (secret.changed && secret.value) {
                payload[secret.name] = secret.value;
            }
        }

        if (Object.keys(payload).length === 0) {
            onClose?.();
            return;
        }

        const expectedKeys = normalizeSecretKeys(
            secrets.filter((s) => !s.deleted).map((s) => s.name),
        );

        setSaving(true);
        try {
            const res = await fetch(`/api/entities/${entityId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({ secrets: payload }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to save secrets");
            }

            const confirmedKeys = await fetchEntitySecretKeys(entityId);
            if (!sameSecretKeys(confirmedKeys, expectedKeys)) {
                setSecrets(buildSecretRows(confirmedKeys));
                throw new Error(
                    t(
                        "Secrets save could not be verified. The editor was reloaded with the current server state.",
                    ),
                );
            }

            await apolloClient.refetchQueries({ include: [SYS_GET_ENTITIES] });

            setSecrets(buildSecretRows(confirmedKeys));
            setSuccessMessage(t("Saved"));
            onSaved?.(normalizeSecretKeys(data.secretKeys || confirmedKeys));

            if (closeOnSave) {
                onClose?.();
            }
        } catch (err) {
            const msg = err.message;
            const i18nKey = API_ERROR_I18N_KEY[msg];
            setError(i18nKey ? t(i18nKey) : msg);
        } finally {
            setSaving(false);
        }
    };

    const activeSecrets = secrets.filter((s) => !s.deleted);
    const deletedSecrets = secrets.filter((s) => s.deleted);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin me-2" />
                {t("Loading...")}
            </div>
        );
    }

    return (
        <form
            className="space-y-4"
            dir={direction}
            onSubmit={(event) => {
                event.preventDefault();
                if (!hasChanges || saving) return;
                handleSave();
            }}
        >
            <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(
                    "Store API keys and tokens securely. Secrets are encrypted and available as environment variables in your workspace.",
                )}
            </p>

            {error && (
                <div className="text-red-500 text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded">
                    {error}
                </div>
            )}

            {successMessage && (
                <div className="text-emerald-700 dark:text-emerald-300 text-sm p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded">
                    {successMessage}
                </div>
            )}

            <div className="space-y-2">
                {activeSecrets.map((secret) => {
                    const index = secrets.indexOf(secret);
                    return (
                        <div
                            key={index}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/30 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                        >
                            <input
                                type="text"
                                value={secret.name}
                                onChange={(e) =>
                                    updateSecret(
                                        index,
                                        "name",
                                        e.target.value
                                            .toUpperCase()
                                            .replace(/[^A-Z0-9_]/g, ""),
                                    )
                                }
                                disabled={secret.isExisting}
                                placeholder="SECRET_NAME"
                                aria-label={t("portal_secret_name")}
                                className="col-span-2 min-h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-900 dark:disabled:text-gray-400 sm:col-span-1"
                            />
                            <div className="relative min-w-0">
                                <input
                                    type={
                                        secret.showValue ? "text" : "password"
                                    }
                                    aria-label={t("Secret value")}
                                    value={secret.value}
                                    onChange={(e) =>
                                        updateSecret(
                                            index,
                                            "value",
                                            e.target.value,
                                        )
                                    }
                                    onFocus={() => clearMaskedValue(index)}
                                    placeholder={
                                        secret.isExisting
                                            ? t("Enter new value to update")
                                            : t("Secret value")
                                    }
                                    className="min-h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 pe-10 font-mono text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500/50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        updateSecret(
                                            index,
                                            "showValue",
                                            !secret.showValue,
                                        )
                                    }
                                    aria-label={t(
                                        secret.showValue
                                            ? "portal_secret_hide"
                                            : "portal_secret_show",
                                    )}
                                    className="absolute end-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                                >
                                    {secret.showValue ? (
                                        <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                        <Eye className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => removeSecret(index)}
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                                title={t("Delete secret")}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}

                {deletedSecrets.map((secret) => {
                    const index = secrets.indexOf(secret);
                    return (
                        <div
                            key={index}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gray-200 p-3 dark:border-gray-700"
                        >
                            <span className="min-w-0 break-all font-mono text-xs text-gray-400 line-through dark:text-gray-500">
                                {secret.name}
                            </span>
                            <span className="flex-1 text-xs italic text-gray-400 dark:text-gray-500">
                                {t("Will be deleted")}
                            </span>
                            <button
                                type="button"
                                onClick={() => undoDelete(index)}
                                className="min-h-10 rounded-lg px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                {t("Undo")}
                            </button>
                        </div>
                    );
                })}

                {activeSecrets.length === 0 && deletedSecrets.length === 0 && (
                    <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
                        {t("No secrets configured")}
                    </div>
                )}
            </div>

            {/* Footer: Add on left, Cancel + Save on right */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={addSecret}
                    className="flex min-h-10 items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {t("Add Secret")}
                </button>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-10 px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        {t("Cancel")}
                    </button>
                    <button
                        type="submit"
                        disabled={!hasChanges || saving}
                        className="min-h-10 px-4 py-2 text-sm rounded-xl bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-gray-950 dark:hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[4rem]"
                    >
                        {saving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
                        ) : (
                            t("Save")
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
}
