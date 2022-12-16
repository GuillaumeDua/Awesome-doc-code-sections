// MIT License
//
// Copyright (c) 2021-2022 Guillaume Dua "Guss"
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// awesome-code-element
//
//  Brief:  Standalone HTML element to represents a code section. Executable, highlighted & dynamically modifiable
//          Lightweight, out-of-the-box, Compiler-Explorer integration in websites & documentations
//          Doxygen + doxygen-awesome-css + highlightjs == <3 (awesome-code-element)
//          Note that neither `Doxygen` nor `doxygen-awesome-css` are mandatory dependencies
//
// Code sections, with extra features :
//  - load content from
//      - JS constructor parameter
//      - HTML
//          - attribute `code` or `url` (for remote-located resource, such as <div class='code-section' url='https://some/remote/path/to/file.cpp'></div>)
//          - inner TextContent
//  - synthax-coloration provided by highlightjs,
//      - theme selector
//  - toggle dark/light theme
//  - buttons :
//      - send-to-godbolt
//      - copy-to-clipboard
//      - (doxygen-awesome-css compatibility) toggle light/dark mode

// ----------------------------------------------------------------------------------------------------------------------------

// TODO: Documentation
// TODO: compatibility with https://github.com/EnlighterJS/EnlighterJS instead of highlightjs
// TODO: compatibility with Marp
//
// TODO: test behavior without theme selector   (provide default behavior)
// TODO: not mandatory dependency to doxygen    (WIP)
// TODO: highlightjs makes clickable code elements not clickable anymore. Fix that ?
//          https://stackoverflow.com/questions/74114767/highlightjs-how-to-create-custom-clickable-sequence-of-characters
// TODO: hide warnings for undefined/fallback hljs language
// TODO: soft errors (replace HTMLElement content with red error message, rather than stopping the process)
// TODO: make Initialize_DivHTMLElements generic
// TODO: Global option: force fallback language to ... [smthg]
// TODO: per-codeSection CE configuration (local override global)
// TODO: toggle technical info/warning logs
// use ?? vs ||
// TODO: execution -> pre.code rather than a new CS (+copy-to-cpliboard button)
// TODO: buttons: bound to CS left-panel, not the element itself ?
// TODO: check encapsulation/visibility
// TODO: type = AwesomeCodeElement.details.${name} ?
// TODO: update error messages -> ${classname}.name ?
// TODO: named parameters
// TODO: static vs. const ?
// TODO: element name consistency ?
// TODO: alias awesome-code-element -> ace ?

// ----------------------------------------------------------------------------------------------------------------------------

if (typeof hljs === 'undefined')
    console.error('awesome-code-element.js: depends on highlightjs, which is missing')
if (typeof jQuery === 'undefined')
    console.error('awesome-code-element.js: depends on jQuery, which is missing')

export const AwesomeCodeElement = {
    API : {
        configuration : {
            CE : {}
        }
    },
    details : {}
}

// =======
// details.containers

AwesomeCodeElement.details.containers = {}
AwesomeCodeElement.details.containers.transformed_map = class extends Map {
// Similar to `Map`, with non-mandatory translation for key, mapped
// example: upper-case keys
// value = new transformed_map(
//     [ ['a', 42 ]],
//     {
//         key_translator: (key) => { return key.toUpperCase() }
//     }
// );

    key_translator      = undefined
    mapped_translator   = undefined

    constructor(values, { key_translator, mapped_translator }  = {}) {

        if (values)
            values = values.map((item) => {
                let [ key, mapped ] = item
                if (key_translator)
                    key = key_translator(key)
                if (mapped_translator)
                    mapped = mapped_translator(mapped)
                return [ key, mapped ]
            })
        super(values)

        this.key_translator     = key_translator
        this.mapped_translator  = mapped_translator
    }
    get(key) {
        if (this.key_translator)
            key = this.key_translator(key)
        return super.get(key)
    }
    set(key, mapped) {
        if (this.key_translator)
            key = this.key_translator(key)
        if (this.mapped_translator)
            mapped = this.mapped_translator(mapped)
        super.set(key, mapped)
        return this
    }
    has(key) {
        if (this.key_translator)
            key = this.key_translator(key)
        return super.has(key)
    }
}
AwesomeCodeElement.API.CE_ConfigurationManager = class extends AwesomeCodeElement.details.containers.transformed_map {
// similar to a Map, but use `hljs.getLanguage(key)` as a key translator
    constructor(values) {
        super(values, {
            key_translator: (key) => {
            // transform any language alias into a consistent name
                let language = hljs.getLanguage(key)
                if (!language)
                    console.warn(`ce_configuration: invalid language [${key}]`)
                return language ? language.name : undefined
            },
            mapped_translator : (mapped) => {
                if (!mapped || !mapped.compiler_id)
                    throw new Error(`ce_configuration: missing mandatory field '.compiler_id' in configuration ${mapped}`)
                return mapped
            }
        })
    }
    set(key, mapped) {
        if (this.has(key)) {
            let language = hljs.getLanguage(key)
            console.warn(`ce_configuration_manager: override existing configuration for language [${key}]. Translated name is [${language.name}], aliases are [${language.aliases}]`)
        }
        super.set(key, mapped)
    }
}
// key   : language (name or alias. ex: C++, cpp, cc, c++ are equivalent)
// value : {
//      language,       // not mandatory, if same as key. Refers to https://godbolt.org/api/languages
//      compiler_id,
//      default_options // not mandatory
// }

// =======
// API.configuration

AwesomeCodeElement.API.configuration = {
    CE                                  : new AwesomeCodeElement.API.CE_ConfigurationManager,
    hljs                                : {
        version : '11.6.0',
        theme   : 'tokyo-night',
        // TODO: dark or light (if not dark-mode)
    },
    doxygen_awesome_css_compatibility   : false,
    pre_code_compatibility              : false,
    auto_hide_buttons                   : false, // TODO: rename force_ or always_
    toggle_dark_mode                    : (typeof DoxygenAwesomeDarkModeToggle !== 'undefined') // true by default if doxygen-awesome-css_dark-mode is detected
}
AwesomeCodeElement.API.configure = (arg) => {
    if (!arg)
        throw new Error('AwesomeCodeElement.API.configuration.configure: invalid argument')
    AwesomeCodeElement.details.utility.unfold_into({
        target : AwesomeCodeElement.API.configuration,
        properties : arg
    })
}

// =======
// details

