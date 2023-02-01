class language_policies {

    static detectors = class {
        static check_concept = function(argument) {
            return argument
                && argument.is_valid_language
                && argument.get_language
                && argument.detect_language
        }

        static use_none = class {
            static is_valid_language(language){ return true; }
            static get_language(element){
                return 'n/a'
            }
            static detect_language(text){
                return {
                    language: 'n/a',
                    relevance: 10,
                    value: text
                }
            }
        }
        static use_hljs = class use_hljs_language_detector_policy {
            static is_valid_language(language){
                return hljs.getLanguage(language) !== undefined
            }
            static get_language(element){

                if (element === undefined || !(element instanceof HTMLElement))
                    throw new Error(`ace.language_policies.get_language(element): bad input`)

                const result = element.classList.toString().match(/language-(\w+)/, '') // expected: "hljs language-[name]"
                return Boolean(result && result.length === 1)
                    ? (result[1] === "undefined" ? undefined : result[1])
                    : undefined // first capture group
            }
            static detect_language(text){
                if (text === undefined || !(typeof text === 'string'))
                    throw new Error(`ace.language_policies.detect_language(text): bad input`)
                const result = hljs.highlightAuto(text) ?? {}
                return {
                    language: result.language,
                    relevance: result.relevance,
                    value: result.value
                }
            }
        }
    }

    static highlighters = class {
        static check_concept = function(argument) {
            return argument
                && argument.highlight
        }

        static use_none = class {
            static highlight({ code_element, language }){
                return {
                    relevance: 10,
                    language: language ?? 'n/a',
                    value: code_element.innerHTML
                }
            }
        }
        static use_hljs = class use_hljs_language_policy {
    
            static #highlight_dry_run({ code_element, language }){
                if (!code_element || !(code_element instanceof HTMLElement))
                    throw new Error('use_hljs_language_policy.highlight: invalid argument. Expect [code_element] to be a valid HTMLElement')
                if (language && !language_policies.detectors.use_hljs.is_valid_language(language)) {
                    console.warn(`use_hljs_language_policy.highlight: invalid language [${language}], attempting fallback detection`)
                    language = undefined
                }
                
                const result = language
                    ? hljs.highlight(code_element.textContent, { language: language })
                    : hljs.highlightAuto(code_element.textContent)
                if (result.relevance < 5)
                    console.warn(
                        `use_hljs_language_policy.highlight: poor language relevance [${result.relevance}/10] for language [${result.language}]
                        Perhaps the code is too small ? (${code_element.textContent.length} characters)`,
                        result
                    )
                return result
            }
            static highlight({ code_element, language }){
                const result = use_hljs_language_policy.#highlight_dry_run({
                    code_element: code_element,
                    language: language
                })
                code_element.innerHTML = result.value
    
                const update_classList = () => {
                    code_element.classList = [...code_element.classList].filter(element => !element.startsWith('language-') && element !== 'hljs')
                    code_element.classList.add(`hljs`)
                    code_element.classList.add(`language-${result.language}`)
                }
                update_classList()
                return result
            }
        }
    }
}

class utility {
    static inject_field_proxy = function(target, property_name, { getter_payload, setter_payload } = {}) {
    // generate a proxy to a value's field, injecting optional payload
        
        var _target = target
        var storage = _target[property_name]
        const target_getter = _target.__lookupGetter__(property_name)
        const target_setter = _target.__lookupSetter__(property_name)
    
        const getter = function(){
            const value = target_getter ? target_getter.call(_target) : storage
            return getter_payload
                ? getter_payload(value) ?? value
                : value
        };
        const setter = function(newValue){
    
            if (setter_payload)
                newValue = setter_payload(newValue)
    
            if (target_setter)
                target_setter.call(_target, newValue)
            else
                storage = newValue
        };
    
        Object.defineProperty(_target, property_name, {
            get: getter,
            set: setter
        });
    
        return {
            get: _target.__lookupGetter__(property_name),
            set: _target.__lookupSetter__(property_name)
        }
    }
}

