import { describe, expect, it } from 'vitest'
import { handshakeMessage, isFatalHandshake, retryDelay } from '../src/main/stt/deepgram'
import { RobustResolver } from '../src/main/net'

const enotfound = (): Error => Object.assign(new Error('getaddrinfo ENOTFOUND api.deepgram.com'), { code: 'ENOTFOUND' })

describe('RobustResolver', () => {
  it('uses the system DNS when it works', async () => {
    const r = new RobustResolver(
      async () => '1.1.1.1',
      async () => ['9.9.9.9']
    )
    expect(await r.resolve('api.deepgram.com')).toBe('1.1.1.1')
  })

  it('falls back to public DNS when the system lookup fails (ENOTFOUND)', async () => {
    const fallbacks: string[] = []
    const r = new RobustResolver(
      async () => {
        throw enotfound()
      },
      async () => ['208.185.49.101'],
      (_h, how) => fallbacks.push(how)
    )
    expect(await r.resolve('api.deepgram.com')).toBe('208.185.49.101')
    expect(fallbacks).toEqual(['public-dns'])
  })

  it('falls back to the last good IP when every DNS fails', async () => {
    let systemOk = true
    const r = new RobustResolver(
      async () => {
        if (systemOk) return '4.53.203.19'
        throw enotfound()
      },
      async () => {
        throw new Error('timeout')
      }
    )
    expect(await r.resolve('api.deepgram.com')).toBe('4.53.203.19')
    systemOk = false
    expect(await r.resolve('api.deepgram.com')).toBe('4.53.203.19')
  })

  it('rethrows the system error when nothing is known', async () => {
    const r = new RobustResolver(
      async () => {
        throw enotfound()
      },
      async () => []
    )
    await expect(r.resolve('api.deepgram.com')).rejects.toThrow('ENOTFOUND')
  })

  it('works as a net lookup function, with and without all:true', async () => {
    const r = new RobustResolver(
      async () => '1.2.3.4',
      async () => []
    )
    const lookup = r.lookup()
    const single = await new Promise((resolve) =>
      lookup('x', {}, (err, address, family) => resolve({ err, address, family }))
    )
    expect(single).toEqual({ err: null, address: '1.2.3.4', family: 4 })
    const all = await new Promise((resolve) =>
      lookup('x', { all: true }, ((err: unknown, addresses: unknown) => resolve({ err, addresses })) as never)
    )
    expect(all).toEqual({ err: null, addresses: [{ address: '1.2.3.4', family: 4 }] })
  })
})

describe('RobustResolver public-first window', () => {
  it('after a system failure it asks the public DNS first, then goes back to the system DNS', async () => {
    let now = 0
    const calls: string[] = []
    const r = new RobustResolver(
      async () => {
        calls.push('system')
        throw enotfound()
      },
      async () => {
        calls.push('public')
        return ['5.5.5.5']
      },
      () => {},
      () => now,
      60_000
    )
    await r.resolve('h')
    expect(calls).toEqual(['system', 'public'])
    calls.length = 0
    now = 30_000
    await r.resolve('h')
    expect(calls).toEqual(['public'])
    calls.length = 0
    now = 200_000
    await r.resolve('h')
    expect(calls).toEqual(['system', 'public'])
  })
})

describe('Deepgram reconnection policy', () => {
  it('only gives up on auth, credit or permission errors', () => {
    expect(isFatalHandshake(401)).toBe(true)
    expect(isFatalHandshake(402)).toBe(true)
    expect(isFatalHandshake(403)).toBe(true)
    expect(isFatalHandshake(429)).toBe(false)
    expect(isFatalHandshake(500)).toBe(false)
    expect(isFatalHandshake(undefined)).toBe(false)
  })

  it('explains the common handshake errors', () => {
    expect(handshakeMessage(402)).toContain('credit')
    expect(handshakeMessage(401)).toContain('invalid API key')
    expect(handshakeMessage(503)).toContain('retrying')
  })

  it('backs off up to 8 s and never stops', () => {
    expect([0, 1, 2, 3, 4, 10, 50].map(retryDelay)).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000])
  })
})
