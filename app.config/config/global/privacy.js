// NOTE: This file only returns static markup; no client-only features.

export const getPrivacyContent = (language) => {
    const common = language === "ar" ? getArabic() : getEnglish();
    return common;
};

function getEnglish() {
    const html = `
    <main class="min-h-screen bg-gray-100 py-8">
        <section class="w-full">
            <div class="max-w-6xl mx-auto px-4">
                <div class="mb-8 text-center">
                    <h1 class="text-xl font-medium mb-3 text-gray-800">Privacy Notice</h1>
                </div>
                <div class="flex flex-wrap justify-center">
                    <div class="w-full">
                        <div class="bg-white p-6 sm:p-8 rounded-lg shadow-md">
                            <!-- OneTrust Privacy Notice start -->
                            <div class="otnotice-language-dropdown-container" style="display:none">
                               <select id="otnotice-language-dropdown" aria-label="language selector"></select>
                            </div>

                            <div id="otnotice-e7d5c184-8792-450c-bdbc-b765b6250a0c" class="otnotice"></div>

                            <!-- scripts are injected by page wrapper -->
                            <!-- OneTrust Privacy Notice end -->
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <style>
            .otnotice-content{padding:0!important;position:relative!important;text-align:left!important;}
            .otnotice-menu{width:310px!important;max-height:80%!important;overflow-y:auto!important;background:#F8F8F8!important;border:1px solid #EEEEEE!important;box-shadow:0px 7px 10px 0px rgba(124,124,124,0.2)!important;padding:25px!important;margin:0!important;position:absolute!important;top:0;left:0;}
            .otnotice-menu>.otnotice-menu-section{width:100%!important;margin-bottom:25px!important;}
            .otnotice-sections{margin-left:335px!important;margin-right:0!important;}
            @media (max-width:768px){
                #otnotice-e7d5c184-8792-450c-bdbc-b765b6250a0c .otnotice-content,
                .mobile-view .otnotice-content{
                    display:block!important;
                    position:relative!important;
                    width:100%!important;
                }
                #otnotice-e7d5c184-8792-450c-bdbc-b765b6250a0c .otnotice-menu,
                .mobile-view .otnotice-menu{
                    position:relative!important;
                    width:100%!important;
                    margin-bottom:20px!important;
                    left:0!important;
                    top:0!important;
                    transform:none!important;
                    float:none!important;
                    display:block!important;
                }
                #otnotice-e7d5c184-8792-450c-bdbc-b765b6250a0c .otnotice-sections,
                .mobile-view .otnotice-sections{
                    margin:0!important;
                    width:100%!important;
                    float:none!important;
                    clear:both!important;
                    display:block!important;
                }
                #otnotice-e7d5c184-8792-450c-bdbc-b765b6250a0c .otnotice-menu,
                #otnotice-e7d5c184-8792-450c-bdbc-b765b6250a0c .otnotice-sections,
                .mobile-view .otnotice-menu,
                .mobile-view .otnotice-sections{
                    position:relative!important;
                    left:0!important;
                    right:0!important;
                    transform:none!important;
                    max-width:100%!important;
                }
            }
            body.dark .otnotice-menu{background:#1f2937!important;border-color:#374151!important;}
            body.dark .otnotice-menu>.otnotice-menu-section a{color:#e5e7eb!important;}
            body.dark .otnotice-sections>.otnotice-section>h2.otnotice-section-header{color:#e5e7eb!important;}
        </style>
    </main>`;

    return {
        markup: (
            <div
                suppressHydrationWarning={true}
                dangerouslySetInnerHTML={{ __html: html }}
            />
        ),
        scripts: [
            {
                src: "https://privacyportalde-cdn.onetrust.com/privacy-notice-scripts/otnotice-1.0.min.js",
                id: "otprivacy-notice-script",
                strategy: "afterInteractive",
                attrs: {
                    charSet: "UTF-8",
                    settings:
                        "eyJjYWxsYmFja1VybCI6Imh0dHBzOi8vZHNwb3J0YWwuYWxqYXplZXJhLm5ldC9yZXF1ZXN0L3YxL3ByaXZhY3lOb3RpY2VzL3N0YXRzL3ZpZXdzIn0=",
                },
            },
        ],
        noticeUrls: [
            "https://privacyportalde-cdn.onetrust.com/15894e16-5fd4-4170-9dfc-9fb1d34b6c3c/privacy-notices/e7d5c184-8792-450c-bdbc-b765b6250a0c.json",
        ],
    };
}

