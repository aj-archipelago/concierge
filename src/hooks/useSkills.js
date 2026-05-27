"use client";

import { useState, useEffect, useCallback } from "react";
import { BUILT_IN_SKILLS } from "../utils/skills";

/**
 * Hook to manage skills - fetches user skills from API and combines with built-in skills.
 * @param {Object} options
 * @param {boolean} options.autoFetch - Whether to fetch on mount (default: true)
 * @returns {Object} Skills state and actions
 */
export function useSkills({ autoFetch = true } = {}) {
    const [userSkills, setUserSkills] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchSkills = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch("/api/skills");
            if (!response.ok) throw new Error("Failed to fetch skills");
            const data = await response.json();
            setUserSkills(data.skills || []);
        } catch (err) {
            console.error("Error fetching skills:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const createSkill = useCallback(
        async ({ name, description, content }) => {
            const response = await fetch("/api/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description, content }),
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to create skill");
            }
            const skill = await response.json();
            await fetchSkills();
            return skill;
        },
        [fetchSkills],
    );

    const updateSkill = useCallback(
        async (name, { description, content }) => {
            const body = {};
            if (description !== undefined) body.description = description;
            if (content !== undefined) body.content = content;
            const response = await fetch(
                `/api/skills/${encodeURIComponent(name)}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to update skill");
            }
            const skill = await response.json();
            await fetchSkills();
            return skill;
        },
        [fetchSkills],
    );

    const deleteSkill = useCallback(
        async (name) => {
            const response = await fetch(
                `/api/skills/${encodeURIComponent(name)}`,
                {
                    method: "DELETE",
                },
            );
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete skill");
            }
            await fetchSkills();
        },
        [fetchSkills],
    );

    const getSkillContent = useCallback(async (name) => {
        // Check built-in first
        const builtIn = BUILT_IN_SKILLS.find(
            (s) => s.name.toLowerCase() === name.toLowerCase(),
        );
        if (builtIn) return builtIn;

        // Fetch from API
        const response = await fetch(`/api/skills/${encodeURIComponent(name)}`);
        if (!response.ok) return null;
        return response.json();
    }, []);

    const fetchSkillFiles = useCallback(async (name) => {
        const response = await fetch(
            `/api/skills/${encodeURIComponent(name)}/files`,
        );
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to fetch skill files");
        }
        const data = await response.json();
        return data.files || [];
    }, []);

    const uploadSkillFile = useCallback(async (name, file) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(
            `/api/skills/${encodeURIComponent(name)}/files`,
            { method: "POST", body: formData },
        );
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to upload file");
        }
        return response.json();
    }, []);

    const deleteSkillFile = useCallback(async (name, filename) => {
        const response = await fetch(
            `/api/skills/${encodeURIComponent(name)}/files?filename=${encodeURIComponent(filename)}`,
            { method: "DELETE" },
        );
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to delete file");
        }
        return response.json();
    }, []);

    useEffect(() => {
        if (autoFetch) {
            fetchSkills();
        }
    }, [autoFetch, fetchSkills]);

    return {
        builtInSkills: BUILT_IN_SKILLS,
        userSkills,
        allSkills: [
            ...BUILT_IN_SKILLS.map((s) => ({ ...s, builtIn: true })),
            ...userSkills.map((s) => ({ ...s, builtIn: false })),
        ],
        loading,
        error,
        fetchSkills,
        createSkill,
        updateSkill,
        deleteSkill,
        getSkillContent,
        fetchSkillFiles,
        uploadSkillFile,
        deleteSkillFile,
    };
}
