/**
 * @jest-environment node
 */
import mongoose from "mongoose";
import AppletUserData from "./applet-user-data";

test.each([null, false, 0, "", [], {}])("accepts JSON value %p", (value) => {
    const doc = new AppletUserData({
        appletId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        key: "draft",
        value,
    });
    expect(doc.validateSync()).toBeUndefined();
});
