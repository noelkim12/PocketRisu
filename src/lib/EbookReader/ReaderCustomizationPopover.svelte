<script lang="ts">
    import { SlidersHorizontalIcon } from '@lucide/svelte'
    import { DBState } from 'src/ts/stores.svelte'
    import { DESKTOP_NAV_AREA_WIDTH_PERCENT_MAX, DESKTOP_NAV_AREA_WIDTH_PERCENT_MIN, DESKTOP_NAV_AREA_WIDTH_PERCENT_STEP, PAGE_WIDTH_PERCENT_MAX, PAGE_WIDTH_PERCENT_MIN, PAGE_WIDTH_PERCENT_STEP, defaultEbookReaderPrefs, normalizeEbookReaderPrefs, type EbookReaderAppearance, type EbookReaderFontFamily, type EbookReaderPrefs } from './core/preferences'
    import { readerLabel } from './readerLanguage'

    type Props = {
        buttonClass: string
        iconSize: number
        align?: 'left' | 'right'
    }

    const appearances: { value: EbookReaderAppearance; label: string }[] = [
        { value: 'system', label: readerLabel('ebookReaderAppearanceSystem') },
        { value: 'light', label: readerLabel('ebookReaderAppearanceLight') },
        { value: 'dark', label: readerLabel('ebookReaderAppearanceDark') },
        { value: 'sepia', label: readerLabel('ebookReaderAppearanceSepia') },
    ]

    const fontFamilies: { value: EbookReaderFontFamily; label: string }[] = [
        { value: 'inherit', label: readerLabel('ebookReaderFontFamilyInherit') },
        { value: 'serif', label: readerLabel('ebookReaderFontFamilySerif') },
        { value: 'sans-serif', label: readerLabel('ebookReaderFontFamilySansSerif') },
        { value: 'monospace', label: readerLabel('ebookReaderFontFamilyMonospace') },
    ]

    let { buttonClass, iconSize, align = 'right' }: Props = $props()
    let rootElement: HTMLElement | null = $state(null)
    let triggerButton: HTMLButtonElement | null = $state(null)
    let open = $state(false)
    let prefs = $derived(normalizeEbookReaderPrefs(DBState.db.ebookReaderPrefs))

    function closePopover({ restoreFocus = false } = {}) {
        open = false
        if (restoreFocus) requestAnimationFrame(() => triggerButton?.focus())
    }

    function updatePrefs(nextPrefs: Partial<EbookReaderPrefs>) {
        DBState.db.ebookReaderPrefs = normalizeEbookReaderPrefs({ ...prefs, ...nextPrefs })
    }

    function inputNumber(event: Event) {
        return event.currentTarget instanceof HTMLInputElement ? Number(event.currentTarget.value) : Number.NaN
    }

    function selectValue(event: Event) {
        return event.currentTarget instanceof HTMLSelectElement ? event.currentTarget.value : ''
    }

    function isAppearance(value: string): value is EbookReaderAppearance {
        return appearances.some((option) => option.value === value)
    }

    function isFontFamily(value: string): value is EbookReaderFontFamily {
        return fontFamilies.some((option) => option.value === value)
    }

    function updateAppearance(event: Event) {
        const value = selectValue(event)
        if (isAppearance(value)) updatePrefs({ appearance: value })
    }

    function updateFontFamily(event: Event) {
        const value = selectValue(event)
        if (isFontFamily(value)) updatePrefs({ fontFamily: value })
    }

    function updateBlurImages(event: Event) {
        if (event.currentTarget instanceof HTMLInputElement) updatePrefs({ blurImages: event.currentTarget.checked })
    }

    function resetDisplayOptions() {
        updatePrefs(defaultEbookReaderPrefs)
    }

    function closeFromOutside(event: MouseEvent) {
        if (!open || !rootElement || !(event.target instanceof Node)) return
        if (!rootElement.contains(event.target)) closePopover()
    }

    function handleWindowKeydown(event: KeyboardEvent) {
        if (!open || event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        closePopover({ restoreFocus: true })
    }
</script>

<svelte:window onclick={closeFromOutside} onkeydown={handleWindowKeydown} />

<div bind:this={rootElement} class="relative shrink-0">
    <button
        bind:this={triggerButton}
        class={buttonClass}
        type="button"
        title={readerLabel('ebookReaderDisplayOptions')}
        aria-label={readerLabel('ebookReaderDisplayOptions')}
        aria-expanded={open}
        aria-controls="ebook-reader-display-options-popover"
        onclick={() => open = !open}
    >
        <SlidersHorizontalIcon size={iconSize} />
    </button>

    {#if open}
        <div id="ebook-reader-display-options-popover" class={`absolute top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-darkborderc bg-darkbg p-4 text-textcolor shadow-2xl ${align === 'left' ? 'left-0' : 'right-0'}`} role="dialog" aria-label={readerLabel('ebookReaderDisplayOptions')}>
            <div class="mb-3 flex items-start justify-between gap-3">
                <div>
                    <h3 class="text-sm font-semibold text-textcolor">{readerLabel('ebookReaderDisplayOptions')}</h3>
                    <p class="mt-0.5 text-[11px] text-textcolor2">{readerLabel('ebookReaderCustomization')}</p>
                </div>
                <button class="rounded-md px-2 py-1 text-[11px] text-textcolor2 hover:bg-selected hover:text-primary" type="button" onclick={resetDisplayOptions}>
                    {readerLabel('ebookReaderResetDisplayOptions')}
                </button>
            </div>

            <div class="grid gap-3">
                <label class="grid gap-1.5 text-xs text-textcolor2">
                    <span>{readerLabel('ebookReaderAppearance')}</span>
                    <select class="rounded-md border border-darkborderc bg-bg px-2 py-2 text-sm text-textcolor outline-hidden focus:ring-2 focus:ring-selected" value={prefs.appearance} onchange={updateAppearance}>
                        {#each appearances as option}
                            <option value={option.value}>{option.label}</option>
                        {/each}
                    </select>
                </label>

                <label class="grid gap-1.5 text-xs text-textcolor2">
                    <span class="flex justify-between gap-2"><span>{readerLabel('ebookReaderFontSize')}</span><span>{prefs.fontSize.toFixed(0)}px</span></span>
                    <input class="accent-primary" type="range" min="12" max="28" step="1" value={prefs.fontSize} oninput={(event) => updatePrefs({ fontSize: inputNumber(event) })} />
                </label>

                <label class="grid gap-1.5 text-xs text-textcolor2">
                    <span class="flex justify-between gap-2"><span>{readerLabel('ebookReaderLineHeight')}</span><span>{prefs.lineHeight.toFixed(2)}</span></span>
                    <input class="accent-primary" type="range" min="1.2" max="2.2" step="0.05" value={prefs.lineHeight} oninput={(event) => updatePrefs({ lineHeight: inputNumber(event) })} />
                </label>

                <label class="grid gap-1.5 text-xs text-textcolor2">
                    <span class="flex justify-between gap-2"><span>{readerLabel('ebookReaderParagraphSpacing')}</span><span>{prefs.paragraphSpacing.toFixed(2)}em</span></span>
                    <input class="accent-primary" type="range" min="0" max="1.5" step="0.05" value={prefs.paragraphSpacing} oninput={(event) => updatePrefs({ paragraphSpacing: inputNumber(event) })} />
                </label>

                <label class="grid gap-1.5 text-xs text-textcolor2">
                    <span>{readerLabel('ebookReaderFontFamily')}</span>
                    <select class="rounded-md border border-darkborderc bg-bg px-2 py-2 text-sm text-textcolor outline-hidden focus:ring-2 focus:ring-selected" value={prefs.fontFamily} onchange={updateFontFamily}>
                        {#each fontFamilies as option}
                            <option value={option.value}>{option.label}</option>
                        {/each}
                    </select>
                </label>

                <label class="grid gap-1.5 text-xs text-textcolor2">
                    <span class="flex justify-between gap-2"><span>{readerLabel('ebookReaderPageWidth')}</span><span>{prefs.pageWidth.toFixed(0)}%</span></span>
                    <input class="accent-primary" type="range" min={PAGE_WIDTH_PERCENT_MIN} max={PAGE_WIDTH_PERCENT_MAX} step={PAGE_WIDTH_PERCENT_STEP} value={prefs.pageWidth} oninput={(event) => updatePrefs({ pageWidth: inputNumber(event) })} />
                </label>

                <label class="grid gap-1.5 text-xs text-textcolor2">
                    <span class="flex justify-between gap-2"><span>{readerLabel('ebookReaderDesktopNavAreaWidth')}</span><span>{prefs.desktopNavAreaWidth.toFixed(0)}%</span></span>
                    <input class="accent-primary" type="range" min={DESKTOP_NAV_AREA_WIDTH_PERCENT_MIN} max={DESKTOP_NAV_AREA_WIDTH_PERCENT_MAX} step={DESKTOP_NAV_AREA_WIDTH_PERCENT_STEP} value={prefs.desktopNavAreaWidth} oninput={(event) => updatePrefs({ desktopNavAreaWidth: inputNumber(event) })} />
                </label>

                <label class="flex items-center justify-between gap-3 rounded-lg border border-darkborderc bg-bg px-3 py-2 text-xs text-textcolor2">
                    <span>{readerLabel('ebookReaderBlurImages')}</span>
                    <input class="accent-primary" type="checkbox" checked={prefs.blurImages} onchange={updateBlurImages} />
                </label>
            </div>
        </div>
    {/if}
</div>
