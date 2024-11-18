"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useApolloClient } from "@apollo/client";
import { PlusIcon, RefreshCwIcon, TextIcon, VideoIcon } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext, ServerContext } from "../../App";
import { QUERIES } from "../../graphql";
import { AddTrackButton, AddTrackOptions } from "./TranscriptionOptions";
import TranscriptView from "./TranscriptView";
import VideoInput from "./VideoInput";
import AddTrackDialog from "./AddTrackDialog";

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

const englishVtt = `WEBVTT

2
00:00:00.000 --> 00:00:08.000
Now Israeli authorities are investigating a suspected intelligence leak that may have harmed efforts to reach a ceasefire in Gaza and the release of

3
00:00:08.160 --> 00:00:14.000
Captives the case involves an aid of Prime Minister Benjamin Netanyahu's who's since been arrested

4
00:00:14.600 --> 00:00:22.840
Investigators are examining four issues including the leaking of top secret documents and the use of those documents to influence public opinion on a captive

5
00:00:22.840 --> 00:00:28.799
Deal critics say the leak was aimed at giving Netanyahu political cover and fuel public support

6
00:00:28.920 --> 00:00:34.119
Particularly as ceasefire talks dragged on the case has outraged the families of captives

7
00:00:34.119 --> 00:00:37.840
Who for months now have demanded a deal to bring them home?

8
00:00:39.680 --> 00:00:41.160
Let's bring in Menashem Klein

9
00:00:41.160 --> 00:00:46.360
He's a professor of political science at Bar-Ilan University and joins us now live from West Jerusalem

10
00:00:46.360 --> 00:00:51.959
Good to have you especially on this story to get the Israeli perspective on how this is being perceived

11
00:00:51.959 --> 00:00:58.759
First of all, do people believe that the information that was leaked by Netanyahu's office was actually false?

12
00:00:59.799 --> 00:01:04.720
It is in my view as far as I read the Israeli public

13
00:01:04.720 --> 00:01:12.639
So the general public cannot get a clear understanding on this affair

14
00:01:12.639 --> 00:01:24.239
It's mainly a branch of a problem within the relations between the security establishment and the media

15
00:01:24.239 --> 00:01:32.959
The general public has a problem to see what's going on there

16
00:01:32.959 --> 00:01:42.959
Who is in charge of leaking top secrets? What wrong was done by Netanyahu's assistants and so on?

17
00:01:42.959 --> 00:01:53.959
It seems that it is an affair in the relations between the security establishment and the Prime Minister's office

18
00:01:54.279 --> 00:02:01.480
The relations between the two institutions is very bad from day one of this war

19
00:02:01.480 --> 00:02:09.880
Netanyahu tries to blame the security and clean himself from any responsibility of October 7

20
00:02:10.679 --> 00:02:15.240
The other way around is the security establishment approach

21
00:02:15.240 --> 00:02:21.880
They say, okay, we are responsible, but you too, you are the number one responsible

22
00:02:22.520 --> 00:02:32.600
So it is here once again, another round of blame exchange between the Prime Minister and the security establishment

23
00:02:32.600 --> 00:02:35.320
So still the leak, yeah, sorry

24
00:02:35.320 --> 00:02:41.720
Just to jump in there, has Netanyahu gained anything from this leak? Is he hoping to gain anything?

25
00:02:44.440 --> 00:02:51.160
First of all, his strategy is to distance himself from this affair

26
00:02:51.240 --> 00:02:55.399
No, it is not exactly my assistant

27
00:02:55.399 --> 00:03:01.080
He was occupied in my office, but not in the inner circle

28
00:03:03.000 --> 00:03:07.160
He was under the chief of staff, but not under me

29
00:03:07.160 --> 00:03:14.360
And so when he tries to distance himself from what happened, this is his strategy

30
00:03:14.360 --> 00:03:22.759
And then secondary, he says, no, it is not a top secret, it's not a big deal

31
00:03:23.639 --> 00:03:27.639
So he tries to control the damage

32
00:03:28.679 --> 00:03:38.279
And then I assume that later on he will come up with his version, full version, and apply to his supporters

33
00:03:38.279 --> 00:03:46.520
For the general Israeli public, a person in Israel that is not fully aware

34
00:03:46.520 --> 00:03:53.720
How the intelligence information is transferred to the Prime Minister's office

35
00:03:53.720 --> 00:04:01.720
And the relations between the Prime Minister's office and what was done by the Prime Minister's office

36
00:04:02.199 --> 00:04:12.679
And with this information and how it was published abroad, it is something very strange, they cannot get it

37
00:04:13.320 --> 00:04:18.440
Netanyahu is on trial already for a number of cases, two of them for corruption

38
00:04:18.440 --> 00:04:23.880
That allege that he gave favours to media moguls in return for favourable coverage

39
00:04:23.880 --> 00:04:27.720
I mean, this is a man who is an extraordinarily canny political survivor

40
00:04:28.679 --> 00:04:34.679
Definitely, he is a survivor and a very good campaigner

41
00:04:34.679 --> 00:04:38.679
He is a very bad decision maker, he is a very bad Prime Minister

42
00:04:38.679 --> 00:04:43.880
But he is a campaigner and survivor, political campaigner, political survivor

43
00:04:43.880 --> 00:04:49.640
And he does many tricks in order to stay in power

44
00:04:50.600 --> 00:04:58.600
And his main mean through which he shapes public opinion is the media

45
00:04:58.600 --> 00:05:02.600
He was brought up, politically brought up, in the United States

46
00:05:02.600 --> 00:05:06.600
And he is a Trump-style leader

47
00:05:06.600 --> 00:05:10.600
The media is his main forum to shape the public opinion

48
00:05:10.600 --> 00:05:12.600
Menachem Klein, great to speak to you

49
00:05:12.600 --> 00:05:16.600
Thanks very much for taking the time to join us there from West Jerusalem

50
00:05:16.600 --> 00:05:18.600
Thank you`;

