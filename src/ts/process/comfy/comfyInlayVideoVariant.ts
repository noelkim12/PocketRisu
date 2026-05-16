import { buildInlayMeta, getInlayMeta, setInlayMeta } from 'src/ts/process/files/inlayMeta'

export async function setComfyVideoDisplayAsset(originalInlayId: string, generatedInlayId: string): Promise<void> {
    const existing = await getInlayMeta(originalInlayId)
    const next = buildInlayMeta(existing)
    next.comfyVideoDisplayAssetId = generatedInlayId
    next.comfyVideoUpdatedAt = Date.now()
    await setInlayMeta(originalInlayId, next)
}

export async function getComfyVideoDisplayAssetId(originalInlayId: string): Promise<string | null> {
    const meta = await getInlayMeta(originalInlayId)
    return meta?.comfyVideoDisplayAssetId ?? null
}
