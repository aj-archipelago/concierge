export function convertSrtToVtt(data) {
    if (!data || !data.trim()) {
        return "WEBVTT\n\n";
    }
    // remove dos newlines
    var srt = data.replace(/\r+/g, "");
    // trim white space start and end
    srt = srt.replace(/^\s+|\s+$/g, "");

    // Convert all timestamps from comma to dot format
    srt = srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");

    // Add blank lines before sequence numbers that are followed by timecodes
    srt = srt.replace(/(\n)(\d+)\n(\d{2}:\d{2}:\d{2}[,.])/g, "$1\n$2\n$3");

    // get cues
    var cuelist = srt.split("\n\n");
    var result = "";
    if (cuelist.length > 0) {
        result += "WEBVTT\n\n";
        for (var i = 0; i < cuelist.length; i = i + 1) {
            const cue = convertSrtCue(cuelist[i]);
            // Only add non-empty cues
            if (cue) {
                result += cue;
            }
        }
    }
    return result;
}

function convertSrtCue(caption) {
    if (!caption || !caption.trim()) {
        return "";
    }
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
    if (
        s[0] &&
        s[1] &&
        !s[0].match(/\d+:\d+:\d+/) &&
        s[1].match(/\d+:\d+:\d+/)
    ) {
        const match = s[0].match(/^\d+$/); // Only match if the entire line is a number
        if (match) {
            cue += match[0] + "\n";
            line += 1;
        }
    }
    // get time strings
    if (s[line] && s[line].match(/\d+:\d+:\d+/)) {
        // convert time string
        var m = s[1].match(
            /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*--?>\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
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

export function detectSubtitleFormat(text) {
    // Remove DOS newlines and trim whitespace
    const cleanText = text.replace(/\r+/g, "").trim();
    const lines = cleanText.split("\n");

    // Check if it's VTT format
    if (lines[0]?.trim() === "WEBVTT") {
        return "vtt";
    }

    // Check if it's SRT format
    // SRT files have a specific pattern:
    // 1. Numeric index
    // 2. Timestamp in format: 00:00:00,000 --> 00:00:00,000
    // 3. Subtitle text
    // 4. Blank line
    const timeRegex =
        /(\d{2}:\d{2}:\d{2})[,.](\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2})[,.](\d{3})/;

    let hasValidStructure = false;
    let index = 1;

    // Check first few entries to confirm SRT structure
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
        const line = lines[i]?.trim();
        if (!line) continue;

        // Check if line is a number matching our expected index
        if (line === index.toString()) {
            // Look ahead for timestamp
            const nextLine = lines[i + 1]?.trim();
            if (nextLine && timeRegex.test(nextLine)) {
                hasValidStructure = true;
                index++;
                i++; // Skip timestamp line since we've verified it
            }
        }
    }

    if (hasValidStructure) {
        return "srt";
    }

    return null;
}
