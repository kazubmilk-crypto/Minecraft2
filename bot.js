const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const Vec3 = require('vec3')
const http = require('http')
const https = require('https')

const AI_API_KEY = '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'
const AI_MODEL = 'llama-3.3-70b-versatile'

function askAI(message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'Ты обычный игрок на майнкрафт сервере. Отвечай очень коротко на русском. 1 предложение. Без markdown. Просто текст. Не начинай ответ с имени бота.' },
        { role: 'user', content: message },
      ],
      max_tokens: 80,
      temperature: 0.7,
    })
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) {
            console.log(`[AI] Ошибка: ${json.error.message}`)
            resolve(null)
          } else {
            let content = json.choices?.[0]?.message?.content || null
            if (content) {
              content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
              content = content.replace(/\*[^*]+\*/g, '').trim()
              if (content.length > 100) content = content.substring(0, 100)
            }
            resolve(content)
          }
        } catch(e) {
          console.log(`[AI] Ошибка парсинга: ${data.substring(0, 200)}`)
          resolve(null)
        }
      })
    })
    req.on('error', (e) => {
      console.log(`[AI] Сетевая ошибка: ${e.message}`)
      resolve(null)
    })
    req.setTimeout(10000, () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}

const AI_AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'move_to',
      description: 'Идти к указанным координатам. Используй чтобы исследовать мир, добраться до ресурсов или убежать от опасности.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Координата X' },
          y: { type: 'number', description: 'Координата Y (высота)' },
          z: { type: 'number', description: 'Координата Z' },
        },
        required: ['x', 'y', 'z'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mine_block',
      description: 'Сломать блок рядом с ботом. Сначала подойди к блоку, потом ломай.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Координата X блока' },
          y: { type: 'number', description: 'Координата Y блока' },
          z: { type: 'number', description: 'Координата Z блока' },
        },
        required: ['x', 'y', 'z'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_block',
      description: 'Поставить блок на указанные координаты.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
          block: { type: 'string', description: 'Название блока ( cobblestone, oak_planks, dirt...)' },
        },
        required: ['x', 'y', 'z', 'block'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'attack',
      description: 'Атаковать ближайшего вражеского моба или игрока.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Имя моба или игрока (zombie, skeleton, spider...)' },
        },
        required: ['target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'chat',
      description: 'Написать сообщение в чат сервера.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Текст сообщения' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'equip',
      description: 'Экипировать предмет из инвентаря.',
      parameters: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Название предмета ( diamond_sword, iron_pickaxe...)' },
          slot: { type: 'string', enum: ['hand', 'off-hand', 'head', 'chest', 'legs', 'feet'], description: 'Слот экипировки' },
        },
        required: ['item', 'slot'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'eat',
      description: 'Поесть из инвентаря.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'craft',
      description: 'Скрафтить предмет через серверную команду /craft.',
      parameters: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Название предмета для крафта (iron_ingot, diamond_sword...)' },
        },
        required: ['item'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'use_command',
      description: 'Выполнить серверную команду.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Команда без слэша (rtpfar, kit dragon, spawn...)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jump',
      description: 'Прыгнуть на месте.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: 'Подождать указанное время (в секундах) перед следующим действием.',
      parameters: {
        type: 'object',
        properties: {
          seconds: { type: 'number', description: 'Количество секунд ожидания' },
        },
        required: ['seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'think',
      description: 'Сделать паузу для обдумывания следующего действия. Используй когда нужно решить что делать дальше.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_house',
      description: 'Построить простой дом 5x5 из бруса/досок с дверью, крышей и сундуками внутри. Бот автоматически подбирает материалы из инвентаря.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'smelt',
      description: 'Расплавить руду или приготовить еду в печи. Сначала ставит печь, потом запускает плавку.',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Что плавить (iron_ore, raw_beef, raw_porkchop, raw_chicken, raw_mutton, sand, cobblestone)' },
          fuel: { type: 'string', description: 'Топливо (coal, charcoal, oak_planks, cobblestone). Если не указано, берёт автоматически.' },
        },
        required: ['input'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'chop_tree',
      description: 'Найти и срубить дерево целиком (все брёвна). Автоматически подбирает лучшую секиру.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_chest',
      description: 'Поставить сундук рядом с ботом.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kill_animal',
      description: 'Найти и убить животное для еды (корову, овцу, свинью, курицу). Автоматически берёт меч.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

function askAIWithTools(messages, tools) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: AI_MODEL,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      max_tokens: 300,
      temperature: 0.3,
    })
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) {
            console.log(`[AI Agent] Ошибка: ${json.error.message}`)
            resolve(null)
          } else {
            resolve(json.choices?.[0]?.message || null)
          }
        } catch(e) {
          console.log(`[AI Agent] Парсинг: ${data.substring(0, 200)}`)
          resolve(null)
        }
      })
    })
    req.on('error', (e) => {
      console.log(`[AI Agent] Сеть: ${e.message}`)
      resolve(null)
    })
    req.setTimeout(15000, () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}

const AGENT_SYSTEM_PROMPT = `Ты — ИИ-агент в Minecraft (Java 1.16.5). Ты управляешь персонажем. ДЕЙСТВУЙ БЫСТРО И РЕШИТЕЛЬНО.

СОСТОЯНИЕ БОТА:
- HP: 20 макс. Если < 14 — ешь. Если < 8 — беги и ешь.
- Голод: 20 макс. Если < 14 — ешь.
- Ночь (tick > 12500) — прячься в доме или стой у света.

ПЛАН ДЕЙСТВИЙ (выполняй ПОСЛЕДОВАТЕЛЬНО):
1. chop_tree → chop_tree → chop_tree (3 дерева)
2. mine_block stone × 16
3. build_house (нужно 40+ дерева)
4. kill_animal → smelt raw_beef (ГОТОВЬ ЕДУ!)
5. mine_block iron_ore × 8 → smelt iron_ore
6. explore — move_to в случайном направлении 50 блоков
7. Повторяй цикл

БЫСТРЫЕ ДЕЙСТВИЯ (делай за один вызов):
- Если нет дерева: chop_tree
- Если есть дерево и нет дома: build_house
- Если есть дом: kill_animal + smelt для еды
- Если есть еда и оружие: attack ближайшего моба
- Если HP > 14 и еда есть: move_to +80 блоков в случайном направлении

ПРАВИЛА:
- ДЕЙСТВУЙ СРАЗУ, не думай долго
- КАЖДЫЕ 2 действия проверяй HP
- Если HP < 10 — СРАЗУ ешь (eat)
- НИКОГДА не стой на месте больше 3 секунд
- Всегда имей оружие в руке
- Пиши КРАТКО. 1 слово или фраза.`

class Bot {
  constructor(username, config) {
    this.username = username
    this.config = config
    this.bot = null
    this.alive = false
    this.registered = false
    this.inGame = false
    this.server = 'lobby'
    this.movements = null
    this.chatCooldown = false
    this.serverMessages = []
    this.behaviors = {
      randomMove: false,
      chatReply: false,
      lookAround: false,
      jump: false,
      gather: false,
      aiChat: false,
      aiChatAll: false,
      execCommands: false,
      pvp: false,
      developing: false,
      agent: false,
    }
    this.developPhase = null
    this.aiCooldown = false
    this.agentMessages = []
    this.agentLog = []
    this.stats = {
      messagesSent: 0,
      distanceMoved: 0,
      deaths: 0,
      rejoins: 0,
    }
    this.intervals = []
  }

