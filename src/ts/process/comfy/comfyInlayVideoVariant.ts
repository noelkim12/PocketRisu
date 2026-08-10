import { buildInlayMeta, getInlayMeta, getInlayMetasBatch, setInlayMeta } from 'src/ts/process/files/inlayMeta'

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

/**
 * Loads persisted Comfy display variants for multiple original inlay IDs.
 * @param originalInlayIds Original inlay IDs requested by one resolver batch.
 * @returns A map containing only IDs that have a generated display asset.
 */
export async function getComfyVideoDisplayAssetIds(originalInlayIds: string[]): Promise<Record<string, string>> {
    const metas = await getInlayMetasBatch([...new Set(originalInlayIds)])
    const displayAssetIds: Record<string, string> = {}
    for (const id of originalInlayIds) {
        const displayAssetId = metas[id]?.comfyVideoDisplayAssetId
        if (displayAssetId) displayAssetIds[id] = displayAssetId
    }
    return displayAssetIds
}
