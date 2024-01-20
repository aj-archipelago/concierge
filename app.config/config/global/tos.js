export const getTosContent = (language) => {
    if (language === "ar") {
        return (
            <>
                <p>
                    مساعد جزيرة العرب الذكي ("أرتشي") الآن في مرحلة ألفا. نحن
                    نريد من الناس الاستمتاع باستخدامه واختبار الوظائف، ولكن يرجى
                    توقع بعض عدم الاستقرار والبطء، وخاصة فيما يتعلق بميزات GPT-4
                    التي تكون في مرحلة ما قبل الإصدار.
                </p>

                <p>
                    لضمان استخدام أرتشي بمسؤولية وأخلاقية، يوافق المستخدم على
                    الشروط والأحكام التالية:
                </p>

                <ul className="mb-3 list-disc ps-4">
                    <li>
                        يوافق المستخدم على عدم مشاركة نتائج أي تفاعلات مع أرتشي
                        علنًا، حيث يمكن أن يتسبب ذلك في الضرر. ويشمل ذلك استخدام
                        أي ترجمة أو ملخصات أو تكوينات نصية أو رمز في إنشاء محتوى
                        أو منتجات لجزيرة العرب بدون التحقق الدقيق من مطابقة
                        النتائج للمعايير ذات الصلة لجزيرة العرب.
                    </li>

                    <li>
                        على الرغم من أننا حاولنا ضبط أرتشي ليكون دقيقًا
                        ومسؤولًا، إلا أن استخدام الذكاء الاصطناعي في الترجمة
                        يمكن أن يؤدي في بعض الأحيان إلى نتائج غير متوقعة. يرجى
                        مراجعة الترجمة بعناية للتحقق من الصحة، خاصة بالنسبة
                        للحقائق مثل أسماء الأشخاص والأماكن والمدن والبلدان
                        والجهات الأخرى.
                    </li>

                    <li>
                        قد تحتوي النتائج التي يقدمها أرتشي على أخطاء أو عدم دقة
                        أو محتوى مسيء أو مشاكل أخرى يمكن أن تتسبب في الضرر.
                        يوافق المستخدم على استخدام أرتشي على مسؤوليته الشخصية.
                    </li>

                    <li>
                        لا يتم ضمان خصوصية أي معلومات تدخلها في أرتشي. يوافق
                        المستخدم على أن أي معلومات يدخلها في أرتشي قد يتم
                        تخزينها واستخدامها من قبل جزيرة العرب لأي غرض، بما في
                        ذلك ولكن لا يقتصر على تحسين أداء ودقة أرتشي، ولأي غرض
                        آخر يراه جزيرة العرب مناسبًا.
                    </li>
                </ul>

                <p>
                    إذا كان لديك أي أسئلة أو مخاوف بشأن استخدام أرتشي، يرجى
                    الاتصال بفريق Archipelago. يمكنك العثور علينا على Slack أو
                    إرسال بريد إلكتروني إلى أي منا.
                </p>
            </>
        );
    } else {
        return (
            <>
                <p>
                    The Al Jazeera AI Assistant (“Labeeb”) is now in Alpha. We
                    want people to enjoy using it and test the functionality,
                    but please expect some instability and slowness,
                    particularly around GPT-4 features, which are in
                    pre-release.
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
                    Slack or send an email to any one of us.
                </p>
            </>
        );
    }
};
