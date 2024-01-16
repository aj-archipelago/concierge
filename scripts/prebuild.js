const fs = require("fs-extra");

const copyStaticFiles = (sourceDir, destDir) => {
    if (!fs.existsSync(sourceDir)) {
        return;
    }

    fs.copySync(sourceDir, destDir, { overwrite: true }, function (err) {
        if (err) {
            console.error("An error occurred while copying the folder.");
            return console.error(err);
        }
        console.log("Assets copied successfully.");
    });
};

copyStaticFiles("config/default/public", "public/app");
copyStaticFiles("config/default/locales", "src/locales");

copyStaticFiles("app.config/public", "public/app");
copyStaticFiles("app.config/locales", "src/locales");
