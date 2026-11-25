// Resolución de nombres tolerante a fallos. En algunos equipos el DNS del sistema
// (getaddrinfo) falla de forma intermitente para api.deepgram.com, cuyos registros
// duran solo 10 s. Orden: DNS del sistema -> DNS públicos -> última IP buena.

import dns from 'node:dns'
import type { LookupFunction } from 'node:net'

export type Resolve4 = (host: string) => Promise<string[]>
export type SystemLookup = (host: string) => Promise<string>

const publicResolver = new dns.promises.Resolver({ timeout: 2500, tries: 2 })
publicResolver.setServers(['1.1.1.1', '8.8.8.8', '9.9.9.9'])

const defaultSystem: SystemLookup = async (host) => (await dns.promises.lookup(host, { family: 4 })).address
const defaultPublic: Resolve4 = (host) => publicResolver.resolve4(host)

export class RobustResolver {
  private readonly lastGood = new Map<string, string>()
  /** Tras un fallo del DNS del sistema, se consulta primero el público durante un rato. */
  private preferPublicUntil = 0

  constructor(
    private readonly system: SystemLookup = defaultSystem,
    private readonly publicDns: Resolve4 = defaultPublic,
    private readonly onFallback: (host: string, how: string, err: unknown) => void = () => {},
    private readonly now: () => number = Date.now,
    private readonly preferPublicMs = 10 * 60_000
  ) {}

  private async viaPublic(host: string): Promise<string> {
    const ips = await this.publicDns(host)
    if (!ips.length) throw new Error('empty answer')
    return ips[0]
  }

  async resolve(host: string): Promise<string> {
    const publicFirst = this.now() < this.preferPublicUntil
    const order: Array<['system' | 'public-dns', () => Promise<string>]> = publicFirst
      ? [['public-dns', () => this.viaPublic(host)], ['system', () => this.system(host)]]
      : [['system', () => this.system(host)], ['public-dns', () => this.viaPublic(host)]]
    let firstErr: unknown
    for (const [how, fn] of order) {
      try {
        const ip = await fn()
        this.lastGood.set(host, ip)
        if (how === 'public-dns' && !publicFirst) this.onFallback(host, how, firstErr)
        return ip
      } catch (err) {
        if (how === 'system') this.preferPublicUntil = this.now() + this.preferPublicMs
        firstErr ??= err
      }
    }
    const cached = this.lastGood.get(host)
    if (cached) {
      this.onFallback(host, 'cached-ip', firstErr)
      return cached
    }
    throw firstErr
  }

  /** Función `lookup` compatible con net/tls/https (y por tanto con la librería ws). */
  lookup(): LookupFunction {
    return (hostname, options, callback) => {
      this.resolve(hostname).then(
        (address) => {
          if (options && (options as { all?: boolean }).all) {
            ;(callback as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(null, [
              { address, family: 4 }
            ])
          } else {
            callback(null, address, 4)
          }
        },
        (err: NodeJS.ErrnoException) => callback(err, '', 4)
      )
    }
  }
}
