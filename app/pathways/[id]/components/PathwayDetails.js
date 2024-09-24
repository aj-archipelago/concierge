"use client";
import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { usePathway, useUpdatePathway, useDeletePathway } from "../../../queries/pathways"; // Import useDeletePathway
import { useRouter } from "next/navigation";

function PathwayDetails({ id }) {
    const { data: pathway, error, isLoading } = usePathway(id); // Use the usePathway hook
    const updatePathway = useUpdatePathway(); // Use the useUpdatePathway hook
    const deletePathway = useDeletePathway(); // Use the useDeletePathway hook
    const router = useRouter();


    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        prompt: "",
        inputParameters: "",
        model: "",
    });

    useEffect(() => {
        if (pathway) {
            setFormData({
                name: pathway.name,
                prompt: pathway.prompt,
                inputParameters: JSON.stringify(pathway.inputParameters, null, 2),
                model: pathway.model || "",
            });
        }
    }, [pathway]);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error loading pathway: {error.message}</div>;
    }

    const handleEditClick = () => {
        setIsEditing(true);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prevData) => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleInputParameterChange = (index, field, value) => {
        setFormData((prevData) => {
            const inputParameters = JSON.parse(prevData.inputParameters || "[]");
            inputParameters[index][field] = value;
            return {
                ...prevData,
                inputParameters: JSON.stringify(inputParameters, null, 2),
            };
        });
    };

    const handleAddInputParameter = () => {
        setFormData((prevData) => {
            const inputParameters = JSON.parse(prevData.inputParameters || "[]");
            inputParameters.push({ key: "", value: "" }); // Removed defaultValue
            return {
                ...prevData,
                inputParameters: JSON.stringify(inputParameters, null, 2),
            };
        });
    };

    const handleRemoveInputParameter = (index) => {
        setFormData((prevData) => {
            const inputParameters = JSON.parse(prevData.inputParameters || "[]");
            inputParameters.splice(index, 1);
            return {
                ...prevData,
                inputParameters: JSON.stringify(inputParameters, null, 2),
            };
        });
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const updatedData = {
            ...formData,
            inputParameters: JSON.parse(formData.inputParameters || "[]"),
        };
        await updatePathway.mutateAsync({ id, data: updatedData });
        setIsEditing(false);
    };

    const handleCancelClick = () => {
        setIsEditing(false);
    };

    const handleDeleteClick = async () => {
        if (window.confirm("Are you sure you want to delete this pathway?")) {
            await deletePathway.mutateAsync({id});
            // Redirect to the pathways list page after deletion
            router.push('/pathways');
        }
    };

    return (
        <div className="flex flex-col h-full p-4">
            {!isEditing && (
                <div className="flex justify-end mb-4 gap-2">
                    <button onClick={handleEditClick} className="btn btn-primary lb-outline-secondary">
                        Edit
                    </button>
                    <button onClick={handleDeleteClick} className="lb-danger">
                        Delete
                    </button>
                </div>
            )}
            {!isEditing && (
                <>
                    <h1 className="text-2xl font-bold mb-4">{formData.name}</h1>
                    <p className="mb-4">{formData.prompt}</p>
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold mb-2">Input Parameters</h2>
                        <table className="table-auto w-full rounded-lg border">
                            <thead className="bg-gray-200">
                                <tr>
                                    <th className="text-start px-4 py-2 border">Key</th>
                                    <th className="text-start px-4 py-2 border">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {JSON.parse(formData.inputParameters || "[]").map((param, index) => (
                                    <tr key={index} className="odd:bg-white even:bg-gray-50">
                                        <td className="border px-4 py-2">{param.key}</td>
                                        <td className="border px-4 py-2">{param.value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {formData.model && (
                        <div className="mb-4">
                            <h2 className="text-xl font-semibold">Model</h2>
                            <p>{formData.model}</p>
                        </div>
                    )}
                </>
            )}
            {isEditing && (
                <form onSubmit={handleFormSubmit} className="mt-4">
                    <div className="mb-4">
                        <label className="block text-sm font-medium">Name</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className="input input-bordered w-full lb-input"
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-medium">Prompt</label>
                        <textarea
                            name="prompt"
                            value={formData.prompt}
                            onChange={handleInputChange}
                            className="textarea textarea-bordered w-full lb-input"
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-medium">Input Parameters</label>
                        {JSON.parse(formData.inputParameters || "[]").map((param, index) => (
                            <div key={index} className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    placeholder="Key"
                                    value={param.key}
                                    onChange={(e) => handleInputParameterChange(index, "key", e.target.value)}
                                    className="input input-bordered w-full lb-input"
                                />
                                <input
                                    type="text"
                                    placeholder="Value"
                                    value={param.value}
                                    onChange={(e) => handleInputParameterChange(index, "value", e.target.value)}
                                    className="input input-bordered w-full lb-input"
                                />
                                <button type="button" onClick={() => handleRemoveInputParameter(index)} className="btn btn-outline-secondary lb-outline-secondary">
                                    Remove
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={handleAddInputParameter} className="btn btn-outline-secondary lb-outline-secondary">
                            Add Parameter
                        </button>
                    </div>
                    <div className="mb-4">
                        <label className="block text-sm font-medium">Model</label>
                        <input
                            type="text"
                            name="model"
                            value={formData.model}
                            onChange={handleInputChange}
                            className="input input-bordered w-full lb-input"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="btn btn-primary lb-primary">
                            Save
                        </button>
                        <button type="button" onClick={handleCancelClick} className="btn btn-outline-secondary lb-outline-secondary">
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

PathwayDetails.propTypes = {
    id: PropTypes.string.isRequired,
};

export default PathwayDetails;