const arabicVtt = `WEBVTT

2
00:00:00.000 --> 00:00:08.000
تحقق السلطات الإسرائيلية الآن في تسريب استخباراتي مشتبه به قد يكون قد اضر بجهود التوصل إلى وقف لإطلاق النار في غزة وإطلاق سراح

3
00:00:08.160 --> 00:00:14.000
الأسرى. القضية تتعلق بمساعد لرئيس الوزراء بنيامين نتنياهو الذي تم اعتقاله منذ ذلك الحين

4
00:00:14.600 --> 00:00:22.840
يحقق المحققون في أربعة قضايا بما في ذلك تسريب وثائق سرية للغاية واستخدام تلك الوثائق للتأثير على الرأي العام بشأن صفقة الأسرى

5
00:00:22.840 --> 00:00:28.799
يقول النقاد إن التسريب كان يهدف إلى منح نتنياهو تغطية سياسية وتأجيج الدعم العام

6
00:00:28.920 --> 00:00:34.119
خاصة مع استمرار محادثات وقف إطلاق النار. أثارت القضية غضب عائلات الأسرى

7
00:00:34.119 --> 00:00:37.840
التي تطالب منذ شهور بصفقة لإعادتهم إلى الوطن

8
00:00:39.680 --> 00:00:41.160
لنستمع إلى مناحم كلين

9
00:00:41.160 --> 00:00:46.360
إنه أستاذ العلوم السياسية في جمعة بار-إيلان وينضم إلينا الآن مباشرة من القدس الغربية

10
00:00:46.360 --> 00:00:51.959
من الجيد أن يكون معنا خصوًا في هذه القصة للحصول على وجهة النظر الإسرائيلية حول كيفية استيعاب هذا الأمر

11
00:00:51.959 --> 00:00:58.759
أولاً، هل يعتقد اناس أن المعلومات التي تسربت من مكتب نتنياهو كانت بالفعل خاطئة؟

12
00:00:59.799 --> 00:01:04.720
برأيي، كما أقرأ الجمهور الإسرائيلي

13
00:01:04.720 --> 00:01:12.639
لا يمكن للجمهور العام أن يفهم بوضوح هذه القضية

14
00:01:12.639 --> 00:01:24.239
إنها في الأساس جزء من مشكلة في العلاقة بين المؤسسة الأمنية والإعلام

15
00:01:24.239 --> 00:01:32.959
يصعب على الجمهور العام رؤية ما يجري هناك

16
00:01:32.959 --> 00:01:42.959
من المسؤول عن تسريب الأسرار العليا؟ ما الخطأ الذي ارتكبه مساعدو نتنياهو؟

17
00:01:42.959 --> 00:01:53.959
يبدو أنها قضية في العلاقة بين المؤسسة الأمنية ومكتب رئيس الوزراء

18
00:01:54.279 --> 00:02:01.480
العلاقة بين المؤسستين سيئة للغاية منذ اليوم الأول لهذه الحرب

19
00:02:01.480 --> 00:02:09.880
يحاول نتنياهو إلقاء اللوم على الأمن وإبعاد نفسه عن أي مسؤولية في 7 أكتوبر

20
00:02:10.679 --> 00:02:15.240
العكس هو نهج المؤسسة الأمنية

21
00:02:15.240 --> 00:02:21.880
يقولون، حسنًا، نحن مسؤولون، لكنك أيضًا، أنت المسؤول الأول

22
00:02:22.520 --> 00:02:32.600
لذا هنا جولة أخرى من تبادل الاتهامات بين رئيس الوزراء والمؤسسة الأمنية

23
00:02:32.600 --> 00:02:35.320
لذا لا يزال التسريب، نعم، آسف

24
00:02:35.320 --> 00:02:41.720
مجرد التدخل، هل استفاد نتنياهو من هذا التسريب؟ هل يأمل في الاستفادة منه؟

25
00:02:44.440 --> 00:02:51.160
أولاً، استراتيجيته هي النأي بنفسه عن هذه القضية

26
00:02:51.240 --> 00:02:55.399
لا، إنه ليس بالضبط مساعدي

27
00:02:55.399 --> 00:03:01.080
كان يعمل في مكتبي، ولكنه ليس في الدائرة الداخلية

28
00:03:03.000 --> 00:03:07.160
كان تحت رئيس الأركان، ولكن ليس تحت إدارتي

29
00:03:07.160 --> 00:03:14.360
ولذا عندما يحاول النأي بنفسه عما حدث، هذه هي استراتيجيته

30
00:03:14.360 --> 00:03:22.759
ثم في المقام الثاني، يقول، لا، هذا ليس سرًا كبيرًا، ليس قضية كبيرة

31
00:03:23.639 --> 00:03:27.639
لذا يحاول السيطرة على الأضرار

32
00:03:28.679 --> 00:03:38.279
ثم أفترض أنه لاحقًا سوف يأتي بإصداره الكامل ويعرضه على مؤيديه

33
00:03:38.279 --> 00:03:46.520
بالنسبة للجمهور الإسرائيلي العام، الشخص في إسرائيل الذي ليس على دراية تامة

34
00:03:46.520 --> 00:03:53.720
كيف يتم نقل المعلومات الاستخباراتية إلى مكتب رئيس الوزراء

35
00:03:53.720 --> 00:04:01.720
والعلاقة بين مكتب رئيس الوزراء وما تم من قبل مكتب رئيس الوزراء

36
00:04:02.199 --> 00:04:12.679
ومع هذه المعلومات وكيف تم نشرها في الخارج، هو شيء غريب للغاية، لا يستطيعون فهمه

37
00:04:13.320 --> 00:04:18.440
نتنياهو يحاكم بالفعل في عدد من القضايا، اثنتان منها تتعلق بالفساد

38
00:04:18.440 --> 00:04:23.880
تتهمه بأنه قدم خدمات لرجال الإعلام مقابل تغطية إعلامية إيجابية

39
00:04:23.880 --> 00:04:27.720
هذا رجل سياسي بارع للغاية ويُعتبر نجا في البقاء السياسي

40
00:04:28.679 --> 00:04:34.679
بالتأكيد، هو ناجٍ وحملة دعائية ماهرة

41
00:04:34.679 --> 00:04:38.679
هو صانع قرارات سيء جداً، رئيس وزراء سيء جداً

42
00:04:38.679 --> 00:04:43.880
لكنه حملة دعائية وناجٍ سياسي ماهر

43
00:04:43.880 --> 00:04:49.640
ويقوم بالعديد من الحيل للبقاء في السلطة

44
00:04:50.600 --> 00:04:58.600
ووسيلته الرئيسية التي من خلالها يشكل الرأي العام هي وسائل الإعلام

45
00:04:58.600 --> 00:05:02.600
تم تربيته سياسيًا في الولايات المتحدة

46
00:05:02.600 --> 00:05:06.600
وهو قائد على نمط ترامب

47
00:05:06.600 --> 00:05:10.600
الإعلام هي ساحته الرئيسية لتشكيل الرأي العام

48
00:05:10.600 --> 00:05:12.600
مناحم كلين، سعداء بالحديث معك

49
00:05:12.600 --> 00:05:16.600
شكرًا جزيلاً لك على الانضمام إلينا من القدس الغربية

50
00:05:16.600 --> 00:05:18.600
شكراً`;

