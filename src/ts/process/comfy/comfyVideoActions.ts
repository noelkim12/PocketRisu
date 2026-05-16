type ComfyVideoActionArgs = {
    durationMs: number
    inlayId: string
    onGenerate: (args: { img: HTMLImageElement; inlayId: string }) => void | Promise<void>
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
    button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        void args.onGenerate({ img, inlayId: args.inlayId })
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
    wrapper.appendChild(img)
    wrapper.appendChild(buttonBar)

    return wrapper
}
