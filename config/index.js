import appConfig from "../app.config/config";
import defaultConfig from "./default/config/index.js";

export default mergeObjects(defaultConfig, appConfig);

function mergeObjects(obj1, obj2) {
    const result = { ...obj1 };
    for (const key in obj2) {
        if (obj2.hasOwnProperty(key)) {
            if (Array.isArray(obj2[key])) {
                result[key] = obj2[key];
            } else if (typeof obj2[key] === "object" && obj1[key] != null) {
                result[key] = mergeObjects(obj1[key], obj2[key]);
            } else {
                result[key] = obj2[key];
            }
        }
    }
    return result;
}
