import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronsUpDown,
  Clock3,
  Copy,
  Eye,
  Globe,
  Image,
  LayoutDashboard,
  Link,
  ListChecks,
  LocateFixed,
  Minus,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PauseCircle,
  Plus,
  Radio,
  Redo2,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  X
} from 'lucide-react'
import { Button } from '../base/Button'
import { Input } from '../base/Input'
import { cn } from '../../lib/utils'
import type {
  AutomationGraphEdge,
  AutomationStep,
  AutomationStepType,
  AutomationTemplate,
  AutomationTemplateV2
} from '../../../../shared/types'
import { ensureAutomationTemplateV2 } from '../../../../shared/template-graph'

type StepNodeData = {
  label: string
  step: AutomationStep
  issues: string[]
}

type GraphSnapshot = {
  nodes: Node<StepNodeData>[]
  edges: Edge[]
}

const STEP_TYPES: Array<{
  value: AutomationStepType
  label: string
  icon: typeof Globe
  hint: string
}> = [
  { value: 'start', label: 'Start', icon: Sparkles, hint: 'Flow entry point' },
  { value: 'end', label: 'End', icon: CheckCircle2, hint: 'Flow termination' },
  { value: 'condition', label: 'Condition', icon: ShieldCheck, hint: 'Route by expression true/false' },
  { value: 'fork', label: 'Fork', icon: Link, hint: 'Split into multiple branches' },
  { value: 'merge', label: 'Merge', icon: ChevronsUpDown, hint: 'Join branch tokens any/all' },
  { value: 'loop', label: 'Loop', icon: Redo2, hint: 'Iterate list with loop/done outputs' },
  { value: 'goto', label: 'Goto URL', icon: Globe, hint: 'Open a page URL' },
  { value: 'waitFor', label: 'Wait For', icon: Clock3, hint: 'Wait until element appears' },
  { value: 'fillText', label: 'Fill Text', icon: Type, hint: 'Type into input' },
  { value: 'selectOption', label: 'Select Option', icon: ListChecks, hint: 'Select by value' },
  { value: 'setCheckbox', label: 'Set Checkbox', icon: ShieldCheck, hint: 'Toggle checkbox state' },
  { value: 'setRadio', label: 'Set Radio', icon: Radio, hint: 'Select radio option' },
  { value: 'uploadFile', label: 'Upload File', icon: Upload, hint: 'Attach local file path' },
  { value: 'click', label: 'Click', icon: MousePointerClick, hint: 'Click target element' },
  { value: 'submit', label: 'Submit', icon: MousePointerClick, hint: 'Submit form' },
  { value: 'assert', label: 'Assert', icon: CheckCircle2, hint: 'Validate output state' },
  { value: 'screenshot', label: 'Screenshot', icon: Image, hint: 'Capture checkpoint' },
  { value: 'sleep', label: 'Sleep', icon: PauseCircle, hint: 'Delay in milliseconds' }
]

const NEED_SELECTOR = new Set<AutomationStepType>([
  'waitFor',
  'fillText',
  'selectOption',
  'setCheckbox',
  'setRadio',
  'uploadFile',
  'click',
  'submit'
])

const NEED_VALUE = new Set<AutomationStepType>([
  'fillText',
  'selectOption',
  'setCheckbox',
  'setRadio',
  'uploadFile'
])

function defaultStep(type: AutomationStepType): AutomationStep {
  if (type === 'start') return { type, label: 'Start' }
  if (type === 'end') return { type, label: 'End' }
  if (type === 'condition') return { type, label: 'Condition', expression: 'input.enabled == true', timeoutMs: 12000 }
  if (type === 'fork') return { type, label: 'Fork' }
  if (type === 'merge') return { type, label: 'Merge', mergeMode: 'all' }
  if (type === 'loop')
    return {
      type,
      label: 'Loop',
      loopItemsFrom: 'input.items',
      loopItemAlias: 'item',
      loopIndexAlias: 'index',
      maxIterations: 200
    }
  if (type === 'goto') return { type, value: 'https://example.com' }
  if (type === 'assert') return { type, assertType: 'success', value: '' }
  if (type === 'sleep') return { type, timeoutMs: 1200 }
  return {
    type,
    selector: '',
    selectors: { css: [''], labelText: '', placeholder: '', name: '', id: '' },
    timeoutMs: 12000
  }
}

function normalizeStep(step: AutomationStep): AutomationStep {
  return {
    ...step,
    label: step.label || '',
    mergeMode: step.mergeMode === 'any' ? 'any' : step.mergeMode === 'all' ? 'all' : step.mergeMode,
    maxIterations: Number.isFinite(Number(step.maxIterations)) ? Number(step.maxIterations) : step.maxIterations,
    selectors: step.selectors || { css: [''], labelText: '', placeholder: '', name: '', id: '' },
    timeoutMs: Number.isFinite(Number(step.timeoutMs)) ? Number(step.timeoutMs) : 12000
  }
}

function stepMeta(type: AutomationStepType | string) {
  return STEP_TYPES.find((item) => item.value === type)
}

