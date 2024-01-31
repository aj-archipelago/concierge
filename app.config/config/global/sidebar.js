export const getSidebarLogo = (language) => {
    if (language === "ar")
        return (
            <div>
                <div className="flex gap-2">
                    لبيب
                    <div className="text-[10px] font-medium mb-2">
                        <div className="rounded text-white bg-yellow-600 px-1">
                            ألفا
                        </div>
                    </div>
                </div>
                <div className="text-gray-400 text-[10px]">
                    مساعد الذكاء الاصطناعي للجزيرة
                </div>
            </div>
        );

    return (
        <div>
            <div className="flex gap-2">
                Labeeb
                <div className="text-[10px] font-medium mb-2">
                    <div className="rounded text-white bg-yellow-600 px-1">
                        Alpha
                    </div>
                </div>
            </div>
            <div className="text-gray-400 text-[10px]">
                Al Jazeera's AI Assistant
            </div>
        </div>
    );
};
