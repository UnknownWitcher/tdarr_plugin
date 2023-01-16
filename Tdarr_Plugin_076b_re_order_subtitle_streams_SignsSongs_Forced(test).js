/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => {
    return {
        id: "Tdarr_Plugin_076b_re_order_subtitle_streams_SignsSongs_Forced_test",
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
        preset: "",
        container: `.${file.container}`,
        handBrakeMode: false,
        FFmpegMode: true,
        reQueueAfter: false,
        infoLog: "",
    };

    let signsSongs = /(s\s*&\s*s|signs(\s?(and|&|\/)\s?songs)?)/i;

    const ffmpegConfig = {
        map: ", -map 0:v? -map 0:a?",
        cmd: " -disposition:s -default-forced",
        temp: [],
    };

    let groupByLang = {};
    let convert = false;

    const getStreams = file.ffProbeData.streams.filter(
        (row) => row.codec_type === "subtitle"
    );

    if (getStreams.length <= 1) {
        response.infoLog = "☑ No need to process file. \n";
        return response;
    }

    for (let i = 0; i < getStreams.length; i++) {
        let subtitle = getStreams[i];
        let language = subtitle.tags?.language || "und";
        groupByLang[language] = groupByLang[language] || [];
        groupByLang[language].push(subtitle);
        groupByLang[language][groupByLang[language].length - 1].index = i;
    }

    if (inputs.preferred_language in groupByLang === false) {
        response.infoLog = "Preferred language not found, No need to process file. \n";
        return response;
    }

    let preferredLanguage = false;
    let subtitlePosition = 0;
    for (let lang in groupByLang) {
        let streams;
        if (preferredLanguage === false) {
            let mainIndex;
            streams = groupByLang[inputs.preferred_language];

            for (let i = 0; i < streams.length; i++) {
                let subtitle = streams[i];
                let title = subtitle.tags?.title || "";

                if (inputs.signssongs === true && signsSongs.test(title)) {

                    response.infoLog += `☒ Signs and Songs ${inputs.preferred_language}; `
                    if (subtitle.index === 0 && subtitle.disposition.forced === 1) {
                        response.infoLog += `is already track 1 and forced. \n`;
                    } else {
                        response.infoLog += `track ${subtitle.index + 1} => 1`;
                        response.infoLog += ", marking as default+forced. \n";

                        ffmpegConfig.cmd += ` -disposition:s:0 +default+forced`;

                        convert = true;
                    }
                    mainIndex = subtitle.index;
                    ffmpegConfig.map += ` -map 0:s:${subtitle.index}`;

                    subtitlePosition++
                    break;
                }
            }

            for (let i = 0; i < streams.length; i++) {
                let subtitle = streams[i];

                if (mainIndex === subtitle.index) {
                    continue;
                }

                response.infoLog += `☒ ${inputs.preferred_language}; `;
                response.infoLog += `track ${subtitle.index + 1} => ${subtitlePosition + 1}`;

                if (subtitlePosition === 0) {
                    if (subtitle.disposition.default !== 1) {
                        response.infoLog += ", marking as default.";
                        ffmpegConfig.cmd += ` -disposition:s:0 default`
                        convert = true;
                    }
                }
                else {
                    if (subtitlePosition !== subtitle.index) {
                        convert = true;
                    }
                }

                ffmpegConfig.map += ` -map 0:s:${subtitle.index}`;

                response.infoLog += " \n"

                subtitlePosition++
            }

            preferredLanguage = true;
        }

        if (convert === false) {
            response.infoLog = "☑ No need to process file. \n";
            return response;
        }

        if (lang !== inputs.preferred_language) {
            streams = groupByLang[lang];

            for (let i = 0; i < streams.length; i++) {
                let subtitle = streams[i];
                response.infoLog += `☒ ${lang}; `
                response.infoLog += `track ${subtitle.index + 1} => ${subtitlePosition + 1} \n`;
                ffmpegConfig.map += ` -map 0:s:${subtitle.index}`;
                subtitlePosition++
            }
        }
    }

    if (convert === true) {
        response.preset += ffmpegConfig.map;
        response.preset += ` -map 0:d? -map 0:t? -c copy`;
        response.preset += ffmpegConfig.cmd;
        response.processFile = true;
    }
    return response
};

module.exports.details = details;
module.exports.plugin = plugin;
