export type WorkflowInputs = Record<string, unknown>;

export interface WorkflowNode {
    inputs?: WorkflowInputs;
    class_type?: string;
    _meta?: {
        title?: string;
    };
}

export interface WorkflowNodeSummary {
    id: string;
    title: string;
    classType: string;
    rawNode: WorkflowNode;
    inputKeys: string[];
    inputFieldCandidates: string[];
    isInputCandidate: boolean;
    isOutputCandidate: boolean;
    isPromptCandidate: boolean;
}

export interface WorkflowGraphEdge {
    id: string;
    fromNodeId: string;
    fromOutputIndex: number;
    toNodeId: string;
    toInputName: string;
}

export type ParsedWorkflow =
    | { ok: true; nodes: WorkflowNodeSummary[]; edges: WorkflowGraphEdge[]; sources: string[]; sinks: string[]; layers: string[][]; warnings: string[]; message: string }
    | { ok: false; nodes: WorkflowNodeSummary[]; edges: WorkflowGraphEdge[]; sources: string[]; sinks: string[]; layers: string[][]; warnings: string[]; message: string };

const emptyGraph = {
    edges: [] as WorkflowGraphEdge[],
    sources: [] as string[],
    sinks: [] as string[],
    layers: [] as string[][],
    warnings: [] as string[],
};

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWorkflowNode(value: unknown): value is WorkflowNode {
    return isRecord(value);
}

/**
 * Parses a ComfyUI API workflow JSON string and returns display-ready node summaries.
 * @param text Raw workflow JSON pasted from ComfyUI API export.
 * @returns Parse status, node summaries, and a user-facing message when invalid.
 */
