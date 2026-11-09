import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from './state/AppContext'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type PageId } from './components/Sidebar'
import { ConsoleDrawer } from './components/ConsoleDrawer'
import { Toasts } from './components/Toasts'
import { CrashModal } from './components/CrashModal'
import { HomePage } from './pages/HomePage'
import { VersionsPage } from './pages/VersionsPage'
import { InstancesPage } from './pages/InstancesPage'
import { ModsPage } from './pages/ModsPage'
import { ServersPage } from './pages/ServersPage'
import { AccountsPage } from './pages/AccountsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoadingScreen } from './components/LoadingScreen'

const PAGES: PageId[] = ['home', 'versions', 'instances', 'mods', 'servers', 'accounts', 'settings']

function pageFromHash(): PageId {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return (PAGES as string[]).includes(raw) ? (raw as PageId) : 'home'
}

export function App(): ReactNode {
  const { ready, accent, settings, consoleOpen } = useApp()
  const [page, setPage] = useState<PageId>(pageFromHash)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onHash = (): void => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])

  useEffect(() => {
    document.documentElement.dataset.design = settings?.design ?? 'cozy'
  }, [settings?.design])

  useEffect(() => {
    document.documentElement.dataset.animations = settings?.animations === false ? 'off' : 'on'
  }, [settings?.animations])

  useEffect(() => {
    document.documentElement.dataset.ready = ready ? '1' : '0'
  }, [ready])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [page])

  const navigate = (next: PageId): void => {
    setPage(next)
    if (window.location.hash !== `#/${next}`) {
      window.location.hash = `#/${next}`
    }
  }

  if (!ready) {
    return (
      <div className="app is-booting">
        <LoadingScreen />
      </div>
    )
  }

  return (
    <div className={`app${consoleOpen ? ' console-is-open' : ''}`}>
      <TitleBar />
      <div className="app-body">
        <Sidebar page={page} onNavigate={navigate} />
        <main className="content">
          <div className="content-scroll" ref={scrollRef}>
            <div className="page-swap" key={page}>
              {page === 'home' ? <HomePage onNavigate={navigate} /> : null}
              {page === 'versions' ? <VersionsPage /> : null}
              {page === 'instances' ? <InstancesPage /> : null}
              {page === 'mods' ? <ModsPage /> : null}
              {page === 'servers' ? <ServersPage /> : null}
              {page === 'accounts' ? <AccountsPage /> : null}
              {page === 'settings' ? <SettingsPage /> : null}
            </div>
            <div className="content-tail" />
          </div>
          <ConsoleDrawer />
        </main>
      </div>
      <Toasts />
      <CrashModal />
    </div>
  )
}