// WIP: code+language
//  this.#_code -> code_mvc (MVVC)
//  integrates:
//  - language policies
//      - detector
//      - highlighter
//  - parsing logic (model -> code_policies.parser.ace_metadata_parser)
//  - CE configuration
//  - immuability -> layout is wrap mode -> is_editable === false
//    - no parsing allowed
//  - language
//  - toggle_language detection
// which interface with ace.cs ?
// - ace.cs.#onLanguageChange()     -> onLanguageChange
// - ace.cs.#onCodeModelChange()

class code_policies {

    static parser = class parser {

        static check_concept = function(argument) {
            return argument
                && argument.parse
        }

        static result_type = class {
            constructor(arg){ Object.assign(this,arg) }
            
            raw        = undefined
            to_display = undefined
            to_execute = undefined
            ce_options = {}
        }

        static no_parser = class {
            static parse({ code }){
                return new code_policies.parser.result_type({
                    raw: code,
                    to_display: code,
                    to_execute: code
                })
            }
        }
        static ace_metadata_parser = class ace_metadata_parser {
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

            static tag = '// @ace'
            static parse({ code }) {

                if (code === undefined)
                    throw new Error('code_policies.parser.ace_metadata_parser.parse: invalid argument')

                let result = new code_policies.parser.result_type({ raw: code })
                    result = ace_metadata_parser.#parse_impl({ result: result})
                    result = ace_metadata_parser.#apply_ce_transformations({ result: result })

                // TODO: (elsewhere!!!) merge local with global
                // apply default configuration for a given - non-mandatory - language
                // Note: global configuration can be overrided locally in the configuration
                // if (AwesomeCodeElement.API.configuration.CE.has(language))
                //     this.ce_options = AwesomeCodeElement.API.configuration.CE.get(language)

                return result
            }
            static #parse_impl({ result }) {

                let code_content = result.raw
        
                {   // CE options
                    const regexp = new RegExp(`^\\s*?${code_policies.parser.ace_metadata_parser.tag}::CE=({(.*?\n\\s*//.*?)+}\n?)`, 'gm')
                    const matches = [...result.raw.matchAll(regexp)] // expect exactly 1 match
                    if (matches.length > 1)
                        console.error(`code_policies.parser.ace_metadata_parser.parse: found multiples CE configurations`)
            
                    matches.map((match) => {
                        const value = match[1].replaceAll(
                            new RegExp(`^\\s*?//`, 'gm'),
                            ''
                        )
                        // remove from original content
                        code_content = code_content.slice(0, match.index)
                                    + code_content.slice(match.index + match[0].length)
                        return value
                    }).forEach((value) => {
                        // Merge CE configuration. Local can override global.
                        result.ce_options = {
                            ...(result.ce_options || {}),
                            ...JSON.parse(value)
                        }
                    })
                }
        
                // skip block, line (documentation & execution sides)
                // block
                code_content = code_content.replaceAll(
                    new RegExp(`^\\s*?${code_policies.parser.ace_metadata_parser.tag}::skip::block::begin\n(.*?\n)*\\s*?${code_policies.parser.ace_metadata_parser.tag}::skip::block::end\\s*?$`, 'gm'),
                    ''
                )
                // line
                code_content = code_content.replaceAll(
                    new RegExp(`^.*?\\s+${code_policies.parser.ace_metadata_parser.tag}::skip::line\\s*$`, 'gm'),
                    ''
                )
        
                // show block, line (documentation side)
                const code_only_show = (() => {
                    const regex_show_block  = `(^\\s*?${code_policies.parser.ace_metadata_parser.tag}::show::block::begin\n(?<block>(^.*?$\n)+)\\s*${code_policies.parser.ace_metadata_parser.tag}::show::block::end\n?)`
                    const regex_show_line   = `(^(?<line>.*?)\\s*${code_policies.parser.ace_metadata_parser.tag}::show::line\\s*?$)`
                    const regexp = new RegExp(`${regex_show_block}|${regex_show_line}`, 'gm')
                    const matches = [...code_content.matchAll(regexp)]
                    return matches
                        .reverse()
                        .map((match) => {
                            const result = match.groups.block !== undefined
                                ? match.groups.block
                                : match.groups.line
                            // remove from original content
                            // code_content = code_content.replace(match[0], result) // really slower than 2 reverse + 2 substring ?
                            code_content = code_content.substring(0, match.index) + result + code_content.substring(match.index + match[0].length)
                            return result
                        })
                        .reverse()
                        .join('\n')
                })()
        
                result.to_display = (code_only_show !== "" ? code_only_show : code_content)
                result.to_execute = code_content

                return result
            }
            static #apply_ce_transformations({ result }) {
        
                // includes_transformation
                if (result.ce_options && result.ce_options.includes_transformation) {
                    result.ce_options.includes_transformation.forEach((value) => {
                        // replace includes
        
                        const regex = new RegExp(`^(\\s*?\\#.*?[\\"|\\<"].*?)(${value[0]})(.*?[\\"|\\>"])`, 'gm')
                        result.to_execute = result.to_execute.replace(regex, `$1${value[1]}$3`)
                    })
                }
                return result
            }
        }
    }
}

