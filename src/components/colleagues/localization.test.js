import fs from "node:fs";
const en = JSON.parse(
    fs.readFileSync(`${process.cwd()}/config/default/locales/en.json`, "utf8"),
);
const ar = JSON.parse(
    fs.readFileSync(`${process.cwd()}/config/default/locales/ar.json`, "utf8"),
);
it("ships the same colleague copy in English and Arabic", () => {
    const keys = Object.keys(en).filter((key) => key.startsWith("colleagues."));
    expect(keys.length).toBeGreaterThan(40);
    expect(
        Object.keys(ar)
            .filter((key) => key.startsWith("colleagues."))
            .sort(),
    ).toEqual(keys.sort());
    keys.forEach((key) => {
        expect(en[key]).toBeTruthy();
        expect(ar[key]).toMatch(/[\u0600-\u06ff]/);
    });
    for (const [language, defaults] of [
        ["en", en],
        ["ar", ar],
    ]) {
        const overrides = JSON.parse(
            fs.readFileSync(
                `${process.cwd()}/config/default/locales/${language}.json`,
                "utf8",
            ),
        );
        keys.forEach((key) => expect(overrides[key]).toBe(defaults[key]));
    }
});
