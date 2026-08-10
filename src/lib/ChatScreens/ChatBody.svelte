<script lang="ts">
    import isEqual from "lodash/isEqual"
    import { DBState } from 'src/ts/stores.svelte'
    import { sleep } from "src/ts/util"
    import { alertError } from "../../ts/alert"
    import { tick } from 'svelte'
    import { addMetadataToElement, getDistance, ParseMarkdown, postTranslationParse, resolveInlayPlaceholders, trimMarkdown, type CbsConditions, type simpleCharacterArgument } from "../../ts/parser/parser.svelte"
    import { getLLMCache, translateHTML } from "../../ts/translator/translator"
    import { getModuleAssets } from "src/ts/process/modules";
    import { getCurrentCharacter } from "src/ts/storage/database.svelte";
    import { getFileSrc } from "src/ts/globalApi.svelte";

    const COMMITTED_HTML_CACHE_LIMIT = 500
    const committedHtmlRevisionCache = new Map<string, string>()
    const committedHtmlIdentityCache = new Map<string, string>()

    /**
     * Reads committed chat HTML from revision cache first, then message identity fallback cache.
     * @param revisionKey Content-specific cache key, if available.
     * @param identityKey Stable same-message identity key, if available.
     * @returns Cached committed HTML for the exact revision or same identity, or an empty string.
     */
    function getCachedCommittedHtml(revisionKey?: string, identityKey?: string) {
        if (revisionKey) {
            const cachedRevision = committedHtmlRevisionCache.get(revisionKey)
            if (cachedRevision !== undefined) {
                return cachedRevision
            }
        }
        return identityKey ? committedHtmlIdentityCache.get(identityKey) ?? '' : ''
    }

    /**
     * Stores committed chat HTML in a bounded cache and evicts the oldest entries after the cap.
     * @param cache Cache map to update.
     * @param key Cache key to write.
     * @param html Committed HTML that was successfully swapped into the visible layer.
     */
    function setBoundedCommittedHtml(cache: Map<string, string>, key: string, html: string) {
        if (cache.has(key)) {
            cache.delete(key)
        }
        cache.set(key, html)
        while (cache.size > COMMITTED_HTML_CACHE_LIMIT) {
            const oldestKey = cache.keys().next().value
            if (!oldestKey) break
            cache.delete(oldestKey)
        }
    }

    /**
     * Stores committed chat HTML for exact revision reuse and same-message fallback reuse.
     * @param revisionKey Content-specific cache key, if available.
     * @param identityKey Stable same-message identity key, if available.
     * @param html Committed HTML that was successfully swapped into the visible layer.
     */
    function setCachedCommittedHtml(revisionKey: string | undefined, identityKey: string | undefined, html: string) {
        if (revisionKey) {
            setBoundedCommittedHtml(committedHtmlRevisionCache, revisionKey, html)
        }
        if (identityKey) {
            setBoundedCommittedHtml(committedHtmlIdentityCache, identityKey, html)
        }
    }

    interface Props {
        character?: simpleCharacterArgument|string|null
        firstMessage?: boolean
        idx?: number
        msgDisplay?: string
        name?: string
        role: string|null
        translated: boolean
        translating: boolean
        retranslate: boolean
        bodyRoot?: HTMLElement|null
        modelShortName: string
        renderIdentityKey?: string
        renderRevisionKey?: string
        renderRawStreaming?: boolean
        rawStreamingText?: string
    }

    let {
        character = null,
        idx = 0,
        firstMessage = false,
        msgDisplay,
        role,
        translated = $bindable(false),
        translating = $bindable(false),
        retranslate = $bindable(false),
        bodyRoot,
        modelShortName = '',
        renderIdentityKey,
        renderRevisionKey,
        renderRawStreaming = false,
        rawStreamingText = '',
    }: Props =  $props()

    // svelte-ignore non_reactive_update
    let lastCharArg:string|simpleCharacterArgument = null
    let lastChatId = -10

    const getInitialRenderIdentityKey = () => renderIdentityKey
    const getInitialRenderRevisionKey = () => renderRevisionKey
    let activeRenderIdentityKey = getInitialRenderIdentityKey()
    let activeRenderRevisionKey = getInitialRenderRevisionKey()
    let committedHtml = $state(getCachedCommittedHtml(getInitialRenderRevisionKey(), getInitialRenderIdentityKey()))
    let stagedHtml = $state('')
    let stagingActive = $state(false)
    let visibleRoot: HTMLElement | null = $state(null)
    let stagingRoot: HTMLElement | null = $state(null)
    let renderGeneration = 0
    let stageTimer: ReturnType<typeof setTimeout> | null = null

    function getCbsCondition(){
        try{
            const cbsConditions:CbsConditions = {
                firstmsg: firstMessage ?? false,
                chatRole: role,
            }
            return cbsConditions
        }
        catch(e){
            return {
                firstmsg: firstMessage ?? false,
                chatRole: null,
            }
        }
    }

    /**
     * Returns the configured chat render swap delay in milliseconds.
     * @returns A clamped integer delay between 0 and 2000 milliseconds.
     */
    function getChatRenderSwapDelayMs() {
        const rawDelay = (DBState.db as { chatRenderSwapDelayMs?: number }).chatRenderSwapDelayMs ?? 120
        if (typeof rawDelay !== 'number' || Number.isNaN(rawDelay) || rawDelay < 0) {
            return 120
        }
        return Math.min(2000, Math.floor(rawDelay))
    }

    /**
     * Waits for the requested number of milliseconds.
     * @param ms Delay duration in milliseconds.
     * @returns A promise that resolves after the delay elapses.
     */
    function delayMs(ms: number) {
        return new Promise<void>((resolve) => {
            stageTimer = setTimeout(() => {
                stageTimer = null
                resolve()
            }, ms)
        })
    }

    /**
     * Converts parsed markdown HTML into sanitized chat body HTML with metadata.
     * @param markdown Parsed markdown HTML returned by ParseMarkdown.
     * @returns Sanitized HTML ready to insert with {@html}.
     */
    function renderChatHtml(markdown: string) {
        return addMetadataToElement(trimMarkdown(markdown), modelShortName)
    }

    let shouldRenderRawStreaming = $derived(renderRawStreaming && !translated && !retranslate)

    const markParsing = async (data: string, charArg: string | simpleCharacterArgument, chatID: number, tries?:number) => {
        // track 'translated' and 'retranslate' state
        translated;
        retranslate;
        let lastParsedQueue = ''
        let mode = 'notrim' as const
        try {
            if((!isEqual(lastCharArg, charArg)) || (chatID !== lastChatId)){
                lastParsedQueue = ''
                lastCharArg = charArg
                lastChatId = chatID
                let translateText = false
                try {
                    if(DBState.db.autoTranslate){
                        if(DBState.db.autoTranslateCachedOnly && DBState.db.translatorType === 'llm'){
                            const cache = DBState.db.translateBeforeHTMLFormatting
                            ? await getLLMCache(data)
                            : !DBState.db.legacyTranslation
                            ? await getLLMCache(await ParseMarkdown(data, charArg, 'pretranslate', chatID, getCbsCondition()))
                            : await getLLMCache(await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition()))
                  
                            translateText = cache !== null
                        }
                        else{
                            translateText = true
                        }
                    }

                    const lastTranslated = translated

                    setTimeout(() => {
                            translated = translateText
                    }, 10)

                    // State change of `translated` triggers markParsing again,
                    // causing redundant translation attempts
                    if (lastTranslated !== translateText) {
                        return;
                    }
                } catch (error) {
                    console.error(error)
                }
            }
            if(retranslate || translated){
                // Keep committedHtml visible during translation. The staged render
                // will be swapped in only after parsing finishes and the configured
                // render-swap delay has elapsed.

                let transResult: string
                
                if(DBState.db.translatorType === 'llm' && DBState.db.translateBeforeHTMLFormatting){
                    await sleep(100)
                    translating = true
                    data = await translateHTML(data, false, charArg, chatID, retranslate)
                    translating = false
                    const marked = await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition())
                    lastParsedQueue = marked
                    lastCharArg = charArg
                    transResult = marked
                }
                else if(!DBState.db.legacyTranslation){
                    const marked = await ParseMarkdown(data, charArg, 'pretranslate', chatID, getCbsCondition())
                    translating = true
                    const translated = await postTranslationParse(await translateHTML(marked, false, charArg, chatID, retranslate))
                    translating = false
                    lastParsedQueue = translated
                    lastCharArg = charArg
                    transResult = translated
                }
                else{
                    const marked = await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition())
                    translating = true
                    const translated = await translateHTML(marked, false, charArg, chatID, retranslate)
                    translating = false
                    lastParsedQueue = translated
                    lastCharArg = charArg
                    transResult = translated
                }

                setTimeout(() => {
                    retranslate = false
                }, 10);

                return transResult
            }
            else{
                const marked = await ParseMarkdown(data, charArg, mode, chatID, getCbsCondition())
                lastParsedQueue = marked
                lastCharArg = charArg
                return marked
            }   
        } catch (error) {
            //retry
            if(tries > 2){

                alertError(`Error while parsing chat message: ${translated}, ${error.message}, ${error.stack}`)
                return data
            }
            return await markParsing(data, charArg, chatID, (tries ?? 0) + 1)
        }
        finally{
            // The caller commits parsed HTML through the staged render pipeline.
            void lastParsedQueue
        }
    }

    /**
     * Stages parsed chat HTML in a hidden layer, then commits it if no newer render superseded it.
     * @param parsedMarkdown Parsed markdown HTML returned by markParsing.
     * @param generation Render generation that must still be current to commit.
     */
    async function stageAndCommit(parsedMarkdown: string, generation: number) {
        stagedHtml = renderChatHtml(parsedMarkdown)
        stagingActive = true
        await tick()

        if (generation !== renderGeneration) {
            return
        }

        const hasPriorCommittedHtml = committedHtml.trim().length > 0

        checkImg(stagingRoot)

        if (hasPriorCommittedHtml && stagingRoot) {
            await resolveInlayPlaceholders(stagingRoot, { eager: true })
        }

        if (generation !== renderGeneration) {
            return
        }

        const swapDelay = hasPriorCommittedHtml ? getChatRenderSwapDelayMs() : 0
        if (swapDelay > 0) {
            await delayMs(swapDelay)
        }

        if (generation !== renderGeneration) {
            return
        }

        committedHtml = stagedHtml
        setCachedCommittedHtml(renderRevisionKey, renderIdentityKey, committedHtml)
        stagedHtml = ''
        stagingActive = false
        await tick()

        if (generation !== renderGeneration) {
            return
        }

        checkImg(visibleRoot)
        if (visibleRoot) {
            void resolveInlayPlaceholders(visibleRoot, { eager: true })
        }
    }

    const checkImg = (root: HTMLElement | null) => {
        if(!DBState.db.newImageHandlingBeta || !root){
            return
        }
        const imgs = root.querySelectorAll('img:not([src^="data:"]):not([src^="http:"]):not([src^="https:"]):not([src^="blob:"]):not([src^="file:"]):not([src^="tauri:"]):not([src^="/"]):not([noimage])') as NodeListOf<HTMLImageElement>
        
        if (imgs.length > 0) {
            const currentCharacter = getCurrentCharacter()
            const styl = currentCharacter.prebuiltAssetStyle
            const assets = getModuleAssets().concat(currentCharacter.additionalAssets ?? [])
            const normalizedAssets = assets.map((asset) => {
                return {
                    name: asset[0].toLocaleLowerCase(),
                    path: asset[1]
                }
            })
            const exactAssets = new Map(normalizedAssets.map((asset) => [asset.name, asset.path]))

            imgs.forEach(async (img) => {
                const name = img.getAttribute('src')?.toLocaleLowerCase() || ''
                console.log(name)

                if(
                    name.length > 200 ||
                    name.includes(':')
                ){
                    img.setAttribute('noimage', 'true')
                    return
                }
                
                const foundAsset = exactAssets.get(name)
                console.log('Checking image:', name, 'Assets:', assets)
                if(foundAsset){
                    img.classList.add('root-loaded-image')
                    img.classList.add('root-loaded-image-' + styl)
                    img.src = await getFileSrc(foundAsset)
                    return
                }

                if(name.length < 3){
                    img.setAttribute('noimage', 'true')
                    return
                }
                const prefixLoc = name.lastIndexOf('.')
                const prefix = prefixLoc > 0 ? name.substring(0, prefixLoc) : ''
                let currentDistance = 1000
                let currentFound = ''
                for(const asset of normalizedAssets){
                    if(!asset.name.startsWith(prefix)){
                        continue
                    }
                    const distance = getDistance(name, asset.name)
                    if(distance < currentDistance){
                        currentDistance = distance
                        currentFound = asset.path
                    }
                }
                if(currentFound){
                    const got = await getFileSrc(currentFound)
                    const name2 = img.getAttribute('src')?.toLocaleLowerCase() || ''
                    if(name === name2){
                        img.setAttribute('src', got)
                    }

                    if(img.classList.length === 0){
                        img.classList.add('root-loaded-image')
                        img.classList.add('root-loaded-image-' + styl)
                    }
                    img.removeAttribute('noimage')
                }
                else{
                    img.setAttribute('noimage', 'true')
                }
            })
        }
    }

    let markParsingResult = $derived.by(() => markParsing(msgDisplay, character, idx))

    $effect(() => {
        const nextIdentityKey = renderIdentityKey
        const nextRevisionKey = renderRevisionKey
        if (nextIdentityKey === activeRenderIdentityKey && nextRevisionKey === activeRenderRevisionKey) {
            return
        }
        renderGeneration++
        if (stageTimer) {
            clearTimeout(stageTimer)
            stageTimer = null
        }
        activeRenderIdentityKey = nextIdentityKey
        activeRenderRevisionKey = nextRevisionKey
        committedHtml = getCachedCommittedHtml(nextRevisionKey, nextIdentityKey)
        stagedHtml = ''
        stagingActive = false
    })

    $effect(() => {
        const generation = ++renderGeneration

        if (stageTimer) {
            clearTimeout(stageTimer)
            stageTimer = null
        }

        if (shouldRenderRawStreaming) {
            stagedHtml = ''
            stagingActive = false
            return
        }

        const currentResult = markParsingResult

        currentResult.then(async (parsed) => {
            if (generation !== renderGeneration) {
                return
            }
            await stageAndCommit(parsed, generation)
        }).catch((error) => {
            if (generation !== renderGeneration) {
                return
            }
            console.error(error)
            const fallback = typeof msgDisplay === 'string' ? msgDisplay : ''
            void stageAndCommit(fallback, generation)
        })
    })
</script>

{#if shouldRenderRawStreaming}
    <span class="whitespace-pre-wrap">{rawStreamingText}</span>
{:else}
    <span bind:this={visibleRoot} data-risu-chatbody-layer="visible">
        {@html committedHtml}
    </span>

    {#if stagingActive}
        <span
            bind:this={stagingRoot}
            data-risu-chatbody-layer="staging"
            aria-hidden="true"
            inert
            style="position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;contain:layout style paint;"
        >
            {@html stagedHtml}
        </span>
    {/if}
{/if}
