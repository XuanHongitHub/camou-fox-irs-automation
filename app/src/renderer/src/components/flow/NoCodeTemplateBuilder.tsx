import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Globe,
  Image,
  ListChecks,
  MousePointerClick,
  PauseCircle,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Copy,
  Type,
  Upload
} from 'lucide-react'
import { Button } from '../base/Button'
import { Input } from '../base/Input'
import type { AutomationStep, AutomationStepType, AutomationTemplateV1 } from '../../../../shared/types'

const STEP_TYPES: Array<{
  value: AutomationStepType
  label: string
  hint: string
  icon: typeof Globe
}> = [
  { value: 'goto', label: 'Goto URL', hint: 'Open target page', icon: Globe },
  { value: 'waitFor', label: 'Wait For', hint: 'Wait until element exists', icon: Timer },
  { value: 'fillText', label: 'Fill Text', hint: 'Type input value', icon: Type },
  { value: 'selectOption', label: 'Select Option', hint: 'Pick option by value', icon: ListChecks },
  { value: 'setCheckbox', label: 'Set Checkbox', hint: 'Toggle checkbox state', icon: ShieldCheck },
  { value: 'setRadio', label: 'Set Radio', hint: 'Set a radio option', icon: Radio },
  { value: 'uploadFile', label: 'Upload File', hint: 'Attach local file', icon: Upload },
  { value: 'click', label: 'Click', hint: 'Click element', icon: MousePointerClick },
  { value: 'submit', label: 'Submit', hint: 'Submit form', icon: MousePointerClick },
  { value: 'assert', label: 'Assert', hint: 'Validate final state', icon: CheckCircle2 },
  { value: 'screenshot', label: 'Screenshot', hint: 'Capture checkpoint', icon: Image },
  { value: 'sleep', label: 'Sleep', hint: 'Delay in milliseconds', icon: PauseCircle }
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

const SELECT_CLASS =
  'h-8 rounded-md bg-base border border-border px-2.5 text-xs text-text outline-none focus:ring-1 focus:ring-accent'

const PRESET_FLOWS: Array<{ id: string; label: string; steps: AutomationStep[] }> = [
  {
    id: 'quick_form',
    label: 'Quick Form',
    steps: [
      { type: 'goto', value: 'https://example.com/register' },
      { type: 'fillText', selector: 'input[name="email"]', valueFrom: 'input.email', timeoutMs: 12000 },
      { type: 'fillText', selector: 'input[name="password"]', valueFrom: 'input.password', timeoutMs: 12000 },
      { type: 'submit', selector: 'button[type="submit"]', timeoutMs: 12000 },
      { type: 'assert', assertType: 'success' }
    ]
  },
  {
    id: 'extended_form',
    label: 'Extended Form',
    steps: [
      { type: 'goto', value: 'https://example.com/form' },
      { type: 'waitFor', selector: 'form', timeoutMs: 12000 },
      { type: 'fillText', selector: 'input[name="full_name"]', valueFrom: 'input.full_name', timeoutMs: 12000 },
      { type: 'fillText', selector: 'input[name="email"]', valueFrom: 'input.email', timeoutMs: 12000 },
      { type: 'selectOption', selector: 'select[name="plan"]', valueFrom: 'input.plan', timeoutMs: 12000 },
      { type: 'setCheckbox', selector: 'input[name="accepted"]', valueFrom: 'input.accepted', timeoutMs: 12000 },
      { type: 'submit', selector: 'button[type="submit"]', timeoutMs: 12000 },
      { type: 'assert', assertType: 'success' }
    ]
  }
]

function defaultStep(type: AutomationStepType): AutomationStep {
  if (type === 'goto') return { type, value: 'https://example.com' }
  if (type === 'assert') return { type, assertType: 'success' }
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
    selectors: step.selectors || { css: [''], labelText: '', placeholder: '', name: '', id: '' }
  }
}

