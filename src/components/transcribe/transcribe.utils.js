export function convertSrtToVtt(data) {
    if (!data || !data.trim()) {
        return "WEBVTT\n\n";
    }

    // If it's already VTT format and has header
    if (data.trim().startsWith("WEBVTT")) {
        const lines = data.split("\n");
        const result = ["WEBVTT", ""]; // Start with header and blank line
        let currentCue = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines and the WEBVTT header
            if (!line || line === "WEBVTT") {
                continue;
            }

            // If it's a number by itself, it's a cue identifier
            if (/^\d+$/.test(line)) {
                // If we have a previous cue, add it with proper spacing
                if (currentCue.length > 0) {
                    result.push(currentCue.join("\n"));
                    result.push(""); // Add blank line between cues
                    currentCue = [];
                }
                currentCue.push(line);
                continue;
            }

            // Check for and convert timestamps
            const shortTimeRegex = /^(\d{2}):(\d{2})[.](\d{3})\s*-->\s*(\d{2}):(\d{2})[.](\d{3})$/;
            const ultraShortTimeRegex = /^(\d{2})[.](\d{3})\s*-->\s*(\d{2})[.](\d{3})$/;
            const timeMatch = line.match(shortTimeRegex);
            const ultraShortMatch = line.match(ultraShortTimeRegex);
            
            if (timeMatch) {
                // Convert MM:SS to HH:MM:SS
                const convertedTime = `00:${timeMatch[1]}:${timeMatch[2]}.${timeMatch[3]} --> 00:${timeMatch[4]}:${timeMatch[5]}.${timeMatch[6]}`;
                currentCue.push(convertedTime);
                continue;
            } else if (ultraShortMatch) {
                // Convert SS to HH:MM:SS
                const convertedTime = `00:00:${ultraShortMatch[1]}.${ultraShortMatch[2]} --> 00:00:${ultraShortMatch[3]}.${ultraShortMatch[4]}`;
                currentCue.push(convertedTime);
                continue;
            }

            // Must be subtitle text
            currentCue.push(line);
        }

        // Add the last cue if there is one
        if (currentCue.length > 0) {
            result.push(currentCue.join("\n"));
            result.push(""); // Add final blank line
        }

        // Join with newlines and ensure proper ending
        return result.join("\n") + "\n";
    }

    // remove dos newlines and trim
    var srt = data.replace(/\r+/g, "");
    srt = srt.replace(/^\s+|\s+$/g, "");

    // Convert all timestamps from comma to dot format
    srt = srt.replace(/(\d{2}:\d{2}:\d{2})[,.](\d{3})/g, "$1.$2");

    // Add blank lines before sequence numbers that are followed by timecodes
    srt = srt.replace(/(\n)(\d+)\n(\d{2}:\d{2}:\d{2}[,.])/g, "$1\n$2\n$3");

    // get cues
    var cuelist = srt.split("\n\n");
    var result = "";

    // Always add WEBVTT header
    result += "WEBVTT\n\n";

    if (cuelist.length > 0) {
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

    var cue = "";
    var s = caption.split(/\n/);

    // concatenate multi-line string separated in array into one
    while (s.length > 3) {
        for (var i = 3; i < s.length; i++) {
            s[2] += "\n" + s[i];
        }
        s.splice(3, s.length - 3);
    }

    var line = 0;

    // detect identifier
    if (s[0] && s[1] && !s[0].match(/\d+:\d+:\d+/) && s[1].match(/\d+:\d+:\d+/)) {
        const match = s[0].match(/^\d+$/); // Only match if the entire line is a number
        if (match) {
            cue += match[0] + "\n";
            line += 1;
        }
    }

    // get time strings
    if (s[line] && s[line].match(/\d+:\d+:\d+/)) {
        // convert time string
        var m = s[line].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*--?>\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (m) {
            cue += m[1] + ":" + m[2] + ":" + m[3] + "." + m[4] + " --> " +
                   m[5] + ":" + m[6] + ":" + m[7] + "." + m[8] + "\n";
            line += 1;
        } else {
            // Try alternate timestamp format
            m = s[line].match(/(\d{2}):(\d{2})\.(\d{3})\s*--?>\s*(\d{2}):(\d{2})\.(\d{3})/);
            if (m) {
                // Convert to full timestamp format
                cue += "00:" + m[1] + ":" + m[2] + "." + m[3] + " --> " +
                       "00:" + m[4] + ":" + m[5] + "." + m[6] + "\n";
                line += 1;
            } else {
                // Unrecognized timestring
                return "";
            }
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

    // Check if it's VTT format - be more lenient with the header
    if (lines[0]?.trim() === "WEBVTT") {
        return "vtt";
    }

    // Define regex patterns for timestamp formats
    const srtTimeRegex = /(\d{2}:\d{2}:\d{2})[,.]\d{3}\s*-->\s*(\d{2}:\d{2}:\d{2})[,.]\d{3}/;
    const vttTimeRegex = /(?:\d{2}:)?(\d{1,2})[.]\d{3}\s*-->\s*(?:\d{2}:)?(\d{1,2})[.]\d{3}/;

    let hasSrtTimestamps = false;
    let hasVttTimestamps = false;
    let hasSequentialNumbers = false;
    let lastNumber = 0;

    // Look through first few lines to detect patterns
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
        const line = lines[i]?.trim();
        if (!line) continue;

        // Check for timestamps
        if (srtTimeRegex.test(line)) {
            hasSrtTimestamps = true;
        }
        if (vttTimeRegex.test(line)) {
            hasVttTimestamps = true;
        }

        // Check for sequential numbers
        const numberMatch = line.match(/^(\d+)$/);
        if (numberMatch) {
            const num = parseInt(numberMatch[1]);
            if (lastNumber === 0 || num === lastNumber + 1) {
                hasSequentialNumbers = true;
                lastNumber = num;
            }
        }
    }

    // If it has SRT-style timestamps (HH:MM:SS), it's SRT
    if (hasSrtTimestamps && hasSequentialNumbers) {
        return "srt";
    }

    // If it has VTT-style timestamps (MM:SS) or WEBVTT header, it's VTT
    if (hasVttTimestamps) {
        return "vtt";
    }

    return null;
}

export function normalizeVtt(vttText) {
    if (!vttText || !vttText.trim()) {
        return "WEBVTT\n\n";
    }

    // If it's already VTT format
    const lines = vttText.split("\n");
    const result = ["WEBVTT", ""]; // Start with header and blank line
    let currentCue = [];
    let isHeader = true;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Handle header
        if (isHeader) {
            if (line === "WEBVTT") {
                continue;
            }
            if (!line) {
                isHeader = false;
                continue;
            }
            continue;
        }

        // If it's a number by itself, it's a cue identifier
        if (/^\d+$/.test(line)) {
            if (currentCue.length > 0) {
                result.push(currentCue.join("\n"));
                result.push(""); // Add blank line between cues
                currentCue = [];
            }
            currentCue.push(line);
            continue;
        }

        // Check for and convert timestamps
        const timestampMatch = line.match(/(?:(\d{2}):)?(\d{1,2})[.](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{1,2})[.](\d{3})/);
        if (timestampMatch) {
            const startHours = timestampMatch[1] || "00";
            const startMinutes = timestampMatch[2].padStart(2, "0");
            const startSeconds = "00";
            const startMs = timestampMatch[3];
            const endHours = timestampMatch[4] || "00";
            const endMinutes = timestampMatch[5].padStart(2, "0");
            const endSeconds = "00";
            const endMs = timestampMatch[6];
            
            currentCue.push(`${startHours}:${startMinutes}:${startSeconds}.${startMs} --> ${endHours}:${endMinutes}:${endSeconds}.${endMs}`);
            continue;
        }

        // Must be subtitle text
        if (line) {
            currentCue.push(line);
        }
    }

    // Add the last cue if there is one
    if (currentCue.length > 0) {
        result.push(currentCue.join("\n"));
        result.push(""); // Add final blank line
    }

    // Join with newlines and ensure proper ending
    return result.join("\n") + "\n";
}
