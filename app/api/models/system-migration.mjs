import mongoose from "mongoose";

export const SYSTEM_MIGRATION_STATUS = {
    RUNNING: "running",
    COMPLETE: "complete",
    FAILED: "failed",
};

const systemMigrationSchema = new mongoose.Schema(
    {
        _id: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(SYSTEM_MIGRATION_STATUS),
            default: SYSTEM_MIGRATION_STATUS.RUNNING,
            required: true,
        },
        ownerId: {
            type: String,
            required: false,
        },
        leaseExpiresAt: {
            type: Date,
            required: false,
        },
        startedAt: {
            type: Date,
            required: false,
        },
        completedAt: {
            type: Date,
            required: false,
        },
        lastAttemptAt: {
            type: Date,
            required: false,
        },
        attempts: {
            type: Number,
            default: 0,
        },
        error: {
            type: mongoose.Schema.Types.Mixed,
            required: false,
        },
        result: {
            type: mongoose.Schema.Types.Mixed,
            required: false,
        },
    },
    {
        collection: "system_migrations",
        timestamps: true,
        autoIndex: false,
    },
);

const SystemMigration =
    mongoose.models?.SystemMigration ||
    mongoose.model("SystemMigration", systemMigrationSchema);

export default SystemMigration;