function csvToList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function listToCsv(items?: string[]): string {
  return (items || []).join(', ')
}

function hasSelector(step: AutomationStep): boolean {
  const css0 = String(step.selector || step.selectors?.css?.[0] || '').trim()
  if (css0) return true
  if (String(step.selectors?.labelText || '').trim()) return true
  if (String(step.selectors?.placeholder || '').trim()) return true
  if (String(step.selectors?.name || '').trim()) return true
  if (String(step.selectors?.id || '').trim()) return true
  return false
}

function hasMappedValue(step: AutomationStep): boolean {
  if (String(step.valueFrom || '').trim()) return true
  if (String(step.value || '').trim()) return true
  if (
    Object.prototype.hasOwnProperty.call(step, 'const') &&
    step.const != null &&
    String(step.const).trim()
  ) {
    return true
  }
  return false
}

function stepSummary(step: AutomationStep): string {
  if (step.type === 'goto') return String(step.value || '').trim() || 'URL not set'
  if (step.type === 'assert') return String(step.assertType || 'assert')
  if (step.type === 'sleep') return `${Number(step.timeoutMs || 0)}ms`
  if (step.valueFrom) return step.valueFrom
  if (String(step.value || '').trim()) return String(step.value || '')
  if (String(step.selector || '').trim()) return String(step.selector || '')
  return 'Configure step'
}

function getStepIssues(step: AutomationStep): string[] {
  const issues: string[] = []
  if (step.type === 'goto' && !String(step.value || '').trim()) issues.push('Goto URL is required')
  if (NEED_SELECTOR.has(step.type) && !hasSelector(step)) {
    issues.push('Selector or fallback locator is required')
  }
  if (NEED_VALUE.has(step.type) && !hasMappedValue(step)) {
    issues.push('Input mapping or const value is required')
  }
  if (step.type === 'assert') {
    const assertType = String(step.assertType || '').trim()
    if (!assertType) issues.push('Assert type is required')
    if (
      (assertType === 'containsText' || assertType === 'urlIncludes') &&
      !String(step.value || '').trim()
    ) {
      issues.push('Assert value is required for this assert type')
    }
  }
  if (step.type === 'sleep') {
    const value = Number(step.timeoutMs || 0)
    if (!Number.isFinite(value) || value < 0) issues.push('Sleep value must be >= 0')
  }
  return issues
}

interface NoCodeTemplateBuilderProps {
  template: AutomationTemplateV1
  onChange: (next: AutomationTemplateV1) => void
  inputFields?: string[]
}

