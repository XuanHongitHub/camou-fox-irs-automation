import { useCallback } from 'react'
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Play, MousePointerClick, Type, LayoutTemplate, Clock, Code, Settings, Save } from 'lucide-react'
import { Button } from '../base/Button'

const initialNodes: Node[] = [
    {
        id: '1',
        type: 'input',
        data: { label: 'Start Application' },
        position: { x: 250, y: 5 },
    },
]

const initialEdges: Edge[] = []

export function TemplateFlowBuilder({ onSave, onCancel }: { onSave?: () => void, onCancel?: () => void }) {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

    const onConnect = useCallback(
        (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    )

    const addNode = (type: string, label: string) => {
        const newNode: Node = {
            id: `${nodes.length + 1}`,
            type,
            data: { label },
            position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
        }
        setNodes((nds) => nds.concat(newNode))
    }

    return (
        <div className="flex flex-col h-full bg-background rounded-lg border border-border overflow-hidden animate-in fade-in duration-200">

            {/* Builder Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-panel border-b border-border">
                <div className="flex items-center gap-2">
                    <LayoutTemplate className="w-5 h-5 text-accent" />
                    <h2 className="text-sm font-semibold text-text">Visual Flow Builder</h2>
                    <span className="text-[10px] text-muted ml-2 bg-surface px-1.5 py-0.5 rounded border border-border">Beta</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                    <Button variant="primary" onClick={onSave}>
                        <Save className="w-4 h-4 mr-2" />
                        Save Flow
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">

                {/* Node Palette (Sidebar) */}
                <div className="w-64 border-r border-border bg-panel p-4 flex flex-col gap-4 overflow-y-auto">
                    <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Available Actions</h3>

                    <button
                        onClick={() => addNode('default', 'Goto URL')}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-accent/5 transition-colors text-left"
                    >
                        <div className="p-1.5 bg-background rounded-md border border-border">
                            <Play className="w-4 h-4 text-accent" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-text">Go To URL</div>
                            <div className="text-[10px] text-muted">Navigate to a target page</div>
                        </div>
                    </button>

                    <button
                        onClick={() => addNode('default', 'Click Element')}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-accent/5 transition-colors text-left"
                    >
                        <div className="p-1.5 bg-background rounded-md border border-border">
                            <MousePointerClick className="w-4 h-4 text-text" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-text">Click Element</div>
                            <div className="text-[10px] text-muted">Click a button or link</div>
                        </div>
                    </button>

                    <button
                        onClick={() => addNode('default', 'Type Input')}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-accent/5 transition-colors text-left"
                    >
                        <div className="p-1.5 bg-background rounded-md border border-border">
                            <Type className="w-4 h-4 text-text" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-text">Type Input</div>
                            <div className="text-[10px] text-muted">Fill out a form field</div>
                        </div>
                    </button>

                    <button
                        onClick={() => addNode('default', 'Wait for Element')}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-accent/5 transition-colors text-left"
                    >
                        <div className="p-1.5 bg-background rounded-md border border-border">
                            <Clock className="w-4 h-4 text-warning" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-text">Wait for Details</div>
                            <div className="text-[10px] text-muted">Pause until element appears</div>
                        </div>
                    </button>

                    <button
                        onClick={() => addNode('default', 'Custom Script')}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface hover:border-accent hover:bg-accent/5 transition-colors text-left"
                    >
                        <div className="p-1.5 bg-background rounded-md border border-border">
                            <Code className="w-4 h-4 text-success" />
                        </div>
                        <div>
                            <div className="text-xs font-semibold text-text">Evaluate JS</div>
                            <div className="text-[10px] text-muted">Run custom script in page</div>
                        </div>
                    </button>
                </div>

                {/* React Flow Canvas */}
                <div className="flex-1 bg-background relative">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        fitView
                        className="bg-background"
                    >
                        <Controls className="bg-panel border-border fill-text" />
                        <MiniMap
                            nodeColor={() => '#888'}
                            maskColor="var(--color-base)"
                            className="bg-panel border border-border rounded-lg"
                        />
                        <Background gap={12} size={1} />
                    </ReactFlow>

                    {/* Properties Panel Stub (Absolute position right) */}
                    <div className="absolute right-4 top-4 bottom-4 w-72 bg-panel border border-border rounded-lg shadow-xl overflow-hidden flex flex-col pointer-events-auto z-10 hidden">
                        <div className="px-4 py-3 border-b border-border bg-surface flex items-center justify-between">
                            <span className="text-xs font-semibold text-text flex items-center gap-2">
                                <Settings className="w-4 h-4" /> Properties
                            </span>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            <p className="text-xs text-muted text-center pt-10">Select a node to configure</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
