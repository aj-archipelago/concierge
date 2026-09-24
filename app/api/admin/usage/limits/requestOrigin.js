export function hasValidRequestOrigin(request) {
    const origin = request.headers.get("origin");
    if (!origin) return true;

    // Azure terminates TLS before Next.js, whose URL can contain the container
    // host. Use the public host/protocol supplied by the ingress proxy, as the
    // app's OAuth callback routes do. The ingress must overwrite these headers.
    const host =
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        request.nextUrl.host;
    const protocol =
        request.headers.get("x-forwarded-proto") ||
        request.nextUrl.protocol.replace(/:$/, "");
    if (
        !["http", "https"].includes(protocol) ||
        !host ||
        /[\s,/@\\?#]/.test(host)
    )
        return false;

    try {
        const source = new URL(origin);
        return (
            source.origin === origin &&
            source.origin === new URL(`${protocol}://${host}`).origin
        );
    } catch {
        return false;
    }
}
