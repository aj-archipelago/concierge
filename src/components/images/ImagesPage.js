"use client";

import { useQuery } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";
import { Form, Modal } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { FaDownload, FaTrash } from "react-icons/fa";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import { ProgressUpdate } from "../editor/TextSuggestions";

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
            <div>
                <Form
                    className="d-flex gap-2"
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
                </Form>
            </div>
            <div className="d-flex flex-wrap">{imageTiles}</div>
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
        return <ImageComponent />;
    }, []);

    return (
        <div className="p-3">
            <div
                className="img-thumbnail generated-image-thumbnail"
                onClick={onClick}
            >
                <div className="image-container">
                    {cortexRequestId && !url && !code && <ProgressComponent />}
                    {code === "ERR_BAD_REQUEST" && <BadRequestError />}
                    {code && code !== "ERR_BAD_REQUEST" && <OtherError />}
                    {expired && url && <ExpiredImageComponent />}
                    {loadError && <ExpiredImageComponent />}
                    {!expired && url && !loadError && memoizedImage}
                </div>
                <div className="caption p-1 text-center" title={prompt}>
                    {prompt}
                </div>
                <Actions image={image} onDelete={onDelete} />
            </div>
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

    function ImageComponent() {
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
                <div>{t("Image expired or not available.")}</div>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate();
                    }}
                >
                    {t("Regenerate")}
                </button>
            </div>
        );
    }
}

function ImageModal({ show, image, onHide }) {
    // modal should show full size image, full prompt and image info
    const { t } = useTranslation();

    return (
        <Modal show={show} onHide={onHide} dialogClassName="modal-wide">
            <Modal.Header closeButton>
                <Modal.Title className="flex-grow-1">
                    {t("Generated image")}
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <div className="modal-image">
                    <div className="image-container">
                        <img
                            className="img-fluid"
                            src={image?.result?.data?.[0]?.url}
                            alt={image?.prompt}
                        />
                    </div>
                    <div className="text-container">
                        <div className="image-info">
                            <ImageInfo data={image} />
                        </div>
                        <div className="prompt-info">
                            <div className="prompt-title">
                                {t("Original prompt:")}
                            </div>
                            <div className="prompt">
                                <p>{image?.prompt}</p>
                            </div>
                        </div>
                        <div className="prompt-info">
                            <div className="prompt-title">
                                {t("System revised prompt:")}
                            </div>
                            <div className="prompt">
                                <p>{image?.result?.data?.[0].revised_prompt}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal.Body>

            <Modal.Footer>
                <button className="btn btn-primary" onClick={onHide}>
                    {t("Close")}
                </button>
            </Modal.Footer>
        </Modal>
    );
}

function Actions({ image, onDelete }) {
    const { t } = useTranslation();

    return (
        <div className="actions text-end p-2">
            <div className="btn-group">
                <button
                    className="btn btn-sm btn-outline-secondary"
                    title={t("Download")}
                    onClick={(e) => {
                        e.stopPropagation();
                        window.open(image?.result?.data?.[0]?.url, "_blank");
                    }}
                >
                    <FaDownload />
                </button>
                <button
                    className="btn btn-sm btn-outline-secondary"
                    title={t("Delete")}
                    onClick={(e) => {
                        if (
                            window.confirm(
                                t(
                                    "Are you sure you want to delete this image?",
                                ),
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
        </div>
    );
}

function ImageInfo({ data }) {
    const url = data?.result?.data?.[0]?.url;
    const { t } = useTranslation();

    return (
        <div>
            <table className="w-100 image-info">
                <tbody>
                    <tr>
                        <td>
                            <strong>{t("Created")}</strong>
                        </td>
                        <td>
                            {data?.result?.created
                                ? new Date(
                                      data?.result?.created * 1000,
                                  ).toLocaleString()
                                : t("(not found)")}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <strong>{t("Expires")}</strong>
                        </td>
                        <td>
                            {data?.expires
                                ? new Date(
                                      data?.expires * 1000,
                                  ).toLocaleString()
                                : t("(not set)")}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <strong>{t("Cortex Request ID")}</strong>
                        </td>
                        <td>{data?.cortexRequestId}</td>
                    </tr>
                    <tr>
                        <td>
                            <strong>{t("Dall-E URL")}</strong>
                        </td>
                        <td style={{ lineBreak: "anywhere" }}>
                            {url ? (
                                <a href={url} target="_blank" rel="noreferrer">
                                    {t("Link")}
                                </a>
                            ) : (
                                t("URL not found")
                            )}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export default ImagesPage;
