### [Youtube transcoder](https://github.com/warren-bank/crx-Youtube-transcoder/tree/userscript/es6)

[Userscript](https://github.com/warren-bank/crx-Youtube-transcoder/raw/userscript/es6/userscript/Youtube-transcoder.user.js) for [youtube.com](https://youtube.com/) to run in:
* the [WebMonkey](https://github.com/warren-bank/Android-WebMonkey) application
  - for Android
* the [Tampermonkey](https://www.tampermonkey.net/) web browser extension
  - for [Firefox/Fenix](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
  - for [~~Chrome/Chromium~~](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    * error: _none_ (execution fails silently)
    * behavior: userscript installs, all resources download and are saved to the DB, but userscript does not execute
    * best guess at cause: DB query to retrieve resources fails because size of result is larger than CursorWindow
    * related issues: [1](https://github.com/warren-bank/crx-Youtube-transcoder/issues/1), [2](https://github.com/Tampermonkey/tampermonkey/issues/2236), [3](https://github.com/Tampermonkey/tampermonkey/issues/1776), [4](https://github.com/Tampermonkey/tampermonkey/issues/1787)
* the [Violentmonkey](https://violentmonkey.github.io/) web browser extension
  - for [Firefox/Fenix](https://addons.mozilla.org/firefox/addon/violentmonkey/)
  - for [Chrome/Chromium](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag)

#### Purpose

Use [_ffmpeg.wasm_](https://github.com/ffmpegwasm/ffmpeg.wasm) to transcode Youtube media streams.

1. copy and combine video with audio to mp4
2. resample and convert audio to mp3

#### Important

* does not currently work when the `User-Agent` request header self-identifies as a mobile device
  - which causes _Youtube_ to redirect from `www.youtube.com` to `m.youtube.com`
  - in _Fenix_:
    * open: main menu
    * select: "Desktop site"
  - in _WebMonkey_:
    * open: main menu &gt; _Settings_ &gt; _User Agent_
    * select either: "Chrome 120, Windows 10", or "Custom User Agent"

#### Legal

* copyright: [Warren Bank](https://github.com/warren-bank)
* license: [GPL-2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)
