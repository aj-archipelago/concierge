const OPTION_FIELDS = {
    image_size: "availableImageSizes",
    resolution: "availableResolutions",
    aspectRatio: "availableAspectRatios",
    duration: "availableDurations",
    outputFormat: "availableOutputFormats",
};
const aliases = (key) =>
    key === "image_size" ? ["image_size", "imageSize", "size"] : [key];

function activeOptions(model, settings) {
    const options = {};
    for (const override of model?.mediaDefaultOverrides || []) {
        const matches = Object.entries(override.when || {}).every(
            ([key, expected]) => {
                const value = settings[key] ?? model.mediaDefaults?.[key];
                return Array.isArray(expected)
                    ? expected.includes(value)
                    : value === expected;
            },
        );
        if (matches) Object.assign(options, override.mediaOptions || {});
    }
    return options;
}

// Resolve conditional option lists without mutating the shared API metadata.
export function resolveMediaModelOptions(model, settings = {}) {
    if (!model) return model;
    const options = activeOptions(model, settings);
    if (!Object.keys(options).length) return model;
    const resolved = { ...model };
    for (const [key, values] of Object.entries(options)) {
        if (OPTION_FIELDS[key]) resolved[OPTION_FIELDS[key]] = values;
    }
    resolved.mediaControls = (model.mediaControls || []).map((control) => {
        const values = options[control.key];
        return values
            ? {
                  ...control,
                  options: values.map(
                      (value) =>
                          control.options?.find(
                              (option) => option.value === value,
                          ) || { value, label: String(value) },
                  ),
              }
            : control;
    });
    return resolved;
}

// A user changing mode/duration must not retain a now-invalid dependent choice.
// API callers are still validated by the provider adapter; this is UI reconciliation.
export function reconcileMediaModelOptions(model, settings = {}) {
    const result = { ...settings };
    for (const [key, values] of Object.entries(activeOptions(model, result))) {
        const keys = aliases(key);
        const value = keys
            .map((alias) => result[alias])
            .find((item) => item !== undefined);
        if (value === undefined || values.includes(value) || !values.length)
            continue;
        const fallback = model.mediaDefaults?.[key];
        for (const alias of keys)
            result[alias] = values.includes(fallback) ? fallback : values[0];
    }
    return result;
}
