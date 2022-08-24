/* eslint no-plusplus: ["error", { "allowForLoopAfterthoughts": true }] */
const details = () => ({
  id: "Tdarr_Plugin_UW01_AudioConverter",
  Stage: "Pre-processing",
  Name: "Witcher-Convert Audio Stream",
  Type: "Audio",
  Operation: "Transcode",
  Author: "UnknownWitcher",
  Description: `With this plugin, you can use the downmix option to create 5.1 and 2.0 audio tracks, once per language 
              and apply drc to the downmix 2.0 audio track using the DRC option. You can also choose to copy existing 2.0 audio
              tracks, convert non-AAC to AAC, replace them using downmix or completely remove 2.0 audio tracks, excluding them from
              being downmixed.`,
  Version: "2.0",
  Tags: "pre-processing,ffmpeg,audio only,configurable",
  Inputs: [{
      name: "downmix",
      defaultValue: false,
      inputUI: {
          type: "dropdown",
          options: ["false","true"]
      },
      tooltip: `If set to true, the plugin will use an audio track that has more channels, to create audio\\n
              tracks with less channels, in other words a 7.1 audio tracks will create 5.1 and 2.0 audio tracks\\n
              assuming both don't exist, while 5.1 will only create 2.0.\\n\\n

              This will be done once for each available language, so if there are two 5.1 english audio tracks, then the\\n
              first available track would be used to create a 2.0 audio track, but if you had 5.1 english and 5.1 french\\n
              then a 2.0 english and 2.0 french audio tracks would be created.`
  },
  {
      name: "two_channel",
      defaultValue: 'convert',
      inputUI: {
          type: "dropdown",
          options: ["copy","convert","replace","remove"]
      },
      tooltip: `Choose what happens to 2.0 audio tracks.\\n\\n
              For Example\\n
              Copy    - Copy existing audio tracks to new file.\\n
              Convert - Convert non-AAC audio tracks to AAC.\\n
              Replace - Replace existing audio tracks using downmix.\\n
              Remove  - Remove existing audio tracks and prevents downmixing.\\n\\n
              Audio will only be removed if 5.1 or 7.1 audio tracks are avaiable in the same language.`
  },
  {
      name: "DRC",
      defaultValue: true,
      inputUI: {
          type: "dropdown",
          options: ["true","false"]
      },
      tooltip: `Apply dynamic range compression when creating new 2.0 audio tracks through downmix.`
  }],
});

