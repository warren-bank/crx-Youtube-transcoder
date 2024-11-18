// ==UserScript==
// @name         Youtube transcoder
// @description  Use ffmpeg.wasm to transcode Youtube media streams. Option #1: copy and combine video with audio to mp4. Options #2: resample and convert audio to mp3.
// @version      2.4.1
// @match        *://youtube.googleapis.com/v/*
// @match        *://youtube.com/watch?v=*
// @match        *://youtube.com/embed/*
// @match        *://*.youtube.com/watch?v=*
// @match        *://*.youtube.com/embed/*
// @icon         https://www.youtube.com/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/@warren-bank/browser-ytdl-core@6.0.5-ybd-project.1/dist/es2020/ytdl-core.js
// @require      https://cdn.jsdelivr.net/npm/@warren-bank/browser-fetch-progress@1.0.0/src/fetch-progress.js
// @require      https://cdn.jsdelivr.net/npm/@warren-bank/ffmpeg@0.12.10-wasmbinary.3/dist/umd/ffmpeg.js
// @resource     classWorkerURL  https://cdn.jsdelivr.net/npm/@warren-bank/ffmpeg@0.12.10-wasmbinary.3/dist/umd/258.ffmpeg.js
// @resource     coreURL         https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js
// @resource     wasmURL         https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm
// @run-at       document_end
// @grant        unsafeWindow
// @grant        GM_getResourceURL
// @grant        GM_download
// @homepage     https://github.com/warren-bank/crx-Youtube-transcoder/tree/userscript/es6
// @supportURL   https://github.com/warren-bank/crx-Youtube-transcoder/issues
// @downloadURL  https://github.com/warren-bank/crx-Youtube-transcoder/raw/userscript/es6/userscript/Youtube-transcoder.user.js
// @updateURL    https://github.com/warren-bank/crx-Youtube-transcoder/raw/userscript/es6/userscript/Youtube-transcoder.user.js
// @namespace    warren-bank
// @author       Warren Bank
// @copyright    Warren Bank
// ==/UserScript==

// ----------------------------------------------------------------------------- config options

const user_options = {
  "debug_verbosity": 0,  // 0 = silent. 1 = console log. 2 = window alert. 3 = window alert + breakpoint in ffmpeg.wasm progress handler.
  "cacheWasmBinary": true,
  "displayOutput":   true,
  "save_result_calls_GM_download": (typeof window.WebViewWM === 'object'),
  "validate_format_xhr_timeout": 5000  // milliseconds
}

// ----------------------------------------------------------------------------- constants

const constants = {
  element_id: {
    transcoder_container: "transcoder_container",
    select_video_format: "select_video_format",
    select_audio_format: "select_audio_format",
    button_copy_and_combine: "button_copy_and_combine",
    button_resample: "button_resample",
    progress_video_downloader: "progress_video_downloader",
    progress_audio_downloader: "progress_audio_downloader",
    progress_transcoder: "progress_transcoder",
    pre_transcoder_output: "pre_transcoder_output"
  },
  button_text: {
    transcode_media: "Transcode Media",
    copy_and_combine: "Audio and Video: Copy and Combine to mp4",
    resample: "Audio: Resample to mp3",
    save_result: "Save Result"
  },
  notification_text: {
    select_video_format_label: "Video Input:",
    select_audio_format_label: "Audio Input:",
    transcoder_progress_label: "Transcoding in Progress",
    progress_video_downloader_label: "Video Download:",
    progress_audio_downloader_label: "Audio Download:",
    progress_transcoder_label: "Transcoding:"
  },
  inline_css: {
    transcoder_container: "position: fixed; top: 10px; right: 10px; z-index: 9999; max-width: 400px;",
    button: "background-color: #065fd4; color: #fff; padding: 10px 15px; border-radius: 18px; border-style: none; outline: none; font-weight: bold; cursor: pointer;",
    table_transcoder_options:  "background-color: white; padding: 2em; border: 1px solid #000;",
    table_transcoder_progress: "background-color: white; padding: 1em; border: 1px solid #000;",
    pre_transcoder_output: "box-sizing: border-box; width: calc(400px - 2em); max-height: 400px; overflow: auto; margin-top: 1em; background-color: white; padding: 0.5em; border: 1px solid #000;",
    progress_label: "white-space: nowrap;",
    progress: "width: calc(100% - 5em);"
  }
}

