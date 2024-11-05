// ==UserScript==
// @name         Youtube transcoder
// @description  Use ffmpeg.wasm to transcode Youtube media streams. Option #1: copy and combine video with audio to mp4. Options #2: resample and convert audio to mp3.
// @version      0.0.5
// @match        *://youtube.googleapis.com/v/*
// @match        *://youtube.com/watch?v=*
// @match        *://youtube.com/embed/*
// @match        *://*.youtube.com/watch?v=*
// @match        *://*.youtube.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/@warren-bank/browser-ytdl-core@6.0.5-ybd-project.1/dist/es2020/ytdl-core.js
// @require      https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js
// @require      https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js
// @resource     wasmURL  https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm
// @run-at       document_end
// @grant        unsafeWindow
// @grant        GM_getResourceURL
// @homepage     https://github.com/warren-bank/crx-Youtube-transcoder/tree/userscript/es6
// @supportURL   https://github.com/warren-bank/crx-Youtube-transcoder/issues
// @downloadURL  https://github.com/warren-bank/crx-Youtube-transcoder/raw/userscript/es6/userscript/Youtube-transcoder.user.js
// @updateURL    https://github.com/warren-bank/crx-Youtube-transcoder/raw/userscript/es6/userscript/Youtube-transcoder.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- references

// https://www.jsdelivr.com/package/npm/@ffmpeg/core
// https://cdn.jsdelivr.net/npm/@ffmpeg/core/

// https://github.com/ffmpegwasm/ffmpeg.wasm/releases
// https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v0.12.10
// https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v0.12.10/packages/ffmpeg/src/worker.ts#L76-L91
// https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v0.12.10/packages/util/src/index.ts#L49
// https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v0.12.10/apps/vanilla-app/public/transcode.html

// ----------------------------------------------------------------------------- constants

const constants = {
  element_id: {
    transcoder_container: "transcoder_container",
    select_video_format: "select_video_format",
    select_audio_format: "select_audio_format",
    button_copy_and_combine: "button_copy_and_combine",
    button_resample: "button_resample",
    span_transcoding_progress: "span_transcoding_progress"
  },
  button_text: {
    transcode_media: "Transcode Media",
    copy_and_combine: "Audio and Video: Copy and Combine to mp4",
    resample: "Audio: Resample to mp3",
    save_result: "Save Result"
  },
  notification_text: {
    transcoding_progress_label: "Transcoding in Progress:"
  },
  inline_css: {
    button: "background-color: #065fd4; color: #fff; padding: 10px 15px; border-radius: 18px; border-style: none; outline: none; font-weight: bold; cursor: pointer;",
    table_transcoder_options: "background-color: white; padding: 2em; border: 1px solid #000;",
    div_transcoding_progress: "background-color: white; padding: 1em; border: 1px solid #000; font-size: 1.5em;"
  }
}

// ----------------------------------------------------------------------------- state

const state = {
  formats: null
}

// ----------------------------------------------------------------------------- CSP

// add support for CSP 'Trusted Type' assignment
const add_default_trusted_type_policy = () => {
  if (typeof unsafeWindow.trustedTypes !== 'undefined') {
    try {
      const passthrough_policy = string => string

      unsafeWindow.trustedTypes.createPolicy('default', {
          createHTML:      passthrough_policy,
          createScript:    passthrough_policy,
          createScriptURL: passthrough_policy
      })
    }
    catch(e) {}
  }
}

// ----------------------------------------------------------------------------- helpers

const make_element = (elementName, html) => {
  const el = unsafeWindow.document.createElement(elementName)

  if (html)
    el.innerHTML = html

  return el
}

const empty_element = (el, html) => {
  while (el.childNodes.length)
    el.removeChild(el.childNodes[0])

  if (html)
    el.innerHTML = html

  return el
}

// ----------------------------------------------------------------------------- DOM: container element