function convertSrtToVtt(data) {
    // remove dos newlines
    var srt = data.replace(/\r+/g, "");
    // trim white space start and end
    srt = srt.replace(/^\s+|\s+$/g, "");
    // get cues
    var cuelist = srt.split("\n\n");
    var result = "";
    if (cuelist.length > 0) {
        result += "WEBVTT\n\n";
        for (var i = 0; i < cuelist.length; i = i + 1) {
            result += convertSrtCue(cuelist[i]);
        }
    }
    return result;
}
function convertSrtCue(caption) {
    // remove all html tags for security reasons
    //srt = srt.replace(/<[a-zA-Z\/][^>]*>/g, '');
    var cue = "";
    var s = caption.split(/\n/);
    // concatenate muilt-line string separated in array into one
    while (s.length > 3) {
        for (var i = 3; i < s.length; i++) {
            s[2] += "\n" + s[i];
        }
        s.splice(3, s.length - 3);
    }
    var line = 0;
    // detect identifier
    if (!s[0].match(/\d+:\d+:\d+/) && s[1].match(/\d+:\d+:\d+/)) {
        cue += s[0].match(/\w+/) + "\n";
        line += 1;
    }
    // get time strings
    if (s[line].match(/\d+:\d+:\d+/)) {
        // convert time string
        var m = s[1].match(
            /(\d+):(\d+):(\d+)(?:,(\d+))?\s*--?>\s*(\d+):(\d+):(\d+)(?:,(\d+))?/,
        );
        if (m) {
            cue +=
                m[1] +
                ":" +
                m[2] +
                ":" +
                m[3] +
                "." +
                m[4] +
                " --> " +
                m[5] +
                ":" +
                m[6] +
                ":" +
                m[7] +
                "." +
                m[8] +
                "\n";
            line += 1;
        } else {
            // Unrecognized timestring
            return "";
        }
    } else {
        // file format error or comment lines
        return "";
    }
    // get cue text
    if (s[line]) {
        cue += s[line] + "\n\n";
    }
    return cue;
}