// eslint-disable-next-line no-unused-vars
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
  
  // Allows us to write multiple issues into the log before skipping.
  let skipPlugin = false;
  
  if(inputs.downmix === false && inputs.two_channel === 'replace') {
      response.infoLog += "☒Cannot replace audio tracks if downmix is disabled. \n";
      skipPlugin = true;
  }
  
  // Get audio streams
  const audioStreams = file.ffProbeData.streams.filter(
      (row) => row.codec_type === "audio"
  );
  
  if(audioStreams.length === 0) {
      response.infoLog += "☒File does not contain audio. \n";
      skipPlugin = true;
  }
  
  if(skipPlugin === true){
      return response;
  }
  
  // important variables
  let has2Channel = {};
  let has6Channel = {};
  let has8Channel = {};
  let groupByLang = {};

  let audioIdx = 0;
  let convert = false;
  
  let insertffmegMap = "";
  let insertffmegFilter = "";
  
  // Easier way to store/modify the DRC portion of the ffmpeg command.
  const ffmpegDRC = 'pan=stereo|FL=FC+0.50*FL+0.50*FLC+0.50*BL+0.50*SL+0.60*LFE|FR=FC+0.50*FR+0.50*FRC+0.50*BR+0.30*SR+0.60*LFE,dynaudnorm';
  
  // Group each audio track by language while checking for 8, 6 and 2 channel audio
  for (let i = 0; i < audioStreams.length; i += 1) {
      let groupKey = "und";
      if (audioStreams[i]?.tags?.language !== undefined) {
          groupKey = audioStreams[i].tags.language;
      }
      
      groupByLang[groupKey] = groupByLang[groupKey] || [];
      groupByLang[groupKey].push(audioStreams[i]);
      groupByLang[groupKey][groupByLang[groupKey].length - 1].index = i; // Change audio index to the audio's position
      
      has2Channel[groupKey] = has2Channel[groupKey] || false;
      if (parseInt(audioStreams[i].channels, 10) === 2) {
          has2Channel[groupKey] = true;
      }
      
      has6Channel[groupKey] = has6Channel[groupKey] || false;
      if (parseInt(audioStreams[i].channels, 10) === 6) {
          has6Channel[groupKey] = true;
      }
      
      has8Channel[groupKey] = has8Channel[groupKey] || false;
      if (parseInt(audioStreams[i].channels, 10) === 8) {
          has8Channel[groupKey] = true;
      }
  }
  
  // Create ffmpeg command for each language
  Object.keys(groupByLang).forEach((key) => {
       // We only want to downmix 2ch and 6ch once per language
      let downmixPerLang = {
          six: true,
          two: true
      };
      // Apply the audio tracks language to new audio if possible.
      let langMeta = "";
      if (key !== "und") {
          langMeta = `-metadata:s:a:{audioIdx} "language=${key}" `;
      }
      
      if( 
          (inputs.two_channel === "remove" || inputs.two_channel === "replace") &&
          has2Channel[key] === true &&
          has6Channel[key] === false &&
          has8Channel[key] === false
      ) {
          if(groupByLang[key].length === 1) {
              response.infoLog += `☒2 channel ${key} Audio cannot be ${inputs.two_channel}, no other audio exists for this language. \n`;
          }
          else {
              response.infoLog += `☒2 channel ${key} Audio tracks found, but no 5.1 or 7.1 audio exist for this language, cannot ${inputs.two_channel}. \n`;
          }
          
          inputs.two_channel = "copy"; // we will now copy that audio instead.
      }
      
      // Loop through each track for current language
      for (let i = 0; i < groupByLang[key].length; i += 1) {
          // Add the correct audioIdx for this track
          let tmpMeta = langMeta.replace("{audioIdx}", audioIdx);
          
          // Position of track within audio stream
          let audioPos = parseInt(groupByLang[key][i].index, 10)
          
          if(
              parseInt(groupByLang[key][i].channels, 10) === 2 &&
              (inputs.two_channel === "copy" || inputs.two_channel === "convert")
          ){
              if(groupByLang[key][i].codec_name !== "aac" && inputs.two_channel === "convert") {
                  insertffmegMap += `-map a:${audioPos} -c:a:${audioIdx} aac -b:a:${audioIdx} 192k -metadata:s:a:${audioIdx} "title=2.0 AAC" ${tmpMeta}`;
                  
                  response.infoLog += `☒Audio track is 2 channel ${key}, codec is ${groupByLang[key][i].codec_name}, will be converted to aac. \n`;
                  convert = true;
              }
              else {
                  insertffmegMap += `-map a:${audioPos} -c:a:${audioIdx} copy ${tmpMeta}`;
                  response.infoLog +=`☒Audio track is 2 channel ${key} and will be copied. \n`;
              }
              audioIdx += 1;
          }
          
          if(parseInt(groupByLang[key][i].channels, 10) !== 2) {
              insertffmegMap += `-map a:${audioPos} -c:a:${audioIdx} copy ${tmpMeta}`;
              
              response.infoLog +=`☒Audio track is ${groupByLang[key][i].channels} channel ${key} and will be copied. \n`;
              
              audioIdx += 1;
          }
          
          if (inputs.downmix) {
              let add2Channel = false;
              
              // Downmix 2 channel from 6 if needed.
              if (parseInt(groupByLang[key][i].channels, 10) === 6 && downmixPerLang.two === true) {
                  if(
                      inputs.two_channel !== "remove" &&
                      (has2Channel[key] === false || inputs.two_channel === "replace")
                  ) {
                      add2Channel = true;
                      response.infoLog += `☒Audio track is 6 channel ${key}, no 2 channel exists. Creating 2 channel from 6 channel`;
                  }
              }
              
              if (parseInt(groupByLang[key][i].channels, 10) === 8) {
                  if (has6Channel[key] === false && downmixPerLang.six === true) {
                      tmpMeta = langMeta.replace("{audioIdx}", audioIdx);

                      insertffmegMap += `-map a:${audioPos} -c:a:${audioIdx} ac3 -ac:a:${audioIdx} 6 `
                      + `-metadata:s:a:${audioIdx} "title=5.1 AC3" ${tmpMeta}`;
                      
                      response.infoLog += `☒Audio track is 8 channel ${key}, no 6 channel exists. Creating 6 channel from 8 channel. \n`;
                      
                      downmixPerLang.six = false;
                      convert = true;
                      audioIdx += 1;
                  }
                  
                  if (
                      downmixPerLang.two === true &&
                      inputs.two_channel !== "remove" &&
                      (has2Channel[key] === false || inputs.two_channel === "replace")
                  ) {
                      add2Channel = true;
                      response.infoLog += `☒Audio track is 8 channel ${key}, no 2 channel exists. Creating 2 channel from 8 channel`;
                  }
              }
              
              if (
                  add2Channel === true &&
                  downmixPerLang.two === true &&
                  inputs.two_channel !== "remove"
              ) {
                  tmpMeta = langMeta.replace("{audioIdx}", audioIdx);
                  
                  if (inputs.DRC === true) {
                      let mapLabel = `UW${key}`.toUpperCase();
                      response.infoLog += ", applying DRC. \n";
                      
                      insertffmegFilter +=`[a:${audioPos}]${ffmpegDRC}[${mapLabel}];`;
                      
                      insertffmegMap += `-map [${mapLabel}] -c:a:${audioIdx} aac -b:a:${audioIdx} 192k -ar:a:${audioIdx} 48000 `
                      + `-metadata:s:a:${audioIdx} "title=2.0 AAC DRC" ${tmpMeta}`;
                  }
                  else {
                      insertffmegMap += `-map a:${audioPos} -c:a:${audioIdx} aac -ac:a:${audioIdx} 2 -b:a:${audioIdx} 192k ${tmpMeta}`
                      + `-metadata:s:a:${audioIdx} "title=2.0 AAC" ${tmpMeta}`;
                      
                      response.infoLog += ".\n";
                  }
                  downmixPerLang.two = false;
                  convert = true;
                  audioIdx += 1;
              }
          }
          //End of for loop
      }
      
  });
  
  // Convert file if convert variable is set to true.
  if (convert === true) {
      response.processFile = true;
      
      if (insertffmegFilter !== "") {
          insertffmegFilter = '-filter_complex "' + insertffmegFilter.slice(0,-1) + '"';
      }
      
      response.preset = '<io> ' + insertffmegFilter + ' -map v -c:v copy -color_primaries 1 -color_trc 1 -colorspace 1 '
      + insertffmegMap + '-c:s copy -strict -2 -max_muxing_queue_size 9999';

  } else {
      response.infoLog = "☑File contains all required audio formats. \n";
      response.processFile = false;
  }
  
  return response;
}
module.exports.details = details;
module.exports.plugin = plugin;