const add_transcoder_container = () => {
  const div = make_element('div')

  div.setAttribute('id', constants.element_id.transcoder_container)

  div.style.position = 'fixed'
  div.style.top = '10px'
  div.style.right = '10px'
  div.style.zIndex = '9999'

  document.body.appendChild(div)

  return div
}

const get_transcoder_container = () => document.getElementById(constants.element_id.transcoder_container) || add_transcoder_container()

const hide_transcoder_container = (transcoder_container) => {
  if (!transcoder_container)
    transcoder_container = get_transcoder_container()

  transcoder_container.style.display = 'none'
}

const show_transcoder_container = (transcoder_container) => {
  if (!transcoder_container)
    transcoder_container = get_transcoder_container()

  transcoder_container.style.display = 'block'
}

// ----------------------------------------------------------------------------- DOM: button to display transcoder options

const add_transcode_media_button = () => {
  const transcoder_container = get_transcoder_container()
  hide_transcoder_container(transcoder_container)

  empty_element(transcoder_container, `
    <button style="${constants.inline_css.button}">
      <span>${constants.button_text.transcode_media}</span>
    </button>
  `)

  // attach event handler to button
  transcoder_container.querySelector('button').addEventListener('click', show_transcoder_options)

  show_transcoder_container(transcoder_container)
}

// ----------------------------------------------------------------------------- DOM: transcoder options

const show_transcoder_options = () => {
  const transcoder_container = get_transcoder_container()
  hide_transcoder_container(transcoder_container)

  empty_element(transcoder_container, `
    <table style="${constants.inline_css.table_transcoder_options}">
      <tr valign="middle">
        <td>Video Input:</td>
        <td><select id="${constants.element_id.select_video_format}"></select></td>
      </tr>
      <tr valign="middle">
        <td>Audio Input:</td>
        <td><select id="${constants.element_id.select_audio_format}"></select></td>
      </tr>
      <tr valign="middle">
        <td colspan="2" align="center">
          <button id="${constants.element_id.button_copy_and_combine}" style="${constants.inline_css.button}">
            <span>${constants.button_text.copy_and_combine}</span>
          </button>
        </td>
      </tr>
      <tr valign="middle">
        <td colspan="2" align="center">
          <button id="${constants.element_id.button_resample}" style="${constants.inline_css.button}">
            <span>${constants.button_text.resample}</span>
          </button>
        </td>
      </tr>
    </table>
  `)

  let html

  // populate video formats
  html = state.formats
    .filter(format => !!format.hasVideo)
    .sort((a, b) => b.bitrate - a.bitrate)
    .map(format => `<option value="${format.itag}">${format.container} @ ${Math.floor(format.bitrate / 1000)} kbps, ${format.quality?.label || format.quality?.text || ''}</option>`)
  html.unshift('<option value="">[none]</option>')
  transcoder_container.querySelector('#' + constants.element_id.select_video_format).innerHTML = html.join("\n")

  // populate audio formats
  html = state.formats
    .filter(format => !!format.hasAudio)
    .sort((a, b) => b.audioBitrate - a.audioBitrate)
    .map(format => `<option value="${format.itag}">${format.container} @ ${format.audioBitrate} kbps</option>`)
  html.unshift('<option value="">[none]</option>')
  transcoder_container.querySelector('#' + constants.element_id.select_audio_format).innerHTML = html.join("\n")

  // attach event handler to button
  transcoder_container.querySelector('#' + constants.element_id.button_copy_and_combine).addEventListener('click', transcode_copy_and_combine)

  // attach event handler to button
  transcoder_container.querySelector('#' + constants.element_id.button_resample).addEventListener('click', transcode_resample)

  show_transcoder_container(transcoder_container)
}

// ----------------------------------------------------------------------------- DOM: progress indicator

const show_transcoding_progress = (transcoder_container) => {
  if (!transcoder_container)
    transcoder_container = get_transcoder_container()

  empty_element(transcoder_container, `
    <div style="${constants.inline_css.div_transcoding_progress}">
      <span>${constants.notification_text.transcoding_progress_label} </span><span id="${constants.element_id.transcoding_progress}"></span>
    </div>
  `)
  update_transcoding_progress({progress: 0})
}

