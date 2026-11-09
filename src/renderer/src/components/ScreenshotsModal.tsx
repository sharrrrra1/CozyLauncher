import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ScreenshotEntry } from '@shared/types'
import { useApp } from '../state/AppContext'
import { api, formatBytes, formatDate, formatError } from '../lib/api'
import { Button, Modal, Spinner } from './ui'
import { Icon } from './Icon'

const PAGE_SIZE = 48

function ScreenshotTile({
  scope,
  item,
  onOpen
}: {
  scope: string
  item: ScreenshotEntry
  onOpen: () => void
}): ReactNode {
  const holder = useRef<HTMLButtonElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    const node = holder.current
    if (!node) return

    let alive = true
    let requested = false

    const load = (): void => {
      if (requested) return
      requested = true
      api.gallery
        .thumb(scope, item.file)
        .then((image) => {
          if (!alive) return
          if (image.dataUrl) setSrc(image.dataUrl)
          else setBroken(true)
        })
        .catch(() => {
          if (alive) setBroken(true)
        })
    }

    if (typeof IntersectionObserver === 'undefined') {
      load()
      return () => {
        alive = false
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          load()
          observer.disconnect()
        }
      },
      { rootMargin: '240px' }
    )
    observer.observe(node)
    return () => {
      alive = false
      observer.disconnect()
    }
  }, [scope, item.file])

  return (
    <button
      ref={holder}
      type="button"
      className="shot-tile"
      onClick={onOpen}
      title={`${item.file} · ${formatBytes(item.size)}`}
    >
      <span className="shot-tile-frame">
        {src ? (
          <img src={src} alt={item.file} draggable={false} loading="lazy" />
        ) : broken ? (
          <span className="shot-tile-broken">
            <Icon name="alert" size={18} />
            <span>Не открылось</span>
          </span>
        ) : (
          <span className="shot-tile-loading">
            <Spinner size={18} />
          </span>
        )}
      </span>
      <span className="shot-tile-name">{item.file}</span>
    </button>
  )
}