const isAudioFile = (url) => {
    if (!url) return false;
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    return audioExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

function VideoPage({ onSelect }) {
    const [transcripts, setTranscripts] = useState([]);
    const [activeTranscript, setActiveTranscript] = useState(0);
    const [asyncComplete, setAsyncComplete] = useState(false);
    const [url, setUrl] = useState("");
    const [videoInformation, setVideoInformation] =
        useState();
    //     {
    //     // videoUrl: "http://ajmn-aje-vod.akamaized.net/media/v1/pmp4/static/clear/665003303001/b29925c2-d081-4f0f-bdbe-397a95a21029/e7f289f0-feda-42c2-89aa-72bb94eb96c6/main.mp4",
    //     // transcriptionUrl: "http://ajmn-aje-vod.akamaized.net/media/v1/pmp4/static/clear/665003303001/b29925c2-d081-4f0f-bdbe-397a95a21029/cce69697-17ba-48f4-9fdd-a8692f8ab971/main.mp4",
    // }
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [error, setError] = useState(null);
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const { serverUrl } = useContext(ServerContext);
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const prevUserStateRef = useRef();
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [errorParagraph, setErrorParagraph] = useState(null);
    const [requestId, setRequestId] = useState(null);
    const videoRef = useRef(null);
    const [currentTime, setCurrentTime] = useState(0);

    const [selectedTab, setSelectedTab] = useState("transcribe");
    const [dialogOpen, setDialogOpen] = useState(false);

    const [showVideoInput, setShowVideoInput] = useState(false);

    const [isAudioOnly, setIsAudioOnly] = useState(false);

    const clearVideoInformation = () => {
        setVideoInformation("");
        setUrl("");
        setIsVideoLoaded(false);
        setTranscripts([]);
    };

    useEffect(() => {
        if (userState?.transcribe !== prevUserStateRef.current?.transcribe) {
            if (userState?.transcribe?.url) {
                setUrl(userState.transcribe.url);
            }
            prevUserStateRef.current = userState;
        }
    }, [userState]);

    const fetchParagraph = useCallback(
        async (text) => {
            try {
                setLoadingParagraph(true);
                const { data } = await apolloClient.query({
                    query: QUERIES.FORMAT_PARAGRAPH_TURBO,
                    variables: { text, async },
                    fetchPolicy: "network-only",
                });
                if (data?.format_paragraph_turbo?.result) {
                    const dataResult = data.format_paragraph_turbo.result;
                    if (async) {
                        setTranscripts([]);
                        setRequestId(dataResult);
                        setAsyncComplete(false);
                    } else {
                        setFinalData(dataResult);
                    }
                }
            } catch (e) {
                setErrorParagraph(e);
                console.error(e);
            } finally {
                setLoadingParagraph(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const setFinalData = (finalData) => {
        setTranscripts((prev) => [
            ...prev,
            {
                text: finalData,
                format: "vtt",
                name: `Transcript ${prev.length + 1}`,
            },
        ]);
        setRequestId(null);
        if (finalData.trim() && currentOperation === "Transcribing") {
            if (textFormatted) {
                setCurrentOperation(t("Formatting"));
                fetchParagraph(finalData);
                return;
            }
        }
        setAsyncComplete(true);
    };

    useEffect(() => {
        asyncComplete &&
            onSelect &&
            onSelect(transcripts[activeTranscript]?.text);
    }, [transcripts, asyncComplete, onSelect, activeTranscript]);

    const handleVideoReady = () => {
        setIsVideoLoaded(true);
        if (videoRef.current && videoRef.current.videoHeight === 0) {
            setIsAudioOnly(true);
        } else {
            setIsAudioOnly(false);
        }
    };

    const handleSeek = useCallback((time) => {
        console.log("handleSeek", time);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    }, []);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, []);

    if (!videoInformation && !transcripts?.length) {
        return (
            <>
                <h1 className="text-2xl font-bold">
                    Transcription and translation
                </h1>
                <p className="text-sm text-gray-500">
                    Transcribe and translate video and audio files.
                </p>
                <h3>How would you like to start?</h3>
                <div className="flex gap-4 mt-4">
                    <button
                        onClick={() => setShowVideoInput(true)}
                        className="lb-outline-secondary rounded-lg flex justify-center p-6"
                    >
                        <div className="text-center flex flex-col gap-2">
                            <div className="flex justify-center">
                                <VideoIcon className="w-12 h-12" />
                            </div>
                            I have a video or audio file
                        </div>
                    </button>
                    <button
                        onClick={() => {
                            setDialogOpen(true);
                            setSelectedTab("transcribe");
                        }}
                        className="lb-outline-secondary rounded-lg flex justify-center p-6"
                    >
                        <div className="text-center flex flex-col gap-2">
                            <div className="flex justify-center">
                                <TextIcon className="w-12 h-12" />
                            </div>
                            I have a transcript or subtitles
                        </div>
                    </button>
                </div>
                <AddTrackDialog
                    dialogOpen={dialogOpen}
                    setDialogOpen={setDialogOpen}
                    url={url}
                    transcripts={transcripts}
                    onAdd={(x) => {
                        if (x) {
                            setTranscripts((prev) => [...prev, x]);
                        }

                        console.log("onAdd", x);
                        setDialogOpen(false);
                    }}
                    options={["upload", "clipboard"]}
                    async={true}
                    apolloClient={apolloClient}
                    activeTranscript={activeTranscript}
                />
                <Dialog open={showVideoInput} onOpenChange={setShowVideoInput}>
                    <DialogContent className="min-w-[80%] max-h-[80%] overflow-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {t("Enter video or audio")}
                            </DialogTitle>
                            <DialogDescription>
                                You can either enter a URL or upload a video or
                                audio file.
                            </DialogDescription>
                        </DialogHeader>
                        <VideoInput
                            url={url}
                            setUrl={setUrl}
                            debouncedUpdateUserState={debouncedUpdateUserState}
                            setVideoInformation={(videoInfo) => {
                                setVideoInformation(videoInfo);
                                setShowVideoInput(false);
                            }}
                            onCancel={() => setShowVideoInput(false)}
                        />
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    let vttUrl = null;
    if (transcripts[activeTranscript]?.format === "vtt") {
        const file = new Blob([transcripts[activeTranscript].text], {
            type: "text/plain",
        });
        vttUrl = URL.createObjectURL(file);
    } else if (transcripts[activeTranscript]?.format === "srt") {
        const vttSubtitles = convertSrtToVtt(
            transcripts[activeTranscript].text,
        );
        const file = new Blob([vttSubtitles], { type: "text/plain" });
        vttUrl = URL.createObjectURL(file);
    }

    return (
        <div className="p-2">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">
                    Video transcription and translation
                </h1>
                <button
                    onClick={() => {
                        if (
                            window.confirm(
                                "Are you sure you want to start over?",
                            )
                        ) {
                            clearVideoInformation();
                        }
                    }}
                    className="lb-outline-secondary lb-sm flex items-center gap-2"
                    aria-label="Clear video"
                >
                    <RefreshCwIcon className="w-4 h-4" />
                    Start over
                </button>
            </div>
            <div className="flex gap-4 mb-4">
                <div className="basis-[calc(100%-12rem)]">
                    <div className={`video-player-container overflow-hidden mb-4 ${isAudioOnly ? 'h-[50px] w-96' : ''}`}>
                        {isValidUrl(videoInformation?.videoUrl) ? (
                            <video
                                className={`rounded-lg ${isAudioOnly ? 'h-[50px] w-96' : 'max-h-[40vh] min-h-[200px]'}`}
                                ref={videoRef}
                                src={videoInformation.videoUrl}
                                controls
                                onLoadedData={handleVideoReady}
                                onTimeUpdate={handleTimeUpdate}
                                controlsList="nodownload"
                            >
                                {vttUrl && (
                                    <track
                                        kind="subtitles"
                                        src={vttUrl}
                                        srcLang="en"
                                        label="English"
                                        default
                                    />
                                )}
                            </video>
                        ) : (
                            <div>
                                <button
                                    onClick={() => setShowVideoInput(true)}
                                    className="lb-outline-secondary flex items-center gap-1 lb-sm"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    {t("Add video")}
                                </button>
                                {showVideoInput && (
                                    <Dialog
                                        open={showVideoInput}
                                        onOpenChange={setShowVideoInput}
                                    >
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {t("Add video")}
                                                </DialogTitle>
                                            </DialogHeader>
                                            <VideoInput
                                                url={url}
                                                setUrl={setUrl}
                                                debouncedUpdateUserState={
                                                    debouncedUpdateUserState
                                                }
                                                setVideoInformation={(
                                                    videoInfo,
                                                ) => {
                                                    setVideoInformation(
                                                        videoInfo,
                                                    );
                                                    setShowVideoInput(false);
                                                }}
                                                onCancel={() =>
                                                    setShowVideoInput(false)
                                                }
                                            />
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>
                        )}
                    </div>
                    <h3 className="mb-2">{t("Subtitles and transcripts")}</h3>
                    <div className="flex gap-2">
                        {transcripts.length > 0 && (
                            <div className="flex gap-2 items-center">
                                {transcripts.length <= 3 ? (
                                    // Show buttons for 3 or fewer transcripts
                                    transcripts.map((transcript, index) => (
                                        <button
                                            key={index}
                                            className={`lb-outline-secondary lb-sm ${activeTranscript === index ? "bg-gray-100" : ""}`}
                                            onClick={() =>
                                                setActiveTranscript(index)
                                            }
                                        >
                                            {transcript.name ||
                                                `Transcript ${index + 1}`}
                                        </button>
                                    ))
                                ) : (
                                    // Use Select component for more than 3 transcripts
                                    <Select
                                        value={activeTranscript.toString()}
                                        onValueChange={(value) =>
                                            setActiveTranscript(parseInt(value))
                                        }
                                    >
                                        <SelectTrigger className="w-[180px] py-1 text-sm">
                                            <SelectValue
                                                placeholder="Select transcript"
                                                className="text-sm py-0"
                                            >
                                                {transcripts[activeTranscript]
                                                    ?.name ||
                                                    `Transcript ${activeTranscript + 1}`}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {transcripts.map(
                                                (transcript, index) => (
                                                    <SelectItem
                                                        key={index}
                                                        value={index.toString()}
                                                    >
                                                        {transcript.name ||
                                                            `Transcript ${index + 1}`}
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        )}
                        <AddTrackButton
                            transcripts={transcripts}
                            url={
                                videoInformation?.transcriptionUrl ||
                                videoInformation?.videoUrl
                            }
                            onAdd={(transcript) => {
                                if (transcript) {
                                    const { text, format, name } = transcript;

                                    setTranscripts((prev) => [
                                        ...prev,
                                        { text, format, name },
                                    ]);
                                    setActiveTranscript(transcripts.length);
                                }
                                setDialogOpen(false);
                            }}
                            activeTranscript={activeTranscript}
                            trigger={
                                <button className="flex gap-1 items-center lb-outline-secondary lb-sm">
                                    <PlusIcon className="h-4 w-4" />{" "}
                                    {transcripts.length > 0
                                        ? t("")
                                        : t("Add subtitles or transcript")}
                                </button>
                            }
                            apolloClient={apolloClient}
                            dialogOpen={dialogOpen}
                            setDialogOpen={setDialogOpen}
                            selectedTab={selectedTab}
                            setSelectedTab={setSelectedTab}
                        />
                    </div>
                </div>
            </div>

            {(error || errorParagraph || fileUploadError) && (
                <div className="mb-4">
                    <p>
                        Error:{" "}
                        {(error || errorParagraph || fileUploadError).message}
                    </p>
                </div>
            )}

            {activeTranscript !== null &&
                transcripts[activeTranscript]?.text && (
                    <TranscriptView
                        name={transcripts[activeTranscript].name}
                        onNameChange={(name) => {
                            setTranscripts((prev) =>
                                prev.map((transcript, index) =>
                                    index === activeTranscript
                                        ? { ...transcript, name }
                                        : transcript,
                                ),
                            );
                        }}
                        url={
                            videoInformation?.transcriptionUrl ||
                            videoInformation?.videoUrl
                        }
                        text={transcripts[activeTranscript].text}
                        format={transcripts[activeTranscript].format}
                        onSeek={handleSeek}
                        currentTime={currentTime}
                        onTranslate={() => {
                            setDialogOpen(true);
                            setSelectedTab("translate");
                        }}
                        onDeleteTrack={() => {
                            setTranscripts((prev) =>
                                prev.filter(
                                    (_, index) => index !== activeTranscript,
                                ),
                            );
                            setActiveTranscript(0);
                        }}
                    />
                )}
        </div>
    );
}

export default VideoPage;