const update_transcoding_progress = (data) => {
  // round to 2 decimal places
  document.getElementById(constants.element_id.transcoding_progress).textContent = String(Math.floor(data.progress * 10000) / 100) + '%'
}

const show_transcoding_output = (output_file, output_url, transcoder_container) => {
  if (!transcoder_container)
    transcoder_container = get_transcoder_container()

  empty_element(transcoder_container, `
    <a href="${output_url}" download="${output_file}">
      <button style="${constants.inline_css.button}">
        <span>${constants.button_text.save_result}</span>
      </button>
    </a>
  `)
}

// ----------------------------------------------------------------------------- transcoder: helper

const getFFmpegCoreOptions = () => {
  const coreURL   = 'http://localhost/'
  const workerURL = `${coreURL}ffmpeg-core.worker.js`
  let wasmURL     = GM_getResourceURL('wasmURL')

  let index = wasmURL.indexOf(',')
  wasmURL = wasmURL.substring(index + 1, wasmURL.length)
  const wasmBinary = base64ToArrayBuffer(wasmURL)
  wasmURL = 'data:application/octet-stream;base64,'

  const mainScriptUrlOrBlob = `${coreURL}#${btoa(
    JSON.stringify({workerURL, wasmURL})
  )}`

  return {mainScriptUrlOrBlob, wasmBinary}
}

/*
 * https://github.com/component/data-uri-to-u8/blob/master/index.js
 * https://stackoverflow.com/a/21797381
 */
const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)

  for (let i=0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes.buffer
}

// ----------------------------------------------------------------------------- transcoder: copy_and_combine

const transcode_copy_and_combine = async () => {
  const video_format_itag = Number( document.getElementById(constants.element_id.select_video_format).value )
  const audio_format_itag = Number( document.getElementById(constants.element_id.select_audio_format).value )

  if (!video_format_itag || !audio_format_itag) return

  const video_format = state.formats.find(format => format.itag === video_format_itag)
  const audio_format = state.formats.find(format => format.itag === audio_format_itag)

  if (!video_format || !audio_format) return

  const video_url = video_format.url
  const audio_url = audio_format.url

  if (!video_url || !audio_url) return

  const transcoder_container = get_transcoder_container()
  show_transcoding_progress(transcoder_container)

  const input_video = `video.${video_format.container}`
  const input_audio = `audio.${audio_format.container}`
  const output_file = 'output.mp4'
  const ffmpeg = await window.createFFmpegCore(getFFmpegCoreOptions())

  ffmpeg.setLogger(console.log)
  ffmpeg.setProgress(update_transcoding_progress)
  await ffmpeg.FS.writeFile(input_video, await window.FFmpegUtil.fetchFile(video_url))
  await ffmpeg.FS.writeFile(input_audio, await window.FFmpegUtil.fetchFile(audio_url))
  await ffmpeg.exec('-i', input_video, '-i', input_audio, '-c', 'copy', '-map', '0:v:0', '-map', '1:a:0', output_file)
  const data = await ffmpeg.FS.readFile(output_file, {encoding: 'binary'})
  const output_url = URL.createObjectURL(new Blob([data.buffer], {type: 'video/mp4'}))

  show_transcoding_output(output_file, output_url, transcoder_container)
}

// ----------------------------------------------------------------------------- transcoder: resample

const transcode_resample = async () => {
  const audio_format_itag = Number( document.getElementById(constants.element_id.select_audio_format).value )
  if (!audio_format_itag) return

  const audio_format = state.formats.find(format => format.itag === audio_format_itag)
  if (!audio_format) return

  const audio_url = audio_format.url
  if (!audio_url) return

  const transcoder_container = get_transcoder_container()
  show_transcoding_progress(transcoder_container)

  const input_audio = `audio.${audio_format.container}`
  const output_file = 'output.mp3'
  const ffmpeg = await window.createFFmpegCore(getFFmpegCoreOptions())

  ffmpeg.setLogger(console.log)
  ffmpeg.setProgress(update_transcoding_progress)
  await ffmpeg.FS.writeFile(input_audio, await window.FFmpegUtil.fetchFile(audio_url))
  await ffmpeg.exec('-i', input_audio, '-ar', '44100', '-ac', '2', '-b:a', '128k', '-c:a', 'libmp3lame', '-q:a', '0', output_file)
  const data = await ffmpeg.FS.readFile(output_file, {encoding: 'binary'})
  const output_url = URL.createObjectURL(new Blob([data.buffer], {type: 'audio/mpeg'}))

  show_transcoding_output(output_file, output_url, transcoder_container)
}

