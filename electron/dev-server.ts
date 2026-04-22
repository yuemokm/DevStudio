import http from 'http'
import fs from 'fs/promises'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'

let server: http.Server | null = null
let viteProcess: ChildProcess | null = null

export async function startDevServer(projectPath: string, framework: string): Promise<{ url: string; port: number }> {
  await stopDevServer()

  if (framework === 'html') {
    return startStaticServer(projectPath)
  }

  return startFrameworkDevServer(projectPath, framework)
}

async function startStaticServer(projectPath: string): Promise<{ url: string; port: number }> {
  const port = await findFreePort(3456)
  console.log('[dev-server] starting static server on port', port, 'for', projectPath)

  server = http.createServer(async (req, res) => {
    const reqPath = req.url === '/' ? '/index.html' : req.url || '/index.html'
    const filePath = path.resolve(path.join(projectPath, decodeURIComponent(reqPath)))
    const resolvedProjectPath = path.resolve(projectPath)
    if (!filePath.startsWith(resolvedProjectPath + path.sep) && filePath !== resolvedProjectPath) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    try {
      const content = await fs.readFile(filePath)
      const ext = path.extname(filePath)
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
      }
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.writeHead(200)
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('Not Found')
    }
  })

  return new Promise((resolve, reject) => {
    server!.listen(port, '127.0.0.1', () => {
      console.log('[dev-server] static server ready at', `http://127.0.0.1:${port}`)
      resolve({ url: `http://127.0.0.1:${port}`, port })
    })
    server!.on('error', reject)
  })
}

async function startFrameworkDevServer(projectPath: string, framework: string): Promise<{ url: string; port: number }> {
  // Check if node_modules exists, auto-install if missing
  const nodeModulesPath = path.join(projectPath, 'node_modules')
  try {
    await fs.access(nodeModulesPath)
  } catch {
    console.log('node_modules not found, running npm install...')
    await runNpmInstall(projectPath)
  }

  const port = await findFreePort(5173)
  const command = framework === 'astro' ? 'astro' : 'vite'
  const args = ['dev', '--port', String(port), '--host', '127.0.0.1']

  viteProcess = spawn('npx', [command, ...args], {
    cwd: projectPath,
    shell: true,
    stdio: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0' },
  })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Dev server startup timeout (30s). Check if the project builds correctly.'))
    }, 30000)

    let outputBuffer = ''

    let resolved = false
    const checkReady = (data: Buffer) => {
      if (resolved) return
      const output = data.toString()
      outputBuffer += output
      console.log(`[dev-server] ${output.trim()}`)

      // Parse actual port from output in case the framework auto-incremented it
      const portMatch = output.match(/http:\/\/127\.0\.0\.1:(\d+)/)
      const actualPort = portMatch ? parseInt(portMatch[1], 10) : port

      if (output.includes('Local:') || output.includes('ready') || output.includes(`http://127.0.0.1:${actualPort}`)) {
        resolved = true
        clearTimeout(timeout)
        resolve({ url: `http://127.0.0.1:${actualPort}`, port: actualPort })
      }

      if (output.includes('error') || output.includes('Error')) {
        // Don't reject immediately, some errors are warnings
      }
    }

    viteProcess!.stdout?.on('data', checkReady)
    viteProcess!.stderr?.on('data', checkReady)
    viteProcess!.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
    viteProcess!.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout)
        reject(new Error(`Dev server exited with code ${code}. Output: ${outputBuffer.substring(0, 500)}`))
      }
    })
  })
}

function runNpmInstall(projectPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install'], {
      cwd: projectPath,
      shell: true,
      stdio: 'pipe',
    })

    let output = ''
    child.stdout?.on('data', (d) => { output += d.toString() })
    child.stderr?.on('data', (d) => { output += d.toString() })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`npm install failed with code ${code}. Output: ${output.substring(0, 500)}`))
      }
    })

    child.on('error', reject)
  })
}

export async function stopDevServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve())
    })
    server = null
  }
  if (viteProcess) {
    viteProcess.kill('SIGTERM')
    viteProcess = null
  }
}

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer()
    // Explicitly test IPv4 (127.0.0.1) since framework dev servers bind to --host 127.0.0.1.
    // Without specifying the host, Node.js may only test IPv6 on some systems,
    // causing false positives and port collisions.
    srv.listen(startPort, '127.0.0.1', () => {
      const port = (srv.address() as any).port
      srv.close(() => resolve(port))
    })
    srv.on('error', () => {
      resolve(findFreePort(startPort + 1))
    })
  })
}
