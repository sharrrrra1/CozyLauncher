export const BOOT_STEPS = [
  'Настройки и система',
  'Аккаунты и каталог версий',
  'Статусы сборок',
  'Журнал запуска'
]

export type BootStepState = 'done' | 'active' | 'pending'

export interface BootView {
  percent: number
  done: boolean
  steps: { label: string; state: BootStepState }[]
}

export function bootView(stage: number, ready: boolean): BootView {
  const total = BOOT_STEPS.length
  const completed = ready ? total : Math.min(Math.max(stage, 0), total - 1)
  return {
    percent: ready ? 100 : Math.round((completed / total) * 100),
    done: ready,
    steps: BOOT_STEPS.map((label, index) => ({
      label,
      state: index < completed ? 'done' : index === completed && !ready ? 'active' : 'pending'
    }))
  }
}