export function ScreenshotsModal({
  open,
  scope,
  title,
  onClose
}: {
  open: boolean
  scope: string | null
  title: string
  onClose: () => void
}): ReactNode {
  const { toast } = useApp()
  const [items, setItems] = useState<ScreenshotEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [index, setIndex] = useState<number | null>(null)
  const [fullSrc, setFullSrc] = useState<string | null>(null)
  const [fullBroken, setFullBroken] = useState(false)
  const [fullLoading, setFullLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !scope) return
    let alive = true
    setItems(null)
    setError(null)
    setLimit(PAGE_SIZE)
    setIndex(null)
    setFullSrc(null)
    setConfirmDelete(false)
    api.gallery
      .list(scope)
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch((reason) => {
        if (!alive) return
        setItems([])
        setError(formatError(reason))
      })
    return () => {
      alive = false
    }
  }, [open, scope])

  const current = index !== null && items ? items[index] : undefined

  useEffect(() => {
    if (index === null || !scope || !current) return
    let alive = true
    setFullLoading(true)
    setFullSrc(null)
    setFullBroken(false)
    api.gallery
      .full(scope, current.file)
      .then((image) => {
        if (!alive) return
        if (image.dataUrl) setFullSrc(image.dataUrl)
        else setFullBroken(true)
      })
      .catch(() => {
        if (alive) setFullBroken(true)
      })
      .finally(() => {
        if (alive) setFullLoading(false)
      })
    return () => {
      alive = false
    }
  }, [index, scope, current])

  const step = useCallback(
    (delta: number) => {
      setConfirmDelete(false)
      setIndex((value) => {
        if (value === null) return value
        const total = items?.length ?? 0
        if (!total) return null
        return (value + delta + total) % total
      })
    },
    [items]
  )

  useEffect(() => {
    if (!open || index === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        step(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        step(1)
      } else if (event.key === 'Escape') {
        setIndex(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, step])

  const copyCurrent = async (): Promise<void> => {
    if (!scope || !current) return
    try {
      await api.gallery.copy(scope, current.file)
      toast('success', 'Скриншот скопирован', 'Можно вставлять в чат')
    } catch (reason) {
      toast('error', 'Не удалось скопировать', formatError(reason))
    }
  }

  const removeCurrent = async (): Promise<void> => {
    if (!scope || !current || index === null) return
    setBusy(true)
    try {
      await api.gallery.remove(scope, current.file)
      const next = (items ?? []).filter((item) => item.file !== current.file)
      setItems(next)
      setConfirmDelete(false)
      setIndex(next.length ? Math.min(index, next.length - 1) : null)
      toast('info', 'Скриншот удалён', current.file)
    } catch (reason) {
      toast('error', 'Не удалось удалить скриншот', formatError(reason))
    } finally {
      setBusy(false)
    }
  }

  const openFolder = async (): Promise<void> => {
    if (!scope) return
    try {
      await api.gallery.openFolder(scope)
    } catch (reason) {
      toast('error', 'Не удалось открыть папку', formatError(reason))
    }
  }

  const visible = useMemo(() => (items ?? []).slice(0, limit), [items, limit])

  return (
    <>
      <Modal
        open={open}
        width={820}
        icon="monitor"
        title="Скриншоты"
        subtitle={title ? `${title} · снимки лежат прямо в папке игры` : undefined}
        onClose={onClose}
        dismissable={index === null && !busy}
      >
        {items === null && !error ? (
          <div className="modal-empty">
            <Spinner size={22} />
            <p>Ищем снимки в папке игры…</p>
          </div>
        ) : error ? (
          <div className="modal-empty">
            <Icon name="alert" size={24} />
            <p>{error}</p>
          </div>
        ) : !items || items.length === 0 ? (
          <div className="shot-empty">
            <span className="empty-icon">
              <Icon name="monitor" size={26} />
            </span>
            <h3>Скриншотов пока нет</h3>
            <p>Жми в игре F2 — и они появятся здесь сами.</p>
            <Button variant="ghost" icon="folder" onClick={() => void openFolder()}>
              Открыть папку
            </Button>
          </div>
        ) : (
          <>
            <div className="shot-grid">
              {visible.map((item, itemIndex) => (
                <ScreenshotTile
                  key={item.file}
                  scope={scope as string}
                  item={item}
                  onOpen={() => setIndex(itemIndex)}
                />
              ))}
            </div>
            {items.length > visible.length ? (
              <div className="shot-more">
                <Button
                  variant="ghost"
                  onClick={() => setLimit((value) => value + PAGE_SIZE)}
                >
                  Показать ещё
                </Button>
                <span>{items.length - visible.length} осталось</span>
              </div>
            ) : null}
          </>
        )}
      </Modal>

      {index !== null && current && scope ? (
        <div
          className="shot-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр скриншота"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIndex(null)
          }}
        >
          <div className="shot-lightbox-head">
            <div>
              <strong>{current.file}</strong>
              <span>
                {formatDate(current.mtimeMs)} · {formatBytes(current.size)}
              </span>
            </div>
            <button
              className="icon-btn"
              onClick={() => setIndex(null)}
              aria-label="Закрыть просмотр"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="shot-lightbox-stage">
            {(items?.length ?? 0) > 1 ? (
              <button
                className="shot-nav is-prev"
                onClick={() => step(-1)}
                aria-label="Предыдущий скриншот"
              >
                <Icon name="chevronRight" size={26} />
              </button>
            ) : null}

            <div className="shot-lightbox-image">
              {fullLoading ? (
                <Spinner size={26} />
              ) : fullSrc ? (
                <img src={fullSrc} alt={current.file} draggable={false} />
              ) : fullBroken ? (
                <div className="shot-tile-broken">
                  <Icon name="alert" size={22} />
                  <span>Не удалось открыть снимок</span>
                </div>
              ) : null}
            </div>

            {(items?.length ?? 0) > 1 ? (
              <button
                className="shot-nav is-next"
                onClick={() => step(1)}
                aria-label="Следующий скриншот"
              >
                <Icon name="chevronRight" size={26} />
              </button>
            ) : null}
          </div>

          <div className="shot-lightbox-actions">
            <Button variant="soft" icon="copy" className="btn-small" onClick={() => void copyCurrent()}>
              Копировать
            </Button>
            {confirmDelete ? (
              <>
                <span className="shot-confirm">Удалить этот снимок?</span>
                <Button
                  variant="danger"
                  className="btn-small"
                  loading={busy}
                  onClick={() => void removeCurrent()}
                >
                  Да, удалить
                </Button>
                <Button
                  variant="ghost"
                  className="btn-small"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Отмена
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                icon="trash"
                className="btn-small"
                onClick={() => setConfirmDelete(true)}
              >
                Удалить
              </Button>
            )}
            <Button variant="ghost" icon="folder" className="btn-small" onClick={() => void openFolder()}>
              Открыть папку
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
