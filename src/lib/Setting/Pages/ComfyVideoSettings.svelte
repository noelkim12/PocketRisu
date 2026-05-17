<script lang="ts">
    import SettingPage from "src/lib/UI/GUI/SettingPage.svelte";
    import CheckInput from "src/lib/UI/GUI/CheckInput.svelte";
    import TextInput from "src/lib/UI/GUI/TextInput.svelte";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import NumberInput from "src/lib/UI/GUI/NumberInput.svelte";
    import Accordion from "src/lib/UI/Accordion.svelte";
    import { DBState } from "src/ts/stores.svelte";
    import { notifyError, notifySuccess } from "src/ts/alert";

    type WorkflowInputs = Record<string, unknown>;

    interface WorkflowNode {
        inputs?: WorkflowInputs;
        class_type?: string;
        _meta?: {
            title?: string;
        };
    }

    interface WorkflowNodeSummary {
        id: string;
        title: string;
        classType: string;
        inputKeys: string[];
        inputFieldCandidates: string[];
        isInputCandidate: boolean;
        isOutputCandidate: boolean;
    }

    type ParsedWorkflow =
        | { ok: true; nodes: WorkflowNodeSummary[]; message: string }
        | { ok: false; nodes: WorkflowNodeSummary[]; message: string };

    const workflowParseResult = $derived(parseWorkflowJson(DBState.db.comfyConfig.video.workflow));

    function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    function isWorkflowNode(value: unknown): value is WorkflowNode {
        return isRecord(value);
    }

    function parseWorkflowJson(text: string): ParsedWorkflow {
        const trimmed = text.trim();
        if (!trimmed) {
            return { ok: false, nodes: [], message: "Paste a ComfyUI API workflow JSON to preview selectable nodes." };
        }

        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (!isRecord(parsed)) {
                return { ok: false, nodes: [], message: "Workflow JSON must be an object keyed by node ID." };
            }

            const nodes = Object.entries(parsed)
                .filter(([, node]) => isWorkflowNode(node))
                .map(([id, node]) => summarizeWorkflowNode(id, node))
                .sort((left, right) => sortNodeIds(left.id, right.id));

            if (nodes.length === 0) {
                return { ok: false, nodes: [], message: "No workflow nodes were found in the JSON object." };
            }

            return { ok: true, nodes, message: "" };
        } catch (error) {
            return { ok: false, nodes: [], message: `Workflow JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}` };
        }
    }

    function summarizeWorkflowNode(id: string, node: WorkflowNode): WorkflowNodeSummary {
        const inputs = isRecord(node.inputs) ? node.inputs : {};
        const inputKeys = Object.keys(inputs);
        const classType = typeof node.class_type === "string" ? node.class_type : "Unknown";
        const title = typeof node._meta?.title === "string" && node._meta.title.trim() ? node._meta.title : classType;
        const inputFieldCandidates = inputKeys.filter((key) => typeof inputs[key] === "string");

        return {
            id,
            title,
            classType,
            inputKeys,
            inputFieldCandidates,
            isInputCandidate: isInputCandidate(classType, inputs),
            isOutputCandidate: isOutputCandidate(classType),
        };
    }

    function sortNodeIds(left: string, right: string) {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
            return leftNumber - rightNumber;
        }
        return left.localeCompare(right);
    }

    function isInputCandidate(classType: string, inputs: WorkflowInputs) {
        return classType.toLowerCase().includes("loadimage") || typeof inputs.image === "string";
    }

    function isOutputCandidate(classType: string) {
        const normalizedClassType = classType.toLowerCase();
        return normalizedClassType.includes("vhs_videocombine")
            || normalizedClassType.includes("videocombine")
            || normalizedClassType.includes("save")
            || normalizedClassType.includes("output");
    }

    function previewInputKeys(inputKeys: string[]) {
        if (inputKeys.length === 0) {
            return "No inputs";
        }

        const visibleKeys = inputKeys.slice(0, 4).join(", ");
        return inputKeys.length > 4 ? `${visibleKeys}, +${inputKeys.length - 4}` : visibleKeys;
    }

    function workflowParseMessage(result: ParsedWorkflow) {
        return result.ok ? "" : result.message;
    }

    function selectInputNode(node: WorkflowNodeSummary, field?: string) {
        DBState.db.comfyConfig.video.inputImageNodeId = node.id;
        DBState.db.comfyConfig.video.inputImageField = field ?? suggestedInputField(node);
    }

    function suggestedInputField(node: WorkflowNodeSummary) {
        if (node.inputFieldCandidates.includes("image")) {
            return "image";
        }
        return node.inputFieldCandidates[0] ?? DBState.db.comfyConfig.video.inputImageField;
    }

    function selectOutputNode(node: WorkflowNodeSummary) {
        DBState.db.comfyConfig.video.outputNodeId = node.id;
    }

    function validateWorkflow() {
        try {
            const workflow: unknown = JSON.parse(DBState.db.comfyConfig.video.workflow);
            if (!isRecord(workflow)) {
                throw new Error("Workflow JSON must be an object keyed by node ID");
            }

            const inputNode = workflow[DBState.db.comfyConfig.video.inputImageNodeId];
            const outputNode = workflow[DBState.db.comfyConfig.video.outputNodeId];

            if (!isWorkflowNode(inputNode) || !isRecord(inputNode.inputs)) {
                throw new Error(`Input image node ${DBState.db.comfyConfig.video.inputImageNodeId} is missing`);
            }
            if (!isWorkflowNode(outputNode) || !isRecord(outputNode.inputs)) {
                throw new Error(`Output node ${DBState.db.comfyConfig.video.outputNodeId} is missing`);
            }

            notifySuccess("ComfyUI video workflow looks valid");
        } catch (error) {
            notifyError(`Invalid ComfyUI video workflow: ${error}`);
        }
    }
