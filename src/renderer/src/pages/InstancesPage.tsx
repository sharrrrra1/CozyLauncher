import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Instance } from '@shared/types'
import { useApp } from '../state/AppContext'
import { api, formatError } from '../lib/api'
import { Badge, Button, Field, Modal, Spinner } from '../components/ui'
import { Icon } from '../components/Icon'

interface FormState {
  name: string
  versionId: string
  loader: 'vanilla' | 'fabric'
  ramMb: string
  javaPath: string
}

const EMPTY_FORM: FormState = {
  name: '',
  versionId: '',
  loader: 'fabric',
  ramMb: '',
  javaPath: ''
}

export function InstancesPage(): ReactNode {
  const { settings, featured, statuses, toast, launchInstance, launchState } = useApp()
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; instance?: Instance } | null>(
    null
  )
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Instance | null>(null)

  const refresh = useCallback(async () => {
    try {
      setInstances(await api.instances.list())
    } catch (error) {
      toast('error', 'Не удалось загрузить сборки', formatError(error))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (launchState?.phase === 'exited' || launchState?.phase === 'stopped') void refresh()
  }, [launchState?.phase, refresh])

  const versionOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const item of featured) ids.add(item.id)
    for (const [id, status] of Object.entries(statuses)) if (status.installed) ids.add(id)
    if (settings?.lastVersion) ids.add(settings.lastVersion)
    return [...ids]
  }, [featured, statuses, settings?.lastVersion])

  const openCreate = (): void => {
    setForm({
      ...EMPTY_FORM,
      versionId: settings?.lastVersion ?? featured[0]?.id ?? ''
    })
    setEditor({ mode: 'create' })
  }

  const openEdit = (instance: Instance): void => {
    setForm({
      name: instance.name,
      versionId: instance.versionId,
      loader: instance.loader,
      ramMb: instance.ramMb ? String(instance.ramMb) : '',
      javaPath: instance.javaPath ?? ''
    })
    setEditor({ mode: 'edit', instance })
  }

  const save = async (): Promise<void> => {
    if (!editor) return
    if (!form.name.trim()) {
      toast('error', 'Укажите название сборки')
      return
    }
    if (!/^[A-Za-z0-9._-]+$/.test(form.versionId.trim())) {
      toast('error', 'Укажите версию Minecraft, например 1.21.4')
      return
    }
    const ram = form.ramMb.trim() ? Math.max(512, Number(form.ramMb)) : undefined
    if (ram !== undefined && !Number.isFinite(ram)) {
      toast('error', 'Некорректный объём памяти')
      return
    }
    setSaving(true)
    try {
      if (editor.mode === 'create') {
        await api.instances.create({
          name: form.name.trim(),
          versionId: form.versionId.trim(),
          loader: form.loader,
          ramMb: ram,
          javaPath: form.javaPath.trim() || undefined
        })
        toast('success', 'Сборка создана', form.name.trim())
      } else if (editor.instance) {
        await api.instances.update(editor.instance.id, {
          name: form.name.trim(),
          versionId: form.versionId.trim(),
          loader: form.loader,
          ramMb: ram,
          javaPath: form.javaPath.trim()
        })
        toast('success', 'Сборка обновлена', form.name.trim())
      }
      setEditor(null)
      await refresh()
    } catch (error) {
      toast('error', 'Не удалось сохранить сборку', formatError(error))
    } finally {
      setSaving(false)
    }
  }

  const clone = async (instance: Instance): Promise<void> => {
    setBusy(instance.id)
    try {
      await api.instances.clone(instance.id)
      toast('success', 'Сборка склонирована', instance.name)
      await refresh()
    } catch (error) {
      toast('error', 'Не удалось склонировать сборку', formatError(error))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (instance: Instance): Promise<void> => {
    setBusy(instance.id)
    try {
      await api.instances.remove(instance.id)
      toast('info', 'Сборка удалена', instance.name)
      setConfirmDelete(null)
      await refresh()
    } catch (error) {
      toast('error', 'Не удалось удалить сборку', formatError(error))
    } finally {
      setBusy(null)
    }
  }

  const openFolder = async (instance: Instance): Promise<void> => {
    try {
      await api.instances.openFolder(instance.id)
    } catch (error) {
      toast('error', 'Не удалось открыть папку', formatError(error))
    }
  }

  const chooseJava = async (): Promise<void> => {
    const file = await api.settings.chooseJava()
    if (file) setForm((prev) => ({ ...prev, javaPath: file }))
  }

  const activeInstance =
    launchState?.instanceId && launchState.phase === 'running'
      ? instances.find((item) => item.id === launchState.instanceId)
      : undefined

  return (
    <div className="page instances-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">Изолированные сборки</span>
          <h1>Сборки</h1>
        </div>
        <div className="heading-actions">
          <div className="heading-stat">
            <span>Всего</span>
            <strong>{instances.length}</strong>
          </div>
          <Button variant="primary" icon="plus" onClick={openCreate}>
            Новая сборка
          </Button>
        </div>
      </div>

      <p className="page-lead">
        У каждой сборки свои моды, миры, скриншоты, память и Java. Файлы игры общие, поэтому новые
        версии не скачиваются повторно.
      </p>

      {loading ? (
        <div className="empty-state">
          <Spinner size={22} />
          <p>Загружаем сборки…</p>
        </div>
      ) : instances.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="gamepad" size={26} />
          </span>
          <h3>Пока ни одной сборки</h3>
          <p>
            Создайте сборку для модов или подключите существующую из другого лаунчера во вкладке
            «Настройки → Импорт».
          </p>
          <Button variant="primary" icon="plus" onClick={openCreate}>
            Создать сборку
          </Button>
        </div>
      ) : (
        <div className="instance-grid">
          {instances.map((instance) => {
            const playing = activeInstance?.id === instance.id && launchState?.phase === 'running'
            return (
              <article className="instance-card" key={instance.id}>
                <div className="instance-card-head">
                  <span className="instance-avatar">
                    <Icon name="gamepad" size={22} />
                  </span>
                  <div className="instance-title">
                    <h3>{instance.name}</h3>
                    <span>
                      Minecraft {instance.versionId} ·{' '}
                      {instance.loader === 'fabric' ? 'Fabric' : 'Vanilla'}
                    </span>
                  </div>
                  {instance.external ? <Badge tone="info">внешняя</Badge> : null}
                </div>

                <div className="instance-stats">
                  <span>
                    <Icon name="sparkles" size={14} /> {instance.modsCount ?? 0} модов
                  </span>
                  <span>
                    <Icon name="memory" size={14} /> {instance.ramMb ?? settings?.ramMb ?? '—'} МБ
                  </span>
                  <span title={instance.dir}>
                    <Icon name="folder" size={14} /> {instance.external ? 'папка другого лаунчера' : 'своя папка'}
                  </span>
                </div>

                <div className="instance-actions">
                  <Button
                    variant="primary"
                    icon="play"
                    disabled={playing}
                    onClick={() => void launchInstance(instance.id)}
                  >
                    {playing ? 'Играет' : 'Играть'}
                  </Button>
                  <Button
                    variant="outline"
                    icon="shield"
                    title="Запустить без модов"
                    onClick={() => void launchInstance(instance.id, true)}
                  >
                    Без модов
                  </Button>
                  <Button
                    variant="ghost"
                    icon="folder"
                    title="Открыть папку"
                    onClick={() => void openFolder(instance)}
                  >
                    Папка
                  </Button>
                </div>

                <div className="instance-links">
                  <button type="button" onClick={() => openEdit(instance)}>
                    <Icon name="settings" size={14} /> Настроить
                  </button>
                  <button type="button" disabled={busy === instance.id} onClick={() => void clone(instance)}>
                    <Icon name="copy" size={14} /> Клонировать
                  </button>
                  <button
                    type="button"
                    className="danger-link"
                    disabled={busy === instance.id}
                    onClick={() => setConfirmDelete(instance)}
                  >
                    <Icon name="trash" size={14} /> Удалить
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={editor !== null}
        width={480}
        icon="gamepad"
        title={editor?.mode === 'edit' ? 'Настройки сборки' : 'Новая сборка'}
        subtitle="Моды и миры хранятся отдельно от других сборок"
        dismissable={!saving}
        onClose={() => setEditor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)} disabled={saving}>
              Отмена
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {editor?.mode === 'edit' ? 'Сохранить' : 'Создать'}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Название" wide>
            <input
              value={form.name}
              maxLength={48}
              placeholder="Например, «Ванильный уют»"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Версия Minecraft" hint="Версия должна быть установлена во вкладке «Версии»">
            <input
              value={form.versionId}
              list="instance-versions"
              placeholder="1.21.4"
              spellCheck={false}
              onChange={(event) => setForm({ ...form, versionId: event.target.value })}
            />
            <datalist id="instance-versions">
              {versionOptions.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </Field>
          <Field label="Загрузчик">
            <select
              value={form.loader}
              onChange={(event) =>
                setForm({ ...form, loader: event.target.value === 'vanilla' ? 'vanilla' : 'fabric' })
              }
            >
              <option value="fabric">Fabric (моды)</option>
              <option value="vanilla">Vanilla (без модов)</option>
            </select>
          </Field>
          <Field label="Память, МБ" hint="Пусто — как в общих настройках">
            <input
              value={form.ramMb}
              type="number"
              min={512}
              step={512}
              placeholder={String(settings?.ramMb ?? 4096)}
              onChange={(event) => setForm({ ...form, ramMb: event.target.value })}
            />
          </Field>
          <Field label="Java" hint="Пусто — автоматический подбор">
            <div className="input-with-button">
              <input
                value={form.javaPath}
                placeholder="Авто"
                spellCheck={false}
                onChange={(event) => setForm({ ...form, javaPath: event.target.value })}
              />
              <Button variant="ghost" onClick={() => void chooseJava()}>
                Выбрать
              </Button>
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        icon="trash"
        title="Удалить сборку?"
        subtitle={confirmDelete?.name}
        dismissable={busy === null}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy !== null}>
              Отмена
            </Button>
            <Button
              variant="danger"
              loading={busy === confirmDelete?.id}
              onClick={() => confirmDelete && void remove(confirmDelete)}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p>
          {confirmDelete?.external
            ? 'Сборка была подключена из другого лаунчера. Её файлы останутся на месте, из Cozy она просто исчезнет.'
            : 'Папка сборки будет удалена вместе с модами, мирами и настройками. Версия Minecraft останется в лаунчере.'}
        </p>
      </Modal>
    </div>
  )
}
