const MEDIA_TOGGLE_LABELS = {
    forceInstrumental: {
        label: "Instrumental",
        trueLabel: "Instrumental",
        falseLabel: "Vocals allowed",
    },
    generateAudio: {
        label: "Generate Audio",
        trueLabel: "Audio",
        falseLabel: "No Audio",
    },
    cameraFixed: {
        label: "Camera",
        trueLabel: "Fixed Camera",
        falseLabel: "Free Camera",
    },
    optimizePrompt: {
        label: "Optimize Prompt",
        trueLabel: "Optimized",
        falseLabel: "Raw Prompt",
    },
};

const DEFAULT_DERIVED_CONTROL_KEYS = [
    "aspectRatio",
    "image_size",
    "resolution",
    "duration",
    "outputFormat",
];

function toOption(value, label = value) {
    if (value && typeof value === "object" && "value" in value) {
        return { ...value };
    }
    return {
        value,
        label: String(label ?? value),
    };
}

function optionList(values, labelForValue) {
    if (!Array.isArray(values)) return [];
    return values.map((value) => {
        if (value && typeof value === "object" && "value" in value) {
            return { ...value };
        }
        return toOption(value, labelForValue ? labelForValue(value) : value);
    });
}

function upsertSelectControl(controls, keys, control) {
    if (!control.options?.length) return;
    if (keys.has(control.key)) {
        const existingIndex = controls.findIndex(
            (existing) => existing.key === control.key,
        );
        if (existingIndex < 0) return;
        const existing = controls[existingIndex];
        controls[existingIndex] = {
            ...control,
            ...existing,
            label: existing.label || control.label,
            type: existing.type || control.type,
            options: Array.isArray(existing.options)
                ? existing.options
                : control.options,
            aliases: existing.aliases || control.aliases,
        };
        return;
    }
    controls.push(control);
    keys.add(control.key);
}

function shouldAddDerivedControl(key, derivedControlKeys) {
    return derivedControlKeys.has(key);
}

export function buildMediaModelControls(model = {}, options = {}) {
    const modelMeta = model || {};
    const derivedControlKeys = new Set(
        options.derivedControlKeys || DEFAULT_DERIVED_CONTROL_KEYS,
    );
    const excludedToggleKeys = new Set(options.excludedToggleKeys || []);
    const controls = Array.isArray(modelMeta.mediaControls)
        ? modelMeta.mediaControls.map((control) => ({ ...control }))
        : [];
    const keys = new Set(controls.map((control) => control.key));

    if (shouldAddDerivedControl("aspectRatio", derivedControlKeys)) {
        upsertSelectControl(controls, keys, {
            key: "aspectRatio",
            label: "Aspect Ratio",
            type: "select",
            options: optionList(modelMeta.availableAspectRatios, (value) =>
                value === "match_input_image" ? "Match Input Image" : value,
            ),
        });
    }

    if (shouldAddDerivedControl("image_size", derivedControlKeys)) {
        upsertSelectControl(controls, keys, {
            key: "image_size",
            aliases: ["imageSize", "size"],
            label: "Image Size",
            type: "select",
            options: optionList(modelMeta.availableImageSizes),
        });
    }

    if (shouldAddDerivedControl("resolution", derivedControlKeys)) {
        upsertSelectControl(controls, keys, {
            key: "resolution",
            label: "Resolution",
            type: "select",
            options: optionList(modelMeta.availableResolutions),
        });
    }

    if (shouldAddDerivedControl("duration", derivedControlKeys)) {
        upsertSelectControl(controls, keys, {
            key: "duration",
            label: "Duration",
            type: "select",
            options: optionList(
                modelMeta.availableDurations,
                (value) => `${value}s`,
            ),
        });
    }

    if (shouldAddDerivedControl("outputFormat", derivedControlKeys)) {
        upsertSelectControl(controls, keys, {
            key: "outputFormat",
            label: "Output Format",
            type: "select",
            options: optionList(modelMeta.availableOutputFormats),
        });
    }

    for (const toggleKey of modelMeta.mediaToggles || []) {
        if (excludedToggleKeys.has(toggleKey)) continue;
        if (keys.has(toggleKey)) continue;
        const labels = MEDIA_TOGGLE_LABELS[toggleKey] || {
            label: toggleKey,
            trueLabel: "Enabled",
            falseLabel: "Disabled",
        };
        controls.push({
            key: toggleKey,
            label: labels.label,
            type: "boolean",
            trueLabel: labels.trueLabel,
            falseLabel: labels.falseLabel,
        });
        keys.add(toggleKey);
    }

    return controls;
}
