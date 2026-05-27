import mongoose from "mongoose";
import { SKILL_DESCRIPTION_MAX_LENGTH } from "../../../src/utils/skillDescriptionLimits";

const skillSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            match: /^[a-z0-9][a-z0-9-]*$/,
            maxlength: 64,
        },
        description: {
            type: String,
            required: true,
            maxlength: SKILL_DESCRIPTION_MAX_LENGTH,
        },
        path: {
            type: String,
        },
    },
    {
        timestamps: true,
    },
);

// Each user can have only one skill with a given name
skillSchema.index({ userId: 1, name: 1 }, { unique: true });

const Skill = mongoose.models?.Skill || mongoose.model("Skill", skillSchema);

export default Skill;
