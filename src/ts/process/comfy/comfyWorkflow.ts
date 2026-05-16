import type { ComfyOutputFile } from './comfyUiClient'

type Workflow = Record<string, { inputs?: Record<string, unknown>; class_type?: string; _meta?: unknown }>

function cloneWorkflow<T>(workflow: T): T {
    return structuredClone(workflow)
}

export function patchLoadImageNode<T extends Workflow>(workflow: T, nodeId: string, fieldName: string, imageName: string): T {
    const cloned = cloneWorkflow(workflow)
    const node = cloned[nodeId]
    if (!node?.inputs) throw new Error(`ComfyUI workflow node ${nodeId} is missing inputs`)
    node.inputs[fieldName] = imageName
    return cloned
}

export function replaceWorkflowText<T extends Workflow>(workflow: T, prompt: string, negative: string): T {
    const cloned = cloneWorkflow(workflow)
    for (const node of Object.values(cloned)) {
        if (!node.inputs) continue
        for (const key of Object.keys(node.inputs)) {
            const value = node.inputs[key]
            if (typeof value === 'string') {
                node.inputs[key] = value.replaceAll('{{risu_prompt}}', prompt).replaceAll('{{risu_neg}}', negative)
            }
        }
    }
    return cloned
}

export function randomizeWorkflowSeeds<T extends Workflow>(workflow: T): T {
    const cloned = cloneWorkflow(workflow)
    for (const node of Object.values(cloned)) {
        if (!node.inputs) continue
        for (const key of Object.keys(node.inputs)) {
            if ((key === 'seed' || key.endsWith('_seed')) && typeof node.inputs[key] === 'number') {
                node.inputs[key] = Math.floor(Math.random() * 1000000000)
            }
        }
    }
    return cloned
}

const MEDIA_KEYS = ['gifs', 'video', 'videos', 'images', 'audio', '3d']

export function collectComfyOutputs(historyEntry: { outputs?: Record<string, Record<string, unknown>> }, preferredNodeId = '30'): ComfyOutputFile[] {
    const outputs = historyEntry.outputs ?? {}
    const files: ComfyOutputFile[] = []
    const nodeIds = [preferredNodeId, ...Object.keys(outputs).filter((id) => id !== preferredNodeId)]

    for (const nodeId of nodeIds) {
        const nodeOutput = outputs[nodeId]
        if (!nodeOutput) continue
        for (const key of MEDIA_KEYS) {
            const list = nodeOutput[key]
            if (!Array.isArray(list)) continue
            for (const item of list) {
                if (item && typeof item === 'object' && 'filename' in item && typeof item.filename === 'string') {
                    files.push({ ...(item as ComfyOutputFile), type: (item as ComfyOutputFile).type ?? 'output' })
                }
            }
        }
    }
    return files
}