</script>

<SettingPage title="ComfyUI Video">
    <Accordion name="ComfyUI Video Workflow" styled disabled>
        <div class="flex items-center mt-2 mb-4">
            <CheckInput bind:check={DBState.db.comfyConfig.video.enabled} name="Enable ComfyUI video generation" />
        </div>

        <span class="text-textcolor mt-2">ComfyUI URL</span>
        <TextInput className="mt-2" marginBottom placeholder="http://127.0.0.1:8188" bind:value={DBState.db.comfyUiUrl}/>

        <span class="text-textcolor mt-2">Workflow API JSON</span>
        <TextAreaInput className="mt-2" margin="bottom" bind:value={DBState.db.comfyConfig.video.workflow}/>

        <div class="mb-4 rounded-lg border border-bordercolor bg-background2 p-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <span class="text-textcolor text-sm font-semibold">Workflow Nodes</span>
                    <span class="text-textcolor2 text-xs block">Select detected input/output nodes, or keep using the manual fields below.</span>
                </div>
                {#if workflowParseResult.ok}
                    <span class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor2">{workflowParseResult.nodes.length} nodes parsed</span>
                {/if}
            </div>

            {#if workflowParseResult.ok}
                <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {#each workflowParseResult.nodes as node (node.id)}
                        <div class:border-selected={DBState.db.comfyConfig.video.inputImageNodeId === node.id || DBState.db.comfyConfig.video.outputNodeId === node.id} class:bg-selected={DBState.db.comfyConfig.video.inputImageNodeId === node.id || DBState.db.comfyConfig.video.outputNodeId === node.id} class="rounded-md border border-bordercolor bg-background p-3 transition-colors">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2">
                                        <span class="rounded bg-darkbutton px-2 py-0.5 text-xs text-textcolor">#{node.id}</span>
                                        {#if node.isInputCandidate}
                                            <span class="rounded bg-selected px-2 py-0.5 text-xs text-primary">input</span>
                                        {/if}
                                        {#if node.isOutputCandidate}
                                            <span class="rounded bg-selected px-2 py-0.5 text-xs text-textcolor">output</span>
                                        {/if}
                                    </div>
                                    <div class="mt-2 truncate text-sm font-semibold text-textcolor" title={node.title}>{node.title}</div>
                                    <div class="truncate text-xs text-textcolor2" title={node.classType}>{node.classType}</div>
                                </div>
                            </div>

                            <div class="mt-2 text-xs text-textcolor2" title={node.inputKeys.join(", ")}>inputs: {previewInputKeys(node.inputKeys)}</div>

                            <div class="mt-3 flex flex-wrap gap-2">
                                {#if node.isInputCandidate}
                                    <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2" onclick={() => selectInputNode(node)}>
                                        Use as input
                                    </button>
                                {/if}
                                {#if node.isOutputCandidate}
                                    <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2" onclick={() => selectOutputNode(node)}>
                                        Use as output
                                    </button>
                                {/if}
                            </div>

                            {#if node.isInputCandidate && node.inputFieldCandidates.length > 0}
                                <div class="mt-2 flex flex-wrap gap-1">
                                    {#each node.inputFieldCandidates as field}
                                        <button class:border-selected={DBState.db.comfyConfig.video.inputImageNodeId === node.id && DBState.db.comfyConfig.video.inputImageField === field} class:text-textcolor={DBState.db.comfyConfig.video.inputImageNodeId === node.id && DBState.db.comfyConfig.video.inputImageField === field} class="rounded border border-bordercolor px-2 py-0.5 text-xs text-textcolor2 transition-colors hover:text-textcolor" onclick={() => selectInputNode(node, field)}>
                                            field: {field}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="rounded-md border border-bordercolor bg-background px-3 py-2 text-xs text-textcolor2">
                    {workflowParseMessage(workflowParseResult)}
                </div>
            {/if}
        </div>

        <div class="grid grid-cols-2 gap-3">
            <div>
                <span class="text-textcolor mt-2">Input Image Node ID</span>
                <TextInput className="mt-2" marginBottom bind:value={DBState.db.comfyConfig.video.inputImageNodeId}/>
            </div>
            <div>
                <span class="text-textcolor mt-2">Input Image Field</span>
                <TextInput className="mt-2" marginBottom bind:value={DBState.db.comfyConfig.video.inputImageField}/>
            </div>
            <div>
                <span class="text-textcolor mt-2">Output Node ID</span>
                <TextInput className="mt-2" marginBottom bind:value={DBState.db.comfyConfig.video.outputNodeId}/>
            </div>
            <div>
                <span class="text-textcolor mt-2">Timeout (sec)</span>
                <NumberInput className="mt-2" marginBottom min={1} max={900} bind:value={DBState.db.comfyConfig.video.timeout}/>
            </div>
        </div>

        <span class="text-textcolor mt-2">Positive Prompt</span>
        <TextAreaInput className="mt-2" margin="bottom" bind:value={DBState.db.comfyConfig.video.positivePrompt}/>

        <span class="text-textcolor mt-2">Negative Prompt</span>
        <TextAreaInput className="mt-2" margin="bottom" bind:value={DBState.db.comfyConfig.video.negativePrompt}/>

        <span class="text-textcolor mt-2">Output Format</span>
        <span class="text-textcolor2 text-xs mb-4 block">
            Fixed to animated WebP (image/webp). The bundled WAN workflow uses VHS_VideoCombine node 30 with format: "image/webp", and its result is read from outputs["30"].gifs[0].
        </span>

        <span class="text-textcolor mt-2">Hover Button Duration (ms)</span>
        <NumberInput className="mt-2" marginBottom min={0} max={10000} bind:value={DBState.db.comfyConfig.video.hoverButtonDurationMs}/>

        <button class="px-3 py-2 rounded-md bg-darkbutton hover:bg-textcolor2 transition-colors" onclick={validateWorkflow}>
            Validate Workflow
        </button>
    </Accordion>
</SettingPage>
