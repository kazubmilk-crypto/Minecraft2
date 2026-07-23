const http = require('http')
const fs = require('fs')
const path = require('path')
const Bot = require('./bot.js')
const { generateUsername } = require('./usernames.js')

const PORT = process.env.PORT || 3000
const bots = {}
const rotation = { active: false, interval: null, nextSpawn: 0 }

const ENGLISH_NAMES = [
  'DiamondSteve','CreeperHunter','EnderDragon','WolfMaster','NetherKing',
  'WitherStorm','IronGolem','VillagerPro','RedstoneGuy','PistonLord',
  'TNTMaster','ObsidianBoy','EmeraldKing','GoldMiner','DiamondSword',
  'StoneBuilder','WoodCrafter','SandWalker','SnowFall','LavaDrip',
  'CaveExplorer','MineShaft','ForestRun','OceanDive','DesertWalk',
  'SkyBuilder','BaseDefend','PvPKing','PvEMaster','LootGoblin',
  'SpeedRunner','ParkourPro','BuildKing','CraftMaster','FarmBoy',
  'TreeCutter','FishCatcher','MobHunter','ZombieSlayer','SkeletonArcher',
  'SpiderJockey','BlazeFighter','GhastHunter','EndermanSee','CreeperBoom',
]

function generateEnglishName() {
  return ENGLISH_NAMES[Math.floor(Math.random() * ENGLISH_NAMES.length)] + Math.floor(Math.random() * 999)
}

function scheduleNextRotation() {
  const delay = 45000 + Math.random() * 15000
  rotation.nextSpawn = Date.now() + delay
  rotation.interval = setTimeout(() => {
    if (!rotation.active) return
    const names = Object.keys(bots)
    if (names.length >= 5) {
      const removeName = names[Math.floor(Math.random() * names.length)]
      console.log(`[Rotation] Удаляю ${removeName}`)
      removeBot(removeName)
    }
    const newName = generateEnglishName()
    console.log(`[Rotation] Добавляю ${newName}`)
    addBot(newName)
    scheduleNextRotation()
  }, delay)
}

function startRotation() {
  if (rotation.active) return
  rotation.active = true
  console.log('[Rotation] Запущена ротация ботов')
  scheduleNextRotation()
}

function stopRotation() {
  rotation.active = false
  rotation.nextSpawn = 0
  if (rotation.interval) {
    clearTimeout(rotation.interval)
    rotation.interval = null
  }
  console.log('[Rotation] Остановлена')
}

function addBot(username) {
  if (bots[username]) return false
  try {
    const bot = new Bot(username, {
    host: 'srv12.vrhosting.su',
    port: 25263,
    version: '1.16.5',
    password: 'zons123123',
    })
    bot.create()
    bots[username] = bot
    return true
  } catch(e) {
    console.error(`[${username}] Ошибка создания: ${e.message}`)
    return false
  }
}

function removeBot(username) {
  if (!bots[username]) return false
  bots[username].destroy()
  delete bots[username]
  return true
}

function startBot(username) {
  if (!bots[username]) return false
  if (bots[username].alive) return false
  try { bots[username].bot.quit() } catch(e) {}
  bots[username].bot = null
  bots[username].create()
  return true
}

function stopBot(username) {
  if (!bots[username]) return false
  if (!bots[username].alive) return false
  bots[username].stopBehavior()
  try { bots[username].bot.quit() } catch(e) {}
  bots[username].alive = false
  bots[username].registered = false
  bots[username].server = 'lobby'
  return true
}

function getAllStatus() {
  const result = {}
  for (const [name, bot] of Object.entries(bots)) {
    result[name] = bot.getStatus()
  }
  return result
}

const HTML = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8')

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HTML)
    return
  }

  if (url.pathname === '/api/bots' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getAllStatus()))
    return
  }

  if (url.pathname === '/api/bot/add' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const ok = addBot(data.username)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok, username: data.username }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/bot/remove' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const ok = removeBot(data.username)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok, username: data.username }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/bot/start' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const ok = startBot(data.username)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok, username: data.username }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/bot/stop' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const ok = stopBot(data.username)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok, username: data.username }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/bot/command' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const bot = bots[data.username]
        if (!bot) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Bot not found' }))
          return
        }
        if (data.command.startsWith('/')) {
          bot.command(data.command.substring(1))
        } else {
          bot.say(data.command)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/bot/join' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const bot = bots[data.username]
        if (!bot) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Bot not found' }))
          return
        }
        bot.command(`server ${data.server || 'grief-1'}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/bots/create' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const count = Math.min(parseInt(data.count) || 1, 50)
        const created = []
        for (let i = 0; i < count; i++) {
          let username
          let attempts = 0
          do {
            username = generateUsername()
            attempts++
          } while (bots[username] && attempts < 100)
          if (!bots[username]) {
            addBot(username)
            created.push(username)
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, created }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/bots/batch' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const count = Math.min(parseInt(data.count) || 1, 50)
        const delay = Math.max(parseInt(data.delay) || 30, 5)
        const created = []
        let index = 0

        function createNext() {
          if (index >= count) return
          let username
          let attempts = 0
          do {
            username = generateUsername()
            attempts++
          } while (bots[username] && attempts < 100)
          if (!bots[username]) {
            addBot(username)
            created.push(username)
            console.log(`[Batch] Создан ${username} (${index + 1}/${count})`)
          }
          index++
          if (index < count) {
            setTimeout(createNext, delay * 1000)
          }
        }

        createNext()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, created, total: count, delay }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/rotation' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        if (data.enable) startRotation()
        else stopRotation()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, active: rotation.active }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/api/rotation/status' && req.method === 'GET') {
    const remaining = rotation.active ? Math.max(0, Math.ceil((rotation.nextSpawn - Date.now()) / 1000)) : 0
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ active: rotation.active, nextSpawn: remaining }))
    return
  }

  if (url.pathname === '/api/bot/behavior' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const bot = bots[data.username]
        if (!bot) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Bot not found' }))
          return
        }
        if (data.action === 'walk') {
          if (data.enable) bot.startRandomWalk()
          else bot.stopRandomWalk()
        } else if (data.action === 'chat') {
          if (data.enable) bot.startRandomChat()
          else bot.stopRandomChat()
        } else if (data.action === 'ai') {
          bot.behaviors.aiChat = data.enable
        } else if (data.action === 'aiAll') {
          bot.behaviors.aiChatAll = data.enable
          bot.behaviors.aiChat = true
        } else if (data.action === 'exec') {
          bot.behaviors.execCommands = data.enable
        } else if (data.action === 'pvp') {
          if (data.enable) bot.startPvp()
          else bot.stopPvp()
        } else if (data.action === 'develop') {
          if (data.enable) bot.startDeveloping()
          else bot.stopDeveloping()
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204)
    res.end()
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Панель управления ботами: http://0.0.0.0:${PORT}`)
})

process.on('SIGINT', () => {
  console.log('Остановка всех ботов...')
  for (const name of Object.keys(bots)) {
    removeBot(name)
  }
  process.exit(0)
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message)
})
