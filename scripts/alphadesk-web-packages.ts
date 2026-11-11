/**
 * Web 分发包的依赖闭包计算。
 *
 * 与构建脚本分开：闭包是纯函数（输入是工作区清单，输出是包名集合），可以在
 * 没有文件系统副作用的情况下单测。`scripts/alphadesk-web-dist.ts` 只负责把
 * 这个集合落成 tarball 与安装脚本。
 * @module
 */

/** 一个 workspace 包的清单信息。 */
export interface WorkspacePackage {
  /** `package.json` 的 `name`。 */
  readonly name: string
  /** 包的绝对目录。 */
  readonly directory: string
  /** 原始清单内容。 */
  readonly manifest: Record<string, unknown>
}

/**
 * 闭包跟随的依赖段。
 *
 * `optionalDependencies` 必须计入：`koffi` 把平台预编译二进制声明在
 * `@koromix/koffi-<platform>` 的 optional 依赖里，安装脚本一旦加
 * `--omit=optional` 就会跳过它，koffi 随即回退源码编译并要求 CMake。
 * 因此安装脚本不加该标志，闭包也不排除这一段。
 */
export const CLAIMED_DEPENDENCY_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const

/**
 * 求给定根包的运行时依赖闭包。
 *
 * 结果只含 workspace 内的包：第三方依赖（`react`、`esbuild` 等）不进集合，
 * 它们由 npm 在安装时解析，分发包不打包。
 * @param roots - 根包名；不在 workspace 里的名字忽略。
 * @param packages - 全部 workspace 包。
 * @returns 可达包名集合。
 */
export function closureOf(roots: readonly string[], packages: ReadonlyMap<string, WorkspacePackage>): Set<string> {
  const seen = new Set<string>()
  const queue: string[] = []
  for (const root of roots) if (packages.has(root)) queue.push(root)
  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined || seen.has(name)) continue
    seen.add(name)
    const entry = packages.get(name)
    if (entry === undefined) continue
    for (const section of CLAIMED_DEPENDENCY_SECTIONS) {
      const declared = entry.manifest[section]
      if (typeof declared !== 'object' || declared === null || Array.isArray(declared)) continue
      for (const dependency of Object.keys(declared)) {
        if (!seen.has(dependency) && packages.has(dependency)) queue.push(dependency)
      }
    }
  }
  return seen
}

/**
 * 把一个闭包分成 dsh 包与 vendor 包两组。
 *
 * vendor 目录定位在仓库根下的 `vendor/`；其余（`packages/`、`apps/`）归 dsh。
 * 集合里没有对应 workspace 目录的名字（第三方依赖）直接丢弃——分发包不打包
 * 第三方，它们由 npm 在安装时解析。
 * @param closure - 包名集合。
 * @param packages - 全部 workspace 包。
 * @param repositoryRoot - 仓库根，用于判定 vendor 归属。
 * @returns 两组已排序的包。
 */
export function partitionByFamily(
  closure: ReadonlySet<string>,
  packages: ReadonlyMap<string, WorkspacePackage>,
  repositoryRoot: string,
): { dsh: WorkspacePackage[]; vendor: WorkspacePackage[] } {
  const dsh: WorkspacePackage[] = []
  const vendor: WorkspacePackage[] = []
  const vendorRoot = `${repositoryRoot.replaceAll('\\', '/')}/vendor/`
  for (const name of [...closure].sort()) {
    const entry = packages.get(name)
    if (entry === undefined) continue
    const directory = entry.directory.replaceAll('\\', '/')
    if (directory.startsWith(vendorRoot)) vendor.push(entry)
    else dsh.push(entry)
  }
  return { dsh, vendor }
}

/**
 * 断言一个 dsh 分组只有一种版本。
 *
 * dsh 发行家族要求所有成员同版本，一个分发包跨版本说明工作区状态不一致。
 * @param members - 待检查的包。
 * @returns 共同版本。
 * @throws 当成员的版本不一致，或某个成员没有 `version`。
 */
export function singleVersion(members: readonly WorkspacePackage[]): string {
  if (members.length === 0) throw new Error('dsh closure is empty')
  const versions = new Set<string>()
  for (const member of members) {
    const version = member.manifest.version
    if (typeof version !== 'string' || version === '') {
      throw new Error(`${member.name} has no version`)
    }
    versions.add(version)
  }
  if (versions.size !== 1) {
    const detail = members.map(member => `${member.name}@${String(member.manifest.version)}`).join(', ')
    throw new Error(`dsh closure mixes versions: ${detail}`)
  }
  const [version] = versions
  if (version === undefined) throw new Error('dsh closure is empty')
  return version
}
