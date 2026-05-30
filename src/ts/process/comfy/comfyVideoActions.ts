import { failGenerationIndicator, finishGenerationIndicator, startGenerationIndicator } from '../../generationIndicator'

type ComfyVideoActionArgs = {
    durationMs: number
    inlayId: string
    onGenerate: (args: { img: HTMLImageElement; inlayId: string; positivePrompt: string | null }) => void | boolean | Promise<void | boolean>
}

const xnaiPromptSelector = 'pre.x-risu-lb-xnai-fullsize-prompt'

function readPromptPreviewText(promptElement: HTMLElement): string {
    const parts: string[] = []

    const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent ?? '')
            return
        }

        if (node.nodeName === 'BR') {
            parts.push('\n')
            return
        }

        node.childNodes.forEach(walk)
    }

    walk(promptElement)
    return parts.join('') || promptElement.innerText || promptElement.textContent || ''
}

/**
 * Extracts the [Positive] section from an XNAI fullsize prompt text.
 * Returns null when the expected markers are missing or the section is empty.
 */
export function extractPositivePromptFromXnaiPromptText(text: string | null | undefined): string | null {
    if (!text) {
        return null
    }

    const positiveMarker = '[Positive]'
    const negativeMarker = '[Negative]'
    const positiveStart = text.indexOf(positiveMarker)
    if (positiveStart === -1) {
        return null
    }

    const contentStart = positiveStart + positiveMarker.length
    const negativeStart = text.indexOf(negativeMarker, contentStart)
    const contentEnd = negativeStart === -1 ? text.length : negativeStart
    const positivePrompt = text.substring(contentStart, contentEnd).trim()

    return positivePrompt.length > 0 ? positivePrompt : null
}

/**
 * Finds the prompt preview associated with a Comfy video inlay wrapper and
 * returns its positive prompt section. Query failures intentionally return null.
 */
export function capturePositivePromptForComfyVideo(wrapper: HTMLElement): string | null {
    const promptElement = wrapper.closest('.x-risu-lb-xnai-fullsize-pop')?.querySelector<HTMLElement>(xnaiPromptSelector)
        ?? wrapper.closest('.x-risu-lb-xnai-inlay')?.querySelector<HTMLElement>(xnaiPromptSelector)
    const promptText = promptElement ? readPromptPreviewText(promptElement) : null

    return extractPositivePromptFromXnaiPromptText(promptText)
}

export function wrapImageWithComfyVideoAction(img: HTMLImageElement, args: ComfyVideoActionArgs) {
    const wrapper = document.createElement('div')
    wrapper.className = 'x-risu-risu-comfy-video-image-wrap x-risu-risu-inlay-image'
    wrapper.style.setProperty('--risu-comfy-video-delay', `${args.durationMs}ms`)

    const buttonBar = document.createElement('div')
    buttonBar.className = 'x-risu-risu-comfy-video-action-bar'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'x-risu-risu-comfy-video-action-button'
    button.textContent = 'Generate video'

    const status = document.createElement('div')
    status.className = 'x-risu-risu-comfy-video-generating-status'
    status.textContent = 'Generating video...'
    status.hidden = true

    let isGenerating = false
    const setGenerating = (generating: boolean) => {
        isGenerating = generating
        wrapper.classList.toggle('x-risu-risu-comfy-video-generating', generating)
        button.disabled = generating
        button.hidden = generating
        status.hidden = !generating
    }

    button.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (isGenerating) {
            return
        }

        setGenerating(true)
        const generationIndicatorId = startGenerationIndicator({
            kind: 'video',
            provider: 'ComfyUI',
            message: 'Generating ComfyUI video...',
            detail: 'Running workflow',
        })
        try {
            const generated = await args.onGenerate({
                img,
                inlayId: args.inlayId,
                positivePrompt: capturePositivePromptForComfyVideo(wrapper),
            })
            if (generated === false) {
                failGenerationIndicator(generationIndicatorId, 'ComfyUI video generation failed')
            } else {
                finishGenerationIndicator(generationIndicatorId, 'ComfyUI video ready')
            }
        } catch (error) {
            failGenerationIndicator(generationIndicatorId, 'ComfyUI video generation failed')
            console.error('[comfyVideoActions] Video generation failed', error)
        } finally {
            if (wrapper.isConnected) {
                setGenerating(false)
            }
        }
    })

    let touchTimer: ReturnType<typeof setTimeout> | undefined
    wrapper.addEventListener('pointerdown', () => {
        wrapper.classList.add('x-risu-risu-comfy-video-touch-active')
        if (touchTimer) {
            clearTimeout(touchTimer)
        }
        touchTimer = setTimeout(() => {
            wrapper.classList.remove('x-risu-risu-comfy-video-touch-active')
        }, args.durationMs)
    })

    buttonBar.appendChild(button)
    buttonBar.appendChild(status)
    wrapper.appendChild(img)
    wrapper.appendChild(buttonBar)

    return wrapper
}
