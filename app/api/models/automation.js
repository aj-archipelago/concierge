import mongoose from "mongoose";

const automationScheduleSchema = new mongoose.Schema(
    {
        frequency: {
            type: String,
            enum: ["manual", "hourly", "daily", "weekly"],
            default: "manual",
        },
        interval: {
            type: Number,
            default: 1,
            min: 1,
        },
        time: {
            type: String,
            default: "09:00",
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
        times: {
            type: [String],
            default: undefined,
            validate: {
                validator: (values) =>
                    !values ||
                    values.every((value) =>
                        /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
                    ),
                message: "All schedule times must use HH:mm format",
            },
        },
        dayOfWeek: {
            type: Number,
            min: 0,
            max: 6,
            default: 1,
        },
        daysOfWeek: {
            type: [Number],
            default: undefined,
            validate: {
                validator: (values) =>
                    !values ||
                    values.every(
                        (value) =>
                            Number.isInteger(value) && value >= 0 && value <= 6,
                    ),
                message: "All schedule days must be between 0 and 6",
            },
        },
        hourlyMode: {
            type: String,
            enum: ["interval", "clock"],
            default: "interval",
        },
        minute: {
            type: Number,
            min: 0,
            max: 59,
            default: 0,
        },
    },
    { _id: false },
);

const automationSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            match: /^[a-z0-9][a-z0-9-]*$/,
            maxlength: 64,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
        },
        description: {
            type: String,
            default: "",
            maxlength: 500,
        },
        enabled: {
            type: Boolean,
            default: false,
        },
        schedule: {
            type: automationScheduleSchema,
            default: () => ({}),
        },
        timezone: {
            type: String,
            default: "UTC",
        },
        path: {
            type: String,
            required: true,
        },
        inputs: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        producesHtml: {
            type: Boolean,
            default: false,
        },
        pinnedToSidebar: {
            type: Boolean,
            default: false,
        },
        lastRunAt: {
            type: Date,
            default: null,
        },
        nextRunAt: {
            type: Date,
            default: null,
        },
        latestRunTaskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            default: null,
        },
        latestHtmlOutputPath: {
            type: String,
            default: null,
        },
        schedulerLockedAt: {
            type: Date,
            default: null,
        },
        lastEnqueuedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

automationSchema.index({ owner: 1, slug: 1 }, { unique: true });
automationSchema.index({ enabled: 1, nextRunAt: 1 });
automationSchema.index({ owner: 1, pinnedToSidebar: 1, producesHtml: 1 });

const Automation =
    mongoose.models?.Automation ||
    mongoose.model("Automation", automationSchema);

export default Automation;
