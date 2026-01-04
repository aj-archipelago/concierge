"use client";

import React, { useState, useEffect } from "react";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../../@/components/ui/alert-dialog";

export default function StyleGuidesPage() {
    const [styleGuides, setStyleGuides] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showUploadDialog, setShowUploadDialog] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(false);

    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadedFileId, setUploadedFileId] = useState(null);

    // Delete dialog state
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [styleGuideToDelete, setStyleGuideToDelete] = useState(null);

    useEffect(() => {
        fetchStyleGuides();
    }, []);

    const fetchStyleGuides = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch("/api/style-guides");
            const data = await response.json();

            if (response.ok) {
                setStyleGuides(data.styleGuides || []);
            } else {
                setError(data.error || "Failed to fetch style guides");
            }
        } catch (err) {
            console.error("Error fetching style guides:", err);
            setError("Failed to fetch style guides");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleUploadFile = async () => {
        if (!selectedFile) {
            toast.error("Please select a file");
            return;
        }

        try {
            setUploadProgress(true);
            const formData = new FormData();
            formData.append("file", selectedFile);

            const response = await fetch("/api/style-guides", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setUploadedFileId(data.file._id);
                return data.file._id;
            } else {
                throw new Error(data.error || "Failed to upload file");
            }
        } catch (err) {
            console.error("Error uploading file:", err);
            toast.error(err.message || "Failed to upload file");
            return null;
        } finally {
            setUploadProgress(false);
        }
    };

    const handleCreateStyleGuide = async () => {
        if (!name.trim()) {
            toast.error("Please enter a name for the style guide");
            return;
        }

        let fileId = uploadedFileId;

        // If file hasn't been uploaded yet, upload it first
        if (!fileId && selectedFile) {
            fileId = await handleUploadFile();
            if (!fileId) return; // Upload failed
        }

        if (!fileId) {
            toast.error("Please upload a file");
            return;
        }

        try {
            setUploadProgress(true);
            const response = await fetch("/api/style-guides", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name,
                    description,
                    fileId,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                toast.success("Style guide created successfully");
                setShowUploadDialog(false);
                resetForm();
                fetchStyleGuides();
            } else {
                throw new Error(data.error || "Failed to create style guide");
            }
        } catch (err) {
            console.error("Error creating style guide:", err);
            toast.error(err.message || "Failed to create style guide");
        } finally {
            setUploadProgress(false);
        }
    };

    const handleDeleteClick = (styleGuide) => {
        setStyleGuideToDelete(styleGuide);
        setShowDeleteDialog(true);
    };

    const handleDeleteConfirm = async () => {
        if (!styleGuideToDelete) return;

        try {
            const response = await fetch(
                `/api/style-guides/${styleGuideToDelete._id}`,
                {
                    method: "DELETE",
                },
            );

            const data = await response.json();

            if (response.ok) {
                toast.success("Style guide deleted successfully");
                fetchStyleGuides();
            } else {
                throw new Error(data.error || "Failed to delete style guide");
            }
        } catch (err) {
            console.error("Error deleting style guide:", err);
            toast.error(err.message || "Failed to delete style guide");
        } finally {
            setShowDeleteDialog(false);
            setStyleGuideToDelete(null);
        }
    };

    const resetForm = () => {
        setName("");
        setDescription("");
        setSelectedFile(null);
        setUploadedFileId(null);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600 dark:text-gray-400">
                    Loading style guides...
                </span>
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8">
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                        Style Guides
                    </h1>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                        Manage system-wide style guides that users can select
                        when checking their content.
                    </p>
                </div>
                <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                    <button
                        type="button"
                        onClick={() => setShowUploadDialog(true)}
                        className="inline-flex items-center justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 sm:w-auto"
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Style Guide
                    </button>
                </div>
            </div>

            {error && (
                <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-md">
                    <p className="text-red-700 dark:text-red-400">{error}</p>
                </div>
            )}

            <div className="mt-8 flex flex-col">
                <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                        {styleGuides.length === 0 ? (
                            <div className="text-center py-12">
                                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                    No style guides
                                </h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    Get started by uploading a style guide.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                                <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            <th
                                                scope="col"
                                                className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 sm:pl-6"
                                            >
                                                Name
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100"
                                            >
                                                Description
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100"
                                            >
                                                File
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100"
                                            >
                                                Uploaded By
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-100"
                                            >
                                                Date
                                            </th>
                                            <th
                                                scope="col"
                                                className="relative py-3.5 pl-3 pr-4 sm:pr-6"
                                            >
                                                <span className="sr-only">
                                                    Actions
                                                </span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                        {styleGuides.map((styleGuide) => (
                                            <tr key={styleGuide._id}>
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-100 sm:pl-6">
                                                    {styleGuide.name}
                                                </td>
                                                <td className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    {styleGuide.description ||
                                                        "-"}
                                                </td>
                                                <td className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    {styleGuide.file
                                                        ?.originalName || "-"}
                                                </td>
                                                <td className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    {styleGuide.uploadedBy
                                                        ?.name || "-"}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    {new Date(
                                                        styleGuide.createdAt,
                                                    ).toLocaleDateString()}
                                                </td>
                                                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                                    <button
                                                        onClick={() =>
                                                            handleDeleteClick(
                                                                styleGuide,
                                                            )
                                                        }
                                                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Upload Dialog */}
            {showUploadDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Upload Style Guide
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="lb-input w-full"
                                    placeholder="e.g., AP Style Guide"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    className="lb-input w-full"
                                    rows="3"
                                    placeholder="Optional description..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    File *
                                </label>
                                <input
                                    type="file"
                                    onChange={handleFileSelect}
                                    className="block w-full text-sm text-gray-500 dark:text-gray-400
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-md file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-sky-50 file:text-sky-700
                                        hover:file:bg-sky-100
                                        dark:file:bg-sky-900 dark:file:text-sky-200"
                                />
                                {selectedFile && (
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Selected: {selectedFile.name}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowUploadDialog(false);
                                    resetForm();
                                }}
                                disabled={uploadProgress}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateStyleGuide}
                                disabled={uploadProgress}
                                className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50 flex items-center"
                            >
                                {uploadProgress && (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                )}
                                {uploadProgress ? "Uploading..." : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Style Guide</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "
                            {styleGuideToDelete?.name}"? This action cannot be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