AwesomeCodeElement.details.ParsedCode = class ParsedCode {
// TODO: @awesome-code-element::keep : keep tag anyway as comment (for documentation purpose)

// @awesome-code-element::CE={
//  "language"            : "c++",
//  "compiler_id"         : "clang1400",
//  "compilation_options" : "-O2 -std=c++20",
//  "libs"                : [ {"id": "fmt", "version": "trunk"} ],
//  "includes_transformation" : [
//     // <documentation> <replacement>
//        [ "csl/",       "https://raw.githubusercontent.com/GuillaumeDua/CppShelf/main/includes/ag/csl/" ],
//        [ "toto",       "iostream" ]
//  ],
//  "add_in_doc_execution" : true
//  }
// @awesome-code-element::skip::block::begin,end : range to [skip] (no parsing, removed from documentation & execution)
// @awesome-code-element::skip::line             : line  to [skip]
// @awesome-code-element::show::block::begin,end : range to [show] (documentation side only. The rest is still part of the execution code)
//                                                      if there is at least one occurence, the rest is by default hidden
// @awesome-code-element::show::line             : line  to [show]
//                                                      if there is at least one occurence, the rest is by default hidden

    static tag = '// @awesome-code-element'

    raw = undefined
    to_display = undefined
    to_execute = undefined
    ce_options = undefined

    constructor(code_content, language) {

        // apply default configuration for given - non-mandatory - language
        if (AwesomeCodeElement.API.configuration.CE.has(language))
            this.ce_options = AwesomeCodeElement.API.configuration.CE.get(language)

        if (!code_content || code_content.length === 0)
            return // default construction

        this.raw = code_content

        this.#parse()
        this.#apply_ce_transformations()
    }

    #parse() {

        let code_content = this.raw

        // CE options
        let regexp = new RegExp(`^\\s*?${ParsedCode.tag}::CE=({(.*?\n\\s*//.*?)+}\n?)`, 'gm')
        let matches = [...this.raw.matchAll(regexp)] // expect exactly 1 match
        if (matches.length > 1)
            console.error(`awesome-code-element.js:ParsedCode::constructor: multiples CE configurations`)

        matches.map((match) => {
            let result = match[1].replaceAll(
                new RegExp(`^\\s*?//`, 'gm'),
                ''
            )
            // remove from original content
            code_content = code_content.slice(0, match.index)
                         + code_content.slice(match.index + match[0].length)
            return result
        }).forEach((value) => {
            // Merge CE configuration. Local can override global.
            this.ce_options = {
                ...(this.ce_options || {}),
                ...JSON.parse(value)
            }
        })

        // skip block, line (documentation & execution sides)
        // block
        code_content = code_content.replaceAll(
            new RegExp(`^\\s*?${ParsedCode.tag}::skip::block::begin\n(.*?\n)*\\s*?${ParsedCode.tag}::skip::block::end\\s*?$`, 'gm'),
            ''
        )
        // line
        code_content = code_content.replaceAll(
            new RegExp(`^.*?\\s+${ParsedCode.tag}::skip::line\\s*$`, 'gm'),
            ''
        )

        // show block, line (documentation side)
        let regex_show_block    = `(^\\s*?${ParsedCode.tag}::show::block::begin\n(?<block>(^.*?$\n)+)\\s*${ParsedCode.tag}::show::block::end\n?)`
        let regex_show_line     = `(^(?<line>.*?)\\s*${ParsedCode.tag}::show::line\\s*?$)`
        regexp = new RegExp(`${regex_show_block}|${regex_show_line}`, 'gm')
        matches = [...code_content.matchAll(regexp)]
        let code_only_show = matches
            .reverse()
            .map((match) => {
                let result = match.groups.block !== undefined
                    ? match.groups.block
                    : match.groups.line
                // remove from original content
                // code_content = code_content.replace(match[0], result) // really slower than 2 reverse + 2 substring ?
                code_content = code_content.substring(0, match.index) + result + code_content.substring(match.index + match[0].length)
                return result
            })
            .reverse()
            .join('\n')

        this.to_display = (code_only_show !== "" ? code_only_show : code_content)
        this.to_execute = code_content
    }
    #apply_ce_transformations() {

        // includes_transformation
        if (this.ce_options && this.ce_options.includes_transformation) {
            this.ce_options.includes_transformation.forEach((value) => {
                // replace includes

                const regex = new RegExp(`^(\\s*?\\#.*?[\\"|\\<"].*?)(${value[0]})(.*?[\\"|\\>"])`, 'gm')
                this.to_execute = this.to_execute.replace(regex, `$1${value[1]}$3`)
            })
        }
    }
}
AwesomeCodeElement.details.remote = {}
AwesomeCodeElement.details.remote.resources_cache = class {
    #remote_files = new Map() // uri -> text

    static async #fetch_remote_file(uri) {

        try {
            let response = await fetch(uri)
            return await response.text()
        }
        catch (error) {
            console.error(
                "awesome-code-element.js:remote_resources_cache: error\n" +
                "\t" + error
            )
        }
    }

    async get(uri) {
        if (! this.#remote_files.has(uri)) {
            this.#remote_files.set(
                uri,
                await AwesomeCodeElement.details.remote.resources_cache.#fetch_remote_file(uri)
            )
        }
        return this.#remote_files.get(uri)
    }
}
AwesomeCodeElement.details.remote.ce_API = class ce_API {
// fetch CE API informations asynchronously

    static #static_initializer = (async function(){
        ce_API.#fetch_languages()
        // AwesomeCodeElement.details.remote.ce_API.#fetch_compilers() // not used for now, disabled to save cache memory
    })()

    // cache
    static languages = undefined
    static compilers = undefined
    static #remote_files_cache = new AwesomeCodeElement.details.remote.resources_cache()

    static async #fetch_languages() {
    // https://godbolt.org/api/languages
        try {
            let response = await fetch('https://godbolt.org/api/languages')
            let datas = await response.text()

            let text = datas.split('\n')
            text.shift() // remove header
            ce_API.languages = text.map((value) => {
            // keep only ids
                return value.slice(0, value.indexOf(' '))
            })
        }
        catch (error) {
            console.error(`AwesomeCodeElement.details.remote.ce_API: godbolt API exception (fetch_languages)\n\t${error}`)
        }
    }
    static async #fetch_compilers() {
    // https://godbolt.org/api/compilers
        try {
            let response = await fetch('https://godbolt.org/api/compilers')
            let datas = await response.text()

            let text = datas.split('\n')
            text.shift() // remove header
            ce_API.languages = text.map((value) => {
            // keep only ids
                return value.slice(0, value.indexOf(' '))
            })
        }
        catch (error) {
            console.error(`AwesomeCodeElement.details.remote.ce_API: godbolt API exception (fetch_compilers)\n\t${error}`)
        }
    }
    static open_in_new_tab(request_data) {
    // https://godbolt.org/clientstate/

        let body  = JSON.stringify(request_data);
        let state = btoa(body); // base64 encoding
        let url   = "https://godbolt.org/clientstate/" + encodeURIComponent(state);

        // Open in a new tab
        window.open(url, "_blank");
    }
    static async fetch_execution_result(ce_options, code) {
    // https://godbolt.org/api/compiler/${compiler_id}/compile

        if (ce_options.compiler_id === undefined)
            throw new Error('awesome-code-element.js::ce_API::fetch_execution_result: invalid argument, missing .compiler_id')

        // POST /api/compiler/<compiler-id>/compile endpoint is not working with remote header-files in `#include`s PP directions
        // https://github.com/compiler-explorer/compiler-explorer/issues/4190
        let matches = [...code.matchAll(/^\s*\#\s*include\s+[\"|\<](\w+\:\/\/.*?)[\"|\>]/gm)].reverse()
        let promises_map = matches.map(async function(match) {

            let downloaded_file_content = await ce_API.#remote_files_cache.get(match[1])
            let match_0_token = match[0].replaceAll('\n', '')
            code = code.replace(match[0], `// download[${match_0_token}]::begin\n${downloaded_file_content}\n// download[${match_0_token}]::end`)
        })

        // Build & send the request
        let fetch_result = async () => {

            let body = {
                "source": code,
                "compiler": ce_options.compiler_id,
                "options": {
                    "userArguments": ce_options.compilation_options,
                    "executeParameters": {
                        "args": ce_options.execute_parameters_args || [],
                        "stdin": ce_options.execute_parameters_stdin || ""
                    },
                    "compilerOptions": {
                        "executorRequest": true
                    },
                    "filters": {
                        "execute": true
                    },
                    "tools": [],
                    "libraries": ce_options.libs || []
                },
                "lang": ce_options.language,
                "allowStoreCodeDebug": true
            }
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=utf-8'
                },
                body: JSON.stringify(body)
            };

            return await fetch(`https://godbolt.org/api/compiler/${ce_options.compiler_id}/compile`, options)
                .then(response => response.text())
        }

        return await Promise.all(promises_map).then(() => {
            return fetch_result()
        })
    }
}
AwesomeCodeElement.details.utility = class {
    static unfold_into({target, properties = {}}) {
        if (!target)
            throw new Error('AwesomeCodeElement.details.utility: invalid argument [target]')
        for (const property in properties)
            target[property] = properties[property];
    }
    static apply_css(element, properties) {
        AwesomeCodeElement.details.utility.unfold_into({target : element.style, properties })
    }
    static create_shadowroot_slot(element, when_childrens_attached) {

        if (!element.shadowRoot)
            element.attachShadow({ mode: 'open' });
        element.shadowRoot.innerHTML = `<slot></slot>`;
        const slot = element.shadowRoot.querySelector('slot');
    
        let callback = (event) => {
            const childrens = event.target.assignedElements();
            when_childrens_attached(childrens)
        }
        slot.addEventListener('slotchange', callback, { once: true });
        return { // accessor
            remove: () => {
                slot.removeEventListener('slotchange', callback);
                element.shadowRoot.innerHTML = ""
                element.outerHTML = element.outerHTML
            }
        }
    }
    static remove_shadowroot(element) {

        element.shadowRoot.innerHTML = ""
        element.outerHTML = element.outerHTML
    }
    static remove_all_childrens(element) {
        while (element.firstChild)
            element.removeChild(element.lastChild)
    }
    static is_scrolling(element) {
        return {
            horizontally    : element.scrollWidth  > element.clientWidth,
            vertically      : element.scrollHeight > element.clientHeight
        }
    }
    static get_url_extension(url) {
        try {
            return url.split(/[#?]/)[0].split('.').pop().trim();
        }
        catch (error) {
            return undefined
        }
    }
    static fetch_resource(url, { on_error, on_success }) {

        let xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.onerror = function() {
                on_error(`RemoteCodeSection: network Error`)
            };
            xhr.onload = function() {

                if (xhr.status != 200) {
                    on_error(`RemoteCodeSection: bad request status ${xhr.status}`)
                    return;
                }
                on_success(xhr.responseText)
            };
            xhr.send();
    }
    static make_incremental_counter_generator = function*(){
        let i = 0;
        while (true) { yield i++; }
    }
}
AwesomeCodeElement.details.log_facility = class {
    
    static #default_channels = {
        debug:  console.debug,
        error:  console.error,
        info:   console.info,
        log:    console.log,
        trace:  console.trace,
        warn:   console.warn
    }
    static #empty_function = (() => {
        let value = function(){}
            value.is_explicitly_empty = true
        return value
    })()

    static is_enabled(name) {
        return Boolean(console[name])
    }
    static enable(name) {
        if (name instanceof Array) {
            name.forEach(value => log_facility.enable(value))
            return
        }
        console[name] = AwesomeCodeElement.details.log_facility.#default_channels[name]
    }
    static disable(name) {
        if (name instanceof Array) {
            name.forEach(value => AwesomeCodeElement.details.log_facility.disable(value))
            return
        }
        console[name] = AwesomeCodeElement.details.log_facility.#empty_function
    }

    static get enabled() {
        return Object.entries(AwesomeCodeElement.details.log_facility.#default_channels)
            .map(element => element[0]).filter(
                element => !Boolean(console[element].is_explicitly_empty)
            ) 
    }
    static get disabled() {
        return Object.entries(AwesomeCodeElement.details.log_facility.#default_channels)
            .map(element => element[0]).filter(
                element => Boolean(console[element].is_explicitly_empty)
            ) 
    }
}

{   // development settings
    if (location.hostname !== 'localhost')
        AwesomeCodeElement.details.log_facility.disable(['log', 'debug', 'trace'])
    console.info(`AwesomeCodeElement.details.log_facility: channels enabled: [${AwesomeCodeElement.details.log_facility.enabled}], disabled: [${AwesomeCodeElement.details.log_facility.disabled}]`)
}
// ============
// HTMLElements

AwesomeCodeElement.details.HTMLElements = {}
// TODO: should be replaced by dynamic CSS at some point
AwesomeCodeElement.details.HTMLElements.resize_observer = new ResizeObserver(entries => {

    for (let entry of entries) {
        entry.target.on_resize()
    }
});

AwesomeCodeElement.details.HTMLElements.CopyToClipboardButton = class CopyToClipboardButton extends HTMLButtonElement {
// Copy text context of this previousSibling HTMLelement

    static HTMLElement_name = 'awesome-code-element_el_copy-to-clipboard-button'
    static title            = "Copy to clipboard"
    static copyIcon         = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`
    static successIcon      = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`
    static successDuration  = 980

    constructor() {
        super();
        this.setAttribute('is', CopyToClipboardButton.HTMLElement_name)

        this.title = CopyToClipboardButton.title
        this.innerHTML = CopyToClipboardButton.copyIcon

        AwesomeCodeElement.details.utility.apply_css(this, {
            zIndex      : 2,
            position    : 'absolute',
            top         : '5px',
            right       : '5px',
        })

        this.addEventListener('click', function(){

            this.innerHTML = CopyToClipboardButton.successIcon
            this.style.fill = 'green'

            let text = this.previousSibling.textContent
            navigator.clipboard.writeText(text).then(
                function() {
                    console.info('awesome-code-element.js:CopyToClipboardButton: success');
                },
                function(error) {
                    console.error(`awesome-code-element.js:CopyToClipboardButton: failed: ${error}`);
                }
            );
            window.setTimeout(() => {
                this.style.fill = 'black'
                this.innerHTML = CopyToClipboardButton.copyIcon
            }, CopyToClipboardButton.successDuration);
        })
    }
}
customElements.define(
    AwesomeCodeElement.details.HTMLElements.CopyToClipboardButton.HTMLElement_name,
    AwesomeCodeElement.details.HTMLElements.CopyToClipboardButton, {extends: 'button'}
);
AwesomeCodeElement.details.HTMLElements.SendToGodboltButton = class SendToGodboltButton extends HTMLButtonElement {

    static HTMLElement_name = 'awesome-code-element_el_send-to-godbolt-button'
    static title            = 'Try this on godbolt.org (compiler-explorer)'
    static icon             = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32"><switch><g><path d="M58.6 46.5c-.3-.5-.3-1.2 0-1.7.3-.6.7-1.3 1-2 .2-.5-.1-1-.7-1h-5.8c-.6 0-1.2.3-1.4.8-.7 1.1-1.6 2.2-2.6 3.2-3.7 3.7-8.6 5.7-13.9 5.7-5.3 0-10.2-2-13.9-5.7-3.8-3.7-5.8-8.6-5.8-13.9s2-10.2 5.8-13.9c3.7-3.7 8.6-5.7 13.9-5.7 5.3 0 10.2 2 13.9 5.7 1 1 1.9 2.1 2.6 3.2.3.5.9.8 1.4.8h5.8c.5 0 .9-.5.7-1-.3-.7-.6-1.3-1-2-.3-.5-.3-1.2 0-1.7l1.9-3.5c.4-.7.3-1.5-.3-2.1l-4.9-4.9c-.6-.6-1.4-.7-2.1-.3l-3.6 2c-.5.3-1.2.3-1.7 0-1.7-.9-3.5-1.7-5.4-2.2-.6-.2-1-.6-1.2-1.2l-1.1-3.9C40.1.5 39.5 0 38.7 0h-6.9C31 0 30.2.5 30 1.3l-1.1 3.9c-.2.6-.6 1-1.2 1.2-1.9.6-3.6 1.3-5.3 2.2-.5.3-1.2.3-1.7 0l-3.6-2c-.7-.4-1.5-.3-2.1.3l-4.9 4.9c-.6.6-.7 1.4-.3 2.1l2 3.6c.3.5.3 1.2 0 1.7-.9 1.7-1.7 3.5-2.2 5.3-.2.6-.6 1-1.2 1.2l-3.9 1.1c-.7.2-1.3.9-1.3 1.7v6.9c0 .8.5 1.5 1.3 1.7l3.9 1.1c.6.2 1 .6 1.2 1.2.5 1.9 1.3 3.6 2.2 5.3.3.6.3 1.2 0 1.7l-2 3.6c-.4.7-.3 1.5.3 2.1L15 57c.6.6 1.4.7 2.1.3l3.6-2c.6-.3 1.2-.3 1.7 0 1.7.9 3.5 1.7 5.3 2.2.6.2 1 .6 1.2 1.2l1.1 3.9c.2.7.9 1.3 1.7 1.3h6.9c.8 0 1.5-.5 1.7-1.3l1.1-3.9c.2-.6.6-1 1.2-1.2 1.9-.6 3.6-1.3 5.4-2.2.5-.3 1.2-.3 1.7 0l3.6 2c.7.4 1.5.3 2.1-.3l4.9-4.9c.6-.6.7-1.4.3-2.1l-2-3.5z" fill="#67c52a"/><path d="M23.5 37.7v4.4h23.8v-4.4H23.5zm0-7.8v4.4h19.6v-4.4H23.5zm0-7.9v4.4h23.8V22H23.5z" fill="#3c3c3f"/></g></switch></svg>`;
    static successIcon      = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`

    constructor() {

        super();
        this.setAttribute('is', SendToGodboltButton.HTMLElement_name)

        this.title = SendToGodboltButton.title;
        this.innerHTML = SendToGodboltButton.icon;

        AwesomeCodeElement.details.utility.apply_css(this, {
            zIndex      : 2,
            position    : 'absolute',
            top         : '5px',
            right       : '55px',
        })

        this.addEventListener(
            'click',
            () => {
                this.innerHTML = SendToGodboltButton.successIcon
                this.style.fill = 'green'

                this.onClickSend()

                window.setTimeout(() => {
                    this.innerHTML = SendToGodboltButton.icon
                    this.style.fill = 'black'
                }, 1000);
            }
        );
    }

    static #make_user_options_accessor(codeSectionElement) {
        return (() => {
            return {
                configuration : function() {

                    let configuration = AwesomeCodeElement.API.configuration.CE.get(codeSectionElement.language)
                    if (configuration === undefined)
                        throw new Error(`awesome-code-element.js:SendToGodboltButton::onClickSend: missing configuration for language [${codeSectionElement.language}]`)
                    return configuration
                },
                ce_options : function() {
                    return codeSectionElement.ce_options || this.configuration()
                },
                language : function() {
                // translate hljs into CE language
                //      hljs    https://github.com/highlightjs/highlight.js/blob/main/SUPPORTED_LANGUAGES.md
                //  vs. CE      https://godbolt.org/api/languages
                    return AwesomeCodeElement.details.remote.ce_API.languages.includes(this.ce_options().language)
                        ? this.ce_options().language
                        : this.configuration().language
                },
                code : function() {
                    let result = codeSectionElement.ce_code || codeSectionElement.code
                    if (result === undefined)
                        throw new Error(`awesome-code-element.js:SendToGodboltButton::onClickSend: missing code`)
                    return result
                }
            }
        })()
    }

    onClickSend() {
        let codeSectionElement = this.parentElement.parentElement

        if (codeSectionElement === undefined
        ||  codeSectionElement.tagName.match(`\w+${CodeSection.HTMLElement_name.toUpperCase()}`) === '')
            throw new Error('awesome-code-element.js: SendToGodboltButton.onClickSend: ill-formed element: unexpected parent.parent element (must be a CodeSection)')
        console.info('awesome-code-element.js: SendToGodboltButton.onClickSend: sending request ...')

        let accessor = SendToGodboltButton.#make_user_options_accessor(codeSectionElement)

        // build request as JSon
        let data = {
            "sessions": [{
                "id": 1,
                "language": accessor.language(),
                "source": accessor.code(),
                "compilers":  [
                    {
                        "id": accessor.ce_options().compiler_id || accessor.configuration().compiler_id,
                        "libs": accessor.ce_options().libs || [ ],
                        "options": accessor.ce_options().compilation_options || accessor.configuration().default_options
                    }
                ],
                "executors": [{
                    "compiler":
                    {
                        "id": accessor.ce_options().compiler_id || accessor.configuration().compiler_id,
                        "libs": accessor.ce_options().libs || [ ],
                        "options": accessor.ce_options().compilation_options || accessor.configuration().default_options
                    }
                    // TODO: exec
                }]
            }]
        };
        // CE /clientstate API
        AwesomeCodeElement.details.remote.ce_API.open_in_new_tab(data)
    }
}
customElements.define(
    AwesomeCodeElement.details.HTMLElements.SendToGodboltButton.HTMLElement_name,
    AwesomeCodeElement.details.HTMLElements.SendToGodboltButton, {extends: 'button'}
);
AwesomeCodeElement.details.HTMLElements.LoadingAnimation = class LoadingAnimation {
    
    static #cache = (function(){
    // TODO: loading_animation.* as opt-in, inline (raw github data) as fallback
        const loading_animation_fallback_url = 'https://raw.githubusercontent.com/GuillaumeDua/awesome-code-element/main/resources/images/loading_animation.svg'
        let value = document.createElement('img');
        value.src = loading_animation_fallback_url
        AwesomeCodeElement.details.utility.apply_css(value, {
            contain             : 'strict',
            border              : '1px solid var(--primary-color)',
            borderRadius        : '5px',
            width               : '100%',
            height              : '100%',
            boxSizing           : 'border-box',
            display             : 'none' // hidden by default
        })
        return value
    })()
    static get element() {
        return LoadingAnimation.#cache.cloneNode()
    }

    static inject_into({owner, target_or_accessor }) {
        LoadingAnimation.#inject_toggle_loading_animation({owner, target_or_accessor })
        LoadingAnimation.#inject_animate_loading_while({owner})
    }

    static #inject_toggle_loading_animation({
        owner,              // injects `owner.toggle_loading_animation`
        target_or_accessor  // target, or a parameterless function that returns the target (preserving access after potential dereferencement)
    }){
        const loading_animation_element = owner.appendChild(LoadingAnimation.element)
        const target_accessor = () => {
            return target_or_accessor instanceof Function
                ? target_or_accessor()
                : target_or_accessor
        }
        const target_visible_display = target_accessor().style.display || 'flex'

        Object.defineProperty(owner, 'toggle_loading_animation', {
            set: function(value){
                target_accessor().style.display         = Boolean(value) ? 'none' : target_visible_display
                loading_animation_element.style.display = Boolean(value) ? 'flex' : 'none'
            },
            get: function(){
                return Boolean(loading_animation_element.style.display !== 'none')
            }
        })
    }
    static async #inject_animate_loading_while({owner}){
    // injects `owner.animate_loading_while`
        owner.animate_loading_while = (task) => {
            owner.toggle_loading_animation = true
            let task_result = undefined
            try {
                task_result = task()
            }
            catch (error){
                owner.toggle_loading_animation = false
                throw (error instanceof Error ? error : new Error(error))
            }
            if (task_result instanceof Promise)
                return task_result.then(() => {
                    owner.toggle_loading_animation = false
                })
            owner.toggle_loading_animation = false
        }
    }
}

// TODO: flex-resizer between the two panels ?
AwesomeCodeElement.details.HTMLElements.CodeSectionHTMLElement = class CodeSectionHTMLElement extends HTMLElement {
// HTML layout/barebone for CodeSection

    static #id_generator = (() => {
        let counter = AwesomeCodeElement.details.utility.make_incremental_counter_generator()
        return () => { return `cs_${counter.next().value}` }
    })()

    #_parameters = { // temporary storage for possibly constructor-provided arguments
        style:{}
    }

    // HTMLElement
    constructor(parameters) {
        super();
        AwesomeCodeElement.details.utility.unfold_into({
            target: this.#_parameters,
            properties: parameters || {}
        })
    }

    connectedCallback() {
        console.debug('CodeSectionHTMLElement: connectedCallback')
        try {
            if (!this.acquire_parameters(this.#_parameters)) {
                console.debug('CodeSectionHTMLElement: create shadowroot slot')
                let _this = this
                this.shadowroot_accessor = AwesomeCodeElement.details.utility.create_shadowroot_slot(
                    this,
                    function(){ _this.#shadow_root_callback() }
                )
            }
            else {
                console.debug('CodeSectionHTMLElement: no need for shadowroot slot')
                this.initialize()
            }
        }
        catch (error) {
            console.error(`${error}`)
            this.on_critical_internal_error(error)
        }
    }
    disconnectedCallback() {
        AwesomeCodeElement.details.HTMLElements.resize_observer.unobserve(this)
    }
    #shadow_root_callback() {
    // defered initialization
        let _this = this
        let error = (function(){
            try {
                return _this.acquire_parameters(_this.#_parameters)
                    ? undefined
                    : 'acquire_parameters failed with no detailed informations'
            }
            catch (error) {
                return error
            }
        })()

        this.shadowroot_accessor.remove()
        if (error) {
            console.error(_this)
            _this.on_critical_internal_error(error)
        }
    }

    // accessors
    #allowed_directions = [ 'row', 'column' ]
    set direction(value) {
        this.style.flexDirection = this.#allowed_directions.includes(value) ? value : this.#allowed_directions[0]
    }
    get direction() {
        return this.style.flexDirection || this.#allowed_directions[0]
    }

    // html layout
    html_elements = {
        panels: {
            left: undefined,
            right: undefined
        },
        code: undefined,
        execution: undefined,
        buttons: {
            CE: undefined,
            copy_to_clipboard: undefined
        }
    }
    #initialize_HTML() {

        if (!this.isConnected)
            throw new Error('CodeSectionHTMLElement:#initialize_HTML: not connected yet')

        this.innerHTML = ""
        // this element
        AwesomeCodeElement.details.utility.apply_css(this, {
            display         : 'flex',
            flexDirection   : this.direction,
            alignItems      : 'stretch',
            boxSizing       : 'border-box',
            width           : '100%',
            minHeight       : '50px'
        })

        // left panel : code content
        const {
            panel: left_panel,
            elements: left_panel_elements
        } = this.#make_HTML_left_panel()

        this.html_elements.panels.left      = left_panel
        this.html_elements.code             = left_panel_elements.code
        this.html_elements.buttons          = left_panel_elements.buttons
        AwesomeCodeElement.details.HTMLElements.LoadingAnimation.inject_into({
            owner:  this.html_elements.panels.left,
            target_or_accessor: this.html_elements.code
        })
        
        this.html_elements.panels.left  = this.appendChild(this.html_elements.panels.left)
        AwesomeCodeElement.details.HTMLElements.resize_observer.observe(this)

        // right panel : execution
        const { 
            panel: right_panel,
            elements: right_panel_elements
        } = this.#make_HTML_right_panel()

        this.html_elements.panels.right      = right_panel
        this.html_elements.execution         = right_panel_elements.execution
        AwesomeCodeElement.details.HTMLElements.LoadingAnimation.inject_into({
            owner:  this.html_elements.panels.right,
            target_or_accessor: () => { return this.html_elements.execution }
        })
        this.html_elements.panels.right      = this.appendChild(this.html_elements.panels.right)

        // panels : style (auto-resize, scroll-bar, etc.)
        let set_panel_style = (panel) => {
            AwesomeCodeElement.details.utility.apply_css(panel, {
                flex:       '1 1 min-content',
                overflow:   'auto',
                position:   'relative',
                top:        0,
                left:       0,
                width:      '100%',
                margin:     0
            })
        }
        set_panel_style(this.html_elements.panels.left)
        set_panel_style(this.html_elements.panels.right)

        this.#initialize_ids()
    }
    #make_HTML_left_panel() {
        let left_panel = document.createElement('pre');
            left_panel.name
            left_panel.style.overflow = 'auto'

        let code_element = document.createElement('code');
        AwesomeCodeElement.details.utility.apply_css(code_element, {
            width:      'auto',
            height:     '100%',
            boxSizing:  'border-box',
            display:    'block'
        })
        code_element = left_panel.appendChild(code_element)

        // buttons : copy-to-clipboard
        let copy_button = new AwesomeCodeElement.details.HTMLElements.CopyToClipboardButton()
            copy_button.style.zIndex = left_panel.style.zIndex + 1
            copy_button = left_panel.appendChild(copy_button)

        let CE_button = new AwesomeCodeElement.details.HTMLElements.SendToGodboltButton
        AwesomeCodeElement.details.utility.apply_css(CE_button, {
            zIndex : left_panel.style.zIndex + 1,
            display : 'none' // hidden by default
        })
        CE_button = left_panel.appendChild(CE_button)

        return { 
            panel: left_panel,
            elements: {
                code : code_element,
                buttons : {
                    CE: CE_button,
                    copy_to_clipboard: copy_button
                }
            }
        }
    }
    #make_HTML_right_panel() {
        // right panel: execution
        let right_panel = document.createElement('pre')
            AwesomeCodeElement.details.utility.apply_css(right_panel, {
                display:    'none',
                alignItems: 'stretch',
                boxSizing:  'border-box'
            })
        let execution_element = document.createElement('code')
            AwesomeCodeElement.details.utility.apply_css(execution_element, {
                //display:    'flex', 'flex-direction' : 'column',
                display:    'block',
                width:      '100%',
                overflow:   'auto',
                margin:     'inherit',
                overflow:   'auto',
                borderRadius:'5px'
            })
            execution_element = right_panel.appendChild(execution_element)
        return { 
            panel: right_panel,
            elements: {
                execution: execution_element
            }
        }
    }
    #initialize_ids() {
        this.id = CodeSectionHTMLElement.#id_generator()
        this.html_elements.panels.left.id   = `${this.id}.panels.left`
        this.html_elements.panels.right.id  = `${this.id}.panels.right`
        this.html_elements.code.id          = `${this.id}.code`
        this.html_elements.execution.id     = `${this.id}.execution` // TODO: as such element is a placeholder which is then replaced, consider another specific id annotation ?
        this.html_elements.buttons.CE.id    = `${this.id}.buttons.CE`
        this.html_elements.buttons.copy_to_clipboard.id = `${this.id}.buttons.copy_to_clipboard`
    }

    // html-related events
    on_resize() {
        let auto_hide_elements = (container, elements) => {

            elements.forEach((element) => element.style.display = 'none')
            container.onmouseover   = () => { elements.forEach((element) => { element.style.display = 'block' }) }
            container.onmouseout    = () => { elements.forEach((element) => element.style.display = 'none') }
        }
        let no_auto_hide_elements = (container, elements) => {

            elements.forEach((element) => { element.style.display = 'block' })
            container.onmouseout = null
            container.onmouseover = null
        }

        // cheaper than a proper AABB to check if code's content overlap with other elements
        let functor = (
                AwesomeCodeElement.API.configuration.auto_hide_buttons
            ||  AwesomeCodeElement.details.utility.is_scrolling(this.html_elements.code).horizontally
        )   ? auto_hide_elements
            : no_auto_hide_elements

        // let elements = $(this).find('button[is^=awesome-code-element_el_]')
        functor(this, [ this.html_elements.buttons.CE, this.html_elements.buttons.copy_to_clipboard ])
    }

    // initialization
    acquire_parameters(parameters) {
        this.#_parameters.style.direction = this.#_parameters.style.direction || this.getAttribute('direction') || this.style.flexDirection
        return true
    }
    initialize() {
        this.direction = this.#_parameters.style.direction
        this.#initialize_HTML()
    }
    
    static get_hljs_language(code_tag) {
        if (code_tag === undefined || code_tag.tagName !== 'CODE')
            throw new Error(`awesome-code-element.js:CodeSectionHTMLElement.get_code_hljs_language: bad input`)

        let result = code_tag.classList.toString().match(/language-(\w+)/, '')
        return result ? result[1] : undefined // first capture group
    }

    on_critical_internal_error(error = "") {

        console.error(`awesome-code-element.js:CodeSectionHTMLElement.on_critical_internal_error : fallback rendering\n\t${error}`)

        if (!this.isConnected)
            return

        let error_element = document.createElement('pre')
            error_element.textContent = error || `awesome-code-element:CodeSectionHTMLElement: unknown error`
        AwesomeCodeElement.details.utility.apply_css(error_element, {
            color: "red",
            border : "2px solid red"
        })
        this.innerHTML = ""
        // this.childNodes.forEach((child) => { child.style.display = 'none' })
        this.replaceWith(error_element)
    }
}

AwesomeCodeElement.API.HTMLElements = {}
// TODO: code loading policy/behavior - as function : default is textContent, but can be remote using an url, or another rich text area for instance
AwesomeCodeElement.API.HTMLElements.CodeSection = class CodeSection extends AwesomeCodeElement.details.HTMLElements.CodeSectionHTMLElement {

    // --------------------------------
    // accessors
    get code() {
        return this.#_toggle_parsing
            ? this.#_code.to_display
            : this.#_code.raw
    }
    set code(value) {

        if (value instanceof AwesomeCodeElement.details.ParsedCode)
            this.#_code = value
        else if (typeof value === 'string')
            this.#_code = new AwesomeCodeElement.details.ParsedCode(value, this.language)
        else throw new Error('SimpleCodeSection: set code: invalid input argument type')

        this.#view_update_code()
    }
    #view_update_code() {
        this.#error_view = false // clear possibly existing errors
        // update view
        this.html_elements.code.textContent = this.code || ""
        // update view syle
        this.#view_update_language()
        // trigger (refresh) execution panel if required
        this.toggle_execution = this.toggle_execution
    }
    
    #_language = undefined
    toggle_language_detection = true
    get #is_valid_language() {
        return hljs.getLanguage(this.#_language) !== undefined
    }
    get language() {

        if (this.#is_valid_language)
            return this.#_language
        if (this.html_elements.code) {
            console.info('CodeSection:language : invalid language, attempting a detection as fallback')
            let detected_language = AwesomeCodeElement.details.HTMLElements.CodeSectionHTMLElement.get_hljs_language(this.html_elements.code)
            return detected_language === 'undefined' ? undefined : detected_language
        }
        return undefined
    }
    set language(arg) {

        let value       = (typeof arg === "object" ? arg.value : arg)
        let update_view = (typeof arg === "object" ? arg.update_view : true)

        console.info(`CodeSection: set language to [${value}]`)

        this.#_language = (value || '').replace('language-', '')
        this.setAttribute('language', this.#_language)
        this.#_code.ce_options = AwesomeCodeElement.API.configuration.CE.get(this.#_language)

        if (!update_view)
            return

        this.toggle_language_detection = !this.#is_valid_language

        this.#view_update_language()
    }
    #view_update_language_hljs_highlightAuto() {
    // can specify user-provided language
        let hljs_result = (() => {
            if (this.toggle_language_detection)
                return hljs.highlightAuto(this.html_elements.code.textContent)
            else
                return hljs.highlightAuto(this.html_elements.code.textContent, [ this.#_language ])
        })()

        if (hljs_result.language === undefined && hljs_result.secondBest)
            hljs_result = hljs_result.secondBest

        return hljs_result
    }
    #view_update_language_hljs_highlightElement() {
    // fallback, cannot provide language as a parameter
        hljs.highlightElement(this.html_elements.code)
        return {
            language: AwesomeCodeElement.details.HTMLElements.CodeSectionHTMLElement.get_hljs_language(this.html_elements.code),
            relevance: 10 // max
        }
    }
    #view_update_language(){
        
        let hljs_result = this.#view_update_language_hljs_highlightAuto()
        if (!hljs_result.language || hljs_result.relevance < 3)
            hljs_result = this.#view_update_language_hljs_highlightElement()
        else
            this.html_elements.code.innerHTML = hljs_result.value

        if (hljs_result.relevance < 5)
            console.warn(`CodeSection: ${hljs_result.relevance === 0 ? 'no' : 'poor'} language matching [${hljs_result.language}] (${hljs_result.relevance}/10). Maybe the code is too small ?`)

        // retro-action: update language with view (hljs) detected one
        if (this.toggle_language_detection) {
            this.language = {
                value: hljs_result.language,
                update_view: false // no recursion here
            }
        }

        // update classList
        // clear existing hljs-related classList items
        this.html_elements.code.classList = [...this.html_elements.code.classList].filter(element => !element.startsWith('language-') && element !== 'hljs')
        this.html_elements.code.classList.add(`hljs`)
        this.html_elements.code.classList.add(`language-${this.#_language}`)

        // CE button visibility
        // Note that resize observer can still toggle `display: block|none`
        this.html_elements.buttons.CE.style.visibility = Boolean(this.#is_valid_language && AwesomeCodeElement.API.configuration.CE.has(this.#_language))
            ? 'visible'
            : 'hidden'

        // trigger (refresh) execution panel if required
        this.toggle_execution = this.toggle_execution
    }

    // --------------------------------
    // construction/initialization
    constructor(parameters) {
        super(parameters)
    }
    #_parameters = {}
    acquire_parameters(parameters) {

        super.acquire_parameters(parameters)

        if (parameters) {
            this.#_parameters = { 
                ...this.#_parameters,
                ...parameters
            }
        }

        let maybe_use_attribute = (property_name) => {
            this.#_parameters[property_name] = this.#_parameters[property_name] || this.getAttribute(property_name) || undefined
        }
        maybe_use_attribute('language')
        maybe_use_attribute('toggle_parsing')
        maybe_use_attribute('toggle_execution')

        // try to acquire local code
        this.#_parameters.code = this.#_parameters.code || this.textContent || this.getAttribute('code') || ''
        // otherwise, remote
        this.#_parameters.url = this.#_parameters.url || this.getAttribute('url') || ''

        // TODO: load attributes as function, that can possibly override non-existing parameters

        // post-condition: valid code content
        let is_valid = (this.#_parameters.code || this.#_parameters.url)
        if (is_valid)
            this.acquire_parameters = () => { throw new Error('CodeSection.acquire_parameters: already called') }
        return is_valid
    }
    initialize() {
        super.initialize()

        console.debug(`CodeSection: initializing with parameters [${JSON.stringify(this.#_parameters, null, 3)}]` )

        // defered initialiation
        this.#_language                  = this.#_parameters.language
        this.toggle_language_detection  = !this.#is_valid_language

        if (this.#_parameters.url)  // remote code
            this.url = this.#_parameters.url
        else                        // local code
            this.#_code = new AwesomeCodeElement.details.ParsedCode(this.#_parameters.code, this.language)  // only update code, not its view

        this.toggle_parsing             = this.#_parameters.toggle_parsing      // will update the code view
        this.toggle_execution           = this.#_parameters.toggle_execution

        this.initialize = () => { throw new Error('CodeSection.initialize: already called') }
    }

    // --------------------------------
    // core logic : parsing
    #_code = new AwesomeCodeElement.details.ParsedCode()
    #_toggle_parsing = false
    set toggle_parsing(value) {

        if (this.#_toggle_parsing == value)
            return

        this.#_toggle_parsing = value
        if (!this.#_toggle_parsing) {
            this.#view_update_code()
            return
        }

        try             { this.code = new AwesomeCodeElement.details.ParsedCode(this.#_code.raw, this.#_language) } // code setter will updates the view
        catch (error)   { this.on_critical_internal_error(error); return }
    }
    get toggle_parsing() {
        return this.#_toggle_parsing
    }

    // --------------------------------
    // core logic : execution
    get ce_options() {
        return this.#_code.ce_options
    }
    get ce_code() {
        return this.#_code.to_execute || this.code
    }
    get is_executable() {
        return Boolean(this.#_code.ce_options)
    }
    get executable_code() {
        if (!this.is_executable)
            throw new Error('CodeSection:get executable_code: not executable.')
        return this.toggle_parsing ? this.#_code.to_execute : this.#_code.raw
    }

    #_toggle_execution = false
    set toggle_execution(value) {

        this.#_toggle_execution = value

        if (this.#_toggle_execution) {
            this.html_elements.panels.right.style.display = 'flex'
            try {
                this.html_elements.panels.right.animate_loading_while(this.#fetch_execution.bind(this))
            }
            catch(error) {
                console.error(error)
            }
        }
        else {
            this.html_elements.panels.right.style.display = 'none'
        }
    }
    get toggle_execution() {
        return this.#_toggle_execution
    }
    #fetch_execution() {

        let set_execution_content = ({ is_fetch_success, content: { value, return_code } }) => {

            if (!is_fetch_success) {
                this.html_elements.execution.textContent = value
                this.html_elements.execution.title = '[error] execution failed'
                AwesomeCodeElement.details.utility.apply_css(this.html_elements.execution, {
                    border: '2px solid red',
                    color:  'red'
                })
                return
            }

            this.html_elements.execution.title = 'Compilation provided by Compiler Explorer at https://godbolt.org/'
            // force hljs bash language
            this.html_elements.execution.innerHTML = hljs.highlightAuto(value, [ 'bash' ]).value
            this.html_elements.execution.classList = [...this.html_elements.code.classList].filter(element => !element.startsWith('language-') && element !== 'hljs')
            this.html_elements.execution.classList.add(`hljs`)
            this.html_elements.execution.classList.add(`language-bash`)
            // automated hljs language
            //  this.html_elements.execution.textContent = result.value
            //  hljs.highlightElement(this.html_elements.execution)
            
            AwesomeCodeElement.details.utility.apply_css(this.html_elements.execution, {
                border: '',
                borderTop : '2px solid ' + (return_code == -1 ? 'red' : 'green'),
                color: ''
            })
        }

        if (!this.is_executable) {

            let error = `CodeSection:fetch_execution: not executable. No known valid configuration for language [${this.language}]`
            set_execution_content({
                is_fetch_success : false,
                content : {
                    return_code: -1,
                    value: error
                }
            })
            throw new Error(error)
        }

        // right panel: replace with result
        return AwesomeCodeElement.details.remote.ce_API.fetch_execution_result(this.#_code.ce_options, this.executable_code)
            .catch((error) => {
                this.on_critical_internal_error(`CodeSection:fetch_execution: ce_API.fetch_execution_result: failed:\n\t[${error}]`)
            })
            .then((result) => {

                // CE header: parse & remove
                let regex = new RegExp('# Compilation provided by Compiler Explorer at https://godbolt.org/\n\n(# Compiler exited with result code (-?\\d+))')
                let regex_result = regex.exec(result)

                if (regex_result === null || regex_result.length != 3)
                    return {
                        value : result,
                        error : 'unknown',
                        return_code : -1
                    }
                else
                    return {
                        value : result.substring(regex_result[0].length - regex_result[1].length), // trim off header
                        error : undefined,
                        return_code : regex_result[2]
                    }
            })
            .then((result) => {
                set_execution_content({ is_fetch_success : true, content : result })
            })
    }

    // core logic: acquire code policies
    #_url = undefined
    get url() {
        return this.#_url
    }
    set url(value) {
    // TODO: Cancel or wait for pending resource acquisition
    //  issue: if `url` is set twice (in a short period of time), we have a race condition
        this.html_elements.panels.left.toggle_loading_animation = true
        if (this.toggle_execution)
            this.html_elements.panels.right.toggle_loading_animation = true

        this.#_url = value

        let _this = this
        AwesomeCodeElement.details.utility.fetch_resource(this.#_url, {
            on_error: (error) => {
                _this.on_error(`RemoteCodeSection: network Error ${error}`)
                this.html_elements.panels.left.toggle_loading_animation = false
            },
            on_success: (code) => {
                if (!code) {
                    _this.on_error('CodeSection: fetched invalid (possibly empty) remote code')
                }
                _this.language = AwesomeCodeElement.details.utility.get_url_extension(_this.#_url)
                _this.code = code
                this.html_elements.panels.left.toggle_loading_animation = false
            }
        })
    }

    on_error(error) {
    // soft (non-critical) error
        error = error || 'CodeSection: unknown non-critical error'

        // restore a stable status
        this.toggle_parsing = false
        this.toggle_execution = false
        this.#_code = ''
        this.#_language = undefined

        // show error
        this.code = error
        this.#error_view = true
    }
    set #error_view(value) {
        if (value)
            AwesomeCodeElement.details.utility.apply_css(this.html_elements.panels.left, {
                border: '1px solid red',
                borderRadius : '5px',
            })
        else
            AwesomeCodeElement.details.utility.apply_css(this.html_elements.panels.left, {
                border: '',
                borderRadius : '',
            })
    }

    static HTMLElement_name = 'code-section'
    static PlaceholdersTranslation = {
        type : CodeSection,
        query : `div[class=${CodeSection.HTMLElement_name}]`,
        translate : (element) => {
            // TODO: all attributes -> options
            let language = element.getAttribute('language')
            let code = element.textContent
                        .replace(/^\s+/g, '').replace(/\s+$/g, '') // remove enclosing empty lines
            let node = new CodeSection(code, language);
            if (language)
                node.setAttribute('language', language)
            return node
        }
    }
}
customElements.define(
    AwesomeCodeElement.API.HTMLElements.CodeSection.HTMLElement_name,
    AwesomeCodeElement.API.HTMLElements.CodeSection
);

AwesomeCodeElement.API.HTMLElements.ThemeSelector = class ThemeSelector extends HTMLSelectElement {
// For themes, see https://cdnjs.com/libraries/highlight.js
// The default one is the first one
//
// Use theme name, without light or dark specification. Example : `tokyo-night`

    static HTMLElement_name = 'theme-selector'
    static stylesheet_element_id = 'code_theme_stylesheet'

    static #url_builder = {
        base : `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${AwesomeCodeElement.API.configuration.hljs.version}/styles/`,
        ext : '.min.css',

        build({ name, dark_or_light = 'light' }) {
            if (typeof name !== 'string' && ! name instanceof String)
                throw new Error('ThemeSelector.#url_builder.build : invalid argument [name]')
            if (dark_or_light !== 'light' && dark_or_light !== 'dark')
                throw new Error('ThemeSelector.#url_builder.build : invalid argument : [dark_or_light]')
            return `${ThemeSelector.#url_builder.base}${name}-${dark_or_light}${ThemeSelector.#url_builder.ext}`
        }
    }

    #parameters = undefined

    constructor(parameters) {
        super()
        this.#parameters = parameters
    }
    connectedCallback() {

        if (this.#parameters) {
            this.#initialize()
            return
        }
        try {
            let _this = this
            this.shadowroot_accessor = AwesomeCodeElement.details.utility.create_shadowroot_slot(
                this,
                function(){
                    var options = $(_this).find('option');
                        _this.#parameters = options.map((index, element) => {
                            return element.getAttribute('value')
                        }).toArray()
                    _this.#initialize()
                }
            )
        }
        catch (error) {
            console.error(`${error}`)
            throw error
        }
    }

    #initialize() {
        console.log('ThemeSelector.Initialize : ')
        console.log(this.#parameters)

        let select_node = document.createElement('select')
        this.#parameters.forEach(element => {
            let option = document.createElement('option')
                option.value = element
                option.text  = element
            select_node.appendChild(option)
        })
        select_node.onchange = function(){

            let selected_option = $(this).find('option:selected')
            console.info(`AwesomeCodeElement.API.HTMLElements.ThemeSelector.onchange: switching to [${selected_option.text()}]`)

            let html_node = document.getElementsByTagName('html')[0];
            let theme_color = (html_node.classList.contains('dark-mode') ? 'dark' : 'light')
            let new_stylesheet_url = ThemeSelector.#url_builder.build({ name : selected_option.text(), dark_or_light : theme_color })

            console.info(`AwesomeCodeElement.API.HTMLElements.ThemeSelector.onchange: loading stylesheet\n\t[${new_stylesheet_url}]`)
            document.getElementById('code_theme_stylesheet').href = new_stylesheet_url

            hljs.highlightAll()
        }
        this.replaceWith(select_node)
    }

    static get stylesheet() {
        let code_stylesheet = document.getElementById(ThemeSelector.stylesheet_element_id);
        if (!code_stylesheet)
            throw new Error('AwesomeCodeElement.API.HTMLElements.ThemeSelector: missing stylesheet\n\tDid you forget to call AwesomeCodeElement.API.initialize(); ?')
        return code_stylesheet
    }

    static initialize() {
        let stylesheet = document.createElement('link')
            stylesheet.id           = ThemeSelector.stylesheet_element_id
            stylesheet.rel          = 'stylesheet'
            stylesheet.href         = ThemeSelector.#url_builder.build({
                name: AwesomeCodeElement.API.configuration.hljs.theme,
                dark_or_light : 'dark' // TODO: detect user-preferences
            })
            stylesheet.crossorigin  = "anonymous"
            stylesheet.referrerpolicy = "no-referrer"

        document.head.appendChild(stylesheet)
    }
}
customElements.define(
    AwesomeCodeElement.API.HTMLElements.ThemeSelector.HTMLElement_name,
    AwesomeCodeElement.API.HTMLElements.ThemeSelector, { extends : 'select'}
);

