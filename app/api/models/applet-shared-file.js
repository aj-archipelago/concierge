import mongoose from "mongoose";
import "./file";

const ObjectIdType =
    mongoose?.Schema?.Types?.ObjectId || mongoose?.Types?.ObjectId || String;

export const appletSharedFileSchema = new mongoose.Schema(
    {
        appletId: {
            type: ObjectIdType,
            ref: "Applet",
            required: true,
        },
        files: {
            type: [
                {
                    type: ObjectIdType,
                    ref: "File",
                },
            ],
            default: [],
        },
    },
    {
        timestamps: true,
    },
);

appletSharedFileSchema.index({ appletId: 1 }, { unique: true });

const AppletSharedFile =
    mongoose.models.AppletSharedFile ||
    mongoose.model("AppletSharedFile", appletSharedFileSchema);

export default AppletSharedFile;
