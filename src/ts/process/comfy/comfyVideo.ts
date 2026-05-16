import { downloadComfyFile, pollComfyHistory, queueComfyPrompt, uploadComfyImage } from './comfyUiClient'
import { collectComfyOutputs, patchLoadImageNode, randomizeWorkflowSeeds, replaceWorkflowText } from './comfyWorkflow'

export async function generateComfyVideoFromBlob(args: {
    baseUrl: string
    image: Blob
    filename: string
    workflowText: string
    inputImageNodeId: string
    inputImageField: string
    outputNodeId: string
    positivePrompt: string
    negativePrompt: string
    timeoutSeconds: number
}) {
    const uploaded = await uploadComfyImage({ baseUrl: args.baseUrl, image: args.image, filename: args.filename })
    let workflow = JSON.parse(args.workflowText)
    workflow = patchLoadImageNode(workflow, args.inputImageNodeId, args.inputImageField, uploaded.name)
    workflow = replaceWorkflowText(workflow, args.positivePrompt, args.negativePrompt)
    workflow = randomizeWorkflowSeeds(workflow)

    const promptId = await queueComfyPrompt(args.baseUrl, workflow)
    const historyEntry = await pollComfyHistory(args.baseUrl, promptId, args.timeoutSeconds * 1000)
    const output = collectComfyOutputs(historyEntry, args.outputNodeId)[0]
    if (!output) throw new Error('ComfyUI did not return a downloadable video output')

    const downloaded = await downloadComfyFile(args.baseUrl, output)
    return downloaded
}
