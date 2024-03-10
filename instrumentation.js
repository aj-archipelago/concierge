import mongoose from "mongoose";

const { MONGO_URI } = process.env;

export function register() {
    mongoose
        .connect(MONGO_URI)
        .then(() => {
            console.log("Connected to MongoDB");
        })
        .catch((err) => {
            console.error("Error connecting to MongoDB", err);
        });
}