// ============

AwesomeCodeElement.API.initializers = {
    doxygenCodeSections : function() {
        // Replace code-sections generated by doxygen (and possibly altered by doxygen-awesome-css)
        // like `<pre><code></code></pre>`,
        // or placeholders like `\include path/to/example.ext`
        
        // DoxygenAwesomeFragmentCopyButton wraps code in
        //  div[class="doxygen-awesome-fragment-wrapper"] div[class="fragment"] div[class="line"]
        // otherwise, default is
        //  div[class="fragment"] div[class="line"]
    
        // clickable documentation elements are :
        //  div[class="doxygen-awesome-fragment-wrapper"] div[class="fragment"] div[class="line"]
        //      <a class="code" href="structcsl_1_1ag_1_1size.html">csl::ag::size&lt;A&gt;::value</a>
    
        let doc_ref_links = new Map(); // preserve clickable documentation reference links
    
        var place_holders = $('body').find('div[class=doxygen-awesome-fragment-wrapper]');
        console.info(`awesome-code-element.js:initialize_doxygenCodeSections : replacing ${place_holders.length} elements ...`)
        place_holders.each((index, value) => {
    
            let lines = $(value).find('div[class=fragment] div[class=line]')
    
            // WIP: keep doc ref links
            let links = lines.find('a[class="code"]')
            links.each((index, value) => {
                doc_ref_links.set(value.textContent, value.href)
            })
            // /WIP
    
            let code = $.map(lines, function(value) { return value.textContent }).join('\n')
            let node = new CodeSection(code, undefined);
                $(value).replaceWith(node)
        })
    
        var place_holders = $('body').find('div[class=fragment]')
        console.info(`awesome-code-element.js:initialize_doxygenCodeSections : replacing ${place_holders.length} elements ...`)
        place_holders.each((index, value) => {
    
            let lines = $(value).find('div[class=line]')
    
            // WIP
            let links = lines.find('a[class="code"]')
            links.each((index, value) => {
                doc_ref_links.set(value.textContent, value.href)
            })
            // /WIP
    
            let code = $.map(lines, function(value) { return value.textContent }).join('\n')
            let node = new CodeSection(code, undefined);
                $(value).replaceWith(node)
        })
    
        // TODO: restore documentation reference links
        doc_ref_links.forEach((values, keys) => {
            // console.debug(">>>>>>> " + value.href + " => " + value.textContent)
            console.debug(">>>>>>> " + values + " => " + keys)
        })
    
        var place_holders = $('body').find('awesome-code-element_code-section pre code') // span or text
        place_holders.filter(function() {
            return $(this).text().replace(/toto/g, '<a href=".">toto</a>');
            })
    },
    // TODO: make sure that doxygen elements are also still clickable with pure doxygen (not doxygen-awesome-css)
    PreCodeHTMLElements : function() {

        $('body').find('pre code').each((index, value) => { // filter

            if ($(value).parent().parent().prop('nodeName').toLowerCase().startsWith("awesome-code-element_"))
                return

            let existing_node = $(value).parent()

            let language = value.getAttribute('language')
            let code = existing_node.text()

            let node = new CodeSection(code, language);
                node.setAttribute('language', language)
            existing_node.replaceWith(node);
        })

        // TODO: same for only code elements ?
    }
}
AwesomeCodeElement.API.initialize = () => {
   
    $(function() {
        $(document).ready(function() {

            console.info('awesome-code-element.js:initialize ...')

            if (AwesomeCodeElement.API.configuration.toggle_dark_mode) {
                if (undefined === AwesomeCodeElement.ToggleDarkMode)
                    console.error(
                        'awesome-code-element.js:initialize: options toggle_dark_mode set to true, but awesome_doc_code_sections.ToggleDarkMode is undefined\n' +
                        'Did you forget to include awesome-code-element_dark-mode.js ?'
                    )
                else
                    AwesomeCodeElement.ToggleDarkMode.initialize()
            }

            AwesomeCodeElement.API.HTMLElements.ThemeSelector.initialize()

            let ReplaceHTMLPlaceholders = (translation) => {

                let elements = $('body').find(translation.query)
                console.info(`awesome-code-element.js:ReplaceHTMLPlaceholders(${translation.type.name}) : replacing ${elements.length} element(s) ...`)
                elements.each((index, element) => {
                    let translated_element = translation.translate(element)
                    if (translated_element)
                        element.replaceWith(translated_element)
                })
            }
            [   // replace placeholders with proper HTML elements
                AwesomeCodeElement.API.HTMLElements.CodeSection
            ].forEach(html_component => ReplaceHTMLPlaceholders(html_component.PlaceholdersTranslation))

            if (AwesomeCodeElement.API.configuration.doxygen_awesome_css_compatibility === true) {
                console.info(`awesome-code-element.js:initialize: doxygen-awesome-css compatiblity ...`)
                AwesomeCodeElement.API.initializers.doxygenCodeSections()
            }

            if (AwesomeCodeElement.API.configuration.pre_code_compatibility) {
                console.info(`awesome-code-element.js:initialize: existing pre-code compatiblity ...`)
                AwesomeCodeElement.API.initializers.PreCodeHTMLElements
            }
        })
    })
}

export { AwesomeCodeElement as default }

// TODO: module (+(sub)components encapsulation)
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export
// export { awesome_doc_code_sections }
// import adcs from '/path/to/awesome-code-element.js'