import { serveWorkspaceFile } from "../../../api/workspace/file/utils";

export async function GET(request, { params }) {
    params = await params;
    const path = Array.isArray(params?.path) ? params.path.join("/") : "";
    return serveWorkspaceFile(`/workspace/files/${path}`);
}