// ----------------------------------------------------------------------------- state

const state = {
  formats: null,
  wasmBinary: null
}

// ----------------------------------------------------------------------------- sanitize config options

const sanitize_user_options = () => {
  user_options.validate_format_xhr_timeout = ((typeof user_options.validate_format_xhr_timeout === 'number') && (user_options.validate_format_xhr_timeout >= 1000))
    ? Math.floor(user_options.validate_format_xhr_timeout)
    : 5000
}

sanitize_user_options()

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

// ----------------------------------------------------------------------------- debug logger

const debug = (msg, breakpoint) => {
  if (!user_options.debug_verbosity) return

  if (msg) {
    if (typeof msg !== 'string')
      msg = JSON.stringify(msg, null, 2)

    switch(user_options.debug_verbosity) {
      case 1:
        console.log(msg)
        break
      case 2:
      case 3:
        window.alert(msg)
        break
    }
  }

  if (breakpoint && (user_options.debug_verbosity > 2))
    debugger;
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

const cancel_event = (event) => {
  event.stopPropagation();event.stopImmediatePropagation();event.preventDefault();event.returnValue=false;
}

// ----------------------------------------------------------------------------- DOM: container element

const add_transcoder_container = () => {
  const div = make_element('div')

  div.setAttribute('id',    constants.element_id.transcoder_container)
  div.setAttribute('style', constants.inline_css.transcoder_container)

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

const show_transcoder_options = (event) => {
  cancel_event(event)

  const transcoder_container = get_transcoder_container()
  hide_transcoder_container(transcoder_container)

  empty_element(transcoder_container, `
    <table style="${constants.inline_css.table_transcoder_options}">
      <tr valign="middle">
        <td>${constants.notification_text.select_video_format_label}</td>
        <td><select id="${constants.element_id.select_video_format}"></select></td>
      </tr>
      <tr valign="middle">
        <td>${constants.notification_text.select_audio_format_label}</td>
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

const show_transcoder_progress = (transcoder_container, show_video_downloader, show_audio_downloader) => {
  if (!transcoder_container)
    transcoder_container = get_transcoder_container()

  empty_element(transcoder_container, `
    <table style="${constants.inline_css.table_transcoder_progress}">
      <tr>
        <th></th>
        <th width="100%"></th>
      </tr>
      <tr valign="middle">
        <td colspan="2" align="center">
          <h4>${constants.notification_text.transcoder_progress_label}</h4>
        </td>
      </tr>
    ${!show_video_downloader ? '' : `
      <tr valign="middle">
        <td style="${constants.inline_css.progress_label}">${constants.notification_text.progress_video_downloader_label}</td>
        <td>
          <progress id="${constants.element_id.progress_video_downloader}" style="${constants.inline_css.progress}" value="0" max="1"></progress><label> 0 %</label>
        </td>
      </tr>
    `}
    ${!show_audio_downloader ? '' : `
      <tr valign="middle">
        <td style="${constants.inline_css.progress_label}">${constants.notification_text.progress_audio_downloader_label}</td>
        <td>
          <progress id="${constants.element_id.progress_audio_downloader}" style="${constants.inline_css.progress}" value="0" max="1"></progress><label> 0 %</label>
        </td>
      </tr>
    `}
      <tr valign="middle">
        <td style="${constants.inline_css.progress_label}">${constants.notification_text.progress_transcoder_label}</td>
        <td>
          <progress id="${constants.element_id.progress_transcoder}" style="${constants.inline_css.progress}" value="0" max="1"></progress><label> 0 %</label>
        </td>
      </tr>
    ${!user_options.displayOutput ? '' : `
      <tr valign="middle">
        <td colspan="2">
          <pre id="${constants.element_id.pre_transcoder_output}" style="${constants.inline_css.pre_transcoder_output}">${"FFmpeg output:\n\n"}</pre>
        </td>
      </tr>
    `}
    </table>
  `)

  if (show_video_downloader)
    update_transcoder_progress(constants.element_id.progress_video_downloader, {progress: 0})

  if (show_audio_downloader)
    update_transcoder_progress(constants.element_id.progress_audio_downloader, {progress: 0})

  update_transcoder_progress(constants.element_id.progress_transcoder, {progress: 0})
}

const update_transcoder_progress = (id, event) => {
  debug(event, true)
  if (event && (typeof event === 'object') && (typeof event.progress === 'number')) {
    const $progress = document.getElementById(id)
    const $label    = $progress.nextSibling
    $progress.value = event.progress
    $label.textContent = ' ' + (Math.floor(event.progress * 10000) / 100) + ' %'  // round to 2 decimal places
  }
}

const update_transcoder_output = (event) => {
  debug(event)
  if (user_options.displayOutput && event && (typeof event === 'object') && ((event.type === 'stdout') || (event.type === 'stderr')) && event.message) {
    document.getElementById(constants.element_id.pre_transcoder_output).appendChild(
      document.createTextNode(event.message + "\n")
    )
  }
}

const show_transcoder_result = (output_file, output_url, transcoder_container) => {
  if (!transcoder_container)
    transcoder_container = get_transcoder_container()

  empty_element(transcoder_container, `
    <a href="${output_url}" download="${output_file}">
      <button style="${constants.inline_css.button}">
        <span>${constants.button_text.save_result}</span>
      </button>
    </a>
  `)

  if (user_options.save_result_calls_GM_download) {
    transcoder_container.querySelector('a').addEventListener('click', (event) => {
      cancel_event(event)

      GM_download(output_url, output_file)
    })
  }
}

// ----------------------------------------------------------------------------- transcoder [helper]: config for load()

const getClassWorkerURL = () => GM_getResourceURL('classWorkerURL', false)
const getCoreURL        = () => GM_getResourceURL('coreURL', false)

const getWasmBinary     = async () => {
  let wasmBinary

  if (state.wasmBinary) {
    wasmBinary = state.wasmBinary.slice(0)
  }
  else {
    wasmBinary  = null
    let wasmURL = GM_getResourceURL('wasmURL', false)
    debug('resource "wasmURL": ' + (wasmURL ? wasmURL.substring(0, 100) : 'null'), true)

    if (wasmURL) {
      if (wasmURL.substring(0, 5) === 'data:') {
        const index = wasmURL.indexOf(',')
        wasmURL     = wasmURL.substring(index + 1, wasmURL.length)
        wasmBinary  = base64ToArrayBuffer(wasmURL)
      }
      else if (wasmURL.substring(0, 5) === 'blob:') {
        wasmBinary = await fetch(wasmURL).then(res => res.arrayBuffer())
      }
    }
    else {
      wasmURL    = 'http://localhost/ffmpeg-core.wasm'
      wasmBinary = await fetch(wasmURL).then(res => res.arrayBuffer())
    }

    if (wasmBinary) {
      debug('size of "wasmBinary": ' + wasmBinary.byteLength + ' bytes')

      if (user_options.cacheWasmBinary) {
        state.wasmBinary = wasmBinary.slice(0)
      }
    }
  }

  return wasmBinary
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

const getFFMessageLoadConfig = async () => ({
  classWorkerURL:          getClassWorkerURL(),
  coreURL:                 getCoreURL(),
  wasmBinary:              await getWasmBinary(),
  createTrustedTypePolicy: true
})

// ----------------------------------------------------------------------------- transcoder [helper]: file downloader w/ progress updates

const fetchFile = async (url, progressHandler) => {
  return fetch(url)
    .then(window.fetchProgress(progressHandler))
    .then(res => res.bytes())
}

const fetchFilesConcurrent = (list) => {
  const promises = []
  for (const args of list) {
    promises.push(
      fetchFile(...args)
    )
  }
  return Promise.all(promises)
}

// ----------------------------------------------------------------------------- transcoder: copy_and_combine

const transcode_copy_and_combine = async (event) => {
  cancel_event(event)

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
  show_transcoder_progress(transcoder_container, true, true)

  const files_list = [
    [video_url, update_transcoder_progress.bind(null, constants.element_id.progress_video_downloader)],
    [audio_url, update_transcoder_progress.bind(null, constants.element_id.progress_audio_downloader)]
  ]

  const files_uint8 = await fetchFilesConcurrent(files_list)

  const input_video    = `video.${video_format.container}`
  const input_audio    = `audio.${audio_format.container}`
  const output_file    = 'output.mp4'
  const ffmpeg         = new window.FFmpegWASM.FFmpeg()

  ffmpeg.on('progress', update_transcoder_progress.bind(null, constants.element_id.progress_transcoder))
  ffmpeg.on('log',      update_transcoder_output)

  await ffmpeg.load(await getFFMessageLoadConfig())
  await ffmpeg.writeFile(input_video, files_uint8[0])
  await ffmpeg.writeFile(input_audio, files_uint8[1])
  await ffmpeg.exec(['-i', input_video, '-i', input_audio, '-c', 'copy', '-map', '0:v:0', '-map', '1:a:0', output_file])
  const data = await ffmpeg.readFile(output_file, 'binary')
  ffmpeg.terminate()

  const output_url = URL.createObjectURL(new Blob([data.buffer], {type: 'video/mp4'}))
  show_transcoder_result(output_file, output_url, transcoder_container)
}

// ----------------------------------------------------------------------------- transcoder: resample

const transcode_resample = async (event) => {
  cancel_event(event)

  const audio_format_itag = Number( document.getElementById(constants.element_id.select_audio_format).value )
  if (!audio_format_itag) return

  const audio_format = state.formats.find(format => format.itag === audio_format_itag)
  if (!audio_format) return

  const audio_url     = audio_format.url
  const audio_bitrate = (audio_format.audioBitrate || 128) + 'k'
  if (!audio_url) return

  const transcoder_container = get_transcoder_container()
  show_transcoder_progress(transcoder_container, false, true)

  const files_list = [
    [audio_url, update_transcoder_progress.bind(null, constants.element_id.progress_audio_downloader)]
  ]

  const files_uint8 = await fetchFilesConcurrent(files_list)

  const input_audio    = `audio.${audio_format.container}`
  const output_file    = 'output.mp3'
  const ffmpeg         = new window.FFmpegWASM.FFmpeg()

  ffmpeg.on('progress', update_transcoder_progress.bind(null, constants.element_id.progress_transcoder))
  ffmpeg.on('log',      update_transcoder_output)

  await ffmpeg.load(await getFFMessageLoadConfig())
  await ffmpeg.writeFile(input_audio, files_uint8[0])
  await ffmpeg.exec(['-i', input_audio, '-ar', '44100', '-ac', '2', '-b:a', audio_bitrate, '-c:a', 'libmp3lame', '-q:a', '0', output_file])
  const data = await ffmpeg.readFile(output_file, 'binary')
  ffmpeg.terminate()

  const output_url = URL.createObjectURL(new Blob([data.buffer], {type: 'audio/mpeg'}))
  show_transcoder_result(output_file, output_url, transcoder_container)
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
  xhr.timeout = user_options.validate_format_xhr_timeout
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
  if (!window.FFmpegWASM && FFmpegWASM)
    window.FFmpegWASM = FFmpegWASM
}
catch(e) {}

// ----------------------------------------------------------------------------- bootstrap

const init = async () => {
  debug('starting to initialize..')
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
  debug('number of formats that are both distinct and available: ' + state.formats.length)

  add_transcode_media_button()
}

if (window.Ytdl && window.Ytdl.YtdlCore && window.FFmpegWASM && window.fetchProgress) {
  init()
}

// -----------------------------------------------------------------------------
