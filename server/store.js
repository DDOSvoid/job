import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.resolve(__dirname, '..', 'data')

export const FILES = {
  companies: path.join(DATA_DIR, 'companies.json'),
  jobs: path.join(DATA_DIR, 'jobs.json'),
  applications: path.join(DATA_DIR, 'applications.json'),
}

/**
 * 每次调用都从磁盘读取，不做进程内缓存。
 * 这样 skill 直接把 JSON 写进 data/ 目录后，前端无需重启即可看到新数据。
 */
export function readCollection(file) {
  try {
    const raw = fs.readFileSync(FILES[file], 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

// 所有写入通过同一个 Promise 队列串行化，避免并发覆盖；
// 采用"写临时文件 → rename 原子替换"，防止写一半崩溃损坏 JSON。
let writeQueue = Promise.resolve()

export function writeCollection(file, data) {
  const target = FILES[file]
  const tmp = `${target}.tmp`
  const run = writeQueue.then(async () => {
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
    await fs.promises.rename(tmp, target)
  })
  // 队列中的一次失败不能卡死后续写入
  writeQueue = run.catch(() => {})
  return run
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}
