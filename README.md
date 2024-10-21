### [Youtube transcoder](https://github.com/warren-bank/crx-Youtube-transcoder/tree/userscript/es6)

[Userscript](https://github.com/warren-bank/crx-Youtube-transcoder/raw/userscript/es6/userscript/Youtube-transcoder.user.js) for [youtube.com](https://youtube.com/) to run in:
* the [Tampermonkey](https://www.tampermonkey.net/) web browser extension
  - for [Chrome/Chromium](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
  - for [Firefox/Fenix](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)

#### Purpose

Use [_ffmpeg.wasm_](https://github.com/ffmpegwasm/ffmpeg.wasm) to transcode Youtube media streams.

1. copy and combine video with audio to mp4
2. resample and convert audio to mp3

#### Status

* mp3 conversion is successfully tested in Firefox 115
  - only works when the input audio stream is: `"itag": 18`
* this limitation is a symptom of a larger problem
  - this userscript depends on both [_ffmpeg.wasm_](https://github.com/ffmpegwasm/ffmpeg.wasm) and [_browser-ytdl-core_](https://github.com/warren-bank/browser-ytdl-core/tree/distubejs/)
    * _browser-ytdl-core_ is currently only working for: `"itag": 18`
    * the URL for every other format receives a `403` server response
    * pages where this issue is discussed: [1](https://github.com/warren-bank/browser-ytdl-core/issues/1), [2](https://github.com/distubejs/ytdl-core/issues/113), [3](https://github.com/distubejs/ytdl-core/pull/111)

#### Legal

* copyright: [Warren Bank](https://github.com/warren-bank)
* license: [GPL-2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)