export function NoCodeTemplateBuilder({
  template,
  onChange,
  inputFields = []
}: NoCodeTemplateBuilderProps) {
  const steps = useMemo(() => (template.steps || []).map((step) => normalizeStep(step)), [template.steps])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [stepTypeToAdd, setStepTypeToAdd] = useState<AutomationStepType>('fillText')

  useEffect(() => {
    if (selectedIndex < steps.length) return
    setSelectedIndex(Math.max(0, steps.length - 1))
  }, [steps.length, selectedIndex])

  const selectedStep = steps[selectedIndex]
  const issueMatrix = useMemo(() => steps.map((step) => getStepIssues(step)), [steps])
  const totalIssues = useMemo(
    () => issueMatrix.reduce((sum, issues) => sum + issues.length, 0),
    [issueMatrix]
  )
  const selectedIssues = selectedStep ? issueMatrix[selectedIndex] || [] : []

  const updateTemplate = (patch: Partial<AutomationTemplateV1>) => {
    onChange({ ...template, ...patch })
  }

  const updateStep = (index: number, patch: Partial<AutomationStep>) => {
    const next = [...steps]
    next[index] = normalizeStep({ ...next[index], ...patch })
    updateTemplate({ steps: next })
  }

  const addStep = (type: AutomationStepType) => {
    const next = [...steps, defaultStep(type)]
    updateTemplate({ steps: next })
    setSelectedIndex(next.length - 1)
  }

  const addPreset = (presetId: string) => {
    const preset = PRESET_FLOWS.find((item) => item.id === presetId)
    if (!preset) return
    const next = [...steps, ...preset.steps.map((step) => normalizeStep(step))]
    updateTemplate({ steps: next })
    setSelectedIndex(next.length - 1)
  }

  const removeStep = (index: number) => {
    const next = steps.filter((_, idx) => idx !== index)
    updateTemplate({ steps: next })
    setSelectedIndex(Math.max(0, Math.min(index, next.length - 1)))
  }

  const duplicateStep = (index: number) => {
    const next = [...steps]
    next.splice(index + 1, 0, normalizeStep({ ...steps[index] }))
    updateTemplate({ steps: next })
    setSelectedIndex(index + 1)
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    const current = next[index]
    next[index] = next[target]
    next[target] = current
    updateTemplate({ steps: next })
    setSelectedIndex(target)
  }

  const setValueMode = (index: number, mode: 'input' | 'const') => {
    if (mode === 'input') {
      updateStep(index, {
        valueFrom: String(steps[index].valueFrom || '').trim() || 'input.',
        value: ''
      })
      return
    }
    updateStep(index, { valueFrom: '', value: String(steps[index].value || '') })
  }

  return (
    <div className="h-full rounded-xl border border-border bg-panel overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-base/80 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-text">No-Code Flow Builder</h4>
            <p className="text-[11px] text-muted mt-0.5">
              Configure generic form automation with selector fallback and input mapping
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BadgeCounter label="steps" value={steps.length} />
            {totalIssues > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger">
                <AlertTriangle className="w-3 h-3" />
                {totalIssues} issue{totalIssues > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-[11px] text-success">
                <CheckCircle2 className="w-3 h-3" />
                Ready
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_auto] gap-2">
          <div className="grid grid-cols-[170px_1fr] gap-2">
            <select
              className={SELECT_CLASS}
              value={stepTypeToAdd}
              onChange={(event) => setStepTypeToAdd(event.target.value as AutomationStepType)}
            >
              {STEP_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={() => addStep(stepTypeToAdd)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Step
            </Button>
          </div>
          <Button size="sm" variant="secondary" onClick={() => addPreset('quick_form')}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Quick Form Preset
          </Button>
          <Button size="sm" variant="secondary" onClick={() => addPreset('extended_form')}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Extended Preset
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            value={listToCsv(template.successIndicators)}
            onChange={(event) => updateTemplate({ successIndicators: csvToList(event.target.value) })}
            placeholder="Success indicators (comma separated)"
          />
          <Input
            value={listToCsv(template.errorIndicators)}
            onChange={(event) => updateTemplate({ errorIndicators: csvToList(event.target.value) })}
            placeholder="Error indicators (comma separated)"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[340px_1fr]">
        <aside className="border-r border-border bg-surface/40 flex flex-col min-h-0">
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-widest font-mono text-muted">Flow Steps</p>
            <span className="text-[10px] text-muted">{steps.length} nodes</span>
          </div>
          <div className="p-3 space-y-2 overflow-auto min-h-0">
            {steps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-base/70 px-3 py-4 text-center text-xs text-muted">
                Add first step to start your flow.
              </div>
            ) : (
              steps.map((step, index) => {
                const meta = STEP_TYPES.find((item) => item.value === step.type)
                const Icon = meta?.icon || ChevronRight
                const active = index === selectedIndex
                const issues = issueMatrix[index] || []
                return (
                  <button
                    key={`step-${index}`}
                    className={`w-full text-left rounded-lg border px-2.5 py-2.5 transition-colors ${
                      active
                        ? 'border-accent bg-accent/12'
                        : 'border-border bg-base hover:border-accent/40 hover:bg-base/80'
                    }`}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-panel text-[10px] font-semibold text-muted">
                          {index + 1}
                        </span>
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-panel text-muted">
                          <Icon className="w-3 h-3" />
                        </span>
                        <span className="text-xs font-semibold text-text truncate">
                          {meta?.label || step.type}
                        </span>
                      </div>
                      {issues.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border border-danger/40 bg-danger/10 text-danger">
                          <AlertTriangle className="w-3 h-3" />
                          {issues.length}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border border-success/40 bg-success/10 text-success">
                          <CheckCircle2 className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted mt-1 truncate">{stepSummary(step)}</p>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="p-4 overflow-auto bg-panel min-h-0">
          {!selectedStep ? (
            <div className="h-full min-h-[360px] flex items-center justify-center text-xs text-muted border border-dashed border-border rounded-lg">
              Select or add a step to configure inspector fields.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-base p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-text">Step {selectedIndex + 1}</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      {STEP_TYPES.find((x) => x.value === selectedStep.type)?.hint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="icon"
                      size="sm"
                      title="Move up"
                      disabled={selectedIndex === 0}
                      onClick={() => moveStep(selectedIndex, 'up')}
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      title="Move down"
                      disabled={selectedIndex >= steps.length - 1}
                      onClick={() => moveStep(selectedIndex, 'down')}
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      title="Duplicate"
                      onClick={() => duplicateStep(selectedIndex)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      title="Delete"
                      onClick={() => removeStep(selectedIndex)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-danger" />
                    </Button>
                  </div>
                </div>

                {selectedIssues.length > 0 ? (
                  <div className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 mt-3">
                    <p className="text-[11px] font-semibold text-danger mb-1">Checklist</p>
                    {selectedIssues.map((issue) => (
                      <p key={issue} className="text-[11px] text-danger/95">
                        - {issue}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-success/40 bg-success/10 px-2.5 py-2 mt-3 text-[11px] text-success">
                    All required fields for this step are configured.
                  </div>
                )}
              </div>

              <BuilderCard title="Action Basics">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  <select
                    className={SELECT_CLASS}
                    value={selectedStep.type}
                    onChange={(event) =>
                      updateStep(selectedIndex, defaultStep(event.target.value as AutomationStepType))
                    }
                  >
                    {STEP_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    value={String(selectedStep.timeoutMs || '')}
                    onChange={(event) =>
                      updateStep(selectedIndex, { timeoutMs: Number(event.target.value || 0) })
                    }
                    placeholder="Timeout (ms)"
                  />
                </div>
              </BuilderCard>

              {selectedStep.type === 'goto' ? (
                <BuilderCard title="Navigation">
                  <Input
                    value={String(selectedStep.value || '')}
                    onChange={(event) => updateStep(selectedIndex, { value: event.target.value })}
                    placeholder="https://target/form"
                  />
                </BuilderCard>
              ) : null}

              {selectedStep.type === 'sleep' ? (
                <BuilderCard title="Delay">
                  <Input
                    type="number"
                    value={String(selectedStep.timeoutMs || 1200)}
                    onChange={(event) =>
                      updateStep(selectedIndex, { timeoutMs: Number(event.target.value || 0) })
                    }
                    placeholder="Sleep duration ms"
                  />
                </BuilderCard>
              ) : null}

              {selectedStep.type === 'assert' ? (
                <BuilderCard title="Assertion">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <select
                      className={SELECT_CLASS}
                      value={String(selectedStep.assertType || 'success')}
                      onChange={(event) =>
                        updateStep(selectedIndex, {
                          assertType: event.target.value as
                            | 'success'
                            | 'noError'
                            | 'containsText'
                            | 'urlIncludes'
                        })
                      }
                    >
                      <option value="success">success indicator</option>
                      <option value="noError">no error indicator</option>
                      <option value="containsText">contains text</option>
                      <option value="urlIncludes">url includes</option>
                    </select>
                    <Input
                      value={String(selectedStep.value || '')}
                      onChange={(event) => updateStep(selectedIndex, { value: event.target.value })}
                      placeholder="Assert value (if needed)"
                    />
                  </div>
                </BuilderCard>
              ) : null}

              {NEED_SELECTOR.has(selectedStep.type) ? (
                <BuilderCard title="Target Element">
                  <div className="space-y-2">
                    <Input
                      value={String(selectedStep.selector || selectedStep.selectors?.css?.[0] || '')}
                      onChange={(event) =>
                        updateStep(selectedIndex, {
                          selector: event.target.value,
                          selectors: { ...selectedStep.selectors, css: [event.target.value] }
                        })
                      }
                      placeholder='Primary CSS selector: input[name="email"]'
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        value={String(selectedStep.selectors?.labelText || '')}
                        onChange={(event) =>
                          updateStep(selectedIndex, {
                            selectors: { ...selectedStep.selectors, labelText: event.target.value }
                          })
                        }
                        placeholder="Fallback label text"
                      />
                      <Input
                        value={String(selectedStep.selectors?.placeholder || '')}
                        onChange={(event) =>
                          updateStep(selectedIndex, {
                            selectors: { ...selectedStep.selectors, placeholder: event.target.value }
                          })
                        }
                        placeholder="Fallback placeholder"
                      />
                      <Input
                        value={String(selectedStep.selectors?.name || '')}
                        onChange={(event) =>
                          updateStep(selectedIndex, {
                            selectors: { ...selectedStep.selectors, name: event.target.value }
                          })
                        }
                        placeholder="Fallback name"
                      />
                      <Input
                        value={String(selectedStep.selectors?.id || '')}
                        onChange={(event) =>
                          updateStep(selectedIndex, {
                            selectors: { ...selectedStep.selectors, id: event.target.value }
                          })
                        }
                        placeholder="Fallback id"
                      />
                    </div>
                  </div>
                </BuilderCard>
              ) : null}

              {NEED_VALUE.has(selectedStep.type) ? (
                <BuilderCard title="Data Mapping">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        className={`h-7 px-3 rounded-md border text-xs ${
                          selectedStep.valueFrom
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-border text-muted hover:text-text'
                        }`}
                        onClick={() => setValueMode(selectedIndex, 'input')}
                      >
                        Input mapping
                      </button>
                      <button
                        className={`h-7 px-3 rounded-md border text-xs ${
                          !selectedStep.valueFrom
                            ? 'border-accent bg-accent/15 text-accent'
                            : 'border-border text-muted hover:text-text'
                        }`}
                        onClick={() => setValueMode(selectedIndex, 'const')}
                      >
                        Const value
                      </button>
                    </div>
                    {selectedStep.valueFrom ? (
                      <>
                        <Input
                          value={String(selectedStep.valueFrom || '')}
                          onChange={(event) => updateStep(selectedIndex, { valueFrom: event.target.value })}
                          placeholder="input.email"
                        />
                        {inputFields.length > 0 ? (
                          <div className="rounded-md border border-border bg-panel p-2">
                            <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">
                              Input Fields
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {inputFields.slice(0, 24).map((field) => (
                                <button
                                  key={field}
                                  className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono text-muted hover:text-text"
                                  onClick={() =>
                                    updateStep(selectedIndex, { valueFrom: `input.${field}` })
                                  }
                                >
                                  input.{field}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <Input
                        value={String(selectedStep.value || selectedStep.const || '')}
                        onChange={(event) =>
                          updateStep(selectedIndex, {
                            value: event.target.value,
                            const: event.target.value
                          })
                        }
                        placeholder="constant value"
                      />
                    )}
                  </div>
                </BuilderCard>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function BuilderCard({
  title,
  children
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-base p-3 space-y-2">
      <p className="text-xs font-semibold text-text">{title}</p>
      {children}
    </div>
  )
}

function BadgeCounter({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-muted">
      {label}
      <strong className="text-text">{value}</strong>
    </span>
  )
}
