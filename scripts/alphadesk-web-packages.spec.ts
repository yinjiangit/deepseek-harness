/** Web 分发包闭包计算的回归测试。 */

import { describe, expect, it } from 'vitest'
import {
  CLAIMED_DEPENDENCY_SECTIONS,
  closureOf,
  partitionByFamily,
  singleVersion,
  type WorkspacePackage,
} from './alphadesk-web-packages.ts'

/**
 * 造一个 workspace 包。
 * @param name - 包名。
 * @param directory - 绝对目录。
 * @param manifest - 附加清单字段。
 * @returns 清单记录。
 */
function pkg(name: string, directory: string, manifest: Record<string, unknown> = {}): WorkspacePackage {
  return { name, directory, manifest: { name, version: '1.0.0', ...manifest } }
}

/**
 * 由一组包建索引。
 * @param entries - 包列表。
 * @returns 包名到包的映射。
 */
function index(entries: readonly WorkspacePackage[]): Map<string, WorkspacePackage> {
  return new Map(entries.map(entry => [entry.name, entry]))
}

describe('closureOf', () => {
  it('follows dependencies transitively', () => {
    const packages = index([
      pkg('a', '/r/packages/g/a', { dependencies: { b: '1' } }),
      pkg('b', '/r/packages/g/b', { dependencies: { c: '1' } }),
      pkg('c', '/r/packages/g/c'),
    ])
    expect([...closureOf(['a'], packages)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('follows peerDependencies', () => {
    const packages = index([
      pkg('a', '/r/packages/g/a', { peerDependencies: { b: '1' } }),
      pkg('b', '/r/packages/g/b'),
    ])
    expect(closureOf(['a'], packages).has('b')).toBe(true)
  })

  it('follows optionalDependencies, because koffi needs its platform prebuild', () => {
    const packages = index([
      pkg('koffi', '/r/packages/g/koffi', { optionalDependencies: { '@koromix/koffi-win32-x64': '1' } }),
      pkg('@koromix/koffi-win32-x64', '/r/packages/g/koffi-win32-x64'),
    ])
    expect(closureOf(['koffi'], packages).has('@koromix/koffi-win32-x64')).toBe(true)
  })

  it('ignores third-party names that have no workspace package', () => {
    const packages = index([pkg('a', '/r/packages/g/a', { dependencies: { react: '18' } })])
    const closure = closureOf(['a'], packages)
    expect([...closure]).toEqual(['a'])
  })

  it('terminates on dependency cycles', () => {
    const packages = index([
      pkg('a', '/r/packages/g/a', { dependencies: { b: '1' } }),
      pkg('b', '/r/packages/g/b', { dependencies: { a: '1' } }),
    ])
    expect([...closureOf(['a'], packages)].sort()).toEqual(['a', 'b'])
  })

  it('ignores a root that has no workspace package', () => {
    expect([...closureOf(['absent'], new Map())]).toEqual([])
  })

  it('names the three sections it follows', () => {
    expect([...CLAIMED_DEPENDENCY_SECTIONS])
      .toEqual(['dependencies', 'peerDependencies', 'optionalDependencies'])
  })
})

describe('partitionByFamily', () => {
  const packages = index([
    pkg('@deepseek-ai/dsh-a', '/r/packages/core/a'),
    pkg('@deepseek-ai/dsh-app', '/r/apps/web'),
    pkg('@deepseek-ai/cordis', '/r/vendor/cordis'),
  ])
  const root = '/r'

  it('separates vendor from everything else and sorts by name', () => {
    const split = partitionByFamily(new Set(['@deepseek-ai/dsh-a', '@deepseek-ai/dsh-app', '@deepseek-ai/cordis']), packages, root)
    expect(split.vendor.map(entry => entry.name)).toEqual(['@deepseek-ai/cordis'])
    expect(split.dsh.map(entry => entry.name)).toEqual(['@deepseek-ai/dsh-a', '@deepseek-ai/dsh-app'])
  })

  it('drops names with no workspace directory', () => {
    const split = partitionByFamily(new Set(['react', '@deepseek-ai/dsh-a']), packages, root)
    expect(split.dsh.map(entry => entry.name)).toEqual(['@deepseek-ai/dsh-a'])
    expect(split.vendor).toEqual([])
  })

  it('treats a Windows-style repository root the same', () => {
    const windows = new Map([['v', pkg('v', 'C:\\r\\vendor\\v')]])
    expect(partitionByFamily(new Set(['v']), windows, 'C:\\r').vendor.map(entry => entry.name)).toEqual(['v'])
  })
})

describe('singleVersion', () => {
  it('returns the shared version', () => {
    expect(singleVersion([pkg('a', '/r/a'), pkg('b', '/r/b')])).toBe('1.0.0')
  })

  it('rejects mixed versions', () => {
    expect(() => singleVersion([pkg('a', '/r/a'), pkg('b', '/r/b', { version: '2.0.0' })]))
      .toThrow(/mixes versions/u)
  })

  it('rejects a member without a version', () => {
    const broken: WorkspacePackage = { name: 'a', directory: '/r/a', manifest: { name: 'a' } }
    expect(() => singleVersion([broken])).toThrow(/has no version/u)
  })

  it('rejects an empty group', () => {
    expect(() => singleVersion([])).toThrow(/empty/u)
  })
})