function stepSummary(step: AutomationStep): string {
  if (step.type === 'start') return 'entry'
  if (step.type === 'end') return 'exit'
  if (step.type === 'condition') return String(step.expression || step.value || '').trim() || 'condition'
  if (step.type === 'fork') return 'parallel split'
  if (step.type === 'merge') return `merge:${String(step.mergeMode || 'all')}`
  if (step.type === 'loop') return String(step.loopItemsFrom || step.valueFrom || 'input.items')
  if (step.type === 'goto') return String(step.value || '').trim() || 'URL not set'
  if (step.type === 'assert') return `assert:${String(step.assertType || 'success')}`
  if (step.type === 'sleep') return `${Number(step.timeoutMs || 0)}ms`
  if (String(step.valueFrom || '').trim()) return String(step.valueFrom)
  if (String(step.value || '').trim()) return String(step.value)
  if (String(step.selector || '').trim()) return String(step.selector)
  return 'Configure step'
}

function getStepIssues(step: AutomationStep): string[] {
  const issues: string[] = []
  if (step.type === 'goto' && !String(step.value || '').trim()) issues.push('Goto URL is required')
  if (step.type === 'condition' && !String(step.expression || step.value || '').trim()) {
    issues.push('Condition expression is required')
  }
  if (step.type === 'loop' && !String(step.loopItemsFrom || step.valueFrom || '').trim()) {
    issues.push('Loop items path is required')
  }
  if (step.type === 'merge' && step.mergeMode && !['any', 'all'].includes(step.mergeMode)) {
    issues.push('Merge mode must be any/all')
  }
  if (NEED_SELECTOR.has(step.type) && !String(step.selector || step.selectors?.css?.[0] || '').trim()) {
    issues.push('Selector is required')
  }
  if (NEED_VALUE.has(step.type) && !String(step.valueFrom || step.value || step.const || '').trim()) {
    issues.push('Value mapping/const is required')
  }
  if (step.type === 'assert') {
    const assertType = String(step.assertType || '').trim()
    if (!assertType) issues.push('Assert type is required')
    if ((assertType === 'containsText' || assertType === 'urlIncludes') && !String(step.value || '').trim()) {
      issues.push('Assert value is required for containsText/urlIncludes')
    }
  }
  return issues
}

function nodeLabel(step: AutomationStep): string {
  if (step.label && String(step.label).trim()) return String(step.label).trim()
  const meta = stepMeta(step.type)
  return meta?.label || String(step.type)
}

function buildNodesFromTemplate(template: AutomationTemplate): Node<StepNodeData>[] {
  const graph = ensureAutomationTemplateV2(template)
  return (graph.nodes || []).map((node, index) => {
    const step = normalizeStep(node.step || defaultStep('click'))
    const position = node.position || { x: 60 + (index % 4) * 280, y: 60 + Math.floor(index / 4) * 190 }
    return {
      id: String(node.id || `node-${index + 1}`),
      type: 'stepNode',
      position: { x: Number(position.x || 0), y: Number(position.y || 0) },
      data: {
        label: nodeLabel(step),
        step,
        issues: getStepIssues(step)
      }
    }
  })
}

