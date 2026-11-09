import os from 'node:os'
import { app, screen } from 'electron'
import type { OptimizationContext, OptimizationResult, SystemSpecs } from '@shared/types'
import { computeOptimization } from '@shared/optimization'

/**
 * Собирает характеристики ПК для автооптимизации.
 * GPU берём у Chromium (app.getGPUInfo), экран — у Electron screen.
 */
export async function getSystemSpecs(): Promise<SystemSpecs> {
  const cpus = os.cpus()
  const gpu: SystemSpecs['gpu'] = []

  try {
    const info = (await app.getGPUInfo('complete')) as {
      gpuDevice?: Array<Record<string, unknown>>
    }
    const devices = Array.isArray(info?.gpuDevice) ? info.gpuDevice : []
    for (const device of devices) {
      const deviceString =
        typeof device.deviceString === 'string' ? device.deviceString.trim() : undefined
      const driverVendor =
        typeof device.driverVendor === 'string' ? device.driverVendor.trim() : undefined
      const driverVersion =
        typeof device.driverVersion === 'string' ? device.driverVersion.trim() : undefined
      const vendorId = typeof device.vendorId === 'number' ? device.vendorId : undefined
      const renderer = deviceString || (vendorId !== undefined ? `GPU ${vendorId}` : undefined)
      const vendor = driverVendor || (vendorId !== undefined ? `Vendor ${vendorId}` : undefined)
      if (renderer || vendor) {
        gpu.push({
          vendor: vendor || 'Неизвестно',
          renderer: renderer || 'Неизвестно',
          version: driverVersion,
          vramMb: undefined
        })
      }
    }
  } catch {
    // Без GPU-информации оптимизация всё равно работает — просто без полного экрана.
  }

  let displays: SystemSpecs['screen'] = []
  try {
    const primary = screen.getPrimaryDisplay()
    const all = [primary, ...screen.getAllDisplays().filter((display) => display.id !== primary.id)]
    displays = all.map((display) => ({
      width: display.workAreaSize.width,
      height: display.workAreaSize.height,
      scaleFactor: display.scaleFactor
    }))
  } catch {
    // screen недоступен до app.whenReady — оставляем пустой список.
  }

  const totalMemMb = Math.round(os.totalmem() / 1024 / 1024)
  const freeMemMb = Math.round(os.freemem() / 1024 / 1024)
  const primaryDisplay = displays[0]
  const primaryGpu = gpu[0]

  return {
    cores: cpus.length,
    totalMemMb,
    freeMemMb,
    gpuVendor: primaryGpu?.vendor ?? 'Неизвестно',
    gpuModel: primaryGpu?.renderer ?? 'Неизвестно',
    screenW: primaryDisplay?.width ?? 0,
    screenH: primaryDisplay?.height ?? 0,
    os: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      totalMemMb,
      freeMemMb,
      cpus: cpus.map((cpu) => ({ model: cpu.model, speed: cpu.speed }))
    },
    gpu,
    screen: displays,
    appVersion: app.getVersion(),
    electron: process.versions.electron
  }
}

function hasKnownGpu(gpu: SystemSpecs['gpu']): boolean {
  return gpu.some((device) => {
    const names = [device.vendor, device.renderer].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    )
    return names.some(
      (name) => !/неизвест|unknown|microsoft basic|software/i.test(name)
    )
  })
}

/** Рекомендации под текущее железо. Настройки не меняет — только предлагает. */
export async function recommendSettings(
  context: OptimizationContext = {}
): Promise<OptimizationResult> {
  const specs = await getSystemSpecs()
  return computeOptimization(
    {
      totalMemMb: specs.totalMemMb,
      cores: specs.cores,
      gpuKnown: hasKnownGpu(specs.gpu),
      screenW: specs.screenW,
      screenH: specs.screenH
    },
    context
  )
}