// TODO: as static factory (+remove code inheritance)
class code_mvc {
// acquire { model, view } from an HTMLElement
//  model: inner text considered as plain code: any invalid nodes injected by the HTML rendering are removed
//  view : either a pre>code or the given element, if the later contains valid HTML elements
    static html_parser = class html_parser {
        static is_valid_HTMLElement({ element }){
            if (element === undefined)
                throw new Error('ace.details.code_mvc.html_parser.is_valid_HTMLElement: invalid argument')
            return element instanceof HTMLElement && !(element instanceof HTMLUnknownElement)
        }
        static is_valid_tagName({ tagName }) {
            if (element === undefined)
                throw new Error('ace.details.code_mvc.html_parser.is_valid_tagName: invalid argument')
            if (!(typeof tagName === 'string') && !(tagName instanceof String))
                throw new Error('html_parser.is_valid_tagName: invalid argument')
            // TODO: cache tagname -> result, to decrease costly/useless element creation
            return html_parser.is_valid_HTMLElement({ element: document.createElement(tagName) })
        }
        static count_valid_childrens({ element, is_recursive = false }) {
            if (element === undefined)
                throw new Error('ace.details.code_mvc.html_parser.count_valid_childrens: invalid argument')
            return Array
                .from(element.children)
                .map((element) => {
                    return 0
                        + html_parser.is_valid_HTMLElement({ element: element })
                        + (is_recursive ? html_parser.count_valid_childrens({ element: element, is_recursive: is_recursive }) : 0)
                })
                .reduce((total, current) => total + current, 0)
        }
        static to_code({ elements }) {
        // expect Array.from(node.childNodes)
        // TODO?: faster approach?: use regex on outerHTML: \<(?'closing'\/?)(?'tagname'\w+\-?)+.*?\>
        // replace invalid HTMLElement by their localName as text
            if (elements === undefined)
                throw new Error('ace.details.code_mvc.html_parser.count_valid_childrens: invalid argument')
            return elements
                .map(element => {
                    switch (element.nodeType) {
                        case Node.TEXT_NODE:
                            return element.textContent
                        case Node.ELEMENT_NODE:
                            if (html_parser.is_valid_HTMLElement({ element: element }))
                                return html_parser.to_code({ elements: Array.from(element.childNodes) })
                            // invalid tagname are kept as text, to preserve include semantic.
                            //  e.g: `<iostream>` in `#include <iostream>`
                            return `<${element.localName}>${html_parser.to_code({ elements: Array.from(element.childNodes) })}`
                        case Node.COMMENT_NODE:
                        case Node.CDATA_SECTION_NODE:
                        default:
                            console.debug(`code_mvc.parser.to_code: unhandled tags [comment, cdata, etc.]`)
                            return ''                        
                    }
                })
                .join('')
        }
        static cleanup({ element }){
        // recursively replaces invalid childrens element by their tagname as text
            if (element === undefined)
                throw new Error('ace.details.code_mvc.html_parser.cleanup: invalid argument')

            let childNodes = Array.from(element.childNodes)
            childNodes
                .filter(element => element.nodeType === HTMLElement.ELEMENT_NODE)
                .forEach(element => {
                    html_parser.#cleanup_impl({ element: element })
                })
            return element
        }
        static #cleanup_impl({ element }){
        // recursively replaces invalid element by their tagname as text

            if (element === undefined)
                throw new Error('ace.details.code_mvc.html_parser.cleanup_impl: invalid argument')

            let childNodes = Array.from(element.childNodes)                                         // preserve reference/offset integrity
            if (!html_parser.is_valid_HTMLElement({ element: element })) {
                element.previousSibling.appendData(`<${element.localName}>`)                        // replace by text
                childNodes.forEach(node => element.parentNode.insertBefore(node, element))          // transfert childrensNodes to parent
                element = element.parentNode.removeChild(element)                                   // remove the element
            }
            childNodes
                .filter(element => element.nodeType === HTMLElement.ELEMENT_NODE)
                .forEach(element => {
                    html_parser.#cleanup_impl({ element: element })
                })
        }
    };

    get is_editable() { return !this.is_self_contained }

    constructor(argument) {

        if (argument instanceof code_mvc) {
            Object.assign(this, arg)
            return
        }

        this.#build_from(argument)
    }

    static is_expected_layout(element){
        if (!(element instanceof HTMLElement))
            throw new Error('code_mvc.is_expected_layout: invalid argument')
        return (element.localName === 'pre'
             && element.childNodes.length === 1
             && element.childNodes[0].nodeType === Node.ELEMENT_NODE
             && element.childNodes[0].localName === 'code'
        )
    }

    #model = undefined
    get model(){ return this.#model }
    set model(value){
        value = value ?? ''
        this.#model = value.replace(/^\s*/, '').replace(/\s*$/, '') // remove enclosing white-spaces
    }

    view = { top_parent: undefined, code_container: undefined }
    is_self_contained = false

    #build_from(argument){

        if (argument instanceof HTMLElement)
            this.#build_from_element(argument)
        else if (argument instanceof Array
              && argument.reduce((index, arg) => undefined !== arg.nodeType, true))
        {
            let only_one_valid_element = (() => {
                const no_ws_elements = argument.filter((element) => !(element.nodeType === Node.TEXT_NODE && /^\s+$/g.test(element.textContent)))
                return no_ws_elements.length === 1 && code_mvc.html_parser.is_valid_HTMLElement({ element: no_ws_elements[0] })
                    ? no_ws_elements[0]
                    : undefined
            })()
            return only_one_valid_element
                ? this.#build_from_element(only_one_valid_element)
                : this.#build_from_nodes(argument)
        }
        else if (argument.nodeType === document.TEXT_NODE)
            this.#build_from_text(argument.textContent)
        else
            this.#build_from_text(argument.toString())
    }
    #build_from_text(value){

        this.is_self_contained = false
        this.model = value
        this.view = (() => {
            let value = document.createElement('pre')
            let code_node = value.appendChild(document.createElement('code'))
                code_node.textContent = this.model
            return { top_parent: value, code_container: code_node }
        })()
    }
    #build_from_element(element){

        if (!(element instanceof HTMLElement))
            throw new Error('code_mvc.#build_from_element: invalid argument')

        if (code_mvc.is_expected_layout(element)) {
            this.is_self_contained = false
            this.model = element.textContent
            this.view = { top_parent: element, code_container: element.firstElementChild }
            return
        }

        // TODO:WIP: set to always true?
        this.is_self_contained = Boolean(code_mvc.html_parser.count_valid_childrens({ element: element, is_recursive: true }))
        this.model = (() => {
            if (this.is_self_contained)
                element = code_mvc.html_parser.cleanup({ element: element })
            return code_mvc.html_parser.to_code({ elements: Array.from(element.childNodes) })
        })()
        if (!this.is_self_contained)
            return this.#build_from_text(this.model)
        this.view = { top_parent: element, code_container: element }
    }
    #build_from_nodes(elements){
    // expected: Array.from(node.childNodes)

        if (!(elements instanceof Array)
        ||  !elements.reduce((index, arg) => undefined !== arg.nodeType, true))
            throw new Error('code_mvc.#build_from_nodes_array: invalid argument')

        this.is_self_contained = false
        this.model = (() => {
            
            elements.forEach((element) => code_mvc.html_parser.cleanup({ element: element }))
            return elements
                .map((element) => { 
                    return code_mvc.html_parser.to_code({
                        elements: [ element ]
                    })
                })
                .join('')
        })()
        this.#build_from_text(this.model)
    }
}
class code extends code_mvc {
// TODO: encapsulation, rd-only accessors
// TODO: editable, not-editable behaviors

