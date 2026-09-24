const content = {
    en: [
        "Review AI-generated answers, translations, and code before relying on or sharing them. Outputs can contain errors, including incorrect facts or unsafe code.",
        "Tools and connectors can read or change data in services you authorize. Review their permissions and requests before granting access.",
        "Contact the administrator of this installation for the terms and policies that apply to your use of Concierge.",
    ],
    ar: [
        "راجع الإجابات والترجمات والشيفرات التي يولّدها الذكاء الاصطناعي قبل الاعتماد عليها أو مشاركتها. قد تتضمن المخرجات أخطاء، بما في ذلك معلومات غير صحيحة أو شيفرات غير آمنة.",
        "يمكن للأدوات والموصّلات قراءة البيانات أو تغييرها في الخدمات التي تمنحها الإذن. راجع صلاحياتها وطلباتها قبل منحها حق الوصول.",
        "تواصل مع مسؤول هذه النسخة لمعرفة الشروط والسياسات التي تنطبق على استخدامك لكونسيرج.",
    ],
};

// Operators can supply their terms through global.getTosContent in app.config.
export const getTosContent = (language) => (
    <>
        {content[String(language || "").startsWith("ar") ? "ar" : "en"].map(
            (paragraph) => (
                <p key={paragraph}>{paragraph}</p>
            ),
        )}
    </>
);