  create() {
    const prevCaptchaPassed = this.captchaPassed
    const prevServerSwitching = this.serverSwitching
    this.registered = false
    this.loggedIn = false
    if (!prevServerSwitching) this.captchaPassed = false
    this.captchaCode = null
    this.inGame = false
    this.server = 'lobby'

    this.bot = mineflayer.createBot({
      host: this.config.host,
      port: this.config.port,
      username: this.username,
      version: this.config.version || '1.16.5',
      respawn: true,
    })

    this.bot.loadPlugin(pathfinder)

    this.bot.on('login', () => {
      console.log(`[${this.username}] Подключился`)
    })

    this.bot.on('spawn', () => {
      this.alive = true
      this.reconnectAttempts = 0
      this.stats.rejoins++
      console.log(`[${this.username}] Заспавнился на ${this.server}`)

      try {
        const mcData = require('minecraft-data')(this.bot.version)
        this.movements = new Movements(this.bot, mcData)
        this.movements.allowSprinting = true
        this.bot.pathfinder.setMovements(this.movements)
      } catch(e) {}
    })

    this.bot.on('windowOpen', (window) => {
      const title = window.title || ''
      console.log(`[${this.username}] GUI открыто: "${title}" slots=${window.slots?.length}`)

      if (this.captchaPassed) {
        console.log(`[${this.username}] Капча уже пройдена, закрываю окно`)
        try { this.bot.closeWindow(window) } catch(e) {}
        return
      }

      const titleLow = title.toLowerCase()
      if (titleLow.includes('капча') || titleLow.includes('captcha') || titleLow.includes('проверк')) {
        console.log(`[${this.username}] LobbyCaptcha: обнаружена капча!`)

        const trySolve = (attempt) => {
          if (this.captchaPassed) return
          const slots = window.slots
          if (!slots || slots.length === 0) {
            if (attempt < 10) {
              console.log(`[${this.username}] Слоты пусты, попытка ${attempt + 1}/10...`)
              setTimeout(() => trySolve(attempt + 1), 500)
            }
            return
          }
          this.solveCaptcha(window)
        }

        setTimeout(() => trySolve(0), 1500)
        return
      }
    })

    this.bot.on('message', (json) => {
      const msg = json.toString()
      const msgLow = msg.toLowerCase()
      console.log(`[${this.username}] MSG: "${msg}" | low: "${msgLow}"`)
      this.serverMessages.push({ time: Date.now(), text: msg })
      if (this.serverMessages.length > 100) this.serverMessages.shift()

      if (msg.includes('Bot-Filter') || msg.includes('rejoin') || msg.includes('exceeded')) {
        console.log(`[${this.username}] Bot-Filter кик`)
        this.alive = false
        this.registered = false
        this.loggedIn = false
        this.captchaPassed = false
        this.inGame = false
        this.server = 'lobby'
        this.stopBehavior()
        setTimeout(() => this.create(), 15000)
        try { this.bot.quit() } catch(e) {}
        return
      }

      if (msgLow.includes('неверн') || msgLow.includes('неправильн') || msgLow.includes('ошибк') || msgLow.includes('уже вошёл') || msgLow.includes('уже вошел')) {
        console.log(`[${this.username}] Ошибка: ${msg.substring(0, 100)}`)
        if (msgLow.includes('уже зарегистрирован') || msgLow.includes('уже зарег')) {
          this.registered = true
          const pass = this.config.password || 'zons123123'
          this.bot.chat(`/login ${pass}`)
          this.loggedIn = true
          console.log(`[${this.username}] Повторная попытка логина`)
        }
      }

      if (msgLow.includes('уже зарегистрирован') || msgLow.includes('уже зарег')) {
        if (!this.loggedIn) {
          const pass = this.config.password || 'zons123123'
          this.bot.chat(`/login ${pass}`)
          this.loggedIn = true
          console.log(`[${this.username}] Аккаунт существует, логинюсь`)
        }
        return
      }

      if (msgLow.includes('зарегистрируйтесь') || msgLow.includes('войдите') || msgLow.includes('/reg') || msgLow.includes('/login') || msgLow.includes('пароль') || msgLow.includes('введите')) {
        if (!this.registered && !this.loggedIn) {
          const pass = this.config.password || 'zons123123'
          this.bot.chat(`/reg ${pass} ${pass}`)
          this.registered = true
          console.log(`[${this.username}] Пробую зарегистрироваться`)
        } else if (this.registered && !this.loggedIn) {
          const pass = this.config.password || 'zons123123'
          this.bot.chat(`/login ${pass}`)
          this.loggedIn = true
          console.log(`[${this.username}] Залогинился`)
        }
      }

      if (msg.includes('Успешная регистрация') || msg.includes('Успешный вход') || msg.includes('Добро пожаловать') || msg.includes('Добро пожаловать на сервер')) {
        this.alive = true
        this.reconnectAttempts = 0
        console.log(`[${this.username}] В лобби`)
        if (this.captchaPassed && this.serverSwitching && this.server !== 'grief-1') {
          console.log(`[${this.username}] Реконнект после server switch → повторю /server grief-1`)
          this.serverSwitching = false
          setTimeout(() => this.joinGrief(), 2000)
        }
      }

      if (msg.includes('Вы прошли проверку') || msg.includes('Удачной игры') || msg.includes('проверку') || msg.includes('проверка') || msg.includes('Проверка') || msg.includes('PROVED') || msg.includes('Captcha passed') || msg.includes('Welcome!') || msg.includes('допущен') || msg.includes('Допущен') || msg.includes('пропущен') || msg.includes('капча пройдена')) {
        if (!this.captchaPassed) {
          this.captchaPassed = true
          console.log(`[${this.username}] Капча пройдена! Перехожу на grief-1...`)
          setTimeout(() => this.joinGrief(), 2000)
        }
      }

      const codeMatch = msg.match(/CODE:\s*(\d{4})/)
      if (codeMatch && !this.captchaPassed) {
        const code = codeMatch[1]
        console.log(`[${this.username}] Капча: ${code}, отправляю...`)
        setTimeout(() => {
          if (this.bot && this.alive) this.bot.chat(code)
        }, 500)
      }

      if (msg.includes('grief') || msg.includes('Grief') || msg.includes('Вы на сервере') || msg.includes('Вы перенесены') || msg.includes('[Ваша статистика]') || msg.includes('Удачной игры')) {
        this.alive = true
        if (this.serverSwitching) {
          this.server = 'grief-1'
          this.serverSwitching = false
          this.switchAttempts = 0
          console.log(`[${this.username}] Успешно перешёл на grief-1!`)
        }
        console.log(`[${this.username}] Сообщение сервера: ${msg.substring(0, 100)}`)
      }

      console.log(`[${this.username}] RAW MSG: "${msg}"`)

      const chatMatch = msg.match(/^(?:\[[\w]+\]\s*)?([\wА-Яа-яЁё]+)[\s>]+(.+)/)
      if (chatMatch) {
        console.log(`[${this.username}] CHAT MATCH: sender=${chatMatch[1]} text=${chatMatch[2]}`)
      }

      if (chatMatch && chatMatch[1] !== this.username && this.behaviors.aiChat && !this.aiCooldown) {
        const sender = chatMatch[1]
        const chatText = chatMatch[2].trim()
        let question
        if (this.behaviors.aiChatAll) {
          question = chatText
        } else {
          const mentionedBot = chatText.toLowerCase().includes(this.username.toLowerCase())
          if (!mentionedBot) return
          question = chatText.replace(new RegExp(this.username, 'gi'), '').trim()
        }
        console.log(`[${this.username}] AI запрос от ${sender}: ${question}`)
        this.aiCooldown = true
        setTimeout(() => { this.aiCooldown = false }, 5000)
        askAI(question).then(reply => {
          if (reply && this.bot) {
            const chatMsg = '!' + reply.substring(0, 199)
            this.bot.chat(chatMsg)
            this.stats.messagesSent++
            this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${chatMsg}` })
          } else if (!reply) {
            setTimeout(() => {
              this.aiCooldown = false
              askAI(chatText).then(reply2 => {
                if (reply2 && this.bot) {
                  const chatMsg = '!' + reply2.substring(0, 199)
                  this.bot.chat(chatMsg)
                  this.stats.messagesSent++
                  this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${chatMsg}` })
                }
              })
            }, 6000)
          }
        }).catch(err => {
          console.log(`[${this.username}] AI ошибка: ${err.message}`)
        })
      }
    })

    this.bot.on('title', (text) => {
      const msg = text.toString()
      if (msg.includes('напишите') || msg.includes('type') || msg.includes('введите')) {
        const num = msg.match(/\d+/)
        if (num) {
          this.bot.chat(num[0])
          console.log(`[${this.username}] Ответил: ${num[0]}`)
        }
      }
    })

    this.bot.on('chat', (username, message) => {
      if (username === this.username) return
      console.log(`[${this.username}] Чат от ${username}: ${message}`)

      if (this.behaviors.execCommands) {
        const msg = message.replace(/^[\wА-Яа-яЁё]+\s+/, '').trim()

        const directCmd = msg.match(/^\/(\w+)\s*(.*)/)
        if (directCmd) {
          const cmd = msg
          console.log(`[${this.username}] Выполняю команду: ${cmd}`)
          this.bot.chat(cmd)
          this.stats.messagesSent++
          this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${cmd}` })
          return
        }

        const cmdWords = ['напиши', 'напишите', 'сделай', 'сделайте', 'выполни', 'тыкни', 'отправь', 'напиши команду', 'выполни команду']
        for (const word of cmdWords) {
          if (msg.toLowerCase().startsWith(word)) {
            const rest = msg.substring(word.length).trim()
            const cmdMatch = rest.match(/^\/?(\w+)\s*(.*)/)
            if (cmdMatch) {
              const cmd = `/${cmdMatch[1]}${cmdMatch[2] ? ' ' + cmdMatch[2] : ''}`
              console.log(`[${this.username}] Выполняю команду: ${cmd}`)
              this.bot.chat(cmd)
              this.stats.messagesSent++
              this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${cmd}` })
              return
            }
          }
        }

        const anyCmd = msg.match(/(\/\w+\s*\S*)/)
        if (anyCmd) {
          const cmd = anyCmd[1].trim()
          console.log(`[${this.username}] Выполняю команду: ${cmd}`)
          this.bot.chat(cmd)
          this.stats.messagesSent++
          this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${cmd}` })
          return
        }
      }

      if (!this.behaviors.aiChat) return
      if (this.aiCooldown) return
      let question
      if (this.behaviors.aiChatAll) {
        question = message
      } else {
        const mentionedBot = message.toLowerCase().includes(this.username.toLowerCase())
        if (!mentionedBot) return
        question = message.replace(new RegExp(this.username, 'gi'), '').trim()
      }
      console.log(`[${this.username}] AI запрос: ${question}`)
      this.aiCooldown = true
      setTimeout(() => { this.aiCooldown = false }, 5000)
      askAI(question).then(reply => {
        if (reply && this.bot) {
          const chatMsg = '!' + reply.substring(0, 199)
          this.bot.chat(chatMsg)
          this.stats.messagesSent++
          this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${chatMsg}` })
        }
      }).catch(err => {
        console.log(`[${this.username}] AI ошибка: ${err.message}`)
      })
    })

    this.bot.on('kicked', (reason) => {
      console.log(`[${this.username}] Кикнут: ${reason}`)
      this.stopBehavior()
      if (this.serverSwitching) {
        console.log(`[${this.username}] Кикнут при переключении сервера → реконнект через 3с`)
        this.alive = false
        this.loggedIn = false
        this.inGame = false
        setTimeout(() => this.create(), 3000)
        return
      }
      this.alive = false
      this.registered = false
      this.loggedIn = false
      this.captchaPassed = false
      this.inGame = false
      this.server = 'lobby'
      this.reconnectAttempts = (this.reconnectAttempts || 0) + 1
      const delay = Math.min(this.reconnectAttempts * 5000, 60000)
      console.log(`[${this.username}] Реконнект через ${delay/1000}с (попытка ${this.reconnectAttempts})`)
      setTimeout(() => this.create(), delay)
    })

    this.bot.on('error', (err) => {
      console.log(`[${this.username}] Ошибка: ${err.message}`)
    })

    this.bot.on('end', (reason) => {
      console.log(`[${this.username}] Отключился: ${reason}`)
      this.stopBehavior()
      if (this.serverSwitching) {
        console.log(`[${this.username}] Отключение при переключении сервера → реконнект через 3с`)
        this.alive = false
        this.loggedIn = false
        this.inGame = false
        setTimeout(() => this.create(), 3000)
        return
      }
      this.alive = false
      this.registered = false
      this.loggedIn = false
      this.captchaPassed = false
      this.inGame = false
      this.server = 'lobby'
      this.reconnectAttempts = (this.reconnectAttempts || 0) + 1
      const delay = Math.min(this.reconnectAttempts * 5000, 60000)
      console.log(`[${this.username}] Реконнект через ${delay/1000}с (попытка ${this.reconnectAttempts})`)
      setTimeout(() => this.create(), delay)
    })
  }

  solveCaptcha(window) {
    if (!this.bot || this.captchaPassed) return
    const slots = window.slots
    const papers = []
    console.log(`[${this.username}] LobbyCaptcha: проверяю ${slots.length} слотов...`)
    for (let i = 0; i < slots.length; i++) {
      const item = slots[i]
      if (!item || !item.name) continue
      const name = item.name
      if (!name.includes('paper') && !name.includes('map')) continue

      let digit = -1

      const nameStr = item.nbt?.value?.display?.value?.Name?.value || ''
      if (typeof nameStr === 'string' && nameStr.length > 0) {
        console.log(`[${this.username}] Paper ${i}: Name = ${nameStr.substring(0, 200)}`)
        const m1 = nameStr.match(/"text"\s*:\s*"(\d)"/)
        if (m1) digit = parseInt(m1[1])
        if (digit === -1) {
          const m2 = nameStr.match(/§[0-9a-fk-or]§l(\d)/)
          if (m2) digit = parseInt(m2[1])
        }
        if (digit === -1) {
          const m3 = nameStr.match(/>(\d)</)
          if (m3) digit = parseInt(m3[1])
        }
        if (digit === -1) {
          const m4 = nameStr.match(/(\d)/)
          if (m4) digit = parseInt(m4[1])
        }
      }

      if (digit >= 0 && digit <= 9) {
        papers.push({ slot: i, digit })
        console.log(`[${this.username}] Бумага слот ${i} = ${digit}`)
      }
    }

    if (papers.length > 0) {
      papers.sort((a, b) => a.digit - b.digit)
      console.log(`[${this.username}] LobbyCaptcha: кликаю по порядку: ${papers.map(p => p.digit).join(' → ')}`)
      papers.forEach((p, idx) => {
        setTimeout(() => {
          if (this.bot && !this.captchaPassed) {
            this.bot.clickWindow(p.slot, 0, 0).catch(() => {})
            console.log(`[${this.username}] Клик: слот ${p.slot} (цифра ${p.digit})`)
          }
        }, 500 + idx * 600)
      })
      const totalClickTime = 500 + (papers.length - 1) * 600 + 1500
      setTimeout(() => {
        if (!this.captchaPassed && this.alive) {
          this.captchaPassed = true
          console.log(`[${this.username}] Капча решена (4 клика отправлены)! Перехожу на grief-1...`)
          this.joinGrief()
        }
      }, totalClickTime)
    } else {
      const allPapers = []
      for (let i = 0; i < slots.length; i++) {
        const item = slots[i]
        if (item && item.name && (item.name.includes('paper') || item.name.includes('map'))) {
          allPapers.push(i)
        }
      }
      if (allPapers.length > 0) {
        console.log(`[${this.username}] LobbyCaptcha: не могу прочитать цифры, кликаю все бумаги (${allPapers.length} шт) по порядку слотов: ${allPapers}`)
        allPapers.forEach((slot, idx) => {
          setTimeout(() => {
            if (this.bot && !this.captchaPassed) {
              this.bot.clickWindow(slot, 0, 0).catch(() => {})
              console.log(`[${this.username}] Fallback клик: слот ${slot}`)
            }
          }, 500 + idx * 600)
        })
      } else {
        console.log(`[${this.username}] LobbyCaptcha: бумага не найдена! Все слоты:`)
        for (let i = 0; i < slots.length; i++) {
          const item = slots[i]
          if (item) console.log(`  [${i}] name=${item.name}`)
        }
      }
    }
  }

  joinGrief() {
    if (!this.bot || !this.alive) return
    if (this.server === 'grief-1') return
    if (this.serverSwitching) return
    this.switchAttempts = (this.switchAttempts || 0) + 1
    if (this.switchAttempts > 5) {
      console.log(`[${this.username}] Слишком много попыток переключения (${this.switchAttempts}), остаюсь на lobby`)
      this.serverSwitching = false
      return
    }
    console.log(`[${this.username}] Перехожу на grief-1... (попытка ${this.switchAttempts})`)
    this.stopBehavior()
    this.serverSwitching = true
    this.bot.chat('/server grief-1')
    setTimeout(() => { this.serverSwitching = false }, 20000)
  }

  chat(message) {
    if (this.bot && this.alive) {
      this.bot.chat(message)
      this.stats.messagesSent++
      this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${message}` })
    }
  }

  command(cmd) {
    if (this.bot && this.alive) {
      this.bot.chat('/' + cmd)
      this.stats.messagesSent++
      this.serverMessages.push({ time: Date.now(), text: `[BOT →] /${cmd}` })
    }
  }

  say(message) {
    if (this.bot && this.alive) {
      this.bot.chat(message)
      this.stats.messagesSent++
    }
  }

  look(yaw, pitch) {
    if (this.bot && this.alive) {
      this.bot.look(yaw || Math.random() * Math.PI * 2, pitch || 0)
    }
  }

  jump() {
    if (!this.bot || !this.alive) return
    this.bot.setControlState('jump', true)
    setTimeout(() => {
      if (this.bot) this.bot.setControlState('jump', false)
    }, 500)
  }

  moveForward(duration) {
    if (!this.bot || !this.alive) return
    this.bot.setControlState('forward', true)
    setTimeout(() => {
      if (this.bot) this.bot.setControlState('forward', false)
    }, duration || 2000)
  }

  stopBehavior() {
    this.intervals.forEach(id => clearInterval(id))
    this.intervals = []
    this.behaviors.randomWalk = false
    this.behaviors.chatReply = false
    this.behaviors.developing = false
    this.behaviors.agent = false
    this.developPhase = null
    if (this.bot) {
      try { this.bot.pathfinder.setGoal(null) } catch(e) {}
    }
  }

  startRandomWalk() {
    if (!this.bot || !this.alive) return
    this.behaviors.randomWalk = true

    const WALK_STATES = {
      IDLE: 'IDLE',
      WALKING: 'WALKING',
      SPRINTING: 'SPRINTING',
      SPRINT_JUMP: 'SPRINT_JUMP',
      SNEAKING: 'SNEAKING',
      LOOKING: 'LOOKING',
      BACKING_UP: 'BACKING_UP',
    }

    let state = WALK_STATES.IDLE
    let stateEnd = 0
    let moveYaw = 0
    let stuckCount = 0
    let lastPos = null
    let lastStateChange = 0
    let sprintJumpChain = 0
    let headYawOffset = 0
    let headPitchOffset = 0
    let headTargetYaw = null
    let headTargetPitch = 0
    let headTargetTime = 0
    let microTick = 0
    let pauseChance = 0

    const rand = (min, max) => min + Math.random() * (max - min)
    const randInt = (min, max) => Math.floor(rand(min, max + 1))

    const stopAll = () => {
      if (!this.bot) return
      for (const c of ['forward','back','left','right','sprint','jump','sneak']) {
        this.bot.setControlState(c, false)
      }
    }

    const isOnGround = () => {
      try { return this.bot.entity.onGround } catch(e) { return true }
    }

    const hasBlockAhead = (yaw, dist) => {
      if (!this.bot) return false
      const pos = this.bot.entity.position
      const dx = -Math.sin(yaw) * dist
      const dz = -Math.cos(yaw) * dist
      const checkPos = new Vec3(Math.floor(pos.x + dx), Math.floor(pos.y), Math.floor(pos.z + dz))
      const block = this.bot.blockAt(checkPos)
      return block && block.name !== 'air' && block.name !== 'cave_air'
    }

    const hasDropAhead = (yaw, dist) => {
      if (!this.bot) return false
      const pos = this.bot.entity.position
      const dx = -Math.sin(yaw) * dist
      const dz = -Math.cos(yaw) * dist
      const footX = Math.floor(pos.x + dx)
      const footZ = Math.floor(pos.z + dz)
      const blockBelow = this.bot.blockAt(new Vec3(footX, Math.floor(pos.y) - 1, footZ))
      return !blockBelow || blockBelow.name === 'air' || blockBelow.name === 'cave_air'
    }

    const isWaterAhead = (yaw) => {
      if (!this.bot) return false
      const pos = this.bot.entity.position
      const dx = -Math.sin(yaw) * 2
      const dz = -Math.cos(yaw) * 2
      const block = this.bot.blockAt(new Vec3(Math.floor(pos.x + dx), Math.floor(pos.y), Math.floor(pos.z + dz)))
      return block && (block.name === 'water' || block.name === 'lava')
    }

    const headJitter = () => {
      if (!this.bot || !this.alive) return
      headYawOffset += (Math.random() - 0.5) * 0.12
      headPitchOffset += (Math.random() - 0.5) * 0.06
      headYawOffset *= 0.88
      headPitchOffset *= 0.88
    }

    const lookAtPlayer = (player) => {
      if (!this.bot || !player || !player.entity) return
      const dir = player.entity.position.plus(new Vec3(0, 1.6, 0)).minus(this.bot.entity.position)
      const yaw = Math.atan2(-dir.x, -dir.z)
      const pitch = Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z))
      headTargetYaw = yaw
      headTargetPitch = pitch
      headTargetTime = Date.now() + 800 + Math.random() * 1200
      headYawOffset = 0
      headPitchOffset = 0
    }

    const lookAtNearestPlayerBriefly = () => {
      const players = Object.values(this.bot.players)
        .filter(p => p.username !== this.username && p.entity && p.entity.position)
      if (!players.length) return
      const sorted = players.sort((a, b) =>
        a.entity.position.distanceTo(this.bot.entity.position) -
        b.entity.position.distanceTo(this.bot.entity.position)
      )
      const nearest = sorted[0]
      if (nearest.entity.position.distanceTo(this.bot.entity.position) < 12) {
        lookAtPlayer(nearest)
      }
    }

    const pickNewYaw = (avoidWater) => {
      let yaw = Math.random() * Math.PI * 2
      let attempts = 0
      while (avoidWater && attempts < 8 && isWaterAhead(yaw)) {
        yaw = Math.random() * Math.PI * 2
        attempts++
      }
      return yaw
    }

    const changeState = (newState, duration) => {
      if (state === newState && Date.now() < stateEnd) return
      stopAll()
      state = newState
      stateEnd = Date.now() + duration
      lastStateChange = Date.now()
    }

    const tickHead = () => {
      if (!this.bot || !this.alive) return
      const now = Date.now()
      const baseYaw = moveYaw || this.bot.entity.yaw || 0

      if (headTargetYaw !== null && now < headTargetTime) {
        const progress = Math.min(1, (now - (headTargetTime - 1000)) / 1000)
        const targetYaw = headTargetYaw + headYawOffset
        const targetPitch = headTargetPitch * progress + headPitchOffset
        try { this.bot.look(targetYaw, targetPitch) } catch(e) {}
        return
      } else {
        headTargetYaw = null
      }

      headJitter()
      try { this.bot.look(baseYaw + headYawOffset, headPitchOffset) } catch(e) {}
    }

    const tick = () => {
      if (!this.behaviors.randomWalk || !this.bot || !this.alive) return
      const now = Date.now()
      microTick++

      if (microTick % 2 === 0) tickHead()

      const pos = this.bot.entity.position
      if (lastPos && pos.distanceTo(lastPos) < 0.1) {
        stuckCount++
      } else {
        stuckCount = 0
      }
      lastPos = pos.clone()

      if (stuckCount >= 5) {
        stopAll()
        for (let i = 0; i < randInt(2, 4); i++) {
          setTimeout(() => {
            if (!this.bot) return
            this.bot.setControlState('jump', true)
            setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false) }, 200)
          }, i * 250)
        }
        moveYaw = Math.random() * Math.PI * 2
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        stuckCount = 0
        changeState(WALK_STATES.WALKING, rand(1500, 3000))
        return
      }

      if (now < stateEnd) {
        if (state === WALK_STATES.SPRINT_JUMP && isOnGround() && now < stateEnd) {
          if (sprintJumpChain < randInt(2, 5)) {
            this.bot.setControlState('sprint', true)
            this.bot.setControlState('forward', true)
            this.bot.setControlState('jump', true)
            setTimeout(() => {
              if (this.bot) this.bot.setControlState('jump', false)
            }, rand(180, 280))
            sprintJumpChain++
          } else {
            sprintJumpChain = 0
            changeState(WALK_STATES.WALKING, rand(2000, 4000))
          }
        }
        if (state === WALK_STATES.WALKING || state === WALK_STATES.SPRINTING) {
          if (microTick % 6 === 0 && Math.random() > 0.6) {
            lookAtNearestPlayerBriefly()
          }
        }
        if (state === WALK_STATES.IDLE) {
          if (microTick % 4 === 0) {
            headYawOffset += (Math.random() - 0.5) * 0.2
            headPitchOffset += (Math.random() - 0.5) * 0.1
            headYawOffset *= 0.85
            headPitchOffset *= 0.85
          }
          if (Math.random() > 0.92) {
            lookAtNearestPlayerBriefly()
          }
        }
        return
      }

      const blockAhead = hasBlockAhead(moveYaw, 1.5)
      const dropAhead = hasDropAhead(moveYaw, 1.5)
      const waterAhead = isWaterAhead(moveYaw)

      if (blockAhead && (state === WALK_STATES.WALKING || state === WALK_STATES.SPRINTING || state === WALK_STATES.SPRINT_JUMP)) {
        stopAll()
        if (dropAhead) {
          this.bot.setControlState('jump', true)
          setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false) }, 300)
        }
        moveYaw += (Math.random() > 0.5 ? 1 : -1) * rand(0.5, 1.5)
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        changeState(WALK_STATES.WALKING, rand(800, 1500))
        return
      }

      if (dropAhead && state !== WALK_STATES.SNEAKING && Math.random() > 0.5) {
        stopAll()
        moveYaw += Math.PI + rand(-0.3, 0.3)
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        changeState(WALK_STATES.SNEAKING, rand(1000, 2000))
        return
      }

      const timeInState = now - lastStateChange
      let roll = Math.random()

      if (roll < 0.08) {
        changeState(WALK_STATES.IDLE, rand(2000, 7000))
        const idleRoll = Math.random()
        if (idleRoll < 0.3) {
          lookAtNearestPlayerBriefly()
        } else if (idleRoll < 0.5) {
          headTargetYaw = Math.random() * Math.PI * 2
          headTargetPitch = rand(-0.3, 0.5)
          headTargetTime = now + rand(1000, 3000)
        } else {
          headYawOffset = rand(-0.8, 0.8)
          headPitchOffset = rand(-0.2, 0.4)
        }
        return
      }

      if (roll < 0.14) {
        changeState(WALK_STATES.BACKING_UP, rand(600, 1200))
        moveYaw += Math.PI + rand(-0.2, 0.2)
        this.bot.look(moveYaw, 0)
        this.bot.setControlState('back', true)
        this.bot.setControlState('sneak', Math.random() > 0.6)
        return
      }

      if (roll < 0.22) {
        changeState(WALK_STATES.SNEAKING, rand(1500, 4000))
        moveYaw = pickNewYaw(true)
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sneak', true)
        if (Math.random() > 0.7) {
          this.bot.setControlState('left', Math.random() > 0.5)
          this.bot.setControlState('right', !this.bot.getControlState('left'))
        }
        return
      }

      if (roll < 0.35) {
        changeState(WALK_STATES.SPRINT_JUMP, rand(1500, 4000))
        moveYaw = pickNewYaw(true)
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        sprintJumpChain = 0
        this.bot.setControlState('sprint', true)
        this.bot.setControlState('forward', true)
        return
      }

      if (roll < 0.55) {
        changeState(WALK_STATES.SPRINTING, rand(2000, 5000))
        moveYaw = pickNewYaw(true)
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
        if (Math.random() > 0.6) {
          this.bot.setControlState('jump', true)
          setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false) }, rand(180, 250))
        }
        return
      }

      if (roll < 0.70) {
        changeState(WALK_STATES.WALKING, rand(2000, 6000))
        moveYaw = pickNewYaw(true)
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', false)
        if (Math.random() > 0.75) {
          this.bot.setControlState('left', Math.random() > 0.5)
          setTimeout(() => {
            if (this.bot) {
              this.bot.setControlState('left', false)
              this.bot.setControlState('right', false)
            }
          }, rand(400, 1000))
        }
        return
      }

      if (roll < 0.80) {
        changeState(WALK_STATES.WALKING, rand(1500, 3000))
        moveYaw = pickNewYaw(true)
        this.bot.look(moveYaw, 0)
        headYawOffset = 0
        headPitchOffset = 0
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', false)
        this.bot.setControlState('jump', true)
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('jump', false)
          setTimeout(() => {
            if (!this.bot) return
            this.bot.setControlState('jump', true)
            setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false) }, 200)
          }, rand(300, 500))
        }, 250)
        return
      }

      changeState(WALK_STATES.IDLE, rand(3000, 8000))
      lookAtNearestPlayerBriefly()
    }

    tick()
    const id = setInterval(tick, 150)
    this.intervals.push(id)
  }

  stopRandomWalk() {
    this.behaviors.randomWalk = false
    if (this.bot) {
      this.bot.setControlState('forward', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('jump', false)
    }
  }

  startRandomChat() {
    if (!this.bot || !this.alive) return
    this.behaviors.chatReply = true
    const chat = () => {
      if (!this.behaviors.chatReply || !this.bot || !this.alive) return
      if (this.behaviors.aiChat) return
      const questions = [
        'как дела у всех?', 'чем занимаетесь?', 'что строите?',
        'кто хочет вместе поиграть?', 'какой у вас любимый блок?',
        'вы тут часто играете?', 'есть кто живой?', 'что делаете?',
        'как проходит день?', 'кто в каком биоме был?', 'что нашли сегодня?',
        'какой ресурс ищете?', 'вы за какую сторону?', 'строите дома?',
        'кто с кем в команде?', 'какой скин у вас?', 'нравится сервер?',
        'кто хочет в клан?', 'что нового построили?', 'какой план на сегодня?',
      ]
      const q = questions[Math.floor(Math.random() * questions.length)]
      const msg = '!' + q
      this.bot.chat(msg)
      this.stats.messagesSent++
      this.serverMessages.push({ time: Date.now(), text: `[BOT →] ${msg}` })
    }
    chat()
    const id = setInterval(chat, 30000)
    this.intervals.push(id)
  }

  stopRandomChat() {
    this.behaviors.chatReply = false
  }

  startPvp() {
    if (!this.bot || !this.alive) return
    this.behaviors.pvp = true
    let eating = false
    let canAttack = true

    const stopAll = () => {
      if (!this.bot) return
      this.bot.setControlState('forward', false)
      this.bot.setControlState('back', false)
      this.bot.setControlState('left', false)
      this.bot.setControlState('right', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('jump', false)
    }

    const getNearest = () => {
      if (!this.bot) return null
      const players = Object.values(this.bot.players)
        .filter(p => p.username !== this.username && p.entity && p.entity.position)
      if (!players.length) return null
      return players.sort((a, b) => {
        return a.entity.position.distanceTo(this.bot.entity.position) -
               b.entity.position.distanceTo(this.bot.entity.position)
      })[0]
    }

    let equippingTotem = false
    let strafeDir = 0
    let strafeTimer = 0

    const closeWindow = () => {
      try {
        const winId = this.bot.inventory.window ? this.bot.inventory.window.id : 0
        if (winId !== 0) this.bot._client.write('close_window', { windowId: winId })
      } catch (e) {}
    }

    const equipTotem = async () => {
      if (!this.bot || eating || equippingTotem) return
      if (this.bot.health > 10) return
      const inOffhand = this.bot.inventory.slots[45]
      if (inOffhand && inOffhand.name === 'totem_of_undying') return
      const totemItem = this.bot.inventory.items().find(i => i.name === 'totem_of_undying')
      if (!totemItem) return
      equippingTotem = true
      try {
        closeWindow()
        await new Promise(r => setTimeout(r, 100))
        await this.bot.equip(totemItem, 'off-hand')
        console.log(`[${this.username}] Тотем в левую руку!`)
      } catch (e) {
        console.log(`[${this.username}] Тотем ошибка: ${e.message}`)
      }
      equippingTotem = false
    }

    const eatGoldenApple = async () => {
      if (!this.bot || eating) return
      if (this.bot.health > 12) return
      const gapple = this.bot.inventory.items().find(i => i.name === 'golden_apple' || i.name === 'enchanted_golden_apple')
      if (!gapple) return
      const sword = this.bot.inventory.items().find(i => i.name.includes('sword'))
      eating = true
      stopAll()
      try {
        closeWindow()
        await new Promise(r => setTimeout(r, 100))
        const hotbarIdx = this.bot.inventory.slots.indexOf(gapple)
        if (hotbarIdx >= 36 && hotbarIdx <= 44) {
          this.bot.setQuickBarSlot(hotbarIdx - 36)
        } else {
          await this.bot.equip(gapple, 'hand')
        }
        console.log(`[${this.username}] Ем золотое яблоко...`)
        this.bot.activateItem()
        await this.bot.consume()
        console.log(`[${this.username}] Съел!`)
        await new Promise(r => setTimeout(r, 1000))
      } catch (e) {
        console.log(`[${this.username}] Ошибка еды: ${e.message}`)
      }
      try {
        if (sword) {
          const swordIdx = this.bot.inventory.slots.indexOf(sword)
          if (swordIdx >= 36 && swordIdx <= 44) {
            this.bot.setQuickBarSlot(swordIdx - 36)
          } else {
            await this.bot.equip(sword, 'hand')
          }
          console.log(`[${this.username}] Меч обратно`)
        }
      } catch (e) {}
      eating = false
    }

    const jumpAndAttack = (entity) => {
      if (eating || !canAttack || !this.bot || !this.behaviors.pvp) return
      canAttack = false

      this.bot.setControlState('jump', true)
      setTimeout(() => {
        if (!this.bot) { canAttack = true; return }
        this.bot.setControlState('jump', false)
        setTimeout(() => {
          if (!this.bot || !this.behaviors.pvp) { canAttack = true; return }
          this.bot.attack(entity)
          setTimeout(() => { canAttack = true }, 500)
        }, 200)
      }, 200)
    }

    const tick = () => {
      if (!this.behaviors.pvp || !this.bot || !this.alive) return
      if (eating) {
        stopAll()
        return
      }

      equipTotem()
      eatGoldenApple()
      if (eating) {
        stopAll()
        return
      }

      const nearest = getNearest()
      if (!nearest) { stopAll(); return }

      const dist = nearest.entity.position.distanceTo(this.bot.entity.position)
      const dir = nearest.entity.position.minus(this.bot.entity.position)
      const yaw = Math.atan2(-dir.x, -dir.z)
      this.bot.look(yaw, 0)

      const now = Date.now()
      if (now > strafeTimer) {
        const r = Math.random()
        if (r < 0.33) strafeDir = -1
        else if (r < 0.66) strafeDir = 1
        else strafeDir = 0
        strafeTimer = now + 400 + Math.random() * 600
      }

      this.bot.setControlState('left', strafeDir === -1)
      this.bot.setControlState('right', strafeDir === 1)

      if (dist <= 4) {
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', dist > 2)
        jumpAndAttack(nearest.entity)
      } else if (dist <= 6) {
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
      } else {
        this.bot.setControlState('forward', true)
        this.bot.setControlState('sprint', true)
      }
    }

    tick()
    const id = setInterval(tick, 200)
    this.intervals.push(id)
  }

  stopPvp() {
    this.behaviors.pvp = false
    if (this.bot) {
      this.bot.setControlState('forward', false)
      this.bot.setControlState('back', false)
      this.bot.setControlState('left', false)
      this.bot.setControlState('right', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('jump', false)
    }
  }

  startDeveloping() {
    if (!this.bot || !this.alive) return
    this.behaviors.developing = true
    this.developPhase = 'init'
    this.developLog = []
    this.developStats = { mined: 0, built: 0, killed: 0 }
    const wait = (ms) => new Promise(r => setTimeout(r, ms))
    const log = (m) => { const e = `[${new Date().toLocaleTimeString()}] ${m}`; this.developLog.push(e); if (this.developLog.length > 50) this.developLog.shift(); console.log(`[${this.username}] ${m}`) }
    const count = (...n) => { if (n.length === 1) return this.bot.inventory.items().filter(i => i.name === n[0]).reduce((s, i) => s + i.count, 0); return n.reduce((a, name) => a + this.bot.inventory.items().filter(i => i.name === name).reduce((s, i) => s + i.count, 0), 0) }
    const has = (n, c) => count(n) >= (c || 1)
    const hp = () => this.bot.health || 20
    const food = () => this.bot.food || 20
    const hungry = () => food() < 14
    const hurt = () => hp() < 14
    const danger = () => hp() < 8
    const night = () => { try { const t = this.bot.time.timeOfDay; return t > 12500 && t < 23000 } catch(e) { return false } }
    const goto = async (x, y, z) => { try { const { goals } = require('mineflayer-pathfinder'); await this.bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1.5)); return true } catch(e) { log(`Pathfinder: ${e.message}`); return false } }
    const nearest = (names, d) => { const b = this.bot.findBlocks({ matching: (b) => b && names.includes(b.name), maxDistance: d || 24, count: 8 }); return b.length ? b.sort((a, b) => a.distanceTo(this.bot.entity.position) - b.distanceTo(this.bot.entity.position))[0] : null }
    const walk = async (dur) => {
      const start = Date.now()
      let yaw = Math.random() * Math.PI * 2
      let headYawOff = 0
      let headPitchOff = 0
      this.bot.look(yaw, 0)
      this.bot.setControlState('forward', true)
      const sprint = Math.random() > 0.35
      this.bot.setControlState('sprint', sprint)
      let jumpTimer = 0
      let strafeTimer = 0
      let dirChangeTimer = 0
      let lastPos = null
      let stuckCount = 0

      while (Date.now() - start < dur && this.behaviors.developing) {
        await wait(150)
        const now = Date.now()

        headYawOff += (Math.random() - 0.5) * 0.12
        headPitchOff += (Math.random() - 0.5) * 0.06
        headYawOff *= 0.88
        headPitchOff *= 0.88
        try { this.bot.look(yaw + headYawOff, headPitchOff) } catch(e) {}

        const pos = this.bot.entity.position
        if (lastPos && pos.distanceTo(lastPos) < 0.1) {
          stuckCount++
          if (stuckCount >= 4) {
            this.bot.setControlState('jump', true)
            await wait(200)
            this.bot.setControlState('jump', false)
            await wait(150)
            this.bot.setControlState('jump', true)
            await wait(200)
            this.bot.setControlState('jump', false)
            yaw = Math.random() * Math.PI * 2
            this.bot.look(yaw, 0)
            headYawOff = 0
            headPitchOff = 0
            stuckCount = 0
            await wait(500)
          }
        } else {
          stuckCount = 0
        }
        lastPos = pos.clone()

        const blockCheck = this.bot.blockAt(new Vec3(
          Math.floor(pos.x - Math.sin(yaw) * 1.5),
          Math.floor(pos.y),
          Math.floor(pos.z - Math.cos(yaw) * 1.5)
        ))
        if (blockCheck && blockCheck.name !== 'air' && blockCheck.name !== 'cave_air') {
          this.bot.setControlState('jump', true)
          await wait(250)
          this.bot.setControlState('jump', false)
          yaw += (Math.random() > 0.5 ? 1 : -1) * rand(0.4, 1.2)
          this.bot.look(yaw, 0)
          headYawOff = 0
          headPitchOff = 0
        }

        if (now > dirChangeTimer) {
          yaw += rand(-0.5, 0.5)
          this.bot.look(yaw, 0)
          headYawOff = 0
          headPitchOff = 0
          dirChangeTimer = now + rand(1500, 4000)
        }

        if (now > jumpTimer && Math.random() > 0.65) {
          this.bot.setControlState('jump', true)
          await wait(200)
          this.bot.setControlState('jump', false)
          jumpTimer = now + rand(600, 1800)
        }

        if (now > strafeTimer && Math.random() > 0.75) {
          const dir = Math.random() > 0.5 ? 'left' : 'right'
          this.bot.setControlState(dir, true)
          await wait(rand(250, 600))
          this.bot.setControlState(dir, false)
          strafeTimer = now + rand(800, 2000)
        }
      }
      this.bot.setControlState('forward', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('left', false)
      this.bot.setControlState('right', false)
      this.bot.setControlState('jump', false)
    }

    const TOOLS = { axe: ['netherite_axe','diamond_axe','iron_axe','stone_axe','wooden_axe'], pickaxe: ['netherite_pickaxe','diamond_pickaxe','iron_pickaxe','stone_pickaxe','wooden_pickaxe'], shovel: ['netherite_shovel','diamond_shovel','iron_shovel','stone_shovel','wooden_shovel'], sword: ['netherite_sword','diamond_sword','iron_sword','stone_sword','wooden_sword'] }
    const BLOCK_TOOL = { oak_log:'axe',spruce_log:'axe',birch_log:'axe',jungle_log:'axe',dark_oak_log:'axe',acacia_log:'axe',stone:'pickaxe',andesite:'pickaxe',diorite:'pickaxe',granite:'pickaxe',iron_ore:'pickaxe',gold_ore:'pickaxe',diamond_ore:'pickaxe',coal_ore:'pickaxe',lapis_ore:'pickaxe',redstone_ore:'pickaxe',emerald_ore:'pickaxe',obsidian:'pickaxe',deepslate:'pickaxe',cobblestone:'pickaxe',dirt:'shovel',grass_block:'shovel',gravel:'shovel',sand:'shovel',red_sand:'shovel' }

    const equipTool = async (type) => {
      const tools = this.bot.inventory.items().filter(i => TOOLS[type] && TOOLS[type].includes(i.name))
      if (!tools.length) {
        const fallback = type === 'axe' ? 'pickaxe' : type === 'shovel' ? 'pickaxe' : null
        if (fallback) {
          const fbTools = this.bot.inventory.items().filter(i => TOOLS[fallback] && TOOLS[fallback].includes(i.name))
          if (fbTools.length) {
            const best = fbTools.sort((a, b) => TOOLS[fallback].indexOf(a.name) - TOOLS[fallback].indexOf(b.name))[0]
            try { await this.bot.equip(best, 'hand'); return true } catch(e) { return false }
          }
        }
        return false
      }
      const best = tools.sort((a, b) => TOOLS[type].indexOf(a.name) - TOOLS[type].indexOf(b.name))[0]
      try { if (this.bot.heldItem && this.bot.heldItem.name === best.name) return true; await this.bot.equip(best, 'hand'); return true } catch(e) { return false }
    }

    const equipArmor = async () => {
      const tier = ['netherite','diamond','iron','gold','chainmail','leather']
      const map = { head:'helmet', chest:'chestplate', legs:'leggings', feet:'boots' }
      const slots = { head:5, chest:6, legs:7, feet:8 }
      for (const [pos, item] of Object.entries(map)) {
        let best = null, bestT = -1
        for (const it of this.bot.inventory.items()) {
          if (!it.name.includes(item)) continue
          for (let i = 0; i < tier.length; i++) { if (it.name.includes(tier[i]) && i > bestT) { bestT = i; best = it } }
        }
        if (best) try { const cur = this.bot.inventory.slots[slots[pos]]; if (!cur || cur.name !== best.name) { await this.bot.equip(best, pos); log(`Экипировал ${best.name}`) } } catch(e) {}
      }
      const sw = this.bot.inventory.items().filter(i => i.name.includes('sword')).sort((a, b) => { const t = {netherite_sword:6,diamond_sword:5,iron_sword:4,stone_sword:3,golden_sword:2,wooden_sword:1}; return (t[b.name]||0)-(t[a.name]||0) })[0]
      if (sw) try { await this.bot.equip(sw, 'hand') } catch(e) {}
    }

    const autoEat = async () => {
      if (!hungry()) return false
      const foods = ['golden_apple','enchanted_golden_apple','cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','bread','baked_potato','golden_carrot','apple','carrot']
      const f = this.bot.inventory.items().find(i => foods.includes(i.name))
      if (!f) { log('Нет еды!'); return false }
      try { await this.bot.equip(f, 'hand'); this.bot.activateItem(); await this.bot.consume(); log(`Съел ${f.name} [HP:${Math.round(hp())} F:${Math.round(food())}]`); await wait(500); return true } catch(e) { return false }
    }

    const digSmart = async (pos) => {
      try {
        const block = this.bot.blockAt(pos)
        if (!block || block.name === 'air' || block.name === 'cave_air') return false

        const tool = BLOCK_TOOL[block.name] || 'pickaxe'
        await equipTool(tool)

        const botPos = this.bot.entity.position
        const dist = botPos.distanceTo(pos)

        if (dist > 4) {
          await goto(pos.x, pos.y, pos.z)
          await wait(300)
        }

        const distAfter = this.bot.entity.position.distanceTo(pos)
        if (distAfter > 5) {
          log(`Не могу подойти к ${block.name}`)
          return false
        }

        const blockNow = this.bot.blockAt(pos)
        if (!blockNow || blockNow.name === 'air') return false

        const myFeet = this.bot.entity.position
        const blockBelowMe = this.bot.blockAt(new Vec3(Math.floor(myFeet.x), Math.floor(myFeet.y) - 1, Math.floor(myFeet.z)))
        const isAtMyFeet = Math.abs(pos.x - Math.floor(myFeet.x)) <= 1 && Math.abs(pos.z - Math.floor(myFeet.z)) <= 1 && pos.y <= Math.floor(myFeet.y)

        if (isAtMyFeet) {
          this.bot.setControlState('jump', true)
          await wait(200)
          this.bot.setControlState('jump', false)
          await wait(200)
        }

        log(`Копаю ${block.name}...`)
        const before = count(
          block.name === 'stone' ? 'cobblestone' :
          block.name === 'deepslate' ? 'cobbled_deepslate' :
          block.name === 'grass_block' ? 'dirt' :
          block.name
        )

        await this.bot.dig(blockNow)
        await wait(400)

        const after = count(
          block.name === 'stone' ? 'cobblestone' :
          block.name === 'deepslate' ? 'cobbled_deepslate' :
          block.name === 'grass_block' ? 'dirt' :
          block.name
        )
        const gone = !this.bot.blockAt(pos) || this.bot.blockAt(pos).name === 'air'

        if (after > before || gone) {
          this.developStats.mined++
          const myNewPos = this.bot.entity.position
          const floorY = Math.floor(myNewPos.y)
          const above = this.bot.blockAt(new Vec3(Math.floor(myNewPos.x), floorY + 1, Math.floor(myNewPos.z)))
          if (above && above.name === 'air') {
            this.bot.setControlState('jump', true)
            await wait(300)
            this.bot.setControlState('jump', false)
          }
          return true
        }

        log(`${block.name} не добыт, повтор...`)
        try { await this.bot.dig(this.bot.blockAt(pos) || block) } catch(e) {}
        await wait(500)
        return true
      } catch(e) {
        log(`Ошибка добычи: ${e.message}`)
        this.bot.setControlState('jump', true)
        await wait(400)
        this.bot.setControlState('jump', false)
        await wait(500)
        return false
      }
    }

    const digMultiple = async (names, target, maxDist, label) => {
      let got = 0, fails = 0, startC = count(...names)
      let lastPos = null, stuckCount = 0
      while (this.behaviors.developing && got < target) {
        if (danger()) { log(`Опасно HP:${Math.round(hp())}!`); await autoEat(); await autoEat(); await autoEat(); await walk(4000); continue }
        if (hungry()) await autoEat()

        const curPos = this.bot.entity.position
        if (lastPos && curPos.distanceTo(lastPos) < 0.2) {
          stuckCount++
          if (stuckCount >= 3) {
            log(`Застрял (${stuckCount} раз)! Выбираюсь...`)
            for (let j = 0; j < 3; j++) {
              this.bot.setControlState('jump', true)
              await wait(350)
              this.bot.setControlState('jump', false)
              await wait(150)
            }
            const escapeYaw = Math.random() * Math.PI * 2
            this.bot.look(escapeYaw, 0)
            this.bot.setControlState('forward', true)
            this.bot.setControlState('sprint', true)
            await wait(2000)
            this.bot.setControlState('forward', false)
            this.bot.setControlState('sprint', false)
            stuckCount = 0
            try { this.bot.pathfinder.setGoal(null) } catch(e) {}
            await wait(500)
            continue
          }
        } else {
          stuckCount = 0
        }
        lastPos = curPos.clone()

        const hostile = ['zombie','skeleton','spider','creeper','witch','phantom','cave_spider','drowned','husk','stray','blaze']
        const nearHostile = Object.values(this.bot.entities || {}).find(e => e && e.position && e.username !== this.username && e.position.distanceTo(curPos) < 6 && hostile.some(h => (e.name||'').toLowerCase().includes(h)))
        if (nearHostile) {
          log(`Атака: ${nearHostile.name}!`)
          await equipTool('sword')
          try {
            for (let i = 0; i < 8; i++) {
              if (!this.behaviors.developing || !nearHostile || !nearHostile.position) break
              this.bot.attack(nearHostile)
              await wait(300)
              if (i % 2 === 0) { this.bot.setControlState('jump', true); setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false) }, 200) }
            }
          } catch(e) {}
          continue
        }

        const p = nearest(names, maxDist || 24)
        if (!p) {
          fails++
          if (fails > 3) {
            log(`${label}: блоков нет, иду искать...`)
            await walk(3000 + Math.random() * 2000)
            fails = 0
            continue
          }
          await walk(2000)
          continue
        }
        if (await digSmart(p)) { got++; fails = 0 } else { fails++ }
        if (fails >= 10) { log(`${label}: слишком много ошибок, пропускаю`); break }
        await wait(100)
      }
      const total = count(...names), gained = total - startC
      log(`${label}: +${gained} (всего: ${total})`)
      return gained
    }

    const placeSmart = async (x, y, z, name) => {
      try {
        const t = this.bot.blockAt(new Vec3(x, y, z))
        if (t && t.name !== 'air' && t.name !== 'cave_air') return false
        const checks = [{p:new Vec3(x,y-1,z),f:new Vec3(0,1,0)},{p:new Vec3(x+1,y,z),f:new Vec3(-1,0,0)},{p:new Vec3(x-1,y,z),f:new Vec3(1,0,0)},{p:new Vec3(x,y,z+1),f:new Vec3(0,0,-1)},{p:new Vec3(x,y,z-1),f:new Vec3(0,0,1)}]
        let ref = null, face = null
        for (const c of checks) { const b = this.bot.blockAt(c.p); if (b && b.name !== 'air' && b.name !== 'cave_air') { ref = b; face = c.f; break } }
        if (!ref) return false
        const item = this.bot.inventory.items().find(i => i.name === name)
        if (!item) return false
        await this.bot.equip(item, 'hand')
        await this.bot.placeBlock(ref, face)
        await wait(150)
        const placed = this.bot.blockAt(new Vec3(x, y, z))
        if (placed && placed.name === name) { this.developStats.built++; return true }
        return false
      } catch(e) { return false }
    }

    const fightMobs = async (range) => {
      const hostile = ['zombie','skeleton','spider','creeper','witch','phantom','cave_spider','drowned','husk','stray','blaze','wither_skeleton']
      const r = range || 8
      const mobs = Object.values(this.bot.entities || {}).filter(e => e && e.position && e.username !== this.username && e.position.distanceTo(this.bot.entity.position) < r && hostile.some(h => (e.name||'').toLowerCase().includes(h)))
      if (!mobs.length) return false
      const mob = mobs.sort((a, b) => a.position.distanceTo(this.bot.entity.position) - b.position.distanceTo(this.bot.entity.position))[0]
      log(`Атака: ${mob.name}!`)
      await equipTool('sword')
      try {
        await this.bot.pathfinder.goto(new (require('mineflayer-pathfinder').goals).GoalNear(mob.position.x, mob.position.y, mob.position.z, 2))
        for (let i = 0; i < 10; i++) {
          if (!this.behaviors.developing || !mob || !mob.position) break
          this.bot.attack(mob)
          await wait(300)
          if (i % 2 === 0) {
            this.bot.setControlState('jump', true)
            setTimeout(() => { if (this.bot) this.bot.setControlState('jump', false) }, 200)
          }
        }
        this.developStats.killed++
        log(`${mob.name} убит!`)
      } catch(e) {}
      return true
    }

    const checkHostiles = async () => {
      const hostile = ['zombie','skeleton','spider','creeper','witch','phantom','cave_spider','drowned','husk','stray','blaze']
      const near = Object.values(this.bot.entities || {}).filter(e => e && e.position && e.username !== this.username && e.position.distanceTo(this.bot.entity.position) < 10 && hostile.some(h => (e.name||'').toLowerCase().includes(h)))
      if (near.length === 0) return false
      log(`Обнаружено ${near.length} врагов рядом!`)
      await fightMobs(12)
      return true
    }

    const avoidDanger = async () => {
      if (danger()) { log(`КРИТИКА HP:${Math.round(hp())}!`); await autoEat(); await autoEat(); await autoEat(); await walk(6000); return true }
      if (hurt()) { log(`Мало HP:${Math.round(hp())}, ем...`); await autoEat(); await autoEat() }
      return false
    }

    const run = async () => {
      try {
        if (this.server !== 'grief-1') { log('На grief-1...'); this.bot.chat('/server grief-1'); await wait(5000) }
        this.developPhase = 'TP'
        log('Телепорт...')
        const old = this.bot.entity.position.clone()
        this.bot.chat('/rtpfar')
        let ok = false
        for (let i = 0; i < 25; i++) { await wait(1000); if (this.bot.entity.position.distanceTo(old) > 10) { ok = true; break } }
        if (!ok) { log('Повтор ТП...'); this.bot.chat('/rtpfar'); await wait(12000); ok = this.bot.entity.position.distanceTo(old) > 10 }
        if (!ok) { log('ТП не сработал!'); this.behaviors.developing = false; return }

        this.developPhase = 'KIT'
        log('Киты...')
        this.bot.chat('/kit dragon'); await wait(3000)
        this.bot.chat('/kit pegas'); await wait(3000)
        await equipArmor()

        for (let cycle = 0; cycle < 5; cycle++) {
          if (!this.behaviors.developing) break
          log(`\n=== Цикл ${cycle+1}/5 [HP:${Math.round(hp())} F:${Math.round(food())}] ===`)
          if (await avoidDanger()) break
          await autoEat()
          await checkHostiles()

          if (night()) {
            log('Ночь! Ищу безопасное место...')
            this.developPhase = 'НОЧЬ'
            await equipTool('sword')
            await checkHostiles()
            await walk(4000)
            await checkHostiles()
          }

          this.developPhase = 'ДРЕВЕСИНА'
          await equipTool('axe')
          const logN = ['oak_log','spruce_log','birch_log','jungle_log','dark_oak_log','acacia_log']
          if (count(...logN) < 32) await digMultiple(logN, 32 - count(...logN), 24, 'Дерево')
          else log(`Дерево: ${count(...logN)} OK`)

          this.developPhase = 'КАМЕНЬ'
          await equipTool('pickaxe')
          if (count('cobblestone') < 48) await digMultiple(['stone','andesite','diorite','granite','deepslate'], 48 - count('cobblestone'), 16, 'Камень')
          else log(`Камень: ${count('cobblestone')} OK`)

          this.developPhase = 'УГОЛЬ'
          if (count('coal') < 32) await digMultiple(['coal_ore','deepslate_coal_ore'], 32 - count('coal'), 24, 'Уголь')
          else log(`Уголь: ${count('coal')} OK`)

          this.developPhase = 'ЖЕЛЕЗО'
          if (count('iron_ore') < 24) await digMultiple(['iron_ore','deepslate_iron_ore'], 24 - count('iron_ore'), 24, 'Железо')
          else log(`Железо: ${count('iron_ore')} OK`)

          if (has('iron_ore') && has('coal')) {
            this.developPhase = 'ПЛАВКА'
            log('Плавлю железо...')
            const b = count('iron_ingot')
            this.bot.chat('/craft iron_ingot'); await wait(2000)
            log(`Железо: ${count('iron_ingot')} (+${count('iron_ingot')-b})`)
          }

          await equipArmor(); await autoEat()
          await checkHostiles()

          this.developPhase = 'БОЙ'
          for (let i = 0; i < 3; i++) { await fightMobs(); await wait(500) }

          if (count('diamond') < 5 && cycle >= 1) {
            this.developPhase = 'АЛМАЗЫ'
            log('Ищу алмазы...')
            const d = Math.random() * Math.PI * 2, dst = 30 + Math.random() * 60
            await goto(this.bot.entity.position.x + Math.cos(d)*dst, Math.max(5, this.bot.entity.position.y - 20), this.bot.entity.position.z + Math.sin(d)*dst)
            await digMultiple(['diamond_ore','deepslate_diamond_ore'], 5 - count('diamond'), 20, 'Алмазы')
          }

          this.developPhase = 'ИССЛЕДОВАНИЕ'
          for (let i = 0; i < 3; i++) { await walk(3000 + Math.random()*2000); await fightMobs(); if (hungry()) await autoEat() }

          if (cycle === 0) {
            this.developPhase = 'СТРОЙКА'
            const p = this.bot.entity.position, bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z)
            const wall = has('cobblestone') ? 'cobblestone' : 'oak_planks'
            const floor = has('oak_planks') ? 'oak_planks' : wall
            log('Строю 7x7...')
            for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) await placeSmart(bx+x, by-1, bz+z, floor)
            for (let x = 0; x < 7; x++) { if (x===3) continue; for (let y = 0; y < 3; y++) { await placeSmart(bx+x, by+y, bz, wall); await placeSmart(bx+x, by+y, bz+6, wall) } }
            for (let z = 1; z < 6; z++) for (let y = 0; y < 3; y++) { await placeSmart(bx, by+y, bz+z, wall); await placeSmart(bx+6, by+y, bz+z, wall) }
            for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) await placeSmart(bx+x, by+3, bz+z, floor)
            if (has('crafting_table')) await placeSmart(bx+1, by, bz, 'crafting_table')
            if (has('furnace')) await placeSmart(bx+2, by, bz, 'furnace')
            if (has('chest')) await placeSmart(bx+4, by, bz, 'chest')
            log('База готова!')
          }

          await equipArmor(); await autoEat()
          log(`Итого: Д:${count(...logN)} К:${count('cobblestone')} Ж:${count('iron_ingot')} А:${count('diamond')} E:${count('cooked_beef','bread','golden_apple')}`)
        }

        this.developPhase = 'DONE'
        log(`\n=== ГОТОВО === Блоки:${this.developStats.mined} Стройка:${this.developStats.built} Мобы:${this.developStats.killed}`)
        this.behaviors.developing = false; this.developPhase = null
      } catch(e) { log(`ОШИБКА: ${e.message}`); this.behaviors.developing = false; this.developPhase = null }
    }
    run()
  }

  stopDeveloping() {
    this.behaviors.developing = false
    this.developPhase = null
    if (this.bot) {
      this.bot.setControlState('forward', false)
      this.bot.setControlState('back', false)
      this.bot.setControlState('left', false)
      this.bot.setControlState('right', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('jump', false)
      this.bot.setControlState('sneak', false)
      try { this.bot.pathfinder.setGoal(null) } catch(e) {}
    }
  }

  getGameState() {
    if (!this.bot || !this.alive) return null
    const pos = this.bot.entity.position
    const health = Math.round(this.bot.health)
    const food = Math.round(this.bot.food)
    const time = this.bot.time.timeOfDay
    const isNight = time > 12500 && time < 23000

    const inventory = {}
    this.bot.inventory.items().forEach(item => {
      inventory[item.name] = (inventory[item.name] || 0) + item.count
    })

    const nearbyBlocks = []
    const radius = 6
    for (let x = -radius; x <= radius; x++) {
      for (let y = -3; y <= 3; y++) {
        for (let z = -radius; z <= radius; z++) {
          const bp = new Vec3(Math.floor(pos.x) + x, Math.floor(pos.y) + y, Math.floor(pos.z) + z)
          const block = this.bot.blockAt(bp)
          if (block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air') {
            if (nearbyBlocks.length < 30) {
              nearbyBlocks.push({ name: block.name, x: bp.x, y: bp.y, z: bp.z })
            }
          }
        }
      }
    }

    const nearbyEntities = []
    const hostileNames = ['zombie','skeleton','spider','creeper','witch','phantom','cave_spider','drowned','husk','stray','blaze','wither_skeleton','enderman']
    for (const [, entity] of Object.entries(this.bot.entities)) {
      if (!entity || !entity.position || entity === this.bot.entity) continue
      const dist = entity.position.distanceTo(pos)
      if (dist > 16) continue
      const name = entity.name || entity.username || 'unknown'
      const isHostile = hostileNames.some(h => name.toLowerCase().includes(h))
      const isPlayer = !!entity.username
      if (nearbyEntities.length < 15) {
        nearbyEntities.push({
          name: name,
          type: isPlayer ? 'player' : (isHostile ? 'hostile' : 'passive'),
          distance: Math.round(dist),
          x: Math.round(entity.position.x),
          y: Math.round(entity.position.y),
          z: Math.round(entity.position.z),
        })
      }
    }

    const equipped = this.bot.heldItem ? this.bot.heldItem.name : 'none'
    const armor = {
      head: this.bot.inventory.slots[5]?.name || 'none',
      chest: this.bot.inventory.slots[6]?.name || 'none',
      legs: this.bot.inventory.slots[7]?.name || 'none',
      feet: this.bot.inventory.slots[8]?.name || 'none',
    }

    return {
      position: { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) },
      health, food, isNight, time,
      inventory, equipped, armor,
      nearbyBlocks, nearbyEntities,
      server: this.server,
    }
  }

  async executeAgentTool(name, args) {
    if (!this.bot || !this.alive) return 'Бот не активен'
    const wait = (ms) => new Promise(r => setTimeout(r, ms))

    try {
      switch (name) {
        case 'move_to': {
          const { goals } = require('mineflayer-pathfinder')
          try {
            await this.bot.pathfinder.goto(new goals.GoalNear(args.x, args.y, args.z, 2))
            return `Дошёл до ${args.x} ${args.y} ${args.z}`
          } catch(e) {
            return `Не могу дойти: ${e.message}`
          }
        }
        case 'mine_block': {
          const target = new Vec3(args.x, args.y, args.z)
          const block = this.bot.blockAt(target)
          if (!block || block.name === 'air') return 'Блок не найден или уже сломан'
          const dist = this.bot.entity.position.distanceTo(target)
          if (dist > 5) {
            const { goals } = require('mineflayer-pathfinder')
            try { await this.bot.pathfinder.goto(new goals.GoalNear(args.x, args.y, args.z, 2)) } catch(e) {}
            await wait(300)
          }
          const blockNow = this.bot.blockAt(target)
          if (!blockNow || blockNow.name === 'air') return 'Блок исчез'
          const BLOCK_TOOL = { oak_log:'axe',spruce_log:'axe',birch_log:'axe',jungle_log:'axe',dark_oak_log:'axe',acacia_log:'axe',stone:'pickaxe',andesite:'pickaxe',diorite:'pickaxe',granite:'pickaxe',iron_ore:'pickaxe',gold_ore:'pickaxe',diamond_ore:'pickaxe',coal_ore:'pickaxe',lapis_ore:'pickaxe',redstone_ore:'pickaxe',emerald_ore:'pickaxe',obsidian:'pickaxe',deepslate:'pickaxe',cobblestone:'pickaxe',dirt:'shovel',grass_block:'shovel',gravel:'shovel',sand:'shovel' }
          const TOOLS = { axe:['netherite_axe','diamond_axe','iron_axe','stone_axe','wooden_axe'], pickaxe:['netherite_pickaxe','diamond_pickaxe','iron_pickaxe','stone_pickaxe','wooden_pickaxe'], shovel:['netherite_shovel','diamond_shovel','iron_shovel','stone_shovel','wooden_shovel'], sword:['netherite_sword','diamond_sword','iron_sword','stone_sword','wooden_sword'] }
          const toolType = BLOCK_TOOL[blockNow.name] || 'pickaxe'
          const tools = this.bot.inventory.items().filter(i => TOOLS[toolType] && TOOLS[toolType].includes(i.name))
          if (tools.length) {
            const best = tools[0]
            if (!this.bot.heldItem || this.bot.heldItem.name !== best.name) {
              try { await this.bot.equip(best, 'hand') } catch(e) {}
            }
          }
          await this.bot.dig(blockNow)
          await wait(300)
          return `Сломал ${blockNow.name} в ${args.x} ${args.y} ${args.z}`
        }
        case 'place_block': {
          const target = new Vec3(args.x, args.y, args.z)
          const checks = [
            { p: new Vec3(args.x, args.y - 1, args.z), f: new Vec3(0, 1, 0) },
            { p: new Vec3(args.x + 1, args.y, args.z), f: new Vec3(-1, 0, 0) },
            { p: new Vec3(args.x - 1, args.y, args.z), f: new Vec3(1, 0, 0) },
            { p: new Vec3(args.x, args.y, args.z + 1), f: new Vec3(0, 0, -1) },
            { p: new Vec3(args.x, args.y, args.z - 1), f: new Vec3(0, 0, 1) },
          ]
          let ref = null, face = null
          for (const c of checks) {
            const b = this.bot.blockAt(c.p)
            if (b && b.name !== 'air' && b.name !== 'cave_air') { ref = b; face = c.f; break }
          }
          if (!ref) return 'Нет опоры для размещения'
          const item = this.bot.inventory.items().find(i => i.name === args.block)
          if (!item) return `Нет ${args.block} в инвентаре`
          await this.bot.equip(item, 'hand')
          await this.bot.placeBlock(ref, face)
          await wait(200)
          return `Поставил ${args.block} в ${args.x} ${args.y} ${args.z}`
        }
        case 'attack': {
          const target = Object.values(this.bot.entities).find(e =>
            e && e.position && e.name && e.name.toLowerCase().includes(args.target.toLowerCase()) &&
            e.position.distanceTo(this.bot.entity.position) < 10
          )
          if (!target) return `${args.target} не найден рядом`
          const sword = this.bot.inventory.items().find(i => i.name.includes('sword'))
          if (sword && (!this.bot.heldItem || !this.bot.heldItem.name.includes('sword'))) {
            try { await this.bot.equip(sword, 'hand') } catch(e) {}
          }
          for (let i = 0; i < 8; i++) {
            if (!target || !target.position) break
            this.bot.attack(target)
            if (i % 2 === 0) {
              this.bot.setControlState('jump', true)
              await wait(200)
              this.bot.setControlState('jump', false)
            }
            await wait(300)
          }
          return `Атаковал ${args.target}`
        }
        case 'chat': {
          this.bot.chat(args.message)
          this.stats.messagesSent++
          return `Написал: ${args.message}`
        }
        case 'equip': {
          const item = this.bot.inventory.items().find(i => i.name === args.item)
          if (!item) return `${args.item} не найден`
          await this.bot.equip(item, args.slot)
          return `Экипировал ${args.item} в ${args.slot}`
        }
        case 'eat': {
          const foods = ['golden_apple','enchanted_golden_apple','cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','bread','baked_potato','golden_carrot','apple','carrot']
          const food = this.bot.inventory.items().find(i => foods.includes(i.name))
          if (!food) return 'Нет еды в инвентаре'
          await this.bot.equip(food, 'hand')
          this.bot.activateItem()
          await this.bot.consume()
          await wait(500)
          return `Съел ${food.name}`
        }
        case 'craft': {
          this.bot.chat(`/craft ${args.item}`)
          await wait(2000)
          return `Скрафтил ${args.item}`
        }
        case 'use_command': {
          this.bot.chat(`/${args.command}`)
          await wait(1000)
          return `Выполнил /${args.command}`
        }
        case 'jump': {
          this.bot.setControlState('jump', true)
          await wait(300)
          this.bot.setControlState('jump', false)
          return 'Прыгнул'
        }
        case 'wait': {
          await wait(args.seconds * 1000)
          return `Ждал ${args.seconds} сек`
        }
        case 'think': {
          return 'Думаю...'
        }
        case 'chop_tree': {
          const logNames = ['oak_log','spruce_log','birch_log','jungle_log','dark_oak_log','acacia_log']
          const TOOLS = { axe:['netherite_axe','diamond_axe','iron_axe','stone_axe','wooden_axe'] }
          const axe = this.bot.inventory.items().filter(i => TOOLS.axe.includes(i.name)).sort((a,b) => TOOLS.axe.indexOf(a.name) - TOOLS.axe.indexOf(b.name))[0]
          if (axe) {
            try { await this.bot.equip(axe, 'hand') } catch(e) {}
          }
          let chopped = 0
          for (let y = this.bot.entity.position.y + 4; y >= this.bot.entity.position.y - 1; y--) {
            const baseX = Math.floor(this.bot.entity.position.x)
            const baseZ = Math.floor(this.bot.entity.position.z)
            for (let dx = -3; dx <= 3; dx++) {
              for (let dz = -3; dz <= 3; dz++) {
                const bp = new Vec3(baseX + dx, Math.floor(y), baseZ + dz)
                const block = this.bot.blockAt(bp)
                if (block && logNames.includes(block.name)) {
                  const dist = this.bot.entity.position.distanceTo(bp)
                  if (dist > 5) {
                    const { goals } = require('mineflayer-pathfinder')
                    try { await this.bot.pathfinder.goto(new goals.GoalNear(bp.x, bp.y, bp.z, 2)) } catch(e) {}
                    await wait(300)
                  }
                  const blockNow = this.bot.blockAt(bp)
                  if (blockNow && logNames.includes(blockNow.name)) {
                    if (axe) try { await this.bot.equip(axe, 'hand') } catch(e) {}
                    try {
                      await this.bot.dig(blockNow)
                      chopped++
                      await wait(200)
                      for (let dy = 1; dy <= 3; dy++) {
                        const above = this.bot.blockAt(new Vec3(bp.x, bp.y + dy, bp.z))
                        if (above && logNames.includes(above.name)) {
                          try { await this.bot.dig(above); chopped++; await wait(200) } catch(e) {}
                        }
                      }
                    } catch(e) {}
                  }
                }
              }
            }
          }
          return `Срубил ${chopped} брёвен`
        }
        case 'place_chest': {
          const chest = this.bot.inventory.items().find(i => i.name === 'chest')
          if (!chest) return 'Нет сундука в инвентаре'
          const feet = this.bot.entity.position
          const refs = [
            { p: new Vec3(Math.floor(feet.x), Math.floor(feet.y) - 1, Math.floor(feet.z)), f: new Vec3(0, 1, 0) },
            { p: new Vec3(Math.floor(feet.x) + 1, Math.floor(feet.y), Math.floor(feet.z)), f: new Vec3(-1, 0, 0) },
            { p: new Vec3(Math.floor(feet.x) - 1, Math.floor(feet.y), Math.floor(feet.z)), f: new Vec3(1, 0, 0) },
            { p: new Vec3(Math.floor(feet.x), Math.floor(feet.y), Math.floor(feet.z) + 1), f: new Vec3(0, 0, -1) },
            { p: new Vec3(Math.floor(feet.x), Math.floor(feet.y), Math.floor(feet.z) - 1), f: new Vec3(0, 0, 1) },
          ]
          for (const r of refs) {
            const refBlock = this.bot.blockAt(r.p)
            if (refBlock && refBlock.name !== 'air' && refBlock.name !== 'cave_air') {
              try {
                await this.bot.equip(chest, 'hand')
                await this.bot.placeBlock(refBlock, r.f)
                await wait(300)
                return 'Поставил сундук'
              } catch(e) {}
            }
          }
          return 'Нет места для сундука'
        }
        case 'kill_animal': {
          const animals = ['cow','sheep','pig','chicken','rabbit','fox']
          const target = Object.values(this.bot.entities).find(e =>
            e && e.position && e.name && animals.includes(e.name.toLowerCase()) &&
            e.position.distanceTo(this.bot.entity.position) < 12
          )
          if (!target) return 'Животные не найдены рядом (до 12 блоков)'
          const sword = this.bot.inventory.items().find(i => i.name.includes('sword'))
          if (sword) try { await this.bot.equip(sword, 'hand') } catch(e) {}
          const { goals } = require('mineflayer-pathfinder')
          try { await this.bot.pathfinder.goto(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2)) } catch(e) {}
          await wait(200)
          for (let i = 0; i < 6; i++) {
            if (!target || !target.position) break
            try { this.bot.attack(target) } catch(e) {}
            await wait(300)
          }
          return `Убил ${target.name || 'животное'}`
        }
        case 'smelt': {
          const furnace = this.bot.inventory.items().find(i => i.name === 'furnace')
          if (!furnace) {
            const cobble = this.bot.inventory.items().find(i => i.name === 'cobblestone')
            if (!cobble) return 'Нет печи и нет булыжника для крафта'
            this.bot.chat('/craft furnace')
            await wait(2000)
            const furnaceAfter = this.bot.inventory.items().find(i => i.name === 'furnace')
            if (!furnaceAfter) return 'Не удалось скрафтить печь'
          }
          const furnaceBlock = this.bot.blockAt(this.bot.entity.position)
          const nearFurnace = this.bot.findBlocks({ matching: b => b && b.name === 'furnace', maxDistance: 5, count: 1 })
          if (nearFurnace.length === 0) {
            const feet = this.bot.entity.position
            const refs = [
              { p: new Vec3(Math.floor(feet.x), Math.floor(feet.y) - 1, Math.floor(feet.z)), f: new Vec3(0, 1, 0) },
              { p: new Vec3(Math.floor(feet.x) + 1, Math.floor(feet.y), Math.floor(feet.z)), f: new Vec3(-1, 0, 0) },
            ]
            const furnaceItem = this.bot.inventory.items().find(i => i.name === 'furnace')
            if (furnaceItem) {
              for (const r of refs) {
                const refBlock = this.bot.blockAt(r.p)
                if (refBlock && refBlock.name !== 'air') {
                  try {
                    await this.bot.equip(furnaceItem, 'hand')
                    await this.bot.placeBlock(refBlock, r.f)
                    await wait(300)
                    break
                  } catch(e) {}
                }
              }
            }
          }
          const furnaceNear = this.bot.findBlocks({ matching: b => b && b.name === 'furnace', maxDistance: 5, count: 1 })
          if (furnaceNear.length === 0) return 'Не удалось поставить печь'
          const fb = this.bot.blockAt(furnaceNear[0])
          await this.bot.lookAt(furnaceNear[0].offset(0.5, 0.5, 0.5))
          await wait(200)
          this.bot.activateBlock(fb)
          await wait(500)
          const win = this.bot.currentWindow
          if (!win) return 'Не открылось окно печи'
          const inputItem = this.bot.inventory.items().find(i => i.name === args.input)
          if (!inputItem) return `Нет ${args.input} в инвентаре`
          const fuelItem = this.bot.inventory.items().find(i => i.name === (args.fuel || 'coal') || i.name === 'charcoal')
          if (!fuelItem) return `Нет топлива (${args.fuel || 'coal'})`
          await this.bot.clickWindow(win.slots[0].slot, 0, 0)
          await wait(100)
          const inputSlot = this.bot.inventory.items().find(i => i.name === args.input)
          if (inputSlot) {
            await this.bot.clickWindow(inputSlot.slot, 0, 0)
            await wait(100)
            await this.bot.clickWindow(win.slots[0].slot, 0, 0)
            await wait(100)
          }
          await this.bot.clickWindow(fuelItem.slot, 0, 0)
          await wait(100)
          await this.bot.clickWindow(win.slots[1].slot, 0, 0)
          await wait(100)
          try { this.bot.closeWindow(win) } catch(e) {}
          await wait(200)
          return `Запустил плавку ${args.input} с ${args.fuel || 'coal'}`
        }
        case 'build_house': {
          const logNames = ['oak_log','spruce_log','birch_log','jungle_log','dark_oak_log','acacia_log']
          const plankNames = ['oak_planks','spruce_planks','birch_planks','jungle_planks','dark_oak_planks','acacia_planks']
          const hasLogs = this.bot.inventory.items().filter(i => logNames.includes(i.name)).reduce((s,i) => s + i.count, 0)
          const hasPlanks = this.bot.inventory.items().filter(i => plankNames.includes(i.name)).reduce((s,i) => s + i.count, 0)
          const totalWood = hasLogs + hasPlanks
          if (totalWood < 40) return `Мало дерева (${totalWood}/40). Нужно срубить дерево.`
          const hasChest = this.bot.inventory.items().find(i => i.name === 'chest')
          const hasDoor = this.bot.inventory.items().find(i => i.name.includes('door'))
          const bx = Math.floor(this.bot.entity.position.x)
          const by = Math.floor(this.bot.entity.position.y)
          const bz = Math.floor(this.bot.entity.position.z)
          const wallBlock = hasPlanks > 0 ? plankNames.find(n => this.bot.inventory.items().find(i => i.name === n)) || 'oak_planks' : logNames.find(n => this.bot.inventory.items().find(i => i.name === n)) || 'oak_log'
          const floorBlock = plankNames.find(n => this.bot.inventory.items().find(i => i.name === n)) || wallBlock
          const roofBlock = logNames.find(n => this.bot.inventory.items().find(i => i.name === n)) || wallBlock
          log('Строю дом 5x5...')
          let placed = 0
          const place = async (x, y, z, blockName) => {
            const item = this.bot.inventory.items().find(i => i.name === blockName)
            if (!item) return
            const t = new Vec3(x, y, z)
            const cur = this.bot.blockAt(t)
            if (cur && cur.name !== 'air' && cur.name !== 'cave_air') return
            const refs = [
              { p: new Vec3(x, y-1, z), f: new Vec3(0,1,0) },
              { p: new Vec3(x+1, y, z), f: new Vec3(-1,0,0) },
              { p: new Vec3(x-1, y, z), f: new Vec3(1,0,0) },
              { p: new Vec3(x, y, z+1), f: new Vec3(0,0,-1) },
              { p: new Vec3(x, y, z-1), f: new Vec3(0,0,1) },
            ]
            for (const r of refs) {
              const ref = this.bot.blockAt(r.p)
              if (ref && ref.name !== 'air' && ref.name !== 'cave_air') {
                try {
                  await this.bot.equip(item, 'hand')
                  await this.bot.placeBlock(ref, r.f)
                  placed++
                  await wait(120)
                  return
                } catch(e) {}
              }
            }
          }
          for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) await place(bx+x, by-1, bz+z, floorBlock)
          for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 5; x++) { if (x === 2 && y < 2) continue; await place(bx+x, by+y, bz, wallBlock) }
            for (let x = 0; x < 5; x++) { if (x === 2 && y < 2) continue; await place(bx+x, by+y, bz+4, wallBlock) }
            for (let z = 1; z < 4; z++) { await place(bx, by+y, bz+z, wallBlock); await place(bx+4, by+y, bz+z, wallBlock) }
          }
          for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) await place(bx+x, by+3, bz+z, roofBlock)
          if (hasDoor) {
            const item = this.bot.inventory.items().find(i => i.name.includes('door'))
            if (item) {
              const doorPos = new Vec3(bx+2, by, bz)
              const ref = this.bot.blockAt(new Vec3(bx+2, by-1, bz))
              if (ref) {
                try {
                  await this.bot.equip(item, 'hand')
                  await this.bot.placeBlock(ref, new Vec3(0,1,0))
                  await wait(200)
                } catch(e) {}
              }
            }
          }
          if (hasChest) {
            const chestItem = this.bot.inventory.items().find(i => i.name === 'chest')
            if (chestItem) {
              const refs = [
                { p: new Vec3(bx+1, by-1, bz+1), f: new Vec3(0,1,0) },
                { p: new Vec3(bx+3, by-1, bz+1), f: new Vec3(0,1,0) },
              ]
              for (const r of refs) {
                const ref = this.bot.blockAt(r.p)
                if (ref && ref.name !== 'air') {
                  try {
                    await this.bot.equip(chestItem, 'hand')
                    await this.bot.placeBlock(ref, r.f)
                    await wait(200)
                  } catch(e) {}
                }
              }
            }
          }
          log(`Дом построен! Поставлено блоков: ${placed}`)
          return `Построен дом 5x5 в ${bx} ${by} ${bz}. Стены: ${wallBlock}, пол: ${floorBlock}, крыша: ${roofBlock}. Поставлено блоков: ${placed}`
        }
        default:
          return `Неизвестное действие: ${name}`
      }
    } catch(e) {
      return `Ошибка: ${e.message}`
    }
  }

  startAgent() {
    if (!this.bot || !this.alive) return
    this.behaviors.agent = true
    this.agentMessages = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ]
    this.agentLog = []

    const log = (msg) => {
      const entry = `[${new Date().toLocaleTimeString()}] ${msg}`
      this.agentLog.push(entry)
      if (this.agentLog.length > 50) this.agentLog.shift()
      console.log(`[${this.username}] [Agent] ${msg}`)
    }

    const runAgentLoop = async () => {
      if (!this.behaviors.agent || !this.bot || !this.alive) return

      const state = this.getGameState()
      if (!state) { log('Нет состояния, жду...'); return }

      const stateMsg = `[${state.position.x},${state.position.y},${state.position.z}] HP:${state.health} F:${state.food} ${state.isNight?'НОЧЬ':'ДЕНЬ'} Экип:${state.equipped}
Инв:${Object.entries(state.inventory).map(([k,v])=>k+':'+v).join(', ')}
Мобы:${state.nearbyEntities.map(e=>e.name+'['+e.type+']('+e.distance+'м)').join(', ')}
Блоки:${state.nearbyBlocks.slice(0,10).map(b=>b.name).join(', ')}

Что делать?`

      this.agentMessages.push({ role: 'user', content: stateMsg })

      if (this.agentMessages.length > 12) {
        this.agentMessages = [this.agentMessages[0], ...this.agentMessages.slice(-8)]
      }

      log('Запрашиваю решение ИИ...')
      const response = await askAIWithTools(this.agentMessages, AI_AGENT_TOOLS)

      if (!response) { log('Нет ответа от ИИ'); setTimeout(runAgentLoop, 5000); return }

      if (response.content) {
        log(`ИИ: ${response.content}`)
      }

      if (response.tool_calls && response.tool_calls.length > 0) {
        this.agentMessages.push({ role: 'assistant', content: response.content || '', tool_calls: response.tool_calls })

        for (const toolCall of response.tool_calls) {
          if (!this.behaviors.agent || !this.bot || !this.alive) break
          const fnName = toolCall.function.name
          let fnArgs = {}
          try { fnArgs = JSON.parse(toolCall.function.arguments) } catch(e) {}

          log(`⚡ ${fnName}(${JSON.stringify(fnArgs).substring(0, 80)})`)
          const result = await this.executeAgentTool(fnName, fnArgs)
          log(`✓ ${result}`)

          this.agentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          })

          await new Promise(r => setTimeout(r, 200))
        }
      } else {
        this.agentMessages.push({ role: 'assistant', content: response.content || '...' })
      }

      if (this.behaviors.agent && this.bot && this.alive) {
        const delay = 1000 + Math.random() * 1500
        setTimeout(runAgentLoop, delay)
      }
    }

    log('AI Agent запущен! ИИ начинает автономное управление.')
    runAgentLoop()
  }

  stopAgent() {
    this.behaviors.agent = false
    this.agentMessages = []
    if (this.bot) {
      this.bot.setControlState('forward', false)
      this.bot.setControlState('back', false)
      this.bot.setControlState('left', false)
      this.bot.setControlState('right', false)
      this.bot.setControlState('sprint', false)
      this.bot.setControlState('jump', false)
      this.bot.setControlState('sneak', false)
      try { this.bot.pathfinder.setGoal(null) } catch(e) {}
    }
  }

  destroy() {
    this.stopBehavior()
    if (this.bot) {
      try { this.bot.quit() } catch(e) {}
      this.bot = null
    }
    this.alive = false
  }

  getStatus() {
    const pos = this.bot && this.bot.entity ? this.bot.entity.position : null
    return {
      username: this.username,
      alive: this.alive,
      registered: this.registered,
      server: this.server,
      behaviors: { ...this.behaviors },
      developPhase: this.developPhase,
      position: pos ? { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) } : null,
      stats: this.stats,
      recentMessages: this.serverMessages.slice(-20),
      developLog: (this.developLog || []).slice(-15),
      agentLog: (this.agentLog || []).slice(-15),
    }
  }
}

module.exports = Bot
