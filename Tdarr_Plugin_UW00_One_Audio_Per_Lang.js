/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: "Tdarr_Plugin_UW00_One_Audio_Per_Lang",
    Stage: "Pre-processing",
    Name: "Witcher-One Audio Stream Per Language",
    Type: "Audio",
    Operation: "Transcode",
    Author: "UnknownWitcher",
    Description: `This plugin remove all audio tracks except the one you'd prefer to keep.`,
    Version: "1.0",
    Tags: "pre-processing,ffmpeg,audio only,configurable",
    Inputs: [{
        name: "codec_priority",
        type: 'string',
        defaultValue: "truehd,eac3,ac3,aac",
        inputUI: {
            type: 'text',
        },
        tooltip: `Place codecs in order of which ones you would prefer to keep.\\n
                If a codec is not added as a value then it will be considered the lowest
                priority.\\n\\n

                \\nExample\\n
                truehd, eac3, ac3, aac

                \\nExample\\n
                truehd, eac3, ac3, aac, flac`,
    },
    {
        name: "channel_priority",
        type: 'string',
        defaultValue: "8,6,2",
        inputUI: {
            type: 'text',
        },
        tooltip: `Place audio channels in order of which one you would prefer to keep.\\n
                Any channels not added will be considered the lowest priority\\n\\n

                \\nExample\\n
                8,6,2

                \\nExample\\n
                8,6,2,1`,
    },
    {
        name: "option_priority",
        defaultValue: "codec",
        inputUI: {
            type: "dropdown",
            options: [
                "codec",
                "channels",
            ]
        },
        tooltip: `Here you can choose which option has more priority. \\n\\n

                By default the plugin will grab the audio based on codec priority, followed by the channel priority.\\n\\n

                So if you had the following, then truehd 5.1 would be the preferred audio track, if you switched the priority\\n
                so that audio was grabed based on channel priority, followed by codec priority, then EAC3 7.1 would be the\\n
                preferred audio track.\\n\\n

                1 - truehd 5.1\\n

                3 - EAC3 7.1\\n

                3 - AAC 5.1\\n

                If two audio tracks had the same codec, but different channels, like shown below, then truehd 7.1 would be preferred
                over truehd 5.1\\n\\n

                1 - truehd 5.1\\n

                2 - eac3 7.1\\n

                3 - truehd 7.1\\n`,
    },
    ],
});

const plugin = (file, librarySettings, inputs, otherArguments) => {
    
    const lib = require("../methods/lib")();
    
    // eslint-disable-next-line no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);
    
    const response = {
        processFile: false,
        container: `.${file.container}`,
        handBrakeMode: false,
        FFmpegMode: true,
        reQueueAfter: false,
        infoLog: ""
    };
    
    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== "video") {
        // eslint-disable-next-line no-console
        response.infoLog += "☒File is not video. \n";
        return response;
    }

    if (file.fileMedium !== "video") {
        response.infoLog += "☒File is not video. \n";
        return response;
    }

    const audioStreams = file.ffProbeData.streams.filter(
        (row) => row.codec_type === "audio"
    );
    
    if(audioStreams.length === 0) {
        response.infoLog += "☒File does not contain audio. \n";
        return response;
    }
    
    if(audioStreams.length === 1) {
        response.infoLog += "☑FFile only has one audio channel. \n";
        return response;
    }

    // Important Variables
    const priority = {
        codec: inputs.codec_priority.split(",").map((el) => el.trim()),
        channels: inputs.channel_priority.split(",").map((el) => el.trim()),
        options: inputs.option_priority
    };

    let convert = false;
    let groupByLang = {};
    let audioIdx = 0;
    let ffmpegInsertCmd = "-map 0:v -c:v copy ";

    // Function to fitler audio based on codec or channel
    const filterAudio = function (audio, priority, type) {
        let results = {};
        type = type ? type : "codec";
        for (let i = 0; i < priority.length; i++) {
            results = audio.filter(function (el) {
            if (type === "codec") {
                return el.codec_name === priority[i];
            }
            if (type === "channels") {
                return parseInt(el.channels, 10) === parseInt(priority[i], 10);
            }
                return el;
            });
            if (results.length > 0) {
                break;
            }
        }
        return results;
    };

    // Group each audio track by language and change audio index to audio position
    for (let i = 0; i < audioStreams.length; i++) {
        let groupKey = "und";
        if (audioStreams[i]?.tags?.language !== undefined) {
            groupKey = audioStreams[i].tags.language;
        }
        groupByLang[groupKey] = groupByLang[groupKey] || [];
        groupByLang[groupKey].push(audioStreams[i]); // Change audio index to the audio's position
        groupByLang[groupKey][groupByLang[groupKey].length - 1].index = i;
    }

    Object.keys(groupByLang).forEach((key) => {
        if (groupByLang[key].length > 1) {
            let results = {};
            // Filter by codec then channel
            if (priority.options === "codec") {
                results = filterAudio(groupByLang[key], priority.codec, "codec");
                if (results.length > 1) {
                    results = filterAudio(results, priority.channels, "channels");
                }
            }
            // Filter by channel then codec
            if (priority.options === "channels") {
                results = filterAudio(groupByLang[key], priority.channels, "channels");
                if (results.length > 1) {
                    results = filterAudio(results, priority.codec, "codec");
                }
            }
            // Prevent duplicate audio
            if (results.length > 0) {
                ffmpegInsertCmd += `-map 0:a:${results[0].index} -c:a:${audioIdx} copy `;
                convert = true;
                audioIdx += 1;
            }
        }
        if (groupByLang[key].length === 1) {
            ffmpegInsertCmd += `-map 0:a:${groupByLang[key][0].index} -c:a:${audioIdx} copy `;
            audioIdx += 1;
        }
    });
    ffmpegInsertCmd+="-map 0:s? -c:s copy -map 0:d? -c:d copy -map 0:t? -c:t copy "
    if (convert === true) {
        response.processFile = true;
        response.preset = `,${ffmpegInsertCmd}-max_muxing_queue_size 9999`;
    }
    else {
        response.processFile = false;
        response.infoLog = "☑File meets plugin requirements. \n";
    }
    return response;
};
module.exports.details = details;
module.exports.plugin = plugin;
