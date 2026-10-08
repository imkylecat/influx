import definePlugin from "@api/Plugins";
import { definePluginSettings } from "@api/Settings";
import { Contributor } from "@utils/constants";
import { Stores } from "@webpack/common";

const endings = [
  "rawr x3",
  "OwO",
  "UwU",
  "o.O",
  "-.-",
  ">w<",
  "(⑅˘꒳˘)",
  "(ꈍᴗꈍ)",
  "(˘ω˘)",
  "(U ᵕ U❁)",
  "σωσ",
  "òωó",
  "(///ˬ///✿)",
  "(U ﹏ U)",
  "( ͡o ω ͡o )",
  "ʘwʘ",
  ":3",
  ":3",
  "XD",
  "nyaa~~",
  "mya",
  ">_<",
  "😳",
  "🥺",
  "😳😳😳",
  "rawr",
  "^^",
  "^^;;",
  "(ˆ ﻌ ˆ)♡",
  "^•ﻌ•^",
  "/(^•ω•^)",
  "(✿oωo)",
];

const replacements = [
  ["small", "smol"],
  ["cute", "kawaii~"],
  ["fluff", "floof"],
  ["love", "luv"],
  ["stupid", "baka"],
  ["what", "nani"],
  ["meow", "nya~"],
  ["hello", "hewwo"],
];

const settings = definePluginSettings({
  uwuEveryMessage: {
    type: "boolean",
    description: "Make every single message uwuified.",
    default: false,
  },
});

export function uwuify(message: string): string {
  message = message.toLowerCase();
  for (const [word, replacement] of replacements) {
    message = message.replaceAll(word, replacement);
  }
  return message
    .replaceAll(/([ \t\n])n/g, "$1ny")
    .replaceAll(/[lr]/g, "w")
    .replaceAll(/([ \t\n])([a-z])/g, (_, space: string, letter: string) =>
      Math.random() < 0.5 ? `${space}${letter}-${letter}` : `${space}${letter}`,
    )
    .replaceAll(
      /([^.,!][.,!])([ \t\n])/g,
      (_, sentenceEnd: string, space: string) =>
        `${sentenceEnd} ${endings[Math.floor(Math.random() * endings.length)]}${space}`,
    );
}

export default definePlugin({
  name: "UwUifier",
  description: "Adds a /uwuify command that uwuifies your message.",
  authors: [Contributor.Kairu],
  settings,

  patches: [
    {
      find: 'name:"/tableflip"',
      replacement: {
        match: /\{type:"action",name:"\/spoiler",description:[^,]+,(options:\[[^\]]+\])\}/,
        replace: "$&,{...$self.command,$1}",
      },
    },
    {
      find: '"Failed to execute command"',
      replacement: [
        {
          match:
            /("\/tts"===(\i))(\)\{if\(!\i\(\i,\["message"\]\)\)return null;let (\i)=\i\(\i,"message",!1\);return null==\4\?null:)/,
          replace: '$1||"/uwuify"===$2$3"/uwuify"===$2?{type:"uwuify",content:$4}:',
        },
        {
          match:
            /("spoiler"===(\i)\.type)(\)\{let \i=\i\(\i\);if\(null!==\i\)\{let (\i)=\i\(\2\.content\);\i=)/,
          replace: '$1||"uwuify"===$2.type$3"uwuify"===$2.type?$self.onCommand($4):',
        },
        {
          match: /sendMessage:\(0,\i\.useCallback\)\(\((\i),\i,\i=\[\],\i,\i\)=>\{/,
          replace: "$&$1=$self.onSend($1);",
        },
      ],
    },
    {
      find: '"Cannot change nickname outside of a guild"',
      replacement: {
        match: /"tts"===(\i)\.type(?=\|\|"unknown"===\1\.type)/,
        replace: '$&||"uwuify"===$1.type',
      },
    },
    {
      find: "Editing message $",
      replacement: {
        match:
          /function \i\((\i),(\i),(\i),\i,\i,\i\)\{return \i\(function\*\(\)\{(?=var \i,\i;\i\.debug\(`Editing message )/,
        replace: "$&$3=$self.onEdit($1,$2,$3);",
      },
    },
  ],

  command: { type: "action", name: "/uwuify", description: "Uwuifies your message." },

  onCommand(content: string): string {
    return settings.store.uwuEveryMessage ? content : uwuify(content);
  },

  onSend(content: string): string {
    return settings.store.uwuEveryMessage ? uwuify(content) : content;
  },

  onEdit(channelId: string, messageId: string, content?: string): string | undefined {
    if (!content || !settings.store.uwuEveryMessage) return content;
    const unchanged = Stores.Messages()?.getMessage(channelId, messageId)?.content === content;
    return unchanged ? content : uwuify(content);
  },
});
