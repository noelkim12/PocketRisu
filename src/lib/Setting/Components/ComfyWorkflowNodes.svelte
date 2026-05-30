<script lang="ts">
    import ShDialog from "src/lib/UI/GUI/ShDialog.svelte";
    import { previewInputKeys, workflowParseMessage, type ParsedWorkflow, type WorkflowGraphEdge, type WorkflowNode, type WorkflowNodeSummary } from "src/ts/comfy/workflowPreview";

    interface Props {
        result: ParsedWorkflow;
        selectedInputNodeId?: string;
        selectedInputField?: string;
        selectedOutputNodeId?: string;
        showInputActions?: boolean;
        showOutputActions?: boolean;
        onSelectInput?: (node: WorkflowNodeSummary, field?: string) => void;
        onSelectOutput?: (node: WorkflowNodeSummary) => void;
        onUpdateNode?: (nodeId: string, node: WorkflowNode) => void;
        emptyTitle?: string;
        emptyDescription?: string;
    }

    let {
        result,
        selectedInputNodeId = "",
        selectedInputField = "",
        selectedOutputNodeId = "",
        showInputActions = false,
        showOutputActions = false,
        onSelectInput = () => {},
        onSelectOutput = () => {},
        onUpdateNode = () => {},
        emptyTitle = "Workflow Nodes",
        emptyDescription = "Preview detected workflow nodes from the JSON above.",
    }: Props = $props();

    let editingNode = $state<WorkflowNodeSummary | null>(null);
    let editingNodeJson = $state("");
    let editingError = $state("");

    const NODE_WIDTH = 240;
    const NODE_HEIGHT = 132;
    const X_GAP = 36;
    const ROW_GAP = 52;
    const LAYER_GAP = 84;
    const GRAPH_PADDING = 24;
    const MAX_LAYER_COLUMNS = 2;

    interface WorkflowLayoutNode {
        node: WorkflowNodeSummary;
        x: number;
        y: number;
    }

    interface WorkflowLayoutEdge {
        edge: WorkflowGraphEdge;
        path: string;
        labelX: number;
        labelY: number;
    }

    interface WorkflowLayout {
        nodes: WorkflowLayoutNode[];
        edges: WorkflowLayoutEdge[];
        width: number;
        height: number;
    }

    const graph = $derived(createWorkflowLayout(result));

    /**
     * Opens the node editor modal with pretty-printed JSON for the clicked workflow node.
     * @param node Node summary selected from the graph/card preview.
     * @returns Nothing.
     */
    function openNodeEditor(node: WorkflowNodeSummary) {
        editingNode = node;
        editingNodeJson = JSON.stringify(node.rawNode, null, 2);
        editingError = "";
    }

    /**
     * Validates and saves the edited node JSON back to the owning settings page.
     * @returns Nothing.
     */
    function saveNodeEditor() {
        if (!editingNode) {
            return;
        }

        try {
            const parsed: unknown = JSON.parse(editingNodeJson);
            if (!isWorkflowNodeEdit(parsed)) {
                editingError = "Node JSON must be an object.";
                return;
            }

            onUpdateNode(editingNode.id, parsed);
            editingNode = null;
            editingNodeJson = "";
            editingError = "";
        } catch (error) {
            editingError = `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    /**
     * Checks whether edited modal content can replace a ComfyUI API node object.
     * @param value Parsed JSON from the node editor textarea.
     * @returns True when the value is a non-array object.
     */
    function isWorkflowNodeEdit(value: unknown): value is WorkflowNode {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    /**
     * Opens the node editor from keyboard activation on a node card.
     * @param event Keyboard event from the focusable node card.
     * @param node Node summary represented by the focused card.
     * @returns Nothing.
     */
    function handleNodeCardKeydown(event: KeyboardEvent, node: WorkflowNodeSummary) {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        event.preventDefault();
        openNodeEditor(node);
    }

    /**
     * Builds a compact top-down layout used by the settings preview graph.
     * @param parsed Parsed workflow graph metadata from the ComfyUI API JSON parser.
     * @returns Absolute card positions and SVG connector paths, or null for grid fallback.
     */
    function createWorkflowLayout(parsed: ParsedWorkflow): WorkflowLayout | null {
        if (!parsed.ok || parsed.edges.length === 0 || parsed.layers.length === 0) {
            return null;
        }

        const nodeById = new Map(parsed.nodes.map((node) => [node.id, node]));
        const maxColumns = Math.min(MAX_LAYER_COLUMNS, Math.max(1, ...parsed.layers.map((layer) => Math.min(layer.length, MAX_LAYER_COLUMNS))));
        const width = GRAPH_PADDING * 2 + maxColumns * NODE_WIDTH + Math.max(0, maxColumns - 1) * X_GAP;
        const layoutNodes: WorkflowLayoutNode[] = [];
        let nextLayerY = GRAPH_PADDING;

        for (const layer of parsed.layers) {
            const layerRows = chunkLayer(layer, MAX_LAYER_COLUMNS);
            let rowY = nextLayerY;

            for (const row of layerRows) {
                const layerWidth = row.length * NODE_WIDTH + Math.max(0, row.length - 1) * X_GAP;
                const startX = GRAPH_PADDING + Math.max(0, (width - GRAPH_PADDING * 2 - layerWidth) / 2);

                for (const [nodeIndex, nodeId] of row.entries()) {
                    const node = nodeById.get(nodeId);
                    if (!node) {
                        continue;
                    }

                    layoutNodes.push({
                        node,
                        x: startX + nodeIndex * (NODE_WIDTH + X_GAP),
                        y: rowY,
                    });
                }

                rowY += NODE_HEIGHT + ROW_GAP;
            }

            nextLayerY = rowY - ROW_GAP + LAYER_GAP;
        }

        const positionById = new Map(layoutNodes.map((layoutNode) => [layoutNode.node.id, layoutNode]));
        const layoutEdges = parsed.edges.flatMap((edge) => {
            const from = positionById.get(edge.fromNodeId);
            const to = positionById.get(edge.toNodeId);
            if (!from || !to) {
                return [];
            }

            return [createWorkflowEdgePath(edge, from, to)];
        });

        return { nodes: layoutNodes, edges: layoutEdges, width, height: Math.max(NODE_HEIGHT + GRAPH_PADDING * 2, nextLayerY - LAYER_GAP + GRAPH_PADDING) };
    }

    /**
     * Splits a logical graph layer into short visual rows that fit the settings panel width.
     * @param layer Node IDs in one topological layer.
     * @param size Maximum number of cards per visual row.
     * @returns Layer rows that preserve node order while avoiding horizontal overflow.
     */
    function chunkLayer(layer: string[], size: number): string[][] {
        const rows: string[][] = [];
        for (let index = 0; index < layer.length; index += size) {
            rows.push(layer.slice(index, index + size));
        }
        return rows;
    }

    /**
     * Creates a smooth vertical connector between two positioned workflow cards.
     * @param edge Workflow edge metadata to preserve label and input names.
     * @param from Source node layout box.
     * @param to Target node layout box.
     * @returns SVG path data and label coordinates for the connector.
     */
    function createWorkflowEdgePath(edge: WorkflowGraphEdge, from: WorkflowLayoutNode, to: WorkflowLayoutNode): WorkflowLayoutEdge {
        const startX = from.x + NODE_WIDTH / 2;
        const startY = from.y + NODE_HEIGHT;
        const endX = to.x + NODE_WIDTH / 2;
        const endY = to.y;
        const bend = Math.max(28, Math.abs(endY - startY) / 2);
        const path = `M ${startX} ${startY} C ${startX} ${startY + bend}, ${endX} ${endY - bend}, ${endX} ${endY}`;

        return {
            edge,
            path,
            labelX: (startX + endX) / 2,
            labelY: (startY + endY) / 2,
        };
    }
</script>

{#snippet nodeCard(node)}
    <div role="button" tabindex="0" class:border-selected={selectedInputNodeId === node.id || selectedOutputNodeId === node.id} class:bg-selected={selectedInputNodeId === node.id || selectedOutputNodeId === node.id} class="flex h-full w-full cursor-pointer flex-col rounded-md border border-bordercolor bg-background p-3 text-left shadow-sm transition-colors hover:border-borderc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-borderc/60" onclick={() => openNodeEditor(node)} onkeydown={(event) => handleNodeCardKeydown(event, node)}>
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded bg-darkbutton px-2 py-0.5 text-xs text-textcolor">#{node.id}</span>
                    {#if result.ok && result.sources.includes(node.id)}
                        <span class="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-200">source</span>
                    {/if}
                    {#if result.ok && result.sinks.includes(node.id)}
                        <span class="rounded bg-orange-900/50 px-2 py-0.5 text-xs text-orange-200">sink</span>
                    {/if}
                    {#if node.isPromptCandidate}
                        <span class="rounded bg-selected px-2 py-0.5 text-xs text-primary">prompt</span>
                    {/if}
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

        <div class="mt-2 truncate text-xs text-textcolor2" title={node.inputKeys.join(", ")}>inputs: {previewInputKeys(node.inputKeys)}</div>

        {#if showInputActions || showOutputActions}
            <div class="mt-auto flex flex-wrap gap-2 pt-3">
                {#if showInputActions && node.isInputCandidate}
                    <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2" onclick={(event) => { event.stopPropagation(); onSelectInput(node); }}>
                        Use as input
                    </button>
                {/if}
                {#if showOutputActions && node.isOutputCandidate}
                    <button class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor transition-colors hover:bg-textcolor2" onclick={(event) => { event.stopPropagation(); onSelectOutput(node); }}>
                        Use as output
                    </button>
                {/if}
            </div>
        {/if}

        {#if showInputActions && node.isInputCandidate && node.inputFieldCandidates.length > 0}
            <div class="mt-2 flex flex-wrap gap-1">
                {#each node.inputFieldCandidates as field}
                    <button class:border-selected={selectedInputNodeId === node.id && selectedInputField === field} class:text-textcolor={selectedInputNodeId === node.id && selectedInputField === field} class="rounded border border-bordercolor px-2 py-0.5 text-xs text-textcolor2 transition-colors hover:text-textcolor" onclick={(event) => { event.stopPropagation(); onSelectInput(node, field); }}>
                        field: {field}
                    </button>
                {/each}
            </div>
        {/if}
    </div>
{/snippet}

<div class="mb-4 rounded-lg border border-bordercolor bg-background2 p-3">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
            <span class="text-textcolor text-sm font-semibold">{emptyTitle}</span>
            <span class="text-textcolor2 text-xs block">{emptyDescription}</span>
        </div>
        {#if result.ok}
            <span class="rounded-md bg-darkbutton px-2 py-1 text-xs text-textcolor2">{result.nodes.length} nodes parsed</span>
        {/if}
    </div>

    {#if result.ok}
        {#if graph}
            <div class="mb-2 flex flex-wrap gap-2 text-xs text-textcolor2">
                <span>{result.edges.length} links</span>
                <span>{result.sources.length} sources</span>
                <span>{result.sinks.length} sinks</span>
                {#if result.warnings.length > 0}
                    <span class="text-orange-200">{result.warnings.length} warnings</span>
                {/if}
            </div>

            {#if result.warnings.length > 0}
                <div class="mb-2 rounded-md border border-orange-900/70 bg-orange-950/30 px-3 py-2 text-xs text-orange-100">
                    {result.warnings[0]}
                </div>
            {/if}

            <div class="overflow-auto rounded-md border border-bordercolor bg-background p-3">
                <div class="relative" style={`width: ${graph.width}px; height: ${graph.height}px;`}>
                    <svg class="absolute inset-0 h-full w-full" width={graph.width} height={graph.height} viewBox={`0 0 ${graph.width} ${graph.height}`} aria-hidden="true">
                        <defs>
                            <marker id="comfy-workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                                <path d="M 0 0 L 8 4 L 0 8 z" class="fill-textcolor2" />
                            </marker>
                        </defs>
                        {#each graph.edges as layoutEdge (layoutEdge.edge.id)}
                            <path d={layoutEdge.path} class="fill-none stroke-textcolor2/60" stroke-width="2" marker-end="url(#comfy-workflow-arrow)" />
                            <text x={layoutEdge.labelX} y={layoutEdge.labelY} text-anchor="middle" class="fill-textcolor2 text-[10px]">
                                {layoutEdge.edge.toInputName}
                            </text>
                        {/each}
                    </svg>

                    {#each graph.nodes as layoutNode (layoutNode.node.id)}
                        <div class="absolute" style={`left: ${layoutNode.x}px; top: ${layoutNode.y}px; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px;`}>
                            {@render nodeCard(layoutNode.node)}
                        </div>
                    {/each}
                </div>
            </div>
        {:else}
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {#each result.nodes as node (node.id)}
                    {@render nodeCard(node)}
                {/each}
            </div>
        {/if}
    {:else}
        <div class="rounded-md border border-bordercolor bg-background px-3 py-2 text-xs text-textcolor2">
            {workflowParseMessage(result)}
        </div>
    {/if}
</div>

<ShDialog open={editingNode !== null} onOpenChange={(open) => { if (!open) editingNode = null; }} size="lg" closeOnEscape closeOnOutsideClick={false}>
    {#snippet title()}
        Edit Workflow Node {editingNode ? `#${editingNode.id}` : ""}
    {/snippet}

    {#snippet description()}
        Edit this ComfyUI API node JSON directly. Save updates the workflow JSON field and refreshes the graph.
    {/snippet}

    {#if editingNode}
        <div class="flex flex-col gap-3">
            <div class="rounded-md border border-bordercolor bg-background px-3 py-2 text-xs text-textcolor2">
                <div class="font-semibold text-textcolor">{editingNode.title}</div>
                <div>{editingNode.classType}</div>
            </div>
            <textarea
                class="min-h-96 w-full resize-y rounded-md border border-bordercolor bg-background px-3 py-2 font-mono text-xs text-textcolor outline-none transition-colors focus:border-borderc focus:ring-2 focus:ring-borderc/50"
                bind:value={editingNodeJson}
                spellcheck="false"
            ></textarea>
            {#if editingError}
                <div class="rounded-md border border-orange-900/70 bg-orange-950/30 px-3 py-2 text-xs text-orange-100">
                    {editingError}
                </div>
            {/if}
        </div>
    {/if}

    {#snippet footer()}
        <button class="rounded-md bg-darkbutton px-3 py-2 text-sm text-textcolor transition-colors hover:bg-textcolor2" onclick={() => { editingNode = null; }}>
            Cancel
        </button>
        <button class="rounded-md bg-primary px-3 py-2 text-sm text-white transition-opacity hover:opacity-90" onclick={saveNodeEditor}>
            Save node
        </button>
    {/snippet}
</ShDialog>
