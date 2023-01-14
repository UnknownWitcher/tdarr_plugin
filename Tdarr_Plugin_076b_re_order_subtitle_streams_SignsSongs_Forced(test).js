/* eslint-disable */
const details = () => {
    return {
        id: "Tdarr_Plugin_076b_re_order_subtitle_streams_SignsSongs_Forced(test)",
        Stage: "Pre-processing",
        Name: "Re-order subtitle streams",
        Type: "Subtitle",
        Operation: "Transcode",
        Description: `[Contains built-in filter] Specify a language tag for Tdarr to try and put as 1st subtitle track  \n\n`,
        Version: "1.00",
        Tags: "pre-processing,subtitle only,ffmpeg,configurable",
        Inputs: [{
            name: "preferred_language",
            type: 'string',
            defaultValue: 'eng',
            inputUI: {
                type: 'text',
            },
            tooltip: `Specify one language tag for Tdarr to try and put as 1st subtitle track
            \\nExample:\\n
            eng (default)
            \\nExample:\\n
            fre
            \\nExample:\\n
            ger
            `,
        }, {
            name: 'signssongs',
            type: 'boolean',
            defaultValue: false,
            inputUI: {
                type: 'dropdown',
                options: [
                    'false',
                    'true',
                ],
            },
            tooltip: `Specify if A subtitle track that contain signs and songs should marked as 
            forced for our preferred language and placed as first subtitle track.

            \\nExample:\\n
            true
            \\nExample:\\n
            false`,
        },
        ],
    };
};

// eslint-disable-next-line no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {

    const lib = require('../methods/lib')();
    // eslint-disable-next-line no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);

    const response = {
        processFile: false,
        preset: ",",
        container: `.${file.container}`,
        handBrakeMode: false,
        FFmpegMode: false,
        reQueueAfter: false,
        infoLog: "",
    };

    // Set up required variables.

    // Regex Pattern for Signs and Songs
    let regexPatern = /(s\s*&\s*s|signs(\s?(and|&|\/)\s?songs)?)/i;

    const ffmpegConfig = {
        map: "-map 0:v? -map 0:a?",
        cmd: "",
        temp: [],
    };

    let groupByLang = {};
    let convert = false;

    // Get subtitle streams
    const subtitleStream = file.ffProbeData.streams.filter(
        (row) => row.codec_type === "subtitle"
    );

    // Does this file have subtitles?
    if (subtitleStream.length === 0) {
        response.infoLog += "☒ No subtitle tracks found! \n";
        return response;
    }
    // Nothing to do if only one subtitle track exists
    if (subtitleStream.length === 1) {
        response.infoLog += "☒ Has one subtitle track! \n";
        return response;
    }

    // Group each subtitle stream by language
    for (let i = 0; i < subtitleStream.length; i++) {
        let stream_lang = subtitleStream[i].tags?.language || "und";

        let groupKey = stream_lang;

        groupByLang[groupKey] = groupByLang[groupKey] || [];
        groupByLang[groupKey].push(subtitleStream[i]);
        // Set stream index position
        groupByLang[groupKey][groupByLang[groupKey].length - 1].index = i;
    }

    // Does our preferred language exist?
    if (inputs.preferred_language in groupByLang) {
        response.infoLog += "☑ Preferred language found! \n";
    } else {
        response.infoLog += "☒ Preferred language not found! \n";
        return response;
    }

    // Find signs and song tracks
    let pos = 0;
    for (let i = 0; i < groupByLang[inputs.preferred_language].length; i++) {
        let stream = groupByLang[inputs.preferred_language][i];
        let stream_title = stream.tags?.title || "";

        if(inputs.signssongs === true && regexPatern.test(stream_title) ) {
            response.infoLog += `☒ Signs and Songs ${inputs.preferred_language}; `
            if (stream.index === 0 && stream.disposition.forced === 1) {
                response.infoLog += `is already track 1 and forced. \n`;
            } else {
                response.infoLog += `track ${stream.index+1} => ${pos+1}`;
                if(pos === 0){
                    response.infoLog += ", marking as default+forced."
                    convert = true;
                }
                response.infoLog += " \n"
            }
            ffmpegConfig.map += ` -map 0:s:${pos}`;
            ffmpegConfig.cmd += ` -disposition:s:${pos} `
            ffmpegConfig.cmd += pos === 0 ? "+default+forced" : "0";
            pos++;
            continue;
        }

        // Save subtitle track for later
        ffmpegConfig.temp.push(stream);
    }

    // This will sort the rest of our preferred language
    for (let i = 0; i < ffmpegConfig.temp.length; i++) {
        let stream = ffmpegConfig.temp[i];
        response.infoLog += `☒ ${inputs.preferred_language}; `;
        response.infoLog += `track ${stream.index+1} => ${pos+1}`;
        if(pos === 0){
            if (stream.disposition.default !== 1) {
                response.infoLog += ", marking as default.";
                convert = true;
            }
        }
        if(pos !== 0 && pos !== stream.index) {
            convert = true;
        }
        response.infoLog += " \n"

        ffmpegConfig.map += ` -map 0:s:${pos}`;
        ffmpegConfig.cmd += ` -disposition:s:${pos} `;
        ffmpegConfig.cmd += pos === 0 ? "default" : "0";
        pos++;
    }

    if (convert === false) {
        response.infoLog = "☑ Subtitles in expected order.";
        return response;
    }

    // Handle remaining languages
    for (var key in groupByLang) {
        if (key === inputs.preferred_language) {
            continue;
        }
        let stream = groupByLang[key];
        for (let i = 0; i < stream.length; i++) {
            response.infoLog += `☒ ${key}; `
            response.infoLog += `track ${stream[i].index+1} => ${pos+1} \n`;
            ffmpegConfig.map += ` -map 0:s:${pos}`;
            ffmpegConfig.cmd += ` -disposition:s:${pos} 0`;
            pos++;
        }
    }

    response.preset += ffmpegConfig.map;
    response.preset += ` -map 0:d? -map 0:t? -c copy`;
    response.preset += ffmpegConfig.cmd;
    response.processFile = true;

    return response
};

module.exports.details = details;
module.exports.plugin = plugin;
