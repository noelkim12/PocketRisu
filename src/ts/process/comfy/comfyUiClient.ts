export interface ComfyUploadResult {
    name: string
    subfolder: string
    type: string
}

export interface ComfyOutputFile {
    filename: string
    subfolder?: string
    type?: string
    format?: string
    frame_rate?: number
    workflow?: string
    fullpath?: string
}

export function buildComfyUrl(baseUrl: string, pathname: string, params: Record<string, string> = {}) {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
    const url = baseUrl.endsWith('/api')
        ? new URL(`${baseUrl}${normalizedPath}`)
        : new URL(normalizedPath, baseUrl)
    url.search = new URLSearchParams(params).toString()
    return url.toString()
}

export async function uploadComfyImage(args: {
    baseUrl: string
    image: Blob
    filename: string
    subfolder?: string
}) {
    const form = new FormData()
    form.append('image', args.image, args.filename)
    form.append('type', 'input')
    form.append('overwrite', 'true')
    if (args.subfolder) {
        form.append('subfolder', args.subfolder)
    }

    const response = await globalThis.fetch(buildComfyUrl(args.baseUrl, '/upload/image'), {
        method: 'POST',
        body: form
    })

    if (!response.ok) {
        throw new Error(`ComfyUI image upload failed: HTTP ${response.status} ${await response.text()}`)
    }

    return await response.json() as ComfyUploadResult
}

export async function downloadComfyFile(baseUrl: string, file: ComfyOutputFile) {
    const response = await globalThis.fetch(buildComfyUrl(baseUrl, '/view', {
        filename: file.filename,
        subfolder: file.subfolder ?? '',
        type: file.type ?? 'output'
    }))

    if (!response.ok) {
        throw new Error(`ComfyUI output download failed: HTTP ${response.status} ${await response.text()}`)
    }

    return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get('Content-Type')?.split(';')[0] || file.format || 'application/octet-stream'
    }
}

export async function queueComfyPrompt(baseUrl: string, workflow: unknown) {
    const response = await globalThis.fetch(buildComfyUrl(baseUrl, '/prompt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow })
    })

    if (!response.ok) throw new Error(`ComfyUI prompt failed: HTTP ${response.status} ${await response.text()}`)
    const data = await response.json() as { prompt_id?: string; error?: unknown; node_errors?: unknown }
    if (data.error || !data.prompt_id) throw new Error(`ComfyUI prompt rejected: ${JSON.stringify(data)}`)
    return data.prompt_id
}

export async function pollComfyHistory(baseUrl: string, promptId: string, timeoutMs: number, intervalMs = 1000) {
    const start = Date.now()
    while (Date.now() - start <= timeoutMs) {
        const response = await globalThis.fetch(buildComfyUrl(baseUrl, `/history/${encodeURIComponent(promptId)}`))
        if (!response.ok) throw new Error(`ComfyUI history failed: HTTP ${response.status} ${await response.text()}`)
        const history = await response.json()
        const entry = history[promptId]
        if (entry?.outputs && Object.keys(entry.outputs).length > 0) return entry
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    throw new Error(`ComfyUI generation timed out after ${Math.round(timeoutMs / 1000)} seconds`)
}
