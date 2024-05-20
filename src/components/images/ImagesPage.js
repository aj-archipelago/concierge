"use client";

import { useQuery } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaDownload, FaTrash } from "react-icons/fa";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import { ProgressUpdate } from "../editor/TextSuggestions";
import { Modal } from "../../../@/components/ui/modal";

function ImagesPage() {
    const [prompt, setPrompt] = useState("");
    const [generationPrompt, setGenerationPrompt] = useState("");
    const [images, setImages] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const { t } = useTranslation();

    useEffect(() => {
        const imagesInStorage = localStorage.getItem("generated-images");
        if (imagesInStorage) {
            setImages(JSON.parse(imagesInStorage));
        }
    }, []);

    const variables = {
        text: generationPrompt,
        async: true,
    };

    const { data, loading } = useQuery(QUERIES.IMAGE, {
        variables,
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "network-only",
    });

    useEffect(() => {
        if (data?.image?.result && generationPrompt) {
            const requestId = data?.image?.result;

            // if already in images, ignore
            if (images.find((img) => img.cortexRequestId === requestId)) {
                return;
            }

            setImages((images) => {
                const newImages = [...images];
                newImages.unshift({
                    cortexRequestId: requestId,
                    prompt: generationPrompt,
                });
                return newImages;
            });
        }
    }, [data?.image?.result, generationPrompt, images]);

    images.sort((a, b) => {
        return b.created - a.created;
    });

    const imageTiles = useMemo(() => {
        return images.map((image, index) => {
            const key = image?.cortexRequestId;

            return (
                <ImageTile
                    key={`image-${key}`}
                    image={image}
                    onClick={() => {
                        if (image?.result?.data?.[0]?.url) {
                            setSelectedImage(image);
                            setShowModal(true);
                        }
                    }}
                    onRegenerate={() => {
                        setPrompt(image.prompt);
                        setGenerationPrompt(image.prompt);

                        // scroll to top
                        window.scrollTo(0, 0);
                    }}
                    onGenerationComplete={(requestId, data) => {
                        const newImages = [...images];

                        const imageIndex = newImages.findIndex(
                            (img) => img.cortexRequestId === requestId,
                        );

                        if (imageIndex !== -1) {
                            newImages[imageIndex] = {
                                ...newImages[imageIndex],
                                ...data,
                            };
                        }
                        setImages(newImages);
                        localStorage.setItem(
                            "generated-images",
                            JSON.stringify(newImages),
                        );
                    }}
                    onDelete={(image) => {
                        const newImages = images.filter((img) => {
                            return (
                                img.cortexRequestId !== image.cortexRequestId
                            );
                        });

                        if (generationPrompt === image.prompt) {
                            setGenerationPrompt("");
                        }

                        setImages(newImages);
                        localStorage.setItem(
                            "generated-images",
                            JSON.stringify(newImages),
                        );
                    }}
                />
            );
        });
    }, [images, generationPrompt]);

    return (
        <div>
            <p className="mb-2">
                {t(
                    "Generate images using the OpenAI Dall-E model. Enter a prompt below to get started.",
                )}
            </p>
            <div className="mb-4">
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setGenerationPrompt(prompt);
                    }}
                >
                    <input
                        type="text"
                        className="lb-input"
                        placeholder={t("Enter prompt")}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />

                    <LoadingButton
                        className={"lb-primary"}
                        style={{ whiteSpace: "nowrap" }}
                        loading={loading}
                        text={t("Generating...")}
                        type="submit"
                    >
                        {t("Generate")}
                    </LoadingButton>
                </form>
            </div>
            <div className="flex flex-wrap gap-4 ">{imageTiles}</div>
            <ImageModal
                show={showModal}
                image={selectedImage}
                onHide={() => {
                    setShowModal(false);
                    setSelectedImage(null);
                }}
            />
        </div>
    );
}

function Progress({ requestId, prompt, onDataReceived }) {
    const [data] = useState(null);
    const { t } = useTranslation();

    if (!requestId) {
        return null;
    }

    if (requestId && !data) {
        return (
            <ProgressUpdate
                initialText={t("Generating...")}
                requestId={requestId}
                setFinalData={(data) => {
                    onDataReceived({ result: { ...data }, prompt });
                }}
            />
        );
    }
}

