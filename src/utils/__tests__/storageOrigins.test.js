import {
    getManagedStorageOrigins,
    getStorageContainerPrefixes,
    isManagedStorageUrl,
} from "../storageOrigins";

const previous = { ...process.env };
afterEach(() => {
    process.env = { ...previous };
});

test("storage origins match exactly and reject lookalikes, credentials, and unrelated tenants", () => {
    process.env.NEXT_PUBLIC_STORAGE_ORIGINS =
        "https://files.example.com, https://tenant.blob.core.windows.net";
    expect(
        isManagedStorageUrl("https://files.example.com/a?token=example"),
    ).toBe(true);
    for (const url of [
        "https://files.example.com.evil.example/a",
        "https://other.blob.core.windows.net/a",
        "https://user:password@files.example.com/a",
        "http://files.example.com/a",
        "https://files.example.com:8443/a",
    ])
        expect(isManagedStorageUrl(url)).toBe(false);
});

test("production has no implicit cloud or loopback storage trust", () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_STORAGE_ORIGINS;
    expect([...getManagedStorageOrigins()]).toEqual([]);
    expect(
        isManagedStorageUrl("http://localhost:10000/account/container/file"),
    ).toBe(false);
});

test("malformed and credential-bearing configured origins are ignored", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_STORAGE_ORIGINS =
        "not a URL,ftp://files.example.com,https://user:pass@files.example.com,https://valid.example.com/path";
    expect([...getManagedStorageOrigins()]).toEqual([
        "https://valid.example.com",
    ]);
});

test("longer configured container prefixes are checked before their shorter parent", () => {
    process.env.CORTEX_STORAGE_CONTAINER_PREFIXES = "files,files-dev";
    expect(getStorageContainerPrefixes()).toEqual(["files-dev", "files"]);
});
