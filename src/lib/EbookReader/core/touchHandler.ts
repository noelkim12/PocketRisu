export type SwipeHandlerOptions = {
    onSwipeLeft?: () => void
    onSwipeRight?: () => void
    threshold?: number
    velocityThreshold?: number
    maxVerticalRatio?: number
    now?: () => number
}

export type SwipeHandlers = {
    touchStart: (event: TouchEvent) => void
    touchMove: (event: TouchEvent) => void
    touchEnd: (event: TouchEvent) => void
    touchCancel: () => void
}

const DEFAULT_THRESHOLD = 50
const DEFAULT_VELOCITY_THRESHOLD = 0.3
const DEFAULT_MAX_VERTICAL_RATIO = 0.75
const MIN_FAST_SWIPE_DISTANCE = 30

export function createSwipeHandler(options: SwipeHandlerOptions = {}): SwipeHandlers {
    const onSwipeLeft = options.onSwipeLeft ?? (() => undefined)
    const onSwipeRight = options.onSwipeRight ?? (() => undefined)
    const threshold = options.threshold ?? DEFAULT_THRESHOLD
    const velocityThreshold = options.velocityThreshold ?? DEFAULT_VELOCITY_THRESHOLD
    const maxVerticalRatio = options.maxVerticalRatio ?? DEFAULT_MAX_VERTICAL_RATIO
    const now = options.now ?? (() => Date.now())

    let startX = 0
    let startY = 0
    let startTime = 0
    let isSwiping = false

    function touchStart(event: TouchEvent) {
        if (event.touches.length !== 1) return
        const touch = event.touches[0]
        startX = touch.clientX
        startY = touch.clientY
        startTime = now()
        isSwiping = true
    }

    function touchMove(event: TouchEvent) {
        if (!isSwiping || event.touches.length !== 1) return
    }

    function touchEnd(event: TouchEvent) {
        if (!isSwiping) return
        isSwiping = false
        const touch = event.changedTouches[0]
        if (!touch) return

        const deltaX = touch.clientX - startX
        const deltaY = touch.clientY - startY
        const duration = Math.max(1, now() - startTime)

        if (Math.abs(deltaY) > Math.abs(deltaX) * maxVerticalRatio) return

        const velocity = Math.abs(deltaX) / duration
        const isSwipe = Math.abs(deltaX) > threshold || (velocity > velocityThreshold && Math.abs(deltaX) > MIN_FAST_SWIPE_DISTANCE)
        if (!isSwipe) return

        if (deltaX > 0) onSwipeRight()
        else onSwipeLeft()
    }

    function touchCancel() {
        isSwiping = false
    }

    return { touchStart, touchMove, touchEnd, touchCancel }
}

export function attachSwipeHandler(element: HTMLElement, options: SwipeHandlerOptions = {}): () => void {
    const handlers = createSwipeHandler(options)
    element.addEventListener('touchstart', handlers.touchStart, { passive: true })
    element.addEventListener('touchmove', handlers.touchMove, { passive: true })
    element.addEventListener('touchend', handlers.touchEnd, { passive: true })
    element.addEventListener('touchcancel', handlers.touchCancel, { passive: true })

    return () => {
        element.removeEventListener('touchstart', handlers.touchStart)
        element.removeEventListener('touchmove', handlers.touchMove)
        element.removeEventListener('touchend', handlers.touchEnd)
        element.removeEventListener('touchcancel', handlers.touchCancel)
    }
}
