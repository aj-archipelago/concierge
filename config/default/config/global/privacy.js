const content = {
    en: [
        "Concierge stores account information, conversations, uploaded files, preferences, and task results to provide its features. Access and retention depend on how the administrator operates this installation.",
        "When you use an AI model or connector, relevant content may be sent to the configured provider or connected service. The administrator may also enable optional analytics.",
        "Contact the administrator of this installation for its privacy policy, retention periods, and the process for accessing or deleting your data.",
    ],
    ar: [
        "يخزّن كونسيرج معلومات الحساب والمحادثات والملفات المرفوعة والتفضيلات ونتائج المهام لتقديم ميزاته. تعتمد صلاحيات الوصول ومدد الاحتفاظ بالبيانات على كيفية إدارة هذه النسخة من التطبيق.",
        "عند استخدام نموذج ذكاء اصطناعي أو موصّل، قد يُرسل المحتوى ذو الصلة إلى مزوّد الخدمة أو الخدمة المتصلة التي أعدّها المسؤول. وقد يفعّل المسؤول أيضًا تحليلات الاستخدام الاختيارية.",
        "تواصل مع مسؤول هذه النسخة للاطلاع على سياسة الخصوصية ومدد الاحتفاظ بالبيانات وإجراءات الوصول إلى بياناتك أو حذفها.",
    ],
};

// Operators should replace this general notice with their deployment's policy.
export const getPrivacyContent = (language) => ({
    markup: (
        <>
            {content[String(language || "").startsWith("ar") ? "ar" : "en"].map(
                (paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                ),
            )}
        </>
    ),
    scripts: [],
    noticeUrls: [],
});
