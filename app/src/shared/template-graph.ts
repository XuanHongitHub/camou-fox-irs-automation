import type {
  AutomationGraphEdge,
  AutomationGraphNode,
  AutomationStep,
  AutomationTemplate,
  AutomationTemplateV1,
  AutomationTemplateV2
} from './types'

function cloneStep(step: AutomationStep | undefined): AutomationStep {
  const source = step || { type: 'click' as const }
  return {
    ...source,
    selectors: source.selectors
      ? {
          ...source.selectors,
          css: Array.isArray(source.selectors.css) ? [...source.selectors.css] : source.selectors.css
        }
      : undefined
  }
}

function cloneNode(node: AutomationGraphNode): AutomationGraphNode {
  return {
    id: String(node.id),
    step: cloneStep(node.step),
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0)
    }
  }
}

function cloneEdge(edge: AutomationGraphEdge): AutomationGraphEdge {
  return {
    id: String(edge.id),
    source: String(edge.source),
    target: String(edge.target),
    sourceHandle: edge.sourceHandle ? String(edge.sourceHandle) : undefined
  }
}

export function isAutomationTemplateV2(input: unknown): input is AutomationTemplateV2 {
  if (!input || typeof input !== 'object') return false
  const candidate = input as AutomationTemplateV2
  return (
    candidate.schemaVersion === '2.0' &&
    typeof candidate.targetDomain === 'string' &&
    typeof candidate.entryNodeId === 'string' &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges)
  )
}

export function createDefaultGraphTemplate(targetDomain: string = 'example.com'): AutomationTemplateV2 {
  const startNode: AutomationGraphNode = {
    id: 'start',
    step: { type: 'start', label: 'Start' },
    position: { x: 80, y: 160 }
  }
  const gotoNode: AutomationGraphNode = {
    id: 'step-1',
    step: { type: 'goto', label: 'Open page', value: 'https://example.com/form', timeoutMs: 12000 },
    position: { x: 320, y: 160 }
  }
  const submitNode: AutomationGraphNode = {
    id: 'step-2',
    step: { type: 'submit', label: 'Submit form', selector: 'button[type="submit"]', timeoutMs: 12000 },
    position: { x: 560, y: 160 }
  }
  const endNode: AutomationGraphNode = {
    id: 'end',
    step: { type: 'end', label: 'End' },
    position: { x: 800, y: 160 }
  }
  return {
    schemaVersion: '2.0',
    targetDomain: String(targetDomain || 'example.com').trim() || 'example.com',
    successIndicators: ['success', 'completed'],
    errorIndicators: ['error', 'invalid', 'failed'],
    entryNodeId: startNode.id,
    nodes: [startNode, gotoNode, submitNode, endNode],
    edges: [
      { id: 'edge-start-1', source: startNode.id, target: gotoNode.id },
      { id: 'edge-1-2', source: gotoNode.id, target: submitNode.id },
      { id: 'edge-2-end', source: submitNode.id, target: endNode.id }
    ]
  }
}

export function migrateTemplateV1ToV2(input: AutomationTemplateV1): AutomationTemplateV2 {
  const targetDomain = String(input.targetDomain || 'example.com').trim() || 'example.com'
  const startNode: AutomationGraphNode = {
    id: 'start',
    step: { type: 'start', label: 'Start' },
    position: { x: 80, y: 160 }
  }
  const endNode: AutomationGraphNode = {
    id: 'end',
    step: { type: 'end', label: 'End' },
    position: { x: 80 + (Math.max(1, input.steps.length) + 1) * 240, y: 160 }
  }

  const stepNodes: AutomationGraphNode[] = (input.steps || []).map((step, index) => ({
    id: `step-${index + 1}`,
    step: cloneStep(step),
    position: { x: 80 + (index + 1) * 240, y: 160 }
  }))

  const nodes = [startNode, ...stepNodes, endNode]
  const edges: AutomationGraphEdge[] = []
  if (stepNodes.length === 0) {
    edges.push({ id: 'edge-start-end', source: startNode.id, target: endNode.id })
  } else {
    edges.push({ id: 'edge-start-1', source: startNode.id, target: stepNodes[0].id })
    for (let index = 0; index < stepNodes.length - 1; index++) {
      edges.push({
        id: `edge-${stepNodes[index].id}-${stepNodes[index + 1].id}`,
        source: stepNodes[index].id,
        target: stepNodes[index + 1].id
      })
    }
    edges.push({
      id: `edge-${stepNodes[stepNodes.length - 1].id}-end`,
      source: stepNodes[stepNodes.length - 1].id,
      target: endNode.id
    })
  }

  return {
    schemaVersion: '2.0',
    meta: input.meta ? { ...input.meta } : undefined,
    targetDomain,
    successIndicators: Array.isArray(input.successIndicators)
      ? [...input.successIndicators]
      : ['success', 'completed'],
    errorIndicators: Array.isArray(input.errorIndicators)
      ? [...input.errorIndicators]
      : ['error', 'invalid', 'failed'],
    entryNodeId: startNode.id,
    nodes,
    edges
  }
}

export function ensureAutomationTemplateV2(input: AutomationTemplate | unknown): AutomationTemplateV2 {
  if (isAutomationTemplateV2(input)) {
    return {
      ...input,
      meta: input.meta ? { ...input.meta } : undefined,
      targetDomain: String(input.targetDomain || 'example.com').trim() || 'example.com',
      entryNodeId: String(input.entryNodeId || 'start').trim() || 'start',
      successIndicators: Array.isArray(input.successIndicators) ? [...input.successIndicators] : [],
      errorIndicators: Array.isArray(input.errorIndicators) ? [...input.errorIndicators] : [],
      nodes: (input.nodes || []).map(cloneNode),
      edges: (input.edges || []).map(cloneEdge)
    }
  }

  if (input && typeof input === 'object' && (input as AutomationTemplateV1).schemaVersion === '1.0') {
    return migrateTemplateV1ToV2(input as AutomationTemplateV1)
  }

  return createDefaultGraphTemplate()
}