function buildEdgesFromTemplate(template: AutomationTemplate): Edge[] {
  const graph = ensureAutomationTemplateV2(template)
  return (graph.edges || []).map((edge, index) => ({
    id: String(edge.id || `edge-${index + 1}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle: edge.sourceHandle || undefined,
    animated: false
  }))
}

function guessEntryNodeId(nodes: Node<StepNodeData>[]): string {
  if (!nodes.length) return ''
  const explicitStart = nodes.find((node) => node.data.step.type === 'start')
  if (explicitStart) return explicitStart.id
  return [...nodes].sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y))[0].id
}

function toTemplateGraph(
  nodes: Node<StepNodeData>[],
  edges: Edge[],
  baseTemplate: AutomationTemplate
): AutomationTemplateV2 {
  const graphBase = ensureAutomationTemplateV2(baseTemplate)
  const normalizedNodes = nodes.map((node) => ({
    id: node.id,
    step: normalizeStep(node.data.step),
    position: {
      x: Number(node.position.x || 0),
      y: Number(node.position.y || 0)
    }
  }))
  const normalizedEdges: AutomationGraphEdge[] = edges
    .filter((edge) => edge.source && edge.target)
    .map((edge) => ({
      id: String(edge.id || `edge-${edge.source}-${edge.target}`),
      source: String(edge.source),
      target: String(edge.target),
      sourceHandle: edge.sourceHandle ? String(edge.sourceHandle) : undefined
    }))
  return {
    ...graphBase,
    schemaVersion: '2.0',
    entryNodeId: graphBase.entryNodeId || guessEntryNodeId(nodes),
    nodes: normalizedNodes,
    edges: normalizedEdges
  }
}

function cloneSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    nodes: snapshot.nodes.map((node) => ({ ...node, data: { ...node.data, step: { ...node.data.step } } })),
    edges: snapshot.edges.map((edge) => ({ ...edge }))
  }
}

function StepNode({ data, selected }: NodeProps<Node<StepNodeData>>) {
  const meta = stepMeta(data.step.type)
  const Icon = meta?.icon || ChevronsUpDown
  const hasTarget = data.step.type !== 'start'
  const hasDefaultSource = !['end', 'condition', 'loop'].includes(data.step.type)
  return (
    <div
      className={`min-w-[210px] max-w-[255px] rounded-lg border px-2.5 py-2.5 shadow-md ${
        selected
          ? 'border-accent bg-accent/18 shadow-[0_0_0_1px_rgba(0,153,255,0.42)]'
          : 'border-border/90 bg-surface/95'
      }`}
    >
      {hasTarget ? (
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-accent !border-0" />
      ) : null}
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-base text-muted">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text truncate">{data.label}</p>
          <p className="text-[10px] text-muted truncate">{stepSummary(data.step)}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className="text-muted">{String(data.step.type)}</span>
        {data.issues.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-danger">
            <AlertTriangle className="w-3 h-3" /> {data.issues.length}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-success">
            <CheckCircle2 className="w-3 h-3" /> ready
          </span>
        )}
      </div>
      {data.step.type === 'condition' ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            className="!w-2 !h-2 !bg-success !border-0 !left-[34%]"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            className="!w-2 !h-2 !bg-danger !border-0 !left-[66%]"
          />
        </>
      ) : null}
      {data.step.type === 'loop' ? (
        <>
          <Handle
            id="loop"
            type="source"
            position={Position.Bottom}
            className="!w-2 !h-2 !bg-warning !border-0 !left-[34%]"
          />
          <Handle
            id="done"
            type="source"
            position={Position.Bottom}
            className="!w-2 !h-2 !bg-success !border-0 !left-[66%]"
          />
        </>
      ) : null}
      {hasDefaultSource ? (
        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-accent !border-0" />
      ) : null}
    </div>
  )
}

interface AutomationVisualBuilderProps {
  template: AutomationTemplate
  reloadKey: string
  onChange: (next: AutomationTemplateV2) => void
  onScanWebsite?: (url: string) => Promise<AutomationTemplate>
}

export function AutomationVisualBuilder(props: AutomationVisualBuilderProps) {
  return (
    <ReactFlowProvider>
      <AutomationVisualBuilderInner {...props} />
    </ReactFlowProvider>
  )
}

function AutomationVisualBuilderInner({
  template,
  reloadKey,
  onChange,
  onScanWebsite
}: AutomationVisualBuilderProps) {
  const reactFlow = useReactFlow<Node<StepNodeData>, Edge>()
  const viewport = useViewport()

  const [nodes, setNodes] = useState<Node<StepNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')

  const [stepTypeToAdd, setStepTypeToAdd] = useState<AutomationStepType>('fillText')
  const [scanUrl, setScanUrl] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [nodeSearch, setNodeSearch] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [paletteWidth, setPaletteWidth] = useState(300)
  const [inspectorWidth, setInspectorWidth] = useState(360)
  const [resizing, setResizing] = useState<'palette' | 'inspector' | null>(null)
  const [clipboardNode, setClipboardNode] = useState<Node<StepNodeData> | null>(null)

  const historyRef = useRef<GraphSnapshot[]>([])
  const futureRef = useRef<GraphSnapshot[]>([])
  const stageRef = useRef<HTMLDivElement | null>(null)

  const getViewportCoverPadding = () => ({
    left: paletteOpen ? paletteWidth + 12 : 0,
    right: inspectorOpen ? inspectorWidth + 12 : 0
  })

  const centerFlowPointInVisibleArea = (flowX: number, flowY: number, duration: number = 260) => {
    const host = stageRef.current
    if (!host) return
    const { left, right } = getViewportCoverPadding()
    const visibleCenterX = left + Math.max(120, host.clientWidth - left - right) / 2
    const visibleCenterY = host.clientHeight / 2
    const viewportState = reactFlow.getViewport()
    const zoom = Math.max(0.1, Number(viewportState.zoom || 1))
    const nextViewport = {
      x: visibleCenterX - flowX * zoom,
      y: visibleCenterY - flowY * zoom,
      zoom
    }
    reactFlow.setViewport(nextViewport, { duration })
  }

  const fitCanvasToContent = (duration: number = 260) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        try {
          reactFlow.fitView({
            duration,
            padding: 0.22,
            minZoom: 0.24,
            maxZoom: 1.25
          })
          const viewportState = reactFlow.getViewport()
          const { left, right } = getViewportCoverPadding()
          const offsetX = (left - right) / 2
          reactFlow.setViewport(
            {
              x: viewportState.x + offsetX,
              y: viewportState.y,
              zoom: viewportState.zoom
            },
            { duration: 0 }
          )
        } catch {
          // react-flow instance may not be ready yet
        }
      })
    })
  }

  useEffect(() => {
    const nextNodes = buildNodesFromTemplate(template)
    const nextEdges = buildEdgesFromTemplate(template)
    setNodes(nextNodes)
    setEdges(nextEdges)
    setSelectedNodeId(nextNodes[0]?.id || '')
    const graph = ensureAutomationTemplateV2(template)
    const firstGoto = graph.nodes.find((node) => node.step.type === 'goto')?.step?.value
    setScanUrl((prev) => prev || String(firstGoto || ''))
    historyRef.current = []
    futureRef.current = []
    fitCanvasToContent(0)
  }, [reloadKey, reactFlow])

  useEffect(() => {
    if (!resizing) return
    const onMouseMove = (event: MouseEvent) => {
      const host = stageRef.current
      if (!host) return
      const rect = host.getBoundingClientRect()
      const min = 240
      const max = Math.max(min, Math.min(520, rect.width - 280))
      if (resizing === 'palette') {
        const next = Math.max(min, Math.min(max, event.clientX - rect.left))
        setPaletteWidth(next)
      } else {
        const next = Math.max(min, Math.min(max, rect.right - event.clientX))
        setInspectorWidth(next)
      }
    }
    const onMouseUp = () => setResizing(null)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [resizing])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId]
  )

  const filteredNodes = useMemo(() => {
    const q = nodeSearch.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter((node) => {
      const text = [node.data.label, node.data.step.type, stepSummary(node.data.step)]
        .join(' ')
        .toLowerCase()
      return text.includes(q)
    })
  }, [nodes, nodeSearch])

  const totalIssues = useMemo(
    () => nodes.reduce((sum, node) => sum + (node.data.issues?.length || 0), 0),
    [nodes]
  )

  const applyGraph = (nextNodes: Node<StepNodeData>[], nextEdges: Edge[], trackHistory: boolean = true) => {
    if (trackHistory) {
      historyRef.current.push(cloneSnapshot({ nodes, edges }))
      if (historyRef.current.length > 80) historyRef.current.shift()
      futureRef.current = []
    }

    const normalizedNodes = nextNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        step: normalizeStep(node.data.step),
        label: nodeLabel(node.data.step),
        issues: getStepIssues(node.data.step)
      }
    }))
    setNodes(normalizedNodes)
    setEdges(nextEdges)

    onChange(toTemplateGraph(normalizedNodes, nextEdges, template))
  }

  const pushNode = (stepType: AutomationStepType, position?: { x: number; y: number }) => {
    const id = `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const step = defaultStep(stepType)
    const baseX = 80 + (nodes.length % 4) * 270
    const baseY = 80 + Math.floor(nodes.length / 4) * 180

    const nextNodes = [
      ...nodes,
      {
        id,
        type: 'stepNode',
        position: position || { x: baseX, y: baseY },
        data: {
          step,
          label: nodeLabel(step),
          issues: getStepIssues(step)
        }
      }
    ]

    const nextEdges = [...edges]

    applyGraph(nextNodes, nextEdges)
    setSelectedNodeId(id)
  }

  const duplicateSelected = () => {
    if (!selectedNode) return
    const clone = normalizeStep({ ...selectedNode.data.step })
    const id = `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const nextNodes = [
      ...nodes,
      {
        id,
        type: 'stepNode',
        position: { x: selectedNode.position.x + 40, y: selectedNode.position.y + 40 },
        data: {
          step: clone,
          label: nodeLabel(clone),
          issues: getStepIssues(clone)
        }
      }
    ]
    applyGraph(nextNodes, edges)
    setSelectedNodeId(id)
  }

  const removeSelected = () => {
    if (!selectedNodeId) return
    const nextNodes = nodes.filter((node) => node.id !== selectedNodeId)
    const nextEdges = edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId)
    applyGraph(nextNodes, nextEdges)
    setSelectedNodeId(nextNodes[0]?.id || '')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (isEditable) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNodeId) {
          event.preventDefault()
          removeSelected()
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        if (selectedNode) {
          event.preventDefault()
          duplicateSelected()
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (selectedNode) {
          event.preventDefault()
          setClipboardNode({
            ...selectedNode,
            data: {
              ...selectedNode.data,
              step: normalizeStep({ ...selectedNode.data.step })
            }
          })
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (clipboardNode) {
          event.preventDefault()
          const id = `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          const clonedStep = normalizeStep({ ...clipboardNode.data.step })
          const pastedNode: Node<StepNodeData> = {
            ...clipboardNode,
            id,
            position: {
              x: clipboardNode.position.x + 48,
              y: clipboardNode.position.y + 48
            },
            data: {
              ...clipboardNode.data,
              step: clonedStep,
              label: nodeLabel(clonedStep),
              issues: getStepIssues(clonedStep)
            }
          }
          applyGraph([...nodes, pastedNode], edges)
          setSelectedNodeId(id)
        }
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        reactFlow.fitView({ duration: 220, padding: 0.2 })
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        reactFlow.zoomIn({ duration: 120 })
      }
      if (event.key === '-') {
        event.preventDefault()
        reactFlow.zoomOut({ duration: 120 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNodeId, selectedNode, nodes, edges, clipboardNode, reactFlow])

  const updateSelectedStep = (patch: Partial<AutomationStep>) => {
    if (!selectedNode) return
    const nextStep = normalizeStep({ ...selectedNode.data.step, ...patch })
    const nextNodes = nodes.map((node) => {
      if (node.id !== selectedNode.id) return node
      return {
        ...node,
        data: {
          ...node.data,
          step: nextStep,
          label: nodeLabel(nextStep),
          issues: getStepIssues(nextStep)
        }
      }
    })
    applyGraph(nextNodes, edges)
  }

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return
    const duplicate = edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        String(edge.sourceHandle || '') === String(connection.sourceHandle || '')
    )
    if (duplicate) return
    const next = addEdge(
      {
        ...connection,
        id: `edge-${connection.source}-${connection.target}-${Date.now()}`
      },
      edges
    )
    applyGraph(nodes, next)
  }

  const onDropNode = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const droppedType = event.dataTransfer.getData('application/x-step-type') as AutomationStepType
    if (!droppedType) return
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    pushNode(droppedType, position)
  }

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const autoLayout = () => {
    const ordered = [...nodes].sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x))
    const nextNodes = ordered.map((node, index) => ({
      ...node,
      position: { x: 90 + (index % 3) * 280, y: 70 + Math.floor(index / 3) * 190 }
    }))
    applyGraph(nextNodes, edges)
    reactFlow.fitView({ duration: 300, padding: 0.2 })
  }

  const undo = () => {
    const previous = historyRef.current.pop()
    if (!previous) return
    futureRef.current.push(cloneSnapshot({ nodes, edges }))
    applyGraph(previous.nodes, previous.edges, false)
  }

  const redo = () => {
    const next = futureRef.current.pop()
    if (!next) return
    historyRef.current.push(cloneSnapshot({ nodes, edges }))
    applyGraph(next.nodes, next.edges, false)
  }

  const handleScanWebsite = async () => {
    if (!onScanWebsite) return
    const url = scanUrl.trim()
    if (!url) return
    setScanLoading(true)
    try {
      const scanned = await onScanWebsite(url)
      const normalizedScanned = ensureAutomationTemplateV2(scanned)
      onChange(normalizedScanned)
      const scannedNodes = buildNodesFromTemplate(normalizedScanned)
      const scannedEdges = buildEdgesFromTemplate(normalizedScanned)
      setNodes(scannedNodes)
      setEdges(scannedEdges)
      setSelectedNodeId(scannedNodes[0]?.id || '')
      historyRef.current = []
      futureRef.current = []
      fitCanvasToContent(300)
    } finally {
      setScanLoading(false)
    }
  }

  const jumpToNode = (id: string) => {
    const node = nodes.find((item) => item.id === id)
    if (!node) return
    setSelectedNodeId(id)
    const nextZoom = Math.max(reactFlow.getZoom(), 0.92)
    const viewportState = reactFlow.getViewport()
    reactFlow.setViewport(
      {
        x: viewportState.x,
        y: viewportState.y,
        zoom: nextZoom
      },
      { duration: 90 }
    )
    centerFlowPointInVisibleArea(node.position.x + 110, node.position.y + 44, 300)
  }

  return (
    <div className="h-full w-full rounded-xl border border-border bg-panel overflow-hidden flex flex-col">
      <div className="px-3 py-2.5 border-b border-border bg-base/80 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 items-center">
        <div className="flex items-center gap-2 min-w-0">
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-panel px-2 py-1.5 text-xs text-text">
            <LayoutDashboard className="w-3.5 h-3.5" />
            Visual Builder
          </div>
          <Input
            className="max-w-[260px]"
            icon={<Search className="w-3.5 h-3.5" />}
            value={nodeSearch}
            onChange={(event) => setNodeSearch(event.target.value)}
            placeholder="Find node..."
          />
          {filteredNodes.length > 0 ? (
            <select
              className="h-8 rounded-md bg-surface border border-border px-2 text-xs text-text min-w-[170px]"
              value={selectedNodeId}
              onChange={(event) => jumpToNode(event.target.value)}
            >
              <option value="">Jump to node</option>
              {filteredNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.label} - {stepSummary(node.data.step)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md bg-surface border border-border px-2 text-xs text-text"
            value={stepTypeToAdd}
            onChange={(event) => setStepTypeToAdd(event.target.value as AutomationStepType)}
          >
            {STEP_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={() => pushNode(stepTypeToAdd)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Node
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={paletteOpen ? 'secondary' : 'ghost'}
            size="sm"
            title="Toggle palette"
            onClick={() => setPaletteOpen((prev) => !prev)}
          >
            {paletteOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </Button>
          <Button
            variant={inspectorOpen ? 'secondary' : 'ghost'}
            size="sm"
            title="Toggle inspector"
            onClick={() => setInspectorOpen((prev) => !prev)}
          >
            {inspectorOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </Button>
          <Button variant="icon" size="sm" title="Undo" onClick={undo}>
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="icon" size="sm" title="Redo" onClick={redo}>
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button variant="icon" size="sm" title="Zoom out" onClick={() => reactFlow.zoomOut({ duration: 150 })}>
            <Minus className="w-4 h-4" />
          </Button>
          <span className="text-[11px] text-text min-w-[48px] text-center">{Math.round(viewport.zoom * 100)}%</span>
          <Button variant="icon" size="sm" title="Zoom in" onClick={() => reactFlow.zoomIn({ duration: 150 })}>
            <Plus className="w-4 h-4" />
          </Button>
          <Button variant="icon" size="sm" title="Fit view" onClick={() => reactFlow.fitView({ duration: 200, padding: 0.2 })}>
            <LocateFixed className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={autoLayout}>
            <Link className="w-3.5 h-3.5 mr-1" /> Auto Layout
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={scanUrl}
            onChange={(event) => setScanUrl(event.target.value)}
            placeholder="https://target-site/form"
            icon={<Globe className="w-3.5 h-3.5" />}
          />
          <Button size="sm" variant="primary" onClick={() => void handleScanWebsite()} disabled={scanLoading || !onScanWebsite}>
            <ScanSearch className={`w-3.5 h-3.5 mr-1 ${scanLoading ? 'animate-spin' : ''}`} /> Scan
          </Button>
        </div>
      </div>

      <div ref={stageRef} className="relative flex-1 min-h-0" onDrop={onDropNode} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ stepNode: StepNode }}
          selectionOnDrag
          panOnScroll
          panOnDrag
          multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
          onNodesChange={(changes) => {
            setNodes((prev) => {
              const byId = new Map(prev.map((node) => [node.id, node]))
              const next = [...prev]
              for (const change of changes) {
                if (change.type === 'remove') {
                  const index = next.findIndex((node) => node.id === change.id)
                  if (index >= 0) next.splice(index, 1)
                  continue
                }
                if (change.type === 'position' && change.position) {
                  const found = byId.get(change.id)
                  if (!found) continue
                  found.position = change.position
                }
                if (change.type === 'select') {
                  if (change.selected) setSelectedNodeId(change.id)
                }
              }
              return next.map((node) => ({ ...node }))
            })
          }}
          onNodeDragStop={() => {
            applyGraph(nodes, edges)
          }}
          onEdgesChange={(changes) => {
            setEdges((prev) => {
              let next = [...prev]
              for (const change of changes) {
                if (change.type === 'remove') next = next.filter((edge) => edge.id !== change.id)
              }
              return next
            })
          }}
          onPaneClick={() => setSelectedNodeId('')}
          onNodeDoubleClick={(_event, node) => {
            setSelectedNodeId(node.id)
            setInspectorOpen(true)
            centerFlowPointInVisibleArea(node.position.x + 110, node.position.y + 44, 260)
          }}
          onConnect={onConnect}
          defaultEdgeOptions={{
            style: { stroke: 'var(--color-accent)', strokeWidth: 1.7, opacity: 0.92 }
          }}
          connectionLineStyle={{ stroke: 'var(--color-accent)', strokeWidth: 1.8, opacity: 0.9 }}
          fitView
          className="bg-base"
        >
          <Controls
            position="top-right"
            className="builder-controls"
            style={{ marginRight: inspectorOpen ? inspectorWidth + 14 : 12, marginTop: 150, zIndex: 44 }}
          />
          <MiniMap
            pannable
            zoomable
            position="top-right"
            className="builder-minimap"
            style={{
              marginRight: inspectorOpen ? inspectorWidth + 14 : 12,
              marginTop: 12,
              width: 220,
              height: 132,
              zIndex: 42
            }}
            bgColor="rgba(22,26,34,0.96)"
            maskColor="rgba(8,10,14,0.18)"
            nodeColor={(node) => (node.id === selectedNodeId ? '#1aa8ff' : '#93b7df')}
            nodeStrokeColor={() => '#dceaff'}
            nodeBorderRadius={4}
            nodeStrokeWidth={1.2}
          />
          <Background gap={14} size={1} />
        </ReactFlow>

        {!paletteOpen ? (
          <button
            onClick={() => setPaletteOpen(true)}
            className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md border border-border bg-panel/95 px-2.5 py-1.5 text-xs text-text shadow-sm hover:border-accent/70"
          >
            <PanelLeftOpen className="w-3.5 h-3.5" /> Palette
          </button>
        ) : null}

        {!inspectorOpen ? (
          <button
            onClick={() => setInspectorOpen(true)}
            className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-md border border-border bg-panel/95 px-2.5 py-1.5 text-xs text-text shadow-sm hover:border-accent/70"
          >
            Inspector <PanelRightOpen className="w-3.5 h-3.5" />
          </button>
        ) : null}

        <aside
          className={cn(
            'absolute left-2 top-2 bottom-2 rounded-xl border border-border bg-panel/95 backdrop-blur-sm shadow-lg transition-transform duration-150',
            paletteOpen ? 'translate-x-0' : '-translate-x-[120%]'
          )}
          style={{ width: paletteWidth }}
        >
          <div className="px-3 py-2 border-b border-border bg-base/70 rounded-t-xl flex items-center justify-between">
            <p className="text-xs font-semibold text-text">Node Palette</p>
            <Button variant="icon" size="sm" title="Hide palette" onClick={() => setPaletteOpen(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="h-[calc(100%-40px)] overflow-auto p-3 space-y-2">
            {STEP_TYPES.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.value}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-step-type', item.value)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => pushNode(item.value)}
                  className="w-full text-left rounded-lg border border-border bg-base px-2.5 py-2 hover:border-accent/60 hover:bg-accent/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-surface">
                      <Icon className="w-3.5 h-3.5 text-muted" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text truncate">{item.label}</p>
                      <p className="text-[10px] text-muted truncate">{item.hint}</p>
                    </div>
                  </div>
                </button>
              )
            })}
            <div className="mt-3 rounded-lg border border-border bg-base p-2.5 text-[11px] text-muted space-y-1.5">
              <p className="font-semibold text-text">Quick Keys</p>
              <p>`Delete` remove selected node</p>
              <p>`Ctrl/Cmd + D` duplicate selected node</p>
              <p>`Ctrl/Cmd + C / V` copy + paste node</p>
              <p>`Space + drag` pan canvas, `F` fit view</p>
              <p>Drag node into canvas to drop at cursor</p>
            </div>
          </div>
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/30"
            onMouseDown={() => setResizing('palette')}
          />
        </aside>

        <aside
          className={cn(
            'absolute right-2 top-2 bottom-2 rounded-xl border border-border bg-panel/95 backdrop-blur-sm shadow-lg transition-transform duration-150',
            inspectorOpen ? 'translate-x-0' : 'translate-x-[120%]'
          )}
          style={{ width: inspectorWidth }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/30"
            onMouseDown={() => setResizing('inspector')}
          />
          <div className="px-3 py-2 border-b border-border bg-base/70 rounded-t-xl flex items-center justify-between">
            <p className="text-xs font-semibold text-text">Inspector</p>
            <div className="inline-flex items-center gap-1">
              <Button variant="icon" size="sm" title="Duplicate" onClick={duplicateSelected} disabled={!selectedNode}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button variant="icon" size="sm" title="Delete" onClick={removeSelected} disabled={!selectedNode}>
                <Trash2 className="w-3.5 h-3.5 text-danger" />
              </Button>
              <Button variant="icon" size="sm" title="Hide inspector" onClick={() => setInspectorOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {!selectedNode ? (
            <div className="p-4 text-xs text-muted">Select a node to edit step properties.</div>
          ) : (
            <div className="h-[calc(100%-40px)] overflow-auto p-3 space-y-3">
              <div className="rounded-md border border-border bg-base p-2.5 space-y-2">
                <p className="text-xs font-semibold text-text">Step Type</p>
                <select
                  className="h-8 w-full rounded-md bg-panel border border-border px-2 text-xs"
                  value={selectedNode.data.step.type}
                  onChange={(event) => updateSelectedStep(defaultStep(event.target.value as AutomationStepType))}
                >
                  {STEP_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-border bg-base p-2.5 space-y-2">
                <p className="text-xs font-semibold text-text">Node Label</p>
                <Input
                  value={String(selectedNode.data.step.label || '')}
                  onChange={(event) => updateSelectedStep({ label: event.target.value })}
                  placeholder="Optional label for readability"
                />
              </div>

              <div className="rounded-md border border-border bg-base p-2.5 space-y-2">
                <p className="text-xs font-semibold text-text">Timeout</p>
                <Input
                  type="number"
                  value={String(selectedNode.data.step.timeoutMs || 12000)}
                  onChange={(event) => updateSelectedStep({ timeoutMs: Number(event.target.value || 0) })}
                />
              </div>

              {selectedNode.data.step.type === 'goto' ? (
                <Card title="Navigation URL">
                  <Input
                    value={String(selectedNode.data.step.value || '')}
                    onChange={(event) => updateSelectedStep({ value: event.target.value })}
                    placeholder="https://..."
                  />
                </Card>
              ) : null}

              {selectedNode.data.step.type === 'assert' ? (
                <Card title="Assert">
                  <select
                    className="h-8 w-full rounded-md bg-panel border border-border px-2 text-xs"
                    value={String(selectedNode.data.step.assertType || 'success')}
                    onChange={(event) =>
                      updateSelectedStep({
                        assertType: event.target.value as 'success' | 'noError' | 'containsText' | 'urlIncludes'
                      })
                    }
                  >
                    <option value="success">success indicator</option>
                    <option value="noError">no error indicator</option>
                    <option value="containsText">contains text</option>
                    <option value="urlIncludes">url includes</option>
                  </select>
                  <Input
                    value={String(selectedNode.data.step.value || '')}
                    onChange={(event) => updateSelectedStep({ value: event.target.value })}
                    placeholder="assert value"
                  />
                </Card>
              ) : null}

              {selectedNode.data.step.type === 'condition' ? (
                <Card title="Condition Expression">
                  <Input
                    value={String(selectedNode.data.step.expression || selectedNode.data.step.value || '')}
                    onChange={(event) =>
                      updateSelectedStep({ expression: event.target.value, value: event.target.value })
                    }
                    placeholder='input.amount > 100'
                  />
                  <p className="text-[10px] text-muted">
                    Supports simple expression: `path op value` (==, !=, &gt;, &lt;, &gt;=, &lt;=)
                  </p>
                </Card>
              ) : null}

              {selectedNode.data.step.type === 'merge' ? (
                <Card title="Merge Mode">
                  <select
                    className="h-8 w-full rounded-md bg-panel border border-border px-2 text-xs"
                    value={String(selectedNode.data.step.mergeMode || 'all')}
                    onChange={(event) =>
                      updateSelectedStep({ mergeMode: event.target.value === 'any' ? 'any' : 'all' })
                    }
                  >
                    <option value="all">all branches</option>
                    <option value="any">first branch</option>
                  </select>
                </Card>
              ) : null}

              {selectedNode.data.step.type === 'loop' ? (
                <Card title="Loop Config">
                  <Input
                    value={String(selectedNode.data.step.loopItemsFrom || selectedNode.data.step.valueFrom || '')}
                    onChange={(event) =>
                      updateSelectedStep({ loopItemsFrom: event.target.value, valueFrom: event.target.value })
                    }
                    placeholder="input.items"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={String(selectedNode.data.step.loopItemAlias || 'item')}
                      onChange={(event) => updateSelectedStep({ loopItemAlias: event.target.value })}
                      placeholder="item alias"
                    />
                    <Input
                      value={String(selectedNode.data.step.loopIndexAlias || 'index')}
                      onChange={(event) => updateSelectedStep({ loopIndexAlias: event.target.value })}
                      placeholder="index alias"
                    />
                  </div>
                  <Input
                    type="number"
                    value={String(selectedNode.data.step.maxIterations || 200)}
                    onChange={(event) => updateSelectedStep({ maxIterations: Number(event.target.value || 200) })}
                    placeholder="max iterations"
                  />
                </Card>
              ) : null}

              {NEED_SELECTOR.has(selectedNode.data.step.type) ? (
                <Card title="Selector">
                  <Input
                    value={String(selectedNode.data.step.selector || selectedNode.data.step.selectors?.css?.[0] || '')}
                    onChange={(event) =>
                      updateSelectedStep({
                        selector: event.target.value,
                        selectors: { ...selectedNode.data.step.selectors, css: [event.target.value] }
                      })
                    }
                    placeholder='input[name="email"]'
                  />
                  <Input
                    value={String(selectedNode.data.step.selectors?.labelText || '')}
                    onChange={(event) =>
                      updateSelectedStep({
                        selectors: { ...selectedNode.data.step.selectors, labelText: event.target.value }
                      })
                    }
                    placeholder="fallback label"
                  />
                  <Input
                    value={String(selectedNode.data.step.selectors?.name || '')}
                    onChange={(event) =>
                      updateSelectedStep({
                        selectors: { ...selectedNode.data.step.selectors, name: event.target.value }
                      })
                    }
                    placeholder="fallback name"
                  />
                </Card>
              ) : null}

              {NEED_VALUE.has(selectedNode.data.step.type) ? (
                <Card title="Value Mapping">
                  <Input
                    value={String(selectedNode.data.step.valueFrom || '')}
                    onChange={(event) => updateSelectedStep({ valueFrom: event.target.value, value: '' })}
                    placeholder="input.email"
                  />
                  <Input
                    value={String(selectedNode.data.step.value || selectedNode.data.step.const || '')}
                    onChange={(event) =>
                      updateSelectedStep({ value: event.target.value, const: event.target.value, valueFrom: '' })
                    }
                    placeholder="const value"
                  />
                </Card>
              ) : null}

              {selectedNode.data.step.type === 'sleep' ? (
                <Card title="Sleep Duration">
                  <Input
                    type="number"
                    value={String(selectedNode.data.step.timeoutMs || 1200)}
                    onChange={(event) => updateSelectedStep({ timeoutMs: Number(event.target.value || 0) })}
                    placeholder="ms"
                  />
                </Card>
              ) : null}

              <Card title="Step Health">
                {selectedNode.data.issues.length === 0 ? (
                  <p className="text-[11px] text-success">No issue for current step.</p>
                ) : (
                  selectedNode.data.issues.map((issue) => (
                    <p key={issue} className="text-[11px] text-danger">- {issue}</p>
                  ))
                )}
              </Card>
            </div>
          )}
        </aside>

        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 inline-flex items-center gap-2 rounded-md border border-border bg-panel/90 px-2 py-1 text-[11px] text-muted">
          <Eye className="w-3.5 h-3.5" />
          nodes {nodes.length} • issues {totalIssues}
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-base p-2.5 space-y-2">
      <p className="text-xs font-semibold text-text">{title}</p>
      {children}
    </div>
  )
}