function ImageTile({
    image,
    onClick,
    onDelete,
    onRegenerate,
    onGenerationComplete,
}) {
    const [loadError, setLoadError] = useState(false);
    const url = image?.result?.data?.[0]?.url;
    const { t } = useTranslation();
    const expired = image?.expires < Date.now() / 1000;
    const { cortexRequestId, prompt, result } = image || {};
    const { code, message } = result?.error || {};

    const memoizedImage = useMemo(() => {
        return <ImageComponent url={url} />;
    }, [url]);

    return (
        <div
            className="border rounded-md basis-[100%] sm:basis-48 p-2 cursor-pointer relative"
            onClick={onClick}
        >
            {!expired && url && !loadError ? (
                <div className="h-40 rounded-md overflow-hidden">
                    {memoizedImage}
                </div>
            ) : (
                <div className="h-40 border overflow-hidden rounded-md bg-gray-50 p-4 text-sm">
                    {cortexRequestId && !url && !code && <ProgressComponent />}
                    {code === "ERR_BAD_REQUEST" && <BadRequestError />}
                    {code && code !== "ERR_BAD_REQUEST" && <OtherError />}
                    {expired && url && <ExpiredImageComponent />}
                    {loadError && <ExpiredImageComponent />}
                </div>
            )}
            <div
                className="text-sm text-gray-500 p-1 text-center"
                title={prompt}
            >
                {prompt}
            </div>
            <Actions image={image} onDelete={onDelete} />
        </div>
    );

    function ProgressComponent() {
        return (
            <div>
                <Progress
                    requestId={cortexRequestId}
                    prompt={prompt}
                    onDataReceived={(data) =>
                        onGenerationComplete(cortexRequestId, data)
                    }
                />
            </div>
        );
    }

    function BadRequestError() {
        return (
            <div className="text-center">
                <div>{t("Image blocked by safety system.")}</div>
            </div>
        );
    }

    function OtherError() {
        return (
            <div className="text-center">
                <div>{`${t("Image Error: ")} ${message}`}</div>
            </div>
        );
    }

    function ImageComponent({ url }) {
        return (
            <img
                className="img-fluid"
                src={url}
                alt={prompt}
                onError={() => setLoadError(true)}
                onLoad={() => setLoadError(false)}
            />
        );
    }

    function ExpiredImageComponent() {
        return (
            <div>
                <div className="mb-4 text-center">
                    {t("Image expired or not available.")}
                </div>
                <div className="flex justify-center">
                    <button
                        className="lb-primary"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRegenerate();
                        }}
                    >
                        {t("Regenerate")}
                    </button>
                </div>
            </div>
        );
    }
}

function ImageModal({ show, image, onHide }) {
    // modal should show full size image, full prompt and image info
    const { t } = useTranslation();

    return (
        <Modal show={show} onHide={onHide} title={t("Generated image")}>
            <div className="flex gap-6">
                <div className="basis-9/12 rounded-md overflow-hidden">
                    <img
                        className=""
                        src={image?.result?.data?.[0]?.url}
                        alt={image?.prompt}
                    />
                </div>
                <div className="basis-3/12">
                    <div className="text-sm">
                        <ImageInfo data={image} />
                    </div>
                    <div className="prompt-info">
                        <div className="prompt-title">
                            {t("Original prompt")}
                        </div>
                        <div className="prompt">
                            <p>{image?.prompt}</p>
                        </div>
                    </div>
                    <div className="prompt-info">
                        <div className="prompt-title">
                            {t("System revised prompt")}
                        </div>
                        <div className="prompt">
                            <p>{image?.result?.data?.[0].revised_prompt}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="justify-end flex gap-2 mt-4">
                <button className="btn btn-primary" onClick={onHide}>
                    {t("Close")}
                </button>
            </div>
        </Modal>
    );
}

function Actions({ image, onDelete }) {
    const { t } = useTranslation();

    return (
        <div className="text-gray-500 text-end">
            <button
                className="lb-sm lb-outline-secondary"
                title={t("Download")}
                onClick={(e) => {
                    e.stopPropagation();
                    window.open(image?.result?.data?.[0]?.url, "_blank");
                }}
            >
                <FaDownload />
            </button>
            <button
                className="lb-sm lb-outline-secondary"
                title={t("Delete")}
                onClick={(e) => {
                    if (
                        window.confirm(
                            t("Are you sure you want to delete this image?"),
                        )
                    ) {
                        onDelete(image);
                    }
                    e.stopPropagation();
                }}
            >
                <FaTrash />
            </button>
        </div>
    );
}

function ImageInfo({ data }) {
    const url = data?.result?.data?.[0]?.url;
    const { t } = useTranslation();

    return (
        <div>
            <div className="mb-2">
                <div>
                    <strong>{t("Created")}</strong>
                </div>
                <div>
                    {data?.result?.created
                        ? new Date(
                              data?.result?.created * 1000,
                          ).toLocaleString()
                        : t("(not found)")}
                </div>
            </div>
            <div className="mb-2">
                <div>
                    <strong>{t("Expires")}</strong>
                </div>
                <div>
                    {data?.expires
                        ? new Date(data?.expires * 1000).toLocaleString()
                        : t("(not set)")}
                </div>
            </div>
            <div className="mb-2">
                <div>
                    <strong>{t("Cortex Request ID")}</strong>
                </div>
                <div>{data?.cortexRequestId}</div>
            </div>
            <div className="mb-2">
                <div>
                    <strong>{t("Dall-E URL")}</strong>
                </div>
                <div style={{ lineBreak: "anywhere" }}>
                    {url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                            {t("Link")}
                        </a>
                    ) : (
                        t("URL not found")
                    )}
                </div>
            </div>
        </div>
    );
}

export default ImagesPage;