// ----------------------------------------------------------------------------- format data structure: validation

const validate_format = (format, callback) => {
  if (!format || !format.url) {
    callback()
    return
  }

  let did_callback = false
  const do_callback = function() {
    if (did_callback) return

    did_callback = true
    callback()
  }

  const xhr = new XMLHttpRequest()
  xhr.open('HEAD', format.url, true)
  xhr.timeout = 2000
  xhr.onreadystatechange = function() {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      format.urlStatus = xhr.status || 0
      do_callback()
    }
  }
  xhr.ontimeout = xhr.onerror = xhr.onabort = function() {
    format.urlStatus = format.urlStatus || 0
    do_callback()
  }
  xhr.send()
}

const validate_formats = (callback) => {
  if (!state.formats || !state.formats.length) {
    callback()
    return
  }

  let done_counter = 0
  const cb = () => {
    done_counter++

    if (done_counter === state.formats.length) {
      state.formats = state.formats.filter(format => (format.urlStatus >= 200) && (format.urlStatus < 300))
      callback()
    }
  }

  for (let format of state.formats) {
    validate_format(format, cb)
  }
}

const validate_formats_async = () => new Promise(resolve => {
  validate_formats(resolve)
})

// ----------------------------------------------------------------------------- format data structure: normalization

const normalize_formats = () => {
  if (!state.formats || !state.formats.length) return

  state.formats = state.formats
    .filter(format => !!format && (typeof format === 'object') && format.url && (format.hasVideo || format.hasAudio))
    .sort((a,b) => {
      // sort formats by bitrate in decreasing order
      return (a.bitrate < b.bitrate)
        ? 1 : (a.bitrate === b.bitrate)
        ?  0 : -1
    })
}

// ----------------------------------------------------------------------------- format data structure: remove duplicates

const dedupe_formats = () => {
  if (!state.formats || !state.formats.length) return

  let previous_itag = null

  state.formats = state.formats
    .filter(format => {
      if (format.itag) {
        if (format.itag === previous_itag) {
          return false
        }
        previous_itag = format.itag
      }
      return true
    })
}

// ----------------------------------------------------------------------------- normalize dependencies

try {
  if (!window.FFmpegUtil && FFmpegUtil)
    window.FFmpegUtil = FFmpegUtil
}
catch(e) {}

try {
  if (!window.createFFmpegCore && createFFmpegCore)
    window.createFFmpegCore = createFFmpegCore
}
catch(e) {}

// ----------------------------------------------------------------------------- bootstrap

const init = async () => {
  add_default_trusted_type_policy()

  const ytdl = new window.Ytdl.YtdlCore({
    logDisplay: ['debug', 'info', 'success', 'warning', 'error'],
    disableInitialSetup: false,
    disableBasicCache: true,
    disableFileCache: true,
    disablePoTokenAutoGeneration: true,
    noUpdate: true
  })

  let info = await ytdl.getFullInfo(window.location.href)
  if (!info || !info.formats || !info.formats.length) return

  state.formats = info.formats
  info = null

  // important: perform normalization BEFORE removing duplicates
  await validate_formats_async()
  normalize_formats()
  dedupe_formats()

  add_transcode_media_button()
}

if (window.Ytdl && window.Ytdl.YtdlCore && window.FFmpegUtil && window.createFFmpegCore) {
  init()
}

// -----------------------------------------------------------------------------
