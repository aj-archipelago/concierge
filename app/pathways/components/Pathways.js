"use client";

import { useRouter } from "next/navigation";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import Loader from "../../components/loader";
import { useCreatePathway, usePathways } from "../../queries/pathways";
import { useTranslation } from "react-i18next";

export default function Pathways() {
    const router = useRouter();
    const { data: pathways, isLoading } = usePathways();
    const createPathway = useCreatePathway();
    const { t } = useTranslation();

    const handleCreate = async () => {
        const pathway = await createPathway.mutateAsync({
            name: t("new_pathway"),
            prompt: t("Enter your prompt here"),
        });
        router.push(`/pathways/${pathway._id}`);
    };

    if (isLoading) {
        return <Loader />;
    }

    return (
        <div>
            <h1 className="text-xl font-medium mb-3">{t("Pathways")}</h1>

            <p className="mb-3">
                {t("Create pathways to organize and share your prompts")}
            </p>
            <div className="flex flex-wrap gap-4">
                {pathways.map((pathway) => (
                    <PathwayTile
                        key={pathway._id}
                        onClick={() =>
                            router.push(`/pathways/${pathway._id}`)
                        }
                    >
                        {pathway.name || "Pathway " + pathway._id}
                    </PathwayTile>
                ))}
                <LoadingButton
                    text={t("Creating") + "..."}
                    className="border border-dashed rounded-md w-64 h-12 p-6 flex items-center hover:bg-gray-50 active:bg-gray-100"
                    loading={createPathway.isPending}
                    onClick={handleCreate}
                >
                    + {t("Create pathway")}
                </LoadingButton>
            </div>
        </div>
    );
}

function PathwayTile({ children, onClick }) {
    return (
        <button
            className="white-button w-64 h-12 p-6 border rounded-md flex items-center "
            onClick={onClick}
        >
            {children}
        </button>
    );
}
