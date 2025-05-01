import { FaUserNinja, FaUserSecret } from "react-icons/fa"; // Or keep letter icons if preferred

// Define the structure for the EntityIcon component if needed elsewhere, or define it where used.
// For letter icons:
const createLetterIconComponent = (letter, bgColorClass, textColorClass) => {
    return () => (
        <div
            className={`w-5 h-5 flex items-center justify-center font-bold text-lg ${bgColorClass} rounded-full ${textColorClass}`}
        >
            {letter}
        </div>
    );
};

export const predefinedEntities = [
    {
        id: "Tony",
        name: "Tony",
        letter: "T",
        bgColor: "bg-blue-200 dark:bg-blue-800",
        textColor: "text-blue-800 dark:text-blue-200",
        // Example using the factory function if EntityIcon component itself is not exported:
        // Icon: createLetterIconComponent("T", "bg-blue-200 dark:bg-blue-800", "text-blue-800 dark:text-blue-200")
    },
    // {
    //     id: "Adam",
    //     name: "Adam",
    //     letter: "A",
    //     bgColor: "bg-green-200 dark:bg-green-800",
    //     textColor: "text-green-800 dark:text-green-200",
    //     // Icon: createLetterIconComponent("A", "bg-green-200 dark:bg-green-800", "text-green-800 dark:text-green-200")
    // },
];