    #language_policies = {
        detector: undefined,
        highlighter: undefined
    }
    parser = undefined

    // language
    #language = undefined
    onLanguageChange = (value) => {} // TODO: update class etc.
    get language() {

        const value = (() => {
            if (this.#language_policies.detector.is_valid_language(this.#language))
                return this.#language
        
            console.info('ace.code.get(language) : invalid language, attempting fallback detections')
            return this.#language_policies.detector.get_language(this.view.code_container)
                ?? this.#language_policies.detector.detect_language(this.model).language
        })()
        if (this.toggle_language_detection)
            this.#language = value
        return value
    }
    set language(value) {

        const is_valid_input = this.#language_policies.detector.is_valid_language(value)
        if (this.#language === value && is_valid_input)
            return
        this.toggle_language_detection = !is_valid_input

        console.debug(this.model)

        const new_value = (this.is_editable
            ? this.#language_policies.highlighter.highlight({
                code_element: this.view.code_container,
                language: this.toggle_language_detection ? undefined : value
            })
            : this.#language_policies.detector.detect_language(this.model)
        ).language
        // if (this.toggle_language_detection)
        this.#language = new_value // note: possibly not value
        this.toggle_language_detection = Boolean(result.relevance <= 5)
        this.ce_options = AwesomeCodeElement.API.configuration.CE.get(this.#language)

        if (this.onLanguageChange) this.onLanguageChange(this.#language)
    }

    // language_detection
    #toggle_language_detection = true
    set toggle_language_detection(value) {
        this.#toggle_language_detection = value
    }
    get toggle_language_detection() {
        return  this.#toggle_language_detection
            || !this.#language_policies.detector.is_valid_language(this.#language)
    }

    toggle_parsing = false

    #model = undefined

    constructor({ argument, language_policy }){

        super(argument)
        this.#language_policies = language_policy
        this.parser = this.is_editable
            ? code_policies.parser.ace_metadata_parser
            : code_policies.parser.no_parser

        if (!language_policies.detectors.check_concept(this.#language_policies.detector))
            throw new Error('ace.details.code.constructor: invalid argument (language_policy.detector)')
        if (!language_policies.highlighters.check_concept(this.#language_policies.highlighter))
            throw new Error('ace.details.code.constructor: invalid argument (language_policy.highlighter)')
        if (!code_policies.parser.check_concept(this.parser))
            throw new Error('ace.details.code.constructor: invalid argument (parser)')

        this.model = (() => {
            console.debug(this.model)
            const previous_value = this.model
            const { get, set } = utility.inject_field_proxy(this, 'model', {
                getter_payload: () => {
                    return this.toggle_parsing
                        ? this.#model.to_display
                        : this.#model.raw
                },
                setter_payload: this.is_editable
                    ? (value) => {
                        this.#model = this.parser.parse({ code: value })
                        this.view.code_container.textContent = this.#model.to_display // update view
                    }
                    : () => { console.warn('code.set(model): no-op: not editable') }
            })
            return previous_value
        })()

        // this.language = this.#model.ce_options.language
    }
}

// new code({
//     argument: document.getElementById('test_1'),
//     language_policy: {
//        detector: language_policies.detectors.use_hljs,
//        highlighter: language_policies.highlighters.use_hljs
//     }
//  })