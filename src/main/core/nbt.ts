export type NbtValue =
  | string
  | number
  | bigint
  | NbtValue[]
  | { [key: string]: NbtValue }
  | ArrayBuffer
  | Buffer

class NbtReader {
  private offset = 0

  constructor(private readonly buffer: Buffer) {}

  get remaining(): number {
    return this.buffer.length - this.offset
  }

  u8(): number {
    const value = this.buffer.readUInt8(this.offset)
    this.offset += 1
    return value
  }

  i16(): number {
    const value = this.buffer.readInt16BE(this.offset)
    this.offset += 2
    return value
  }

  u16(): number {
    const value = this.buffer.readUInt16BE(this.offset)
    this.offset += 2
    return value
  }

  i32(): number {
    const value = this.buffer.readInt32BE(this.offset)
    this.offset += 4
    return value
  }

  i64(): bigint {
    const value = this.buffer.readBigInt64BE(this.offset)
    this.offset += 8
    return value
  }

  f32(): number {
    const value = this.buffer.readFloatBE(this.offset)
    this.offset += 4
    return value
  }

  f64(): number {
    const value = this.buffer.readDoubleBE(this.offset)
    this.offset += 8
    return value
  }

  bytes(length: number): Buffer {
    const value = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  string(): string {
    const length = this.u16()
    return this.bytes(length).toString('utf8')
  }

  payload(tag: number, depth: number): NbtValue {
    if (depth > 512) throw new Error('Слишком глубокая структура NBT')
    switch (tag) {
      case 1:
        return this.u8() << 24 >> 24
      case 2:
        return this.i16()
      case 3:
        return this.i32()
      case 4:
        return this.i64()
      case 5:
        return this.f32()
      case 6:
        return this.f64()
      case 7: {
        const length = this.i32()
        return this.bytes(Math.max(0, length))
      }
      case 8:
        return this.string()
      case 9: {
        const itemTag = this.u8()
        const length = this.i32()
        const items: NbtValue[] = []
        for (let index = 0; index < Math.max(0, length); index += 1) {
          items.push(this.payload(itemTag, depth + 1))
        }
        return items
      }
      case 10: {
        const compound: { [key: string]: NbtValue } = {}
        for (;;) {
          const childTag = this.u8()
          if (childTag === 0) break
          const name = this.string()
          compound[name] = this.payload(childTag, depth + 1)
        }
        return compound
      }
      case 11: {
        const length = this.i32()
        const values: number[] = []
        for (let index = 0; index < Math.max(0, length); index += 1) values.push(this.i32())
        return values
      }
      case 12: {
        const length = this.i32()
        const values: bigint[] = []
        for (let index = 0; index < Math.max(0, length); index += 1) values.push(this.i64())
        return values
      }
      default:
        throw new Error(`Неизвестный тег NBT: ${tag}`)
    }
  }

  root(): { [key: string]: NbtValue } {
    const tag = this.u8()
    if (tag !== 10) throw new Error('Корневой тег servers.dat должен быть compound')
    this.string()
    return this.payload(10, 0) as { [key: string]: NbtValue }
  }
}

export function parseNbt(buffer: Buffer): { [key: string]: NbtValue } {
  return new NbtReader(buffer).root()
}

export interface ServerDatEntry {
  name: string
  ip: string
  icon?: string
}

/** Parses the vanilla servers.dat (uncompressed NBT). */
export function parseServersDat(buffer: Buffer): ServerDatEntry[] {
  const root = parseNbt(buffer)
  const servers = root.servers
  if (!Array.isArray(servers)) return []
  const result: ServerDatEntry[] = []
  for (const raw of servers) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = raw as Record<string, NbtValue>
    const ip = typeof entry.ip === 'string' ? entry.ip : ''
    if (!ip) continue
    result.push({
      name: typeof entry.name === 'string' && entry.name ? entry.name : ip,
      ip,
      icon: typeof entry.icon === 'string' ? entry.icon : undefined
    })
  }
  return result
}

/* ------------------------------------------------------------------ */
/*  Minimal NBT writer, used by tests and future export features.     */
/* ------------------------------------------------------------------ */

class NbtWriter {
  private chunks: Buffer[] = []

  raw(buffer: Buffer): void {
    this.chunks.push(buffer)
  }

  u8(value: number): void {
    this.raw(Buffer.from([value & 0xff]))
  }

  i16(value: number): void {
    const buffer = Buffer.alloc(2)
    buffer.writeInt16BE(value)
    this.raw(buffer)
  }

  i32(value: number): void {
    const buffer = Buffer.alloc(4)
    buffer.writeInt32BE(value)
    this.raw(buffer)
  }

  string(value: string): void {
    const data = Buffer.from(value, 'utf8')
    this.u16(data.length)
    this.raw(data)
  }

  u16(value: number): void {
    const buffer = Buffer.alloc(2)
    buffer.writeUInt16BE(value)
    this.raw(buffer)
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

/** Builds a servers.dat file. Kept small and used by unit tests. */
export function writeServersDat(servers: ServerDatEntry[]): Buffer {
  const writer = new NbtWriter()
  writer.u8(10) // root compound
  writer.string('')
  writer.u8(9) // list
  writer.string('servers')
  writer.u8(10) // list element type: compound
  writer.i32(servers.length)
  for (const server of servers) {
    writer.u8(8)
    writer.string('name')
    writer.string(server.name)
    writer.u8(8)
    writer.string('ip')
    writer.string(server.ip)
    if (server.icon) {
      writer.u8(8)
      writer.string('icon')
      writer.string(server.icon)
    }
    writer.u8(0)
  }
  writer.u8(0)
  return writer.toBuffer()
}
