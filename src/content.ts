import { dispatchEvent, sendMessageToBackgroundScript, getRecordOptions, getExportOptions } from './common'
import { RecordData } from 'timecatjs'
const isDev = process.env.NODE_ENV === 'development'
const timeCatScript = isDev
    ? 'http://localhost:4321/timecat.global.js'
    : chrome.runtime.getURL('timecat.global.prod.js')

let timeCatInjected = false

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { type } = request
    switch (type) {
        case 'START': {
            lazyInject().then(async () => {
                const options = await getRecordOptions()
                dispatchEvent('CHROME_RECORD_START', options)
                timeCatInjected = true
                sendResponse(timeCatInjected)
            })
            return true
        }
        case 'FINISH': {
            getExportOptions().then(options => {
                const records = request.records
                dispatchEvent('CHROME_RECORD_FINISH', {
                    records,
                    options: {
                        scripts: [
                            {
                                name: 'time-cat',
                                src: timeCatScript
                            }
                        ],
                        ...options
                    }
                })
            })
            break
        }
        case 'TAB_CHANGE': {
            dispatchEvent('CHROME_TAB_CHANGE')
            break
        }
        case 'COLLECT_RECORDS': {
            dispatchEvent('CHROME_RECORD_COLLECT')
            break
        }
    }
    sendResponse(null)
})

window.addEventListener('RECORD_COLLECT_TO_CONTENT', (e: CustomEvent) => {
    const { isFinal, records } = e.detail as { isFinal: boolean; records: RecordData[] }
    sendMessageToBackgroundScript({
        type: 'BACK_RECORDS',
        data: { isFinal, records }
    })
})


const injectMain = injectScriptOnce({
    name: 'time-cat',
    src: timeCatScript
})

const injectPageJS = injectScriptOnce({
    name: 'timecat-chrome-page',
    src: chrome.runtime.getURL('timecat-chrome-page.js')
})

function lazyInject(): Promise<void> {
    if (!window.document.getElementById('time-cat')) {
        return Promise.all([new Promise(injectMain), new Promise(injectPageJS)]).then(Promise.resolve.bind(Promise))
    } else {
        return Promise.resolve()
    }
}

function injectScriptOnce(scriptItem: { name: string; src: string }) {
    let el: HTMLScriptElement | null = null

    return function(callback?: () => void) {
        const { name, src } = scriptItem

        const document = window.document
        if (el && callback) {
            callback()
            return el
        }

        if (document.getElementById(name)) {
            return el
        }

        const script = document.createElement('script')
        script.onload = () => {
            callback && callback()
        }
        script.id = name
        script.src = src
        el = script
        document.head.insertBefore(script, document.head.firstChild)
    }
}
