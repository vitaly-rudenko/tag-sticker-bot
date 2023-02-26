import { config } from 'dotenv'
import { createBot } from './bot/createBot.js'
import { InMemoryStickerQueueRepository } from './queue/InMemoryStickerQueueRepository.js'
import { InMemoryStickerRepository } from './stickers/InMemoryStickerRepository.js'
import { InMemoryUserSessionRepository } from './users/InMemoryUserSessionRepository.js'
import { SearchStickersInteractor } from './SearchStickersInteractor.js'
import { InMemoryTagRepository } from './tags/InMemoryTagRepository.js'

config()

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN ?? ''

async function start() {
  const userSessionRepository = new InMemoryUserSessionRepository()
  const stickerRepository = new InMemoryStickerRepository()
  const stickerQueueRepository = new InMemoryStickerQueueRepository()
  const tagRepository = new InMemoryTagRepository()

  const searchStickersInteractor = new SearchStickersInteractor({
    stickerRepository,
    tagRepository,
  })

  const bot = await createBot({
    telegramBotToken,
    searchStickersInteractor,
    stickerQueueRepository,
    stickerRepository,
    userSessionRepository,
    tagRepository,
  })

  bot.launch().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

start()
  .then(() => console.log('Started!'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
