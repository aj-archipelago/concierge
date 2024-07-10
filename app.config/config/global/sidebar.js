import pkg from "../../../package.json";

export const getSidebarLogo = (language) => {
    const version = pkg.version;

    if (language === "ar")
        return (
            <div>
                <div className="flex gap-2">
                    لبيب
                    <div className="text-[10px] font-medium mb-2">
                        <div className="rounded-md text-white bg-yellow-600 px-1">
                            ألفا
                        </div>
                    </div>
                </div>
                <div className="text-gray-400 text-[10px]">
                    <div>مساعد الذكاء الاصطناعي للجزيرة</div>
                    <div>v{version}</div>
                </div>
            </div>
        );

    return (
        <div>
            <div className="flex gap-2">
                Labeeb
                <div className="text-[10px] font-medium mb-2">
                    <div className="rounded-md text-white bg-yellow-600 px-1">
                        Beta
                    </div>
                </div>
            </div>
            <div className="text-gray-400 text-[10px]">
                <div>Al Jazeera's AI Assistant</div>
                <div>v{version}</div>
            </div>
        </div>
    );
};