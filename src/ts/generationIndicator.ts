import { generationIndicatorStore, type GenerationIndicatorJob, type GenerationIndicatorKind, type GenerationIndicatorProvider, type GenerationIndicatorStatus } from './stores.svelte'

type GenerationIndicatorOptions = {
    kind: GenerationIndicatorKind
    provider: GenerationIndicatorProvider
    message: string
    detail?: string
}

type GenerationTaskOptions<T> = GenerationIndicatorOptions & {
    doneMessage?: string
    failMessage?: string
    isSuccess?: (result: T) => boolean
}

let nextGenerationIndicatorId = 0
let novelAIQueue: Promise<void> = Promise.resolve()
const clearTimers = new Map<number, ReturnType<typeof setTimeout>>()

function updateJobs(updater: (jobs: GenerationIndicatorJob[]) => GenerationIndicatorJob[]) {
    generationIndicatorStore.update((state) => {
        const jobs = updater(state.jobs)
        return {
            open: jobs.length > 0,
            jobs,
        }
    })
}

function clearJobTimer(id: number) {
    const timer = clearTimers.get(id)
    if (timer) {
        clearTimeout(timer)
        clearTimers.delete(id)
    }
}

function scheduleJobRemoval(id: number, delayMs: number) {
    clearJobTimer(id)
    clearTimers.set(id, setTimeout(() => {
        clearTimers.delete(id)
        updateJobs((jobs) => jobs.filter((job) => job.id !== id))
    }, delayMs))
}

function updateJob(id: number, patch: Partial<Omit<GenerationIndicatorJob, 'id' | 'provider' | 'kind'>>) {
    updateJobs((jobs) => jobs.map((job) => job.id === id ? { ...job, ...patch } : job))
}

/**
 * Adds one generation job to the top-screen queue indicator.
 * @param options Generation type, provider, primary message, and optional detail text.
 * @param status Initial lifecycle state for the job.
 * @returns A numeric id used to update only this generation job.
 */
export function startGenerationIndicator(options: GenerationIndicatorOptions, status: GenerationIndicatorStatus = 'running') {
    const id = ++nextGenerationIndicatorId
    clearJobTimer(id)
    updateJobs((jobs) => [...jobs, {
        id,
        status,
        kind: options.kind,
        provider: options.provider,
        message: options.message,
        detail: options.detail ?? '',
    }])
    return id
}

/**
 * Marks a queued generation job as actively running.
 * @param id Lifecycle id returned by startGenerationIndicator.
 * @param message Optional replacement message.
 * @param detail Optional replacement detail.
 */
export function runGenerationIndicator(id: number, message?: string, detail?: string) {
    updateJob(id, {
        status: 'running',
        ...(message ? { message } : {}),
        ...(detail !== undefined ? { detail } : {}),
    })
}

/**
 * Marks a matching generation indicator job as completed, then removes it after a short delay.
 * @param id Lifecycle id returned by startGenerationIndicator.
 * @param message Completion message shown to the user.
 */
export function finishGenerationIndicator(id: number, message = 'Generation completed') {
    updateJob(id, { status: 'done', message, detail: '' })
    scheduleJobRemoval(id, 2500)
}

/**
 * Marks a matching generation indicator job as failed, then removes it after a short delay.
 * @param id Lifecycle id returned by startGenerationIndicator.
 * @param message Error message shown to the user.
 */
export function failGenerationIndicator(id: number, message = 'Generation failed') {
    updateJob(id, { status: 'error', message, detail: '' })
    scheduleJobRemoval(id, 4000)
}

/**
 * Runs a ComfyUI/server-queued generation task while tracking it as an independent job.
 * @param options Indicator metadata, success predicate, and lifecycle messages.
 * @param task Async task to execute immediately.
 * @returns The task result.
 */
export async function withGenerationIndicator<T>(options: GenerationTaskOptions<T>, task: () => Promise<T>) {
    const id = startGenerationIndicator(options, 'running')
    try {
        const result = await task()
        if (options.isSuccess?.(result) === false) {
            failGenerationIndicator(id, options.failMessage ?? `${options.provider} ${options.kind} generation failed`)
        } else {
            finishGenerationIndicator(id, options.doneMessage ?? 'Generation completed')
        }
        return result
    } catch (error) {
        failGenerationIndicator(id, options.failMessage ?? `${options.provider} ${options.kind} generation failed`)
        throw error
    }
}

/**
 * Runs a NovelAI generation task through a local FIFO queue so only one request runs at a time.
 * @param options Indicator metadata, success predicate, and lifecycle messages.
 * @param task Async task to execute after earlier NovelAI jobs settle.
 * @returns The task result.
 */
export async function withNovelAIQueue<T>(options: GenerationTaskOptions<T>, task: () => Promise<T>) {
    const id = startGenerationIndicator({
        ...options,
        message: options.message || 'Queued NovelAI image...',
        detail: options.detail ?? 'Waiting for previous NovelAI request',
    }, 'queued')

    const run = async () => {
        runGenerationIndicator(id, 'Generating NovelAI image...', 'Waiting for image API response')
        try {
            const result = await task()
            if (options.isSuccess?.(result) === false) {
                failGenerationIndicator(id, options.failMessage ?? 'NovelAI image generation failed')
            } else {
                finishGenerationIndicator(id, options.doneMessage ?? 'NovelAI image ready')
            }
            return result
        } catch (error) {
            failGenerationIndicator(id, options.failMessage ?? 'NovelAI image generation failed')
            throw error
        }
    }

    const resultPromise = novelAIQueue.then(run, run)
    novelAIQueue = resultPromise.then(() => undefined, () => undefined)
    return resultPromise
}

/**
 * Clears all tracked generation jobs and pending removal timers.
 * Primarily useful when a caller needs to reset transient UI state after teardown.
 */
export function clearGenerationIndicators() {
    clearTimers.forEach((timer) => {
        clearTimeout(timer)
    })
    clearTimers.clear()
    novelAIQueue = Promise.resolve()
    generationIndicatorStore.set({ open: false, jobs: [] })
}
