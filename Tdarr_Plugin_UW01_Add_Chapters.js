/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_UW01_Add_Chapters',
    Stage: 'Pre-processing',
    Name: 'WITCH - Add Chapters',
    Type: 'Video',
    Operation: 'Transcode',
    Author: "UnknownWitcher",
    Description: `Warning: tdarr does not detect chapters, this plugin includes it's own filter to break potential loops, because of this
                the plugin needs to be first on your stack.`,
    Version: '1.20',
    Tags: 'pre-processing,ffmpeg,video only,configurable',
    Inputs: [{
        name: 'chapter_duration',
        type: 'string',
        defaultValue: '60', 
        inputUI: {
            type: 'text',
        },
        tooltip:  `Enter in seconds the maximum langth your chapters should be. The plugin will do it's best to get as close to that duration 
                \\nas possible.

                \\n\\nFor Example; if you wanted 2 minutes (120s) and the files duration was 2532.80s,
                \\nthen your chapters would be 115.127s long with the last chapter being 115.133s
                
                \\n\\nIf your files duration was 1469.6640s,
                \\nthen your chapters would be 113.051s, with the last chapter being 113.052s

                \\n\\nIf your files duration was 7451.6160s,
                \\nthen your chapters would be 118.280s, with the last chapter being 118.256s

                \\n\\nIf your files duration was 7451.6160s,
                \\nthen your chapters would be 118.280s, with the last chapter being 119.498s
                
                \\n\\nThe minimum duration is 60, the maximum duration is 1/3 of the files duration, meaning a 3 chapter minimum per file.`,
    }],
});
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
    const fs = require('fs'); const os = require('os');
    // eslint-disable-next-line no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);
    const response = {
        processFile: false,
        preset: "",
        handBrakeMode: false,
        container: `.${file.container}`,
        FFmpegMode: true,
        reQueueAfter: true,
        infoLog: ""
    };

    if (file.file !== otherArguments.originalLibraryFile.file) {
        response.processFile = false;
        response.infoLog += '☒File has been processed, skipping this plugin. \n';
        return response;
    }

    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== "video") {
        response.infoLog += "☒File is not a video. \n";
        return response;
    }

    let { chapter_duration } = inputs;
    const { originalLibraryFile } = otherArguments;

    // Let's grab our video stream
    let video = file.ffProbeData.streams.filter(
        (row) => row.codec_type === "video"
    );

    let timeBase = video[0].time_base || file.ffProbeData.format.time_base;
    let duration = video[0].duration || file.ffProbeData.format.duration;

    // Windows newline is different than other systems.
    let nL = os.platform() === "win32" ? "\r\n" : "\n";

    // This is a function that will act like a template when creating our chapters
    const createChapter = (start, end, title) => {
        let template = `[CHAPTER]${nL}`;
        template += `TIMEBASE=${timeBase}${nL}`;
        template += `START=${start}${nL}`;
        template += `END=${end}${nL}`;
        template += `title=${title}`;
        return template;
    };

    // Make sure our input is an integer
    chapter_duration = parseInt(chapter_duration, 10);
    // And that it is at least 60 seconds.
    chapter_duration = chapter_duration < 60 ? 60 : chapter_duration;

    // Max time in seconds = 3 chapters minimum
    let maxDuration = duration / 3;

    if (chapter_duration > maxDuration) {
        response.infoLog += `Chapters can not be longer than ${maxDuration.toFixed(4)} seconds for this file. \n`;
        return response;
    }

    let originFile = originalLibraryFile.file;

    if (librarySettings.output !== "") {
        originFile = originFile.replace(librarySettings.folder,librarySettings.output);
        let fileDir = originFile.substr(0, originFile.lastIndexOf("/")) || "";
        if (fileDir !== "" && !fs.existsSync(fileDir)) {
            try {
                fs.mkdirSync(fileDir, { recursive: true });
            } catch (err) {
                response.infoLog += `☒Error occured while attempting to create path ${fileDir}. \n`;
                response.infoLog += err + " \n";
                return response;
            }
        }
    }
    let chapterFile = `${originFile.substr(0, originFile.lastIndexOf(".")) || originFile}.chapters`;
    
    // Skip if file already exists
    if (fs.existsSync(chapterFile)) {
        response.infoLog += `☒"${chapterFile}" Exists... SKIPPING. \n`;
        return response;
    }
    
    // Convert seconds to milliseconds
    chapter_duration = chapter_duration * 1000;
    duration = duration * 1000;

    // This will never be perfect, so we get the markers as close to
    // our duration as possible
    let totalMarkers = Math.ceil(duration / chapter_duration);
    // We then divide our total markers by the files duration
    // to get our new chapter duration.
    chapter_duration = parseInt((duration / totalMarkers).toFixed(0), 10);

    // Loop and store chapter data into a variable
    let start_time = 0;
    let end_time = 0;
    let storeChapters = `;FFMETADATA1${nL}`;
    for (let i = 1; i <= totalMarkers; i++) {
        let title = `Chapter ${i}`;
        start_time = i === 1 ? 0 : end_time;
        end_time = i === 1 ? chapter_duration : end_time + chapter_duration;
        if (i < totalMarkers) {
            storeChapters += `${createChapter(start_time, end_time, title)}${nL}`;
        } else {
            storeChapters += createChapter(start_time, duration, title);
        }
    }
    // Write chapter data to "filename.chapters"
    try {
        fs.writeFileSync(chapterFile, storeChapters, "utf-8");
    } catch (err) {
        response.infoLog += "☒Error occured while attempting to save chapters. \n";
        response.infoLog += err;
        return response;
    }
    // Make sure that file exists before we run our ffmpeg command
    if (!fs.existsSync(chapterFile)) {
        response.infoLog += `☒Missing chapters "${chapterFile}". \n`;
        return response;
    }

    response.preset = `, -i "${chapterFile}" -map_chapters 1 -c copy -max_muxing_queue_size 9999`;
    response.processFile = true;
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
