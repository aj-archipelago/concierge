export const getTosContent = (language) => {
    if (language === "ar") {
        return (
            <>
                <div dir="rtl">
                    <p>
                    مساعد الذكاء الاصطناعي من الجزيرة ("لبيب") هو الآن في النسخة التجريبية. نريد أن يستمتع الناس باستخدامه واختبار وظيفته، لكن يرجى توقع بعض عدم الاستقرار والبطء، خصوصاً حول ميزات النموذج الأحدث التي غالبًا ما تكون في مرحلة ما قبل الإصدار.
                    </p>

                    <p>
                        لضمان الاستخدام المسؤول و الأخلاقي للبيب ، يوافق
                        المستخدم على الشروط والأحكام التالية:
                    </p>

                    <ul className="mb-3 list-disc ps-4">
                        <li>
                            يوافق المستخدم على عدم مشاركة نتائج أي تفاعلات مع
                            لبيب علنيًا ، حيث قد يتسبب ذلك في إلحاق الضرر. يشمل
                            ذلك استخدام أية ترجمة ، ملخصات ، تكوينات نصية ، أو
                            رمز في إنشاء المحتوى أو المنتجات للجزيرة دون التحقق
                            بعناية من أن الناتج يتوافق مع معايير الجزيرة ذات
                            الصلة.
                        </li>

                        <li>
                            على الرغم من أننا حاولنا ضبطلبيب ليكون دقيقًا
                            ومسؤولًا ، يرجى ملاحظة أن استخدام الذكاء الاصطناعي
                            في القيام بالترجمة يمكن أن يؤدي أحيانًا إلى نتائج
                            غير متوقعة. يرجى مراجعة الترجمة بعناية للتأكد من
                            صحتها ، خاصة بالنسبة للحقائق مثل أسماء الأشخاص
                            والأماكن والمدن والبلدان والكيانات الأخرى.
                        </li>

                        <li>
                            قد تحتوي نتائج لبيب على أخطاء ، وعدم دقة ، ومحتوى
                            مسيء ، أو مشكلات أخرى قد تسبب الضرر. يوافق المستخدم
                            على استخدام لبيب على مسؤوليته الخاصة.
                        </li>

                        <li>
                            أي شيء تدخله في لبيب ليس مضمونًا أن يكون خاصًا.
                            يوافق المستخدم على أن أي معلومات يدخلها في لبيب قد
                            يتم تخزينها واستخدامها من قبل الجزيرة لأي غرض ، بما
                            في ذلك ولكن لا تقتصر على تحسين أداء لبيب ودقته ،
                            ولأي غرض آخر يراه الجزيرة مناسبًا.
                        </li>
                    </ul>

                    <p>
                        إذا كان لديك أي أسئلة أو مخاوف حول استخدام لبيب ، يرجى
                        الاتصال بفريق أرخبيل. يمكنك العثور علينا على سلاك أو
                        إرسال بريد إلكتروني إلى dis@aljazeera.net.
                    </p>
                </div>
            </>
        );
    } else {
        return (
            <>
                <p>
                    The Al Jazeera AI Assistant (“Labeeb”) is now in Beta. We
                    want people to enjoy using it and test the functionality,
                    but please expect some instability and slowness,
                    particularly around the newest model features which are
                    often in pre-release.
                </p>

                <p>
                    To ensure responsible and ethical use of Labeeb, the user
                    agrees to the following terms and conditions:
                </p>

                <ul className="mb-3 list-disc ps-4">
                    <li>
                        The user agrees not to share the output of any
                        interactions with Labeeb publicly, as this could
                        potentially cause harm. This includes using any
                        translation, summaries, text compositions, or code in
                        the creation of content or products for Al Jazeera
                        without careful verification that the output conforms to
                        Al Jazeera's relevant standards.
                    </li>

                    <li>
                        Although we have tried to tune Labeeb to be accurate and
                        responsible, please note that using AI to do translation
                        can sometimes produce unexpected results. Please review
                        the translation carefully for correctness, especially
                        for facts such as names of people, places, cities,
                        countries, and other entities.
                    </li>

                    <li>
                        Labeeb's output may contain errors, inaccuracies,
                        offensive content, or other problems that could
                        potentially cause harm. The user agrees to use Labeeb at
                        their own risk.
                    </li>

                    <li>
                        Anything you enter into Labeeb is not guaranteed to be
                        private. The user agrees that any information they enter
                        into Labeeb may be stored and used by Al Jazeera for any
                        purpose, including but not limited to improving Labeeb's
                        performance and accuracy, and for any other purpose that
                        Al Jazeera deems appropriate.
                    </li>
                </ul>

                <p>
                    If you have any questions or concerns about using Labeeb,
                    please contact the Archipelago team. You can find us on
                    Slack or send an email to dis@aljazeera.net.
                </p>
            </>
        );
    }
};