function getArabic() {
    const html = `<main class="page inner-page">
        <section class="clean-block clean-info bright-gray-bg">

            <div class="container container-overlap-top">
                <div class="block-heading">
                    <h1 class="page-title color-white opacity50">سياسة الخصوصية</h1>
                </div>
                <div class="row">
                    <div class="col col-md-12">
                        <div class="card white-bg main-row padding25 box-shadow">
                        	<div class="row">
                        
								<div class="col-xs-12 col-lg-3">
									<ul class="notice-menu">
									<li><a href="#​القسمالأول:حولهذاالإشعار">​القسم الأول: حول هذا الإشعار</a></li><li><a href="#القسم2:معالجةالبياناتالشخصية">القسم 2: معالجة البيانات الشخصية</a></li><li><a href="#القسم3:الكشفعنالبياناتالشخصيةلأطرافثالثة">القسم 3 : الكشف عن البيانات الشخصية لأطراف ثالثة</a></li><li><a href="#القسم4:نقلللبياناتالشخصيةدوليا">القسم 4: نقل للبيانات الشخصية دوليا</a></li><li><a href="#القسم5:أمنالبيانات">القسم 5 : أمن البيانات</a></li><li><a href="#القسم6:دقةالبيانات">القسم 6 : دقة البيانات</a></li><li><a href="#القسم7:خفضحجمالبياناتإلىالحدالأدنى">القسم 7: خفض حجم البيانات إلى الحد الأدنى</a></li><li><a href="#القسم8:الاحتفاظبالبيانات">القسم 8 : الاحتفاظ بالبيانات</a></li><li><a href="#القسم9:حقوقكالقانونية">القسم 9 : حقوقك القانونية</a></li><li><a href="#القسم10:التزاماتكالشخصية">القسم 10 : التزاماتك الشخصية</a></li><li><a href="#القسم11:تفاصيلالاتصال">القسم 11 : تفاصيل الاتصال</a></li><li><a href="#​القسم12:التعريفات">​القسم 12: التعريفات</a></li></ul>
			                    </div>

								<div class="col-xs-12 col-lg-9 ms-rtestate-field">
								
									<div class="ms-webpart-chrome ms-webpart-chrome-fullWidth ">
		<div webpartid="00000000-0000-0000-0000-000000000000" haspers="true" id="WebPartWPQ3" width="100%" class="noindex " onlyformepart="true" allowdelete="false" style=""><div class="ms-vb privacy-content" xmlns:x="http://www.w3.org/2001/XMLSchema" xmlns:d="http://schemas.microsoft.com/sharepoint/dsp" xmlns:asp="http://schemas.microsoft.com/ASPNET/20" xmlns:__designer="http://schemas.microsoft.com/WebParts/v2/DataView/designer" xmlns:sharepoint="Microsoft.SharePoint.WebControls" xmlns:ddwrt2="urn:frontpage:internal"><div class="ExternalClass25EC10D139CD405282F229A2BD5D5E4B"><h1 dir="rtl" style="text-align:right;" id="​القسمالأول:حولهذاالإشعار">​القسم الأول: حول هذا الإشعار<br></h1><p dir="rtl" style="text-align:justify;">هذا الإشعار صادر عن شبكة الجزيرة الإعلامية &nbsp;(تُستحدم أيضا عبارة "الجزيرة" أو "نحن")، وهو موجه إلى المديرين الحاليين والسابقين والمحتملين، والموظفين، والاستشاريين، والعمال، والموظفين المؤقتين، والمتعاقدين الأفراد، والمتدربين، والمُعارين، وأفراد أسرة الموظف، وغيرهم من موظفي شبكة الجزيرة (نستخدم أيضا وصف "موظفون" أو "أنت/أنتم"). وترد شروح المصطلحات المحددة المستخدمة في هذا الإشعار في القسم 12 أدناه.<br></p><p dir="rtl" style="text-align:right;">​لأغراض خاصة بهذا الإشعار، فإن &nbsp;المراقب هنا هو كيان الجزيرة الذي وظفك أو استعان بخدماتك.<br></p><p dir="rtl" style="text-align:right;"><br></p><h1 dir="rtl" style="text-align:right;" id="القسم2:معالجةالبياناتالشخصية">القسم 2: معالجة البيانات الشخصية</h1><p dir="rtl" style="text-align:justify;">جمع البيانات الشخصية: قد نجمع بياناتك الشخصية من المصادر التالية:</p><p dir="rtl" style="text-align:justify;">• مباشرة منك: قد نحصل على بياناتك الشخصية منك أنت مباشرة عندما تقدّمها لنا.&nbsp;</p><p dir="rtl" style="text-align:justify;">• من خلال تفاعلك معنا: قد نقوم بجمع بياناتك الشخصية عبر المسار العادي لعلاقة العمل التي تجمعك معنا، أو من خلال عملك لحسابنا (على سبيل المثال، عندما نكون نستقبلك كموظف جديد معنا؛ أو عندما نعالج بياناتك الشخصية لأغراض تتعلق بصرف الرواتب؛ أو عندما تقوم أنت باستخدام أنظمة تكنولوجيا المعلومات لدينا).</p><p dir="rtl" style="text-align:justify;">• مصدر عام: قد نقوم بجمع البيانات الشخصية التي تختار أنت أو الحكومة الإعلان عنها ونشرها عَلنًا، بما في ذلك عبر وسائل التواصل الاجتماعي (إلى الحد الذي تختاره &nbsp;أنت لجعل ملفك الشخصي مرئيا للجمهور).</p><p dir="rtl" style="text-align:justify;">• أطراف أخرى: قد نتلقى بياناتك الشخصية من أطراف أخرى تقدمها لنا (على سبيل المثال، أصحاب العمل السابقين؛ الحكّام (القضاء)؛ ووكالات إنفاذ القانون).</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">إنشاء البيانات الشخصية: قد نقوم أيضًا بإنشاء بياناتك الشخصية، مثل المسمى الوظيفي وتفاصيل التعويض ومراجعات الأداء. تساعدنا هذه البيانات الشخصية على إجراء عملياتنا وإدارة القوى العاملة لدينا. إذا لم تقدم لنا بيانات شخصية معيّنة، فقد لا نتمكن من تحقيق بعض الأهداف المحددة في هذا الإشعار.</p><p dir="rtl" style="text-align:justify;">البيانات الشخصية ذات الصلة: تشمل فئات بياناتك الشخصية التي نُعالجها ما يلي:</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;تفاصيل سيرتك الذاتية: الاسم (الأسماء إن وجدت)؛ الاسم المفضل؛ - الجندر (الجنس)؛ تاريخ الميلاد؛ الجنسية؛ الإثنية؛ صورة فوتوغرافية؛ الحالة الاجتماعية؛ رقم جواز السفر (إن وجد)؛ الرقم القومي (عند الاقتضاء)؛ معرّف الضريبة (عند الاقتضاء)؛ رقم التأشيرة (عند الاقتضاء)؛ رقم إذن العمل (حيثما ينطبق ذلك)؛ سجلات الهجرة؛ وتفاصيل من تتكفل بإعالتهم وأفراد الأسرة.</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;تفاصيل التواصل معك: عنوان منزلك؛ عنوانك في العمل؛ رقم هاتفك المنزلي؛ رقم هاتف العمل؛ رقم هاتف العمل الجوال؛ رقم الهاتف الجوال الشخصي؛ عنوان البريد الإلكتروني الشخصي؛ عنوان بريد العمل الإلكتروني؛ معرّف الشبكة؛ وتفاصيل الاتصال في حالات الطوارئ.</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;سجلات الأجهزة والاستخدام: معلومات عن المركبات؛ معلومات من الجهاز المحمول؛ معلومات النظم؛ المعلومات المتعلقة باستخدام نظم تكنولوجيا المعلومات الداخلية والبيانات الشخصية المرسلة من خلالها (مثل رسائل البريد الإلكتروني، وسجلات الاتصالات عبر الهاتف)؛ وملفات تعريف وسائل التواصل الاجتماعي.</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;التفاصيل البيومترية: الصور؛ الفيديوهات؛ بصمة الإصبع؛ مسح الشبكية؛ التعرف إلى الصوت؛ والتعرف إلى الوجه.</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;تفاصيل الراتب والمزايا الأخرى: الراتب والمزايا الأخرى؛ معدّل سعر الساعة (حيثما ينطبق ذلك)؛ العمولة المستهدفة؛ &nbsp; &nbsp;نوع المكافأة؛ جوائز الأسهم؛ معرّف نظام الرواتب؛ تفاصيل الراتب والتعويضات؛ الأهلية للحصول على مكافأة و/ أو الدخل طويل الأجل؛ معلومات الحساب المصرفي؛ رمز الضريبة ورقمها؛ سجلات الرواتب؛ سجلات ضريبة الدخل؛ سجلات ضريبة البطالة؛ سجلات دفع الأمومة؛ سجلات المعاشات التقاعدية؛ سجلات التقاعد؛ ومعلومات عن النفقات.&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;سجلات العمل: النسبة المئوية للعمل (دوام كامل أو جزئي)؛ السيرة الذاتية/ملخّص تعريفي؛ سجلات المقابلات؛ مراجع؛ عقود العمل؛ تاريخ التوظيف الأصلي؛ تاريخ آخر توظيف؛ تاريخ انتهاء فترة الاختبار؛ المسمى الوظيفي؛ كيان صاحب العمل؛ الإدارة؛ نوع ورقم معرّف الموظفين؛ مجموعة الموظفين/مجموعة الموظفين الفرعية؛ اسم المشرف؛ اسم الوحدة التنظيمية؛ مستوى الوظيفة؛ ساعات العمل؛ سجلات غياب العمل؛ سجلات الحضور؛ سجلات الترقية؛ إخطارات إنهاء العقد؛ سجلات العطلات؛ و طلبات العطلات.</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;تدريب الموظفين وتقييم أدائهم: أهداف تعلم الموظفين؛ التقدم والنتائج؛ خطة تطوير شؤون الموظفين؛ أهداف أداء الموظفين؛ سجلات تقييم الأداء؛ نتائج التقييم الذاتي للموظفين؛ سجلات التدريب؛ مواعيد التدريب؛ المؤهلات المُتحصّل عليها؛ والشهادات الأكاديمية/الدرجة العلمية.</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;السجلات المتعلقة بالامتثال والانضباط: التقارير المتعلقة بانتهاكات السياسات ومدونات السلوك الداخلية؛ العقوبات التأديبية؛ اسم المدير وهيكل التقارير؛ الإقرارات المتعلقة بالسياسات الداخلية؛ وتاريخ وسبب الاستقالة أو إنهاء التعاقد.</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;التحقق من خلفية الموظف: تفاصيل تم الكشف عنها من خلال عملية التحقق من خلفية الموظف، المُجراة وفقا للقانون المعمول به، والتي تخضع لموافقتك الخطية الصريحة المسبقة، بما في ذلك تفاصيل التوظيفات السابقة وتفاصيل الإقامة ومعلومات مرجعية الائتمان وتدقيق السجلات الجنائية.</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;الصحة والسلامة: السجلات الصحية؛ تدريب على السلامة من الحرائق؛ معلومات التأمين؛ سجل الإصابات المهنية؛ وسجلات تاريخ المرض؛&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;بيانات الحساب والوصول: &nbsp;تفاصيل تسجيل الوصول (بما في ذلك اسم المستخدم وكلمة المرور)؛ تسجيل الدخول (بما في ذلك موقع تسجيل الدخول، عنوان بروتوكول الإنترنت لتسجيل الوصول، ومحاولات تسجيل الوصول الفاشلة)؛ تاريخ اسم المستخدم وتفاصيل كلمة المرور؛ تسجيلات الدوائر التلفزيونية المغلقة؛ سجلات التحقيقات الداخلية؛ سجلات استخدامك لأنظمة تكنولوجيا المعلومات الخاصة بشبكة الجزيرة؛ والأدلة المتعلقة بأي خرق فعلي أو مشتبه فيه لأي سياسة من سياسات الجزيرة أو للقانون المعمول به.</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">البيانات الشخصية الحساسة: سنجمع ونخزن ونستخدم أيضا مختلف الفئات الخاصة من المعلومات الشخصية الأكثر حساسية، وسيكون ذلك على النحو التالي:</p><p dir="rtl" style="text-align:justify;">• معلومات عن عرقك، وإثنيتك، ومعتقداتك الدينية، وتوجهك الجنسي؛</p><p dir="rtl" style="text-align:justify;">• عضويتك في النقابات؛</p><p dir="rtl" style="text-align:justify;">• معلوماتك البيومترية؛</p><p dir="rtl" style="text-align:justify;">• معلومات عن الإدانات الجنائية التي قد تكون طالتك / الادعاءات والجرائم.</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">الأساس القانوني لمعالجة البيانات الشخصية: &nbsp;عند معالجتنا للبيانات الشخصية المتعلقة بالأغراض المحددة في هذا الإشعار، قد نعتمد أحد الأسس القانونية التالية:</p><p dir="rtl" style="text-align:justify;">• اتخاذ إجراء المعالجة ضروري نظرا لارتباطه بعقد التوظيف الخاص بك أو عقد الاستعانة بخدماتك؛&nbsp;</p><p dir="rtl" style="text-align:justify;">• اتخاذ إجراء المعالجة مطلوب بموجب القانون المعمول به؛</p><p dir="rtl" style="text-align:justify;">• اتخاذ إجراء المعالجة لمصلحتك أنت، وللمصلحة الحيوية لشخص آخر؛&nbsp;</p><p dir="rtl" style="text-align:justify;">• حيث أننا حصلنا على موافقتك الصريحة المسبقة على اتخاذ هذا الإجراء (يتم اللجوء إلى هذا الأساس القانوني فقط فيما يتعلق بالمعالجة ذات الصبغة الطوعية الخالصة - ولا يتم استخدامها للمعالجة الضرورية أو الإلزامية بأي شكل من الأشكال)؛</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">• لدينا مصلحة مشروعة في تنفيذ المعالجة التي لا تُبطلها مصالحك أو حقوقك الأساسية أو حرياتك. وعندما نعتمد على هذا الأساس القانوني، فإن مصالحنا المشروعة تكون متمثلة في:</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;مصلحتنا المشروعة في إدارة وتشغيل وتعزيز أعمالنا؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp; مصلحتنا المشروعة في الحفاظ على سلامة وأمن موظفينا ومبانينا وأصولنا وعملياتنا؛ و</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;اهتمامنا المشروع بتقديم الخدمات لعملائنا.&nbsp;</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">الأغراض التي قد تدفعنا لمعالجة البيانات الشخصية: تشمل الأغراض التي قد نعالج البيانات الشخصية من أجلها، مع مراعاة القانون المعمول به، ما يلي:</p><p dir="rtl" style="text-align:right;">&nbsp;</p><table cellspacing="0" width="100%" class="ms-rteTable-default"><tbody><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default" style="width:33.3333%;"><strong>الغرض</strong></td><td class="ms-rteTable-default" style="width:33.3333%;"><strong>الوصف</strong></td><td class="ms-rteTable-default" style="width:33.3333%;"><strong>الأفراد</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default"><strong>الوصول إلى مرافق الشبكة</strong></td><td class="ms-rteTable-default"><strong>لتوفير إمكانية وصولك إلى مرافقنا من أجل أداء عملك</strong></td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default"><strong>الوصول إلى أنظمتنا</strong></td><td class="ms-rteTable-default"><strong>لتزويدك بإمكانية الوصول إلى أنظمتنا من أجل أداء عملك</strong></td><td class="ms-rteTable-default"><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default"><strong>التدقيق - الداخلي والخارجي</strong></td><td class="ms-rteTable-default"><strong>من أجل تحقيق الامتثال للمتطلبات القانونية والقرارات التنظيمية</strong></td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">تخطيط إدارة الأعمال</td><td class="ms-rteTable-default"><strong>التخطيط لإدارة &nbsp;العمل، بما في ذلك &nbsp;عمل التحليل لمراجعة وفهم &nbsp;مسألة الاحتفاظ بالموظفين وأسباب تركهم وظائفهم بصورة أفضل</strong></td><td class="ms-rteTable-default"><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default"><strong>الصحة والسلامة</strong></td><td class="ms-rteTable-default"><strong>الامتثال لالتزامات الصحة والسلامة</strong></td><td class="ms-rteTable-default"><br><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الفنادق والإقامة</td><td class="ms-rteTable-default"><strong>لتوفير خدمات الفنادق والإقامة</strong></td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default"><p>الموارد البشرية- التحقق من خلفية الموظف/المرشح للتوظيف</p><p>&nbsp;</p></td><td class="ms-rteTable-default"><strong>لضمان التحقق من معلومات الموظف أو المرشح للتوظيف والتأكد من أنه لن يشكل خطراً على المؤسسة</strong><strong>.</strong></td><td class="ms-rteTable-default"><div><strong>الموظفون</strong></div><div><strong> </strong><br></div></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية - إدارة الاستحقاقات</td><td class="ms-rteTable-default">لتوفير المزايا &nbsp;التي يحق لك التمتع بها</td><td class="ms-rteTable-default"><strong>الموظفون</strong></td></tr><tr><td class="ms-rteTable-default" dir="rtl" style="text-align:right;"><strong>الموارد البشرية - التطوير الوظيف</strong></td><td class="ms-rteTable-default" dir="rtl" style="text-align:right;"><p>إجراء مراجعات تقييم الأداء، ومن ثم إدارة الأداء وتحديد متطلباته.</p><p>اتخاذ القرارات بشأن مراجعات الرواتب والتعويضات المستحقّة.</p><p>تقييم المؤهلات لشغل وظيفة أو التكليف بمهمة معينة، بما في ذلك القرارات المتعلقة بالترقية.</p><p>اتخاذ القرارات بشأن استمرارك في عملك أو الاستعانة بخدماتك.</p></td><td class="ms-rteTable-default"><div dir="rtl" style="text-align:right;"><strong>الموظفون</strong></div><div dir="rtl" style="text-align:right;"><strong> </strong></div><br></td></tr><tr><td class="ms-rteTable-default" dir="rtl" style="text-align:right;"><strong>الموارد البشرية - مراقبة الامتثال</strong></td><td class="ms-rteTable-default" dir="rtl" style="text-align:right;"><strong>لمراقبة التزاماتنا القانونية المتعلقة بتوظيفك (أي مراقبة تكافؤ الفرص)</strong></td><td class="ms-rteTable-default"><div dir="rtl" style="text-align:right;"><br><strong>الموظفون</strong></div><div dir="rtl" style="text-align:right;"><strong> </strong></div><br></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية - الإجراءات التأديبية</td><td class="ms-rteTable-default"><p><br><br></p><p>من أجل جمع الأدلة وأية خطوات أخرى تتعلق بمسائل التظلم أو بالقرارارت التأديبية &nbsp;التي يمكن &nbsp;اتخاذها والجلسات المرتبطة بها.</p></td><td class="ms-rteTable-default"><br><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية - إدارة الطوارئ</td><td class="ms-rteTable-default">للتواصل معك، أو مع الآخرين من معارفك، في حالة الطوارئ التي تشملك أنت أو الآخرين.</td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية - الخدمات الحكومية</td><td class="ms-rteTable-default">للتحقق من أنه يحق لك العمل قانونا، أو لاستصدار تأشيرتك أو أي إذن عمل آخر، أو من أجل دعمك في الحصول على الخدمات الحكومية المتصلة بالعمل وإتمامها.</td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية - إدارة التأمينات</td><td class="ms-rteTable-default">لتزويدك بخدمات التأمين الصحي وغيرها من خدمات التأمين المرتبطة بالعمل.</td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية – التعلم والتطوير</td><td class="ms-rteTable-default">لنوفر لك مختلف متطلبات التعلم والتدريب والتطوير</td><td class="ms-rteTable-default"><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية – وقف علاقة العمل</td><td class="ms-rteTable-default">لاتخاذ الترتيبات اللازمة لإنهاء علاقة العمل التي تجمعنا</td><td class="ms-rteTable-default"><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية – &nbsp;بدء علاقة العمل</td><td class="ms-rteTable-default">لاتخاذ إجراءات الترتيب لبدء عملك معنا كموظف جديد أو كموظف منتقل</td><td class="ms-rteTable-default"><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية - إدارة الرواتب</td><td class="ms-rteTable-default">لندفع لك مستحقاتك المالية، ولخصم الضرائب وغيرها من الخصومات الأخرى المطلوب خصمها.</td><td class="ms-rteTable-default"><strong>الموظفون</strong></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الموارد البشرية – التوظيف</td><td class="ms-rteTable-default">لاتخاذ قرار بشأن توظيفك أو تعيينك.</td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الحوادث والطلبات</td><td class="ms-rteTable-default">لحل ما قد يعرض لك من حوادث أو لتلبية طلباتك.</td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">تكنولوجيا المعلومات – الإدارة&nbsp;</td><td class="ms-rteTable-default">لضمان أمن الشبكة وأمن المعلومات الخاصة بها، بما في ذلك منع الوصول غير المصرح به إلى أنظمة الاتصالات الإلكترونية والحواسيب، ومنع نشر البرامج المضرّة.</td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">تكنولوجيا المعلومات – الرصد والمراقبة</td><td class="ms-rteTable-default">لمراقبة عملك واستخدامك الشخصي لأنظمة المعلومات والاتصالات بهدف ضمان الامتثال لسياسات تكنولوجيا المعلومات المتبعة في شبكة الجزيرة الإعلامية.</td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الإجراءات القانونية</td><td class="ms-rteTable-default">للتعامل مع النزاعات القانونية المتعلقة بك، أو بالموظفين الآخرين والعمال والمقاولين، بما في ذلك حوادث العمل.</td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">الاحتفاظ بالسجلات</td><td class="ms-rteTable-default">للاحتفاظ بالسجلات الخاصة وفقا لما يقتضيه القانون.</td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">المكافآت وشهادات التقدير</td><td class="ms-rteTable-default">لتوفير المكافآت الخاصة بك وشهادات التقدير المُستحقّة لك.</td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default"><p>&nbsp;</p><p>الأمن ومنع الاحتيال</p></td><td class="ms-rteTable-default"><p>لمنع حدوث احتيال.&nbsp;</p><p>لضمان أمان الشبكة والمعلومات، بما في ذلك منع الوصول غير المصرح به إلى أنظمة الاتصالات الإلكترونية وأنظمة الكمبيوتر ومنع توزيع البرامج الضارة</p></td><td class="ms-rteTable-default"><p><br><br></p><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">إدارة الأسفار</td><td class="ms-rteTable-default">لتزويدك بخدمات الخطوط الجوية، أو غيرها من الخدمات، المتعلقة بالسفر.</td><td class="ms-rteTable-default"><p>الموظفون</p><p>وأفراد أسرهم</p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">وجهات النظر والآراء الشخصية</td><td class="ms-rteTable-default">لتمكينك من مشاركة آرائك ووجهات نظرك من خلال قناة الجزيرة أو أي منصات مفتوحة لعموم الجمهور.</td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr><tr dir="rtl" style="text-align:right;"><td class="ms-rteTable-default">إدارة العمل</td><td class="ms-rteTable-default"><p>تحديد الشروط التي تعمل وفقها لدينا.</p><p>الإدارة العامة للعقد الذي أبرمناه معك.</p></td><td class="ms-rteTable-default"><p>&nbsp;</p><p><strong>الموظفون</strong></p></td></tr></tbody></table><p dir="rtl" style="text-align:right;">&nbsp;</p><p dir="rtl" style="text-align:right;"><strong>الأسباب التي قد نعالج من أجلها البيانات الشخصية الحساسة</strong></p><p dir="rtl" style="text-align:right;"><strong>سنلجأ، عند اللزوم، إلى معالجة فئات خاصة من البيانات الشخصية في الظروف التالية</strong><strong>:&nbsp;</strong></p><p dir="rtl" style="text-align:right;"><strong>•</strong><strong> </strong><strong>عندما تكون المعالجة مطلوبة أو مسموح بها بموجب القانون المعمول به (على سبيل المثال، من أجل الامتثال لالتزاماتنا بالإبلاغ عن التنوع)؛</strong><strong>&nbsp;</strong></p><p dir="rtl" style="text-align:right;"><strong>•</strong><strong> </strong><strong>عندما تكون المعالجة ضرورية للكشف عن جريمة ما أو منعها؛</strong><strong>&nbsp;</strong></p><p dir="rtl" style="text-align:right;"><strong>•</strong><strong> </strong><strong>عندما تكون المعالجة ضرورية من أجل إنشاء حق قانوني أو ممارسة حق قانوني، أو الدفاع عن الحقوق القانونية؛</strong><strong>&nbsp;</strong></p><p dir="rtl" style="text-align:right;"><strong>•</strong><strong> </strong><strong>عندما تكون المعالجة ضرورية لحماية المصالح الحيوية لأي فرد؛</strong><strong>&nbsp;</strong></p><p dir="rtl" style="text-align:right;"><strong>•</strong><strong> </strong><strong>لقد حصلنا، وفقا للقانون المعمول به، على موافقتك الصريحة المسبقة قبل معالجة بياناتك الشخصية الحساسة (كما هو الحال أعلاه، فإنه يتم استخدام هذا الأساس القانوني فقط فيما يتعلق بالمعالجة الطوعية تماما - ولا يتم استخدامه للمعالجة الضرورية أو الإلزامية بأي شكل من الأشكال)</strong><strong>.</strong></p><p dir="rtl" style="text-align:right;"><strong>أعلاه، فإنه يتم استخدام هذا الأساس القانوني فقط فيما يتعلق بالمعالجة الطوعية تماما - ولا يتم استخدامه للمعالجة الضرورية أو الإلزامية بأي شكل من الأشكال</strong><strong>).</strong></p><p dir="rtl" style="text-align:right;">​&nbsp;<br></p><h1 dir="rtl" style="text-align:right;" id="القسم3:الكشفعنالبياناتالشخصيةلأطرافثالثة">القسم 3 : الكشف عن البيانات الشخصية لأطراف ثالثة</h1><p dir="rtl" style="text-align:justify;">​قد نكشف عن البيانات الشخصية لصالح قطاعات وإدارات مجموعة الجزيرة الأخرى، &nbsp;ويكون ذلك لأغراض مشروعة متعلقة بالعمل، وفقا للقانون المعمول به. وبالإضافة إلى ما سبق، فقد نكشف عن البيانات الشخصية إلى:<br></p><p dir="rtl" style="text-align:justify;">• السلطات القانونية والضريبية والتنظيمية بناء على طلبها، أو لأغراض الإبلاغ عن أي انتهاك فعلي أو مشتبه به للقانون أو اللوائح المعمول بها؛&nbsp;</p><p dir="rtl" style="text-align:justify;">• سلطات الهجرة والجهات الحكومية والطبية لأغراض معالجة وحفظ التفاصيل الدقيقة المتعلقة بك وبعائلتك، وأيضا تلك الخاصة بشؤون الهجرة أو التأشيرة أو غيرها من الوثائق القانونية الأخرى.</p><p dir="rtl" style="text-align:justify;">• إلى المحاسبين ومراجعي الحسابات والمحامين وغيرهم من المستشارين المهنيين الخارجيين التابعين لمجموعة شبكة الجزيرة، والتي ترتبط بالالتزامات التعاقدية الملزمة بالسرية؛</p><p dir="rtl" style="text-align:justify;">• جهات أخرى قد تكون موجودة في أي مكان من العالم (مثل الجهات التي توفر الرواتب، ونظام المعاشات التقاعدية، والتأمين، والمزايا الطبية، وخدمات الموارد البشرية، ونظم تكنولوجيا المعلومات والدعم، وأطراف ثالثة أخرى تعمل لمساعدتنا في تنفيذ أنشطتنا)، الموجودة في أي مكان في العالم. ويكون ذلك علا علاقة بالمتطلبات المذكورة أدناه في هذا القسم (3)؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;أي طرف له صلة أو وكالة إنفاذ القانون أو المحكمة، بالقدر الذي يستلزمه إنشاء الحقوق القانونية أو ممارستها أو الدفاع عن الحقوق القانونية؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;أي طرف له صلة بهدف منع الجرائم الجنائية أو التحقيق فيها أو كشفها أو ملاحقة مرتكبيها أو تنفيذ العقوبات الجنائية، بما في ذلك الحماية من التهديدات التي يتعرض لها الأمن العام ومنع حدوثها؛ و</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;أي طرف آخر له صلة حيازة (المشترون) في حال بيع أو نقل كل أعمالنا، أو أي جزء من أعمالنا أو أصولنا (بما في ذلك في حالة إعادة التنظيم أو الحلّ أو التصفية).&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;في حال إشراكنا طرفا آخر في عملية معالجة البيانات الشخصية، فسيكون عليه الخضوع لمراعاة واجبات تعاقدية ملزمة بما في ذلك (i) &nbsp;قصر معالجة البيانات الشخصية وفقا لتعليماتنا المكتوبة السابقة فقط؛ (ii) استخدام تدابير لحماية سرية وأمن البيانات الشخصية.</p><p dir="rtl" style="text-align:right;">&nbsp;</p><h1 dir="rtl" style="text-align:right;" id="القسم4:نقلللبياناتالشخصيةدوليا">القسم 4: نقل للبيانات الشخصية دوليا</h1><p dir="rtl" style="text-align:justify;">بالنظر إلى الطبيعة الدولية لأعمالنا، فإننا قد نحتاج إلى نقل البيانات الشخصية إلى الجهات الأخرى التابعة لمجموعة شبكة الجزيرة الإعلامية (وبالأخص تلك العاملة في دولة قطر، ولكن ليس حصريا)، وإلى أطراف أخرى، كما هو مذكور في القسم 3 أعلاه، فيما يتعلق بالأغراض المحدَّدة في هذا الإشعار. ولهذا السبب، فقد ننقل البيانات الشخصية إلى بلدان أخرى، من الجائز أن تكون لها قوانين ومتطلبات مختلفة لحماية البيانات عن تلك التي تنطبق في البلد الذي تتواجد أنت فيه. وبشكل خاص، يمكننا مشاركة المعلومات الأساسية حول دورك مع فروع مجموعة الجزيرة الأخرى، عبر أدلة الموظفين الداخليين لدينا. تقتصر معالجة البيانات الشخصية الأخرى من قبل الجزيرة بشكل عام على موظفينا الذين لديهم احتياجات عمل مشروعة تبرر وصولهم إلى البيانات الشخصية لواحد أو أكثر من الأغراض المبينة في هذا الإشعار.</p><p dir="rtl" style="text-align:justify;">عندما ننقل للبيانات الشخصية إلى بلدان أخرى، فإننا نفعل ذلك على أساس الشروط التعاقدية القياسية. ويمكنك طلب نسخة من الشروط التعاقدية القياسية باستخدام تفاصيل الاتصال المبيّنة في القسم 11 أدناه.</p><p dir="rtl" style="text-align:right;">&nbsp;<br></p><h1 dir="rtl" style="text-align:right;" id="القسم5:أمنالبيانات">القسم 5 : أمن البيانات</h1><p dir="rtl" style="text-align:justify;">لقد نفّذنا تدابير أمنية تقنية وتنظيمية مناسبة تهدف إلى حماية بياناتك الشخصية من الإتلاف العرضي أو غير القانوني، والفقدان، والتغيير، والإفصاح غير المصرح به، والوصول غير المصرح به، وغير ذلك من أشكال المعالجة غير القانونية أو غير المصرح بها، وفقًا للقانون المعمول به.<br></p><p dir="rtl" style="text-align:justify;"><br></p><h1 dir="rtl" style="text-align:right;" id="القسم6:دقةالبيانات">القسم 6 : دقة البيانات<br></h1><p dir="rtl" style="text-align:justify;">نتخذ كل خطوة صائبة لضمان:</p><p dir="rtl" style="text-align:justify;">• &nbsp;أن تكون ياناتك الشخصية التي نعالجها دقيقة، وأن تظلّ محدثة حيثما كان ذلك ضروريا ؛ و</p><p dir="rtl" style="text-align:justify;">• &nbsp;مسح أو تصحيح أيّ من بياناتك الشخصية، غير الدقيقة، التي نعالجها (مع مراعاة الأغراض التي تتم المعالجة من أجلها) دون تأخير.</p><p dir="rtl" style="text-align:justify;">قد نطلب منك، من وقت لآخر، تأكيد دقة بياناتك الشخصية.</p><p dir="rtl" style="text-align:right;">&nbsp;</p><h1 dir="rtl" style="text-align:right;" id="القسم7:خفضحجمالبياناتإلىالحدالأدنى">القسم 7: خفض حجم البيانات إلى الحد الأدنى</h1><p dir="rtl" style="text-align:right;">نتخذ كل خطوة صائبة لضمان أن تقتصر بياناتك الشخصية التي نعالجها على تلك المطلوبة بشكل معقول فيما يتعلق بالأغراض المحددة في هذا الإشعار.<br></p><p dir="rtl" style="text-align:right;"><br></p><h1 dir="rtl" style="text-align:right;" id="القسم8:الاحتفاظبالبيانات">القسم 8 : الاحتفاظ بالبيانات</h1><p dir="rtl" style="text-align:justify;">سنحتفظ بنسخ من بياناتك الشخصية، كلما دعت الضرورة لذلك، &nbsp;في نموذج يسمح بتحديد الهوية فقط فيما يتعلق بالأغراض المحددة في هذا الإشعار، باستثناء الحالات التي يسمح فيها القانون المعمول به، أو يتطلب فيها، الاحتفاظ بالبيانات لفترة أطول.&nbsp;</p><p dir="rtl" style="text-align:justify;">&nbsp;</p><p dir="rtl" style="text-align:justify;">أما عن معايير تحديد المدة التي سنحتفظ خلالها ببياناتك الشخصية فهي كما يلي: سنحتفظ ببياناتك الشخصية طيلة مدة امتداد علاقتك المهنية مع الجزيرة. بعد إنهاء هذه العلاقة، قد نحتفظ ببياناتك الشخصية لفترات إضافية لنتمكن من إدارة أعمالنا وتلبية المتطلبات القانونية والتدقيقية والتأمينية، بما في ذلك أي فترات تقادم سارية. عند انتهاء هذه الفترات، سيتم حذف بياناتك الشخصية أو إخفاء/تجهيل هويتها الأصلية.</p><p dir="rtl" style="text-align:right;">&nbsp;</p><h1 dir="rtl" style="text-align:right;" id="القسم9:حقوقكالقانونية">القسم 9 : حقوقك القانونية</h1><p dir="rtl" style="text-align:justify;">وفقا للقانون الجاري به العمل، قد يكون لديك جملة من الحقوق بشأن معالجة بياناتك الشخصية، بما في ذلك:</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;الحق في طلب الوصول إلى بياناتك الشخصية التي نعالجها أو نتحكم فيها أو طلب نسخة منها، &nbsp;بالإضافة إلى حقك في الحصول على المعلومات المتعلقة بطبيعة تلك البيانات الشخصية، ومعالجتها، والكشف عنها؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;الحق في طلب تصحيح أي أخطاء قد تكون شابت بياناتك الشخصية،</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;الحق في طلب ما يلي، بناءً على أسباب مشروعة:</p><p dir="rtl" style="text-align:justify;">o محو بياناتك الشخصية التي نعمل على معالجتها &nbsp;أو نتحكم فيها؛ و</p><p dir="rtl" style="text-align:justify;">o تقييد معالجة بياناتك الشخصية التي نعمل على معالجتها أو نتحكم فيها؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;الحق في الاعتراض، لأسباب مشروعة، على معالجة بياناتك الشخصية؛&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;الحق في نقل بياناتك الشخصية إلى &nbsp;مراقب آخر، إذا لم يتعدّ الحدّ الذي ينطبق؛&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;حيث أننا نعالج بياناتك الشخصية على أساس موافقتك، فسيكون لك الحق في سحب تلك الموافقة؛ و</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;الحق في تقديم شكاوى مرتبطة بمعالجة بياناتك الشخصية لدى هيئة حماية البيانات.</p><p dir="rtl" style="text-align:justify;">بطبيعة الحال، فإن ما تقدّم أعلاه لا يؤثر على وضعية حقوقك القانونية، فنحن لا نتخذ إجراءات تأديبية ضد الموظفين بسبب ممارستهم أي من هذه الحقوق.&nbsp;</p><p dir="rtl" style="text-align:justify;">لممارسة واحد أو أكثر من هذه الحقوق، أو لطرح سؤال حول هذه الحقوق أو أي بند آخر من هذا الإشعار أو حول معالجتنا لبياناتك الشخصية، يرجى استخدام تفاصيل الاتصال الواردة في القسم 11 أدناه.</p><p dir="rtl" style="text-align:right;">&nbsp;</p><h1 dir="rtl" style="text-align:right;" id="القسم10:التزاماتكالشخصية">القسم 10 : التزاماتك الشخصية</h1><p dir="rtl" style="text-align:justify;">من الأهمية أن تكون على علم بالتزاماتك المتعلقة بالامتثال لحماية البيانات وأن تفي بتلك الالتزامات. وهذا يعني أنه من واجبك الالتزام بسياسات الجزيرة ومعاييرها وإجراءاتها المتعلقة بمعالجة البيانات الشخصية التي يمكنك الوصول إليها أثناء أدائك واجباتك. ومن بين تلك الالتزامات على وجه الخصوص:</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;تأكيدك على أنه لديك السلطة القانونية لتزويدنا بمعلومات أفراد عائلتك؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;وجوب أن تتعرف على هذا الإشعار و"سياسة حماية البيانات الشخصية للجزيرة"؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;وجوب التزامك بالقانون المعمول به في جميع الأوقات عند معالجة البيانات الشخصية؛</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;وجوب عدم وصولك إلى أي بيانات شخصية أو معالجتها بما يتجاوز المدى اللازم الذي يتطلبه عملك مع الجزيرة.&nbsp;</p><p dir="rtl" style="text-align:justify;">• &nbsp; &nbsp;وجوب محافظتك على جميع البيانات الشخصية التي تعمل على معالجتها في سرية تامة. وهذا الالتزام بالسرية يستمر حتى بعد انتهاء علاقتك المهنية مع الجزيرة.</p><p dir="rtl" style="text-align:right;">&nbsp;</p><h1 dir="rtl" style="text-align:right;" id="القسم11:تفاصيلالاتصال">القسم 11 : تفاصيل الاتصال</h1><p dir="rtl" style="text-align:justify;">إذا كان لديك أي تعليقات أو استفسارات أو مخاوف حول أيّ من المعلومات الواردة في هذا الإشعار، أو بشأن أي مسائل أخرى تتعلق بمعالجة البيانات الشخصية من قبل الجزيرة، فيرجى الاتصال بمسؤول حماية البيانات، وفي مقدمتهم:</p><p dir="rtl" style="text-align:right;">عمران شودري</p><p dir="rtl" style="text-align:right;">موظف حماية البيانات<br></p><p dir="rtl" style="text-align:right;">شبكة الجزيرة الإعلامية</p><p dir="rtl" style="text-align:right;"><a href="mailto:dpo@aljazeera.net">dpo@aljazeera.net</a></p><p dir="rtl" style="text-align:right;">أو زيارة &nbsp;<a href="https://confluence.aljazeera.net/display/DPO/">https:// dpo.aljazeera.net</a><br></p><p dir="rtl" style="text-align:right;"><br></p><h1 dir="rtl" style="text-align:right;" id="​القسم12:التعريفات">​القسم 12: التعريفات<br></h1><table cellspacing="0" width="100%" class="ms-rteTable-default" dir="rtl" style="text-align:right;"><tbody><tr><td class="ms-rteTable-default" dir="rtl" style="width:50%;text-align:right;">المراقب</td><td class="ms-rteTable-default" style="width:50%;"><p>&nbsp;</p><p>يُقصد به الجهة/الكيان &nbsp;الذي يقرر كيفية وأسباب معالجة البيانات الشخصية . في العديد من الولايات القضائية، يتحمل المراقب المالي المسؤولية الرئيسية عن الامتثال للقوانين المعمول بها في مجال حماية البيانات.</p></td></tr><tr><td class="ms-rteTable-default">سلطة حماية البيانات</td><td class="ms-rteTable-default">يُقصد بها سلطة عامة مستقلة مكلفة قانونا بالإشراف على الامتثال للقوانين المعمول بها في مجال حماية البيانات.</td></tr><tr><td class="ms-rteTable-default">البيانات الشخصية</td><td class="ms-rteTable-default"><p>&nbsp;</p><p>يُقصد بها المعلومات التي يتم من خلالها تحديد هوية أي فرد أو التعرف إليه.</p></td></tr><tr><td class="ms-rteTable-default">معالجة، بصدد المعالجة، عُولجت</td><td class="ms-rteTable-default">يُقصد بها أي شيء يتم عمله للبيانات الشخصية، سواء أكان ذلك بوسائل آلية أم بغيرها، مثل الجمع والتسجيل والتنظيم والهيكلة والتخزين والتكييف أو التغيير أو الاسترجاع أو المشاورة أو الاستخدام أو الكشف، عن طريق الإرسال أو النشر، أو الإتاحة أو المواءمة أو الجمع أو التقييد أو المحو أو الإتلاف.</td></tr><tr><td class="ms-rteTable-default">المعالج</td><td class="ms-rteTable-default">يُقصد به أي شخص (أو جهة) يعمل على معالجة البيانات الشخصية نيابة عن المراقب المالي (من غير الموظفين التابعين للمراقب المالي).</td></tr><tr><td class="ms-rteTable-default"><p>&nbsp;</p><p>البيانات الشخصية الحساسة</p></td><td class="ms-rteTable-default"><p>&nbsp;</p><p>يُقصد بها البيانات الشخصية المتعلقة بالعرق أو الإثنية، أو الآراء السياسية، أو المعتقدات الدينية أو الفلسفية، أو العضوية النقابية، أو الصحة البدنية أو العقلية، أو الحياة الجنسية، أو أي جرائم جنائية فعلية أو مزعومة، أو عقوبات، أو رقم الهوية الوطنية، أو أي معلومات أخرى قد تُصنّف حساسة بموجب القانون المعمول به.</p></td></tr><tr><td class="ms-rteTable-default">شخص، أو "أنت"</td><td class="ms-rteTable-default">يأخذ المعنى الوارد في الفقرة الافتتاحية من هذاالإخطار.</td></tr></tbody></table><p dir="rtl" style="text-align:right;">&nbsp;</p><p dir="rtl" style="text-align:right;"><br></p></div></div><div class="ms-clear"></div></div>
	</div>
								
								
			                    </div>
								
			                    
							</div>			                    
	                    
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </main>`;

    const fontStyle = `
      @font-face {
        font-family: 'Al-Jazeera';
        src: url('/app/assets/fonts/Al-Jazeera-Regular.woff2') format('woff2');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'Al-Jazeera';
        src: url('/app/assets/fonts/Al-Jazeera-Bold.woff2') format('woff2');
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
      html[dir="rtl"] strong,
      html[dir="rtl"] b,
      html[dir="rtl"] h1,
      html[dir="rtl"] h2,
      html[dir="rtl"] h3,
      html[dir="rtl"] th {
        font-weight: 700;
      }
    `;

    const noticeStyles = `
    html[dir="rtl"], html[dir="rtl"] body {
      background: #f3f4f6;
      font-family: 'Al-Jazeera', 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
      direction: rtl;
    }
    .page.inner-page,
    .bright-gray-bg,
    .container,
    .container-overlap-top {
      background: #f3f4f6;
      min-height: 100vh;
      padding-top: 2rem;
      padding-bottom: 2rem;
    }
    .container, .container-overlap-top {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1rem;
    }
    .block-heading,
    .page-title {
      text-align: center !important;
      margin-bottom: 1.5rem;
    }
    .page-title,
    .block-heading h1 {
      color: #1f2937;
      font-size: 1.25rem;
      line-height: 1.75rem;
      font-weight: 500;
      margin-bottom: 0;
      letter-spacing: 0.03em;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0 2rem;
      margin: 0 -1rem;
    }
    .col,
    .col-md-12,
    .col-xs-12,
    .col-lg-3,
    .col-lg-9 {
      padding: 0 1rem;
      box-sizing: border-box;
    }
    .col-md-12,
    .col-xs-12 {
      flex: 1 1 100%;
    }
    .col-lg-3 {
      flex: 0 0 310px;
      max-width: 310px;
    }
    .col-lg-9 {
      flex: 1 1 0%;
      max-width: calc(100% - 310px);
    }
    @media (max-width: 992px) {
      .row {
        flex-direction: column;
      }
      .col-lg-3,
      .col-lg-9 {
        flex: 1 1 100%;
        max-width: 100%;
      }
    }
  
    .notice-menu {
      background: #f8f8f8;
      border: 1px solid #eee;
      box-shadow: 0px 7px 10px 0px rgba(124,124,124,0.16);
      border-radius: 0.7rem;
      padding: 1.1rem 1.25rem;
      margin-bottom: 2rem;
      list-style: none;
      position: relative;
      width: 100%;
      max-width: 310px;
    }
    .notice-menu li {
      margin: 0;
      border-bottom: 1px solid #eee;
    }
    .notice-menu li:last-child {
      border-bottom: 0;
    }
    .notice-menu a {
      display: block;
      padding: 0.7rem 0.5rem;
      color: #1f2937;
      font-size: 1.09rem;
      font-weight: 500;
      text-decoration: none;
      border-radius: 0.45rem;
      transition: background 0.18s, color 0.18s;
    }
    .notice-menu a:hover,
    .notice-menu a:focus {
      background: #357DED;
      color: #fff;
    }
  
    .card,
    .white-bg,
    .main-row {
      background: #fff;
      border-radius: 0.7rem;
      box-shadow: 0 2px 14px rgba(30,40,90,0.10);
      padding: 2rem 1.5rem 2rem 1.5rem;
      margin-bottom: 2rem;
    }
    .privacy-content {
      padding: 0.2rem 0;
    }
    .privacy-content h1,
    .privacy-content h2,
    .privacy-content h3 {
      color: #1f2937;
      font-size: 1.18rem;
      font-weight: bold;
      margin: 2rem 0 0.9rem 0;
    }
    .privacy-content p {
      color: #273142;
      font-size: 1.05em;
      margin-bottom: 0.8em;
      line-height: 1.68em;
    }
    .privacy-content ul {
      padding-right: 1.2em;
      margin-bottom: 1.12em;
    }
    .privacy-content li {
      margin-bottom: 0.4em;
    }
    .ms-rteTable-default {
      width: 100%;
      border-collapse: collapse;
      background: #fafafd;
      margin-top: 1.1em;
      margin-bottom: 1.1em;
      font-size: 1em;
      table-layout: fixed;
    }
    .ms-rteTable-default th,
    .ms-rteTable-default td {
      border: 1px solid #e5e7eb;
      padding: 0.65em 0.85em;
      text-align: right;
      background: #fff;
      color: #1f2937;
      word-wrap: break-word;
      white-space: normal;
    }
    .ms-rteTable-default tr:nth-child(even) td {
      background: #f3f4f6;
    }
    .ms-rteTable-default th {
      background: #357DED;
      color: #fff;
      font-weight: 600;
    }
    .ms-clear { clear:both; }
    .ms-webpart-chrome { margin: 0; padding: 0; border: none; }
    .noindex { display: block; }
    [dir="rtl"] h1, [dir="rtl"] h2, [dir="rtl"] h3 { text-align: right; }
    @media (max-width: 768px) {
      .card,
      .white-bg,
      .main-row {
        padding: 1.1rem 0.7rem 1.1rem 0.7rem;
      }
      .notice-menu {
        max-width: 100%;
        margin-bottom: 1.5rem;
        padding: 0.8rem;
      }
    }
    /* -- DARK MODE (enabled by <body class="dark">, matches English page logic) -- */
    body.dark, .dark .page.inner-page, .dark .bright-gray-bg, .dark .container, .dark .container-overlap-top {
      background: #16191e !important;
    }
    body.dark .card,
    body.dark .white-bg,
    body.dark .main-row,
    .dark .card,
    .dark .white-bg,
    .dark .main-row {
        background: #1f2937 !important;
        color: #e5e7eb !important;
        box-shadow: 0 2px 14px rgba(20,24,35,0.22) !important;
    }
    body.dark .page-title,
    body.dark .block-heading h1,
    body.dark .privacy-content h1,
    body.dark .privacy-content h2,
    body.dark .privacy-content h3,
    .dark .page-title,
    .dark .block-heading h1,
    .dark .privacy-content h1,
    .dark .privacy-content h2,
    .dark .privacy-content h3 {
        color: #e5e7eb !important;
    }
    body.dark .privacy-content p,
    body.dark .privacy-content ul,
    body.dark .privacy-content li,
    .dark .privacy-content p,
    .dark .privacy-content ul,
    .dark .privacy-content li {
        color: #d1d5db !important;
    }
    body.dark .notice-menu,
    .dark .notice-menu {
        background: #232946 !important;
        border-color: #374151 !important;
    }
    body.dark .notice-menu a,
    .dark .notice-menu a {
        color: #e5e7eb !important;
    }
    body.dark .notice-menu a:hover,
    body.dark .notice-menu a:focus,
    .dark .notice-menu a:hover,
    .dark .notice-menu a:focus {
        background: #357DED !important;
        color: #fff !important;
    }
    body.dark .ms-rteTable-default th,
    .dark .ms-rteTable-default th {
        background: #357DED !important;
        color: #fff !important;
    }
    body.dark .ms-rteTable-default td,
    .dark .ms-rteTable-default td {
        background: #232946 !important;
        color: #e5e7eb !important;
    }
    body.dark .ms-rteTable-default tr:nth-child(even) td,
    .dark .ms-rteTable-default tr:nth-child(even) td {
        background: #1f232d !important;
    }
    `;

    const fullMarkup = `<style jsx global>${fontStyle}</style><style jsx global>${noticeStyles}</style><div>${html}</div>`;

    return {
        markup: (
            <div
                suppressHydrationWarning={true}
                dangerouslySetInnerHTML={{ __html: fullMarkup }}
            />
        ),
        scripts: [],
        initInline: "",
    };
}
