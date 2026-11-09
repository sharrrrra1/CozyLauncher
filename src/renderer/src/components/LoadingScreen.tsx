import type { ReactNode } from 'react'
import { useApp } from '../state/AppContext'
import { bootView } from '../lib/boot'
import { LogoMark } from './Stickers'

export function LoadingScreen(): ReactNode {
  const { ready, bootStage } = useApp()
  const view = bootView(bootStage, ready)
  const active = view.steps.find((step) => step.state === 'active')

  return (
    <div className="loading-screen">
      <div className="loading-stars" aria-hidden="true" />
      <svg
        className="loading-terrain"
        viewBox="0 0 600 140"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="loading-terrain-far"
          d="M0 96 H48 V80 H96 V88 H150 V72 H210 V84 H270 V64 H330 V80 H390 V72 H450 V88 H510 V76 H560 V92 H600 V140 H0 Z"
        />
        <path
          className="loading-terrain-near"
          d="M0 116 H60 V100 H120 V112 H180 V96 H240 V108 H300 V92 H360 V104 H420 V96 H480 V112 H540 V100 H600 V140 H0 Z"
        />
      </svg>
      <div className="loading-stage">
        <LogoMark size={96} className="loading-logo" />
        <div className="loading-name">JorneyMC</div>
        <div className="loading-tagline">Твой путь в Minecraft</div>
        <ul className="loading-checklist">
          {view.steps.map((step) => (
            <li key={step.label} className={`loading-step is-${step.state}`}>
              <span className="loading-step-box" aria-hidden="true">
                {step.state === 'done' ? '✓' : ''}
              </span>
              <span className="loading-step-label">{step.label}</span>
            </li>
          ))}
        </ul>
        <div className="loading-meter">
          <div
            className="loading-xp"
            role="progressbar"
            aria-valuenow={view.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Загрузка ${view.percent}%`}
          >
            <div className="loading-xp-fill" style={{ width: `${view.percent}%` }} />
          </div>
          <span className="loading-percent">
            {view.percent}
            <i>%</i>
          </span>
        </div>
        <div className="loading-hint">
          {view.done ? 'Всё готово — открываем лаунчер…' : `${active?.label ?? 'Загрузка'}…`}
        </div>
      </div>
    </div>
  )
}