import { useState, type ReactNode } from 'react'
import type { CrashInfo } from '@shared/types'
import { useApp } from '../state/AppContext'
import { api, formatError } from '../lib/api'
import { Badge, Button, Modal } from './ui'

type ActionId = 'safe' | 'memory' | 'mod' | 'report' | 'copy' | 'upload'

export function CrashModal(): ReactNode {
  const { crash, dismissCrash, updateSettings, toast } = useApp()
  const [busy, setBusy] = useState<ActionId | null>(null)

  if (!crash) return null

  const run = async (action: ActionId, task: () => Promise<unknown>, done?: string): Promise<void> => {
    setBusy(action)
    try {
      const result = await task()
      if (action === 'memory') await updateSettings({})
      if (done) toast('success', done, typeof result === 'string' ? result : undefined)
      if (action === 'safe' || action === 'memory' || action === 'mod') dismissCrash()
    } catch (error) {
      toast('error', 'Не удалось выполнить действие', formatError(error))
    } finally {
      setBusy(null)
    }
  }

  const title = crash.title
  const subtitle =
    crash.suspects.length > 0
      ? `Возможные виновники: ${crash.suspects.join(', ')}`
      : undefined

  return (
    <Modal
      open
      width={560}
      icon="alert"
      title={title}
      subtitle={subtitle}
      onClose={dismissCrash}
      footer={
        <div className="crash-actions">
          <Button
            variant="primary"
            icon="shield"
            loading={busy === 'safe'}
            onClick={() => void run('safe', () => api.crash.safeMode(crash.id), 'Запускаем без модов')}
          >
            Запустить без модов
          </Button>
          <Button
            variant="soft"
            icon="memory"
            loading={busy === 'memory'}
            onClick={() =>
              void run('memory', () => api.crash.addMemory(crash.id), 'Память увеличена на 2 ГБ')
            }
          >
            +2 ГБ памяти
          </Button>
          <Button
            variant="soft"
            icon="minus"
            loading={busy === 'mod'}
            onClick={() =>
              void run(
                'mod',
                () => api.crash.disableLastMod(crash.id),
                'Последний мод отключён'
              )
            }
          >
            Отключить последний мод
          </Button>
        </div>
      }
    >
      <div className="crash-card">
        <p className="crash-summary">{crash.summary}</p>

        <div className="crash-meta">
          {crash.signature ? <Badge tone="warm">{crash.signature}</Badge> : null}
          <Badge tone="neutral">{crash.memoryMb} МБ памяти</Badge>
          <Badge tone="neutral">{crash.modsCount} модов</Badge>
          {crash.exitCode !== null ? <Badge tone="neutral">код {crash.exitCode}</Badge> : null}
        </div>

        {crash.details.length > 0 ? (
          <div className="crash-section">
            <h4>Что случилось</h4>
            <ul>
              {crash.details.slice(0, 4).map((line, index) => (
                <li key={index}>
                  <code>{line}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="crash-section">
          <h4>Что попробовать</h4>
          <ul>
            {crash.hints.map((hint, index) => (
              <li key={index}>{hint}</li>
            ))}
          </ul>
        </div>

        <div className="crash-secondary">
          <Button
            variant="outline"
            icon="folder"
            loading={busy === 'report'}
            onClick={() => void run('report', () => api.crash.openReport(crash.id))}
          >
            Открыть отчёт
          </Button>
          <Button
            variant="outline"
            icon="copy"
            loading={busy === 'copy'}
            onClick={() => void run('copy', () => api.crash.copyReport(crash.id), 'Отчёт скопирован')}
          >
            Скопировать отчёт
          </Button>
          <Button
            variant="outline"
            icon="external"
            loading={busy === 'upload'}
            onClick={() =>
              void run(
                'upload',
                async () => {
                  const url = await api.crash.uploadReport(crash.id)
                  await api.shell.openExternal(url)
                  return url
                },
                'Отчёт загружен на mclo.gs'
              )
            }
          >
            Загрузить на mclo.gs
          </Button>
        </div>
      </div>
    </Modal>
  )
}