export function parseWorkflowJson(text: string): ParsedWorkflow {
    const trimmed = text.trim();
    if (!trimmed) {
        return { ok: false, nodes: [], ...emptyGraph, message: "Paste a ComfyUI API workflow JSON to preview selectable nodes." };
    }

    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!isRecord(parsed)) {
            return { ok: false, nodes: [], ...emptyGraph, message: "Workflow JSON must be an object keyed by node ID." };
        }

        const nodes = Object.entries(parsed)
            .filter(([, node]) => isWorkflowNode(node))
            .map(([id, node]) => summarizeWorkflowNode(id, node))
            .sort((left, right) => sortNodeIds(left.id, right.id));

        if (nodes.length === 0) {
            return { ok: false, nodes: [], ...emptyGraph, message: "No workflow nodes were found in the JSON object." };
        }

        const graph = summarizeWorkflowGraph(parsed, nodes);

        return { ok: true, nodes, ...graph, message: "" };
    } catch (error) {
        return { ok: false, nodes: [], ...emptyGraph, message: `Workflow JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/**
 * Builds a compact node summary used by ComfyUI image and video settings previews.
 * @param id Node ID from the workflow JSON object.
 * @param node Raw ComfyUI API node object.
 * @returns Display and candidate metadata for the workflow node.
 */
export function summarizeWorkflowNode(id: string, node: WorkflowNode): WorkflowNodeSummary {
    const inputs = isRecord(node.inputs) ? node.inputs : {};
    const inputKeys = Object.keys(inputs);
    const classType = typeof node.class_type === "string" ? node.class_type : "Unknown";
    const title = typeof node._meta?.title === "string" && node._meta.title.trim() ? node._meta.title : classType;
    const inputFieldCandidates = inputKeys.filter((key) => typeof inputs[key] === "string");

    return {
        id,
        title,
        classType,
        rawNode: node,
        inputKeys,
        inputFieldCandidates,
        isInputCandidate: isInputCandidate(classType, inputs),
        isOutputCandidate: isOutputCandidate(classType),
        isPromptCandidate: isPromptCandidate(classType, inputs),
    };
}

export function sortNodeIds(left: string, right: string) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
}

/**
 * Extracts ComfyUI API link edges and derives graph metadata for preview rendering.
 * @param workflow Raw workflow object keyed by node ID.
 * @param nodes Display-ready node summaries parsed from the same workflow.
 * @returns Edges, roots, sinks, top-down layers, and non-fatal graph warnings.
 */
export function summarizeWorkflowGraph(workflow: Record<string, unknown>, nodes: WorkflowNodeSummary[]): Pick<Extract<ParsedWorkflow, { ok: true }>, "edges" | "sources" | "sinks" | "layers" | "warnings"> {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: WorkflowGraphEdge[] = [];
    const warnings: string[] = [];

    for (const [toNodeId, node] of Object.entries(workflow)) {
        if (!isWorkflowNode(node) || !isRecord(node.inputs)) {
            continue;
        }

        for (const [toInputName, inputValue] of Object.entries(node.inputs)) {
            const link = readWorkflowInputLink(inputValue);
            if (!link) {
                continue;
            }

            if (!nodeIds.has(link.fromNodeId)) {
                warnings.push(`Node ${toNodeId}.${toInputName} references missing node ${link.fromNodeId}.`);
                continue;
            }

            edges.push({
                id: `${link.fromNodeId}:${link.fromOutputIndex}->${toNodeId}:${toInputName}`,
                fromNodeId: link.fromNodeId,
                fromOutputIndex: link.fromOutputIndex,
                toNodeId,
                toInputName,
            });
        }
    }

    const incoming = new Map(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map(nodes.map((node) => [node.id, 0]));

    for (const edge of edges) {
        incoming.set(edge.toNodeId, (incoming.get(edge.toNodeId) ?? 0) + 1);
        outgoing.set(edge.fromNodeId, (outgoing.get(edge.fromNodeId) ?? 0) + 1);
    }

    const sources = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
    const sinks = nodes.filter((node) => (outgoing.get(node.id) ?? 0) === 0).map((node) => node.id);
    const layers = buildWorkflowLayers(nodes, edges, warnings);

    return { edges, sources, sinks, layers, warnings };
}

/**
 * Reads a ComfyUI API input value as a graph link when it matches [nodeId, outputIndex].
 * @param value Raw input value from a node's inputs object.
 * @returns Link source metadata, or undefined for scalar/widget inputs.
 */
export function readWorkflowInputLink(value: unknown): { fromNodeId: string; fromOutputIndex: number } | undefined {
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string") {
        return undefined;
    }

    const outputIndex = Number(value[1]);
    if (!Number.isInteger(outputIndex)) {
        return undefined;
    }

    return { fromNodeId: value[0], fromOutputIndex: outputIndex };
}

/**
 * Builds deterministic top-down graph layers from extracted workflow edges.
 * @param nodes Parsed workflow node summaries.
 * @param edges Valid graph edges between parsed nodes.
 * @param warnings Warning collector for cycles or unresolved layout conditions.
 * @returns Node IDs grouped by visual depth from sources to sinks.
 */
export function buildWorkflowLayers(nodes: WorkflowNodeSummary[], edges: WorkflowGraphEdge[], warnings: string[]): string[][] {
    const nodeIds = nodes.map((node) => node.id);
    const incoming = new Map(nodeIds.map((id) => [id, 0]));
    const children = new Map(nodeIds.map((id) => [id, [] as string[]]));
    const layerByNode = new Map(nodeIds.map((id) => [id, 0]));

    for (const edge of edges) {
        incoming.set(edge.toNodeId, (incoming.get(edge.toNodeId) ?? 0) + 1);
        children.set(edge.fromNodeId, [...(children.get(edge.fromNodeId) ?? []), edge.toNodeId]);
    }

    const queue = nodeIds.filter((id) => (incoming.get(id) ?? 0) === 0).sort(sortNodeIds);
    const visited = new Set<string>();

    while (queue.length > 0) {
        const id = queue.shift();
        if (!id) {
            continue;
        }

        visited.add(id);
        for (const childId of children.get(id) ?? []) {
            layerByNode.set(childId, Math.max(layerByNode.get(childId) ?? 0, (layerByNode.get(id) ?? 0) + 1));
            incoming.set(childId, Math.max(0, (incoming.get(childId) ?? 0) - 1));
            if ((incoming.get(childId) ?? 0) === 0) {
                queue.push(childId);
                queue.sort(sortNodeIds);
            }
        }
    }

    const unresolved = nodeIds.filter((id) => !visited.has(id));
    if (unresolved.length > 0) {
        const fallbackLayer = Math.max(0, ...[...layerByNode.values()]) + 1;
        for (const id of unresolved) {
            layerByNode.set(id, fallbackLayer);
        }
        warnings.push("Workflow graph may contain a cycle; unresolved nodes were grouped at the bottom.");
    }

    const layers = new Map<number, string[]>();
    for (const id of nodeIds) {
        const layer = layerByNode.get(id) ?? 0;
        layers.set(layer, [...(layers.get(layer) ?? []), id]);
    }

    return [...layers.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, ids]) => ids.sort(sortNodeIds));
}

export function isInputCandidate(classType: string, inputs: WorkflowInputs) {
    return classType.toLowerCase().includes("loadimage") || typeof inputs.image === "string";
}

export function isOutputCandidate(classType: string) {
    const normalizedClassType = classType.toLowerCase();
    return normalizedClassType.includes("vhs_videocombine")
        || normalizedClassType.includes("videocombine")
        || normalizedClassType.includes("save")
        || normalizedClassType.includes("output");
}

export function isPromptCandidate(classType: string, inputs: WorkflowInputs) {
    const normalizedClassType = classType.toLowerCase();
    return normalizedClassType.includes("cliptextencode") || typeof inputs.text === "string";
}

export function previewInputKeys(inputKeys: string[]) {
    if (inputKeys.length === 0) {
        return "No inputs";
    }

    const visibleKeys = inputKeys.slice(0, 4).join(", ");
    return inputKeys.length > 4 ? `${visibleKeys}, +${inputKeys.length - 4}` : visibleKeys;
}

export function workflowParseMessage(result: ParsedWorkflow) {
    return result.ok ? "" : result.message;
}
