/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
    id: 'Tdarr_Plugin_UW01_auto_tag_language',
    Stage: 'Pre-processing',
    Name: 'Witcher-Audio/Subtitle auto language tagger',
    Type: 'Video',
    Operation: 'Transcode',
    Author: "UnknownWitcher",
    Description: `If the stream language is undefined, the plugin will look for the language in the stream title.
            This plugin by default will look for the following languages; english, french, german, spanish
            portuguese, dutch, norwegian, chinese, japanese, korean and icelandic, you can add additional languages
            in the configuration section or modify the code to include extra languages.`,
    Version: '1.00',
    Tags: 'pre-processing,ffmpeg,configurable',
    Inputs: [{
        name: 'extra_languages',
        type: 'string',
        defaultValue: '',
        inputUI: {
            type: 'text',
        },
        tooltip: `If the plugin is missing a language that you need, then add it here.\\n
        
            Make sure you use ISO 639-2 for the language code. https://en.wikipedia.org/wiki/List_of_ISO_639-2_codes\\n

            How to add languages:\\n

            Seperate the ISO code from the search word by using a colon.\\n

            eng:english\\n\\n


            Seperate multiple languages with a plus symbol.\\n
        
            eng:english+fre:french\\n\\n
            

            If you want to add more words to a specific ISO code, use a coma.\\n

            fre:french,français,française\\n\\n
            

            Here is an example for french, english and german\\n\\n

            eng:english+fre:french,français,française+ger:german,deutsch\\n\\n`,
    }],
});

// eslint-disable-next-line no-unused-vars
const plugin = (file, librarySettings, inputs, otherArguments) => {
    const lib = require('../methods/lib')();
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

    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== "video") {
        response.infoLog += "☒File is not a video. \n";
        return response;
    }

    // Grab our streams
    let streams = file.ffProbeData.streams.filter(
        (row) => row.codec_type === "audio" || row.codec_type === "subtitle"
    );

    let ffmpegArg = ", -map 0 -c copy";
    let position = { //audio/subtitle positions
        a: 0,
        s: 0,
    }

    if (streams.length === 0) {
        response.infoLog += "☒No Audio/Subtitle tracks found. \n";
        return response;
    }

  // Common Languages
    var iso6292 = {
        eng: ["english"],
        fre: ["french", "française", "français"],
        ger: ["german", "deutsch"],
        spa: ["spanish", "española", "español"],
        por: ["portuguese", "português"],
        dut: ["dutch", "flemish"],
        nor: ["norwegian", "norsk"],
        chi: ["chinese", "中国人"],
        jpn: ["japanese", "日本"],
        kor: ["korean", "한국어"],
        ice: ["icelandic", "íslensku"]
    };

    // Splits extra_language and trims spaces
    const splitTrim = (string, seperator) => {
        return string.split(seperator).map((el) => el.trim());
    };
    // Adds extra_language to iso6292
    let tmpObj = {};
    if (inputs.extra_languages !== "") {
        let language = splitTrim(inputs.extra_languages, "+");
        for (let i = 0; i < language.length; i++) {
            let lang = splitTrim(language[i], ":");
            let key = lang[0].toLowerCase();
            let val = splitTrim(lang[1].toLowerCase(), ",");
            if (key in iso6292) {
                for (let j = 0; j < val.length; j++) {
                    if (!iso6292[key].includes(val[j])) {
                        iso6292[key].push(val[j]);
                    }
                }
                continue;
            }
            tmpObj[key] = val;
        }
        // Place new languages to the top of the search
        iso6292 = { ...tmpObj, ...iso6292 };
    }
    // Loops through audio and subtitle streams
    for (let i = 0; i < streams.length; i++) {
        // Set language to und if undefined
        let language = (streams[i].tags?.language || "und").toLowerCase();
        // Set title to empty if undefined
        let title = (streams[i].tags?.title || "").toLowerCase();

        // Handles audio/subtitle stream positions
        if (i !== 0) {
            if (streams[i].codec_type === "audio") {
                position.a += 1;
            } else {
                position.s += 1;
            }
        }
        let pos = streams[i].codec_type === "audio" ? position.a : position.s;

        // Skip this stream if language exists
        if (language !== "und") {
            continue;
        }
        // Skip this stream if title does not exist
        if (title === "") {
            response.infoLog += `☒${streams[i].codec_type} track ${pos + 1} does not have a title. \\n`;
            continue;
        }
        // Where the magic happens
        let breakOut = false;
        for (let k in iso6292) {
            let language = iso6292[k];
            for (let j in language) {
                let lang = language[j];
                if (title.includes(lang) || title.includes(lang.slice(0, 3))) {
                    response.infoLog += `Adding ${language[0]} to ${streams[i].codec_type} track ${pos + 1}. \\n`;

                    ffmpegArg += ` -metadata:s:${streams[i].codec_type.slice(0, 1)}:${pos} language=${k}`;
                    //Once we have our language we can break out of this loop
                    breakOut = true;
                    break;
                }
            }
            if(breakOut === true) {
                break;
            }
        }
    }

    if (ffmpegArg === ", -map 0 -c copy") {
        response.infoLog += "☒Streams did not receive a language tag.";
        return response;
    }

    response.processFile = true;
    response.preset = ffmpegArg + " -max_muxing_queue_size 9999";
    return response;
}
module.exports.details = details;
module.exports.plugin = plugin;
