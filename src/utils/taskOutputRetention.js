export const DEFAULT_RETAINED_RUNS = 30;
export const MAX_RETAINED_RUNS = 1000;

// Zero explicitly means keep all outputs. Missing settings use the default.
export function retainedRunLimit(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_RETAINED_RUNS
        ? value
        : DEFAULT_RETAINED_RUNS;
}

export function isValidRetainedRunLimit(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_RETAINED_RUNS;
}
