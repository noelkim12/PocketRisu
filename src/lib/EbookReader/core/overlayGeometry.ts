export type EbookReaderPanelRect = {
    top: number
    left: number
    width: number
    height: number
}

export type EbookReaderViewportRect = {
    top: number
    left: number
    right: number
    bottom: number
}

export function getVisibleRect(
    rect: EbookReaderViewportRect,
    clipRect: EbookReaderViewportRect,
): EbookReaderPanelRect | null {
    const visibleTop = Math.max(rect.top, clipRect.top, 0)
    const visibleLeft = Math.max(rect.left, clipRect.left, 0)
    const visibleRight = Math.min(rect.right, clipRect.right)
    const visibleBottom = Math.min(rect.bottom, clipRect.bottom)
    const width = Math.max(0, visibleRight - visibleLeft)
    const height = Math.max(0, visibleBottom - visibleTop)

    if (width === 0 || height === 0) return null
    return { top: visibleTop, left: visibleLeft, width, height }
}

export function getReaderPanelRect(
    anchorRect: EbookReaderViewportRect,
    hostRect: EbookReaderViewportRect,
    viewportRect: EbookReaderViewportRect,
    excludedRects: EbookReaderViewportRect[] = [],
): EbookReaderPanelRect | null {
    const visibleHostRect = getVisibleRect(hostRect, viewportRect)
    if (!visibleHostRect) return null

    const visibleAnchorRect = getVisibleRect(anchorRect, hostRect)
    if (!visibleAnchorRect) return null

    const visibleHostBottom = visibleHostRect.top + visibleHostRect.height
    const panelBottom = excludedRects.reduce((bottom, excludedRect) => {
        const visibleExcludedRect = getVisibleRect(excludedRect, viewportRect)
        if (!visibleExcludedRect) return bottom

        const excludedTop = visibleExcludedRect.top
        const excludedBottom = visibleExcludedRect.top + visibleExcludedRect.height
        const excludedRight = visibleExcludedRect.left + visibleExcludedRect.width
        const anchorRight = visibleAnchorRect.left + visibleAnchorRect.width
        const overlapsPanelColumn = excludedRight > visibleAnchorRect.left && visibleExcludedRect.left < anchorRight
        const overlapsHostBottom = excludedBottom > visibleHostRect.top && excludedTop < visibleHostBottom

        if (!overlapsPanelColumn || !overlapsHostBottom || excludedTop <= visibleHostRect.top) return bottom
        return Math.min(bottom, excludedTop)
    }, visibleHostBottom)

    const height = Math.max(0, panelBottom - visibleHostRect.top)
    if (height === 0) return null

    return {
        top: visibleHostRect.top,
        left: visibleAnchorRect.left,
        width: visibleAnchorRect.width,
        height,
    }
}
