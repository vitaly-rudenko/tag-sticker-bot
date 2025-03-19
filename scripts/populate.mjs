import pg from 'pg'
import fs from 'fs'
import { Telegraf } from 'telegraf'
import { TagsRepository } from '../src/tags/tags-repository.ts'
import { StickerSetsRepository } from '../src/sticker-sets/sticker-sets-repository.ts'
import { FilesRepository } from '../src/files/files-repository.ts'

const postgresClient = new pg.Client(process.env.DATABASE_URL)
await postgresClient.connect()

const tagsRepository = new TagsRepository({ client: postgresClient })
const stickerSetsRepository = new StickerSetsRepository({ client: postgresClient })
const filesRepository = new FilesRepository({ client: postgresClient })

const results = JSON.parse(fs.readFileSync('./results.json', 'utf8'))

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

for (const [i, result] of results.entries()) {
  console.log('Processing', i + 1, '/', results.length)

  const fileType = result.mimeType ? 'animation' : 'sticker'

  await tagsRepository.upsert({
    authorUserId: result.authorUserId,
    value: result.value,
    visibility: result.visibility,
    taggableFile: {
      fileId: result.fileId,
      fileUniqueId: result.fileUniqueId,
      ...fileType === 'animation' && {
        mimeType: result.mimeType,
      },
      ...fileType === 'sticker' && result.setName && {
        setName: result.setName,
      },
      fileType,
    }
  })

  await filesRepository.upsert({
    fileUniqueId: result.fileUniqueId,
    fileType,
    setName: result.setName,
    mimeType: result.mimeType,
    data: {
      __imported__: true,
      ...result,
    }
  })

  if (result.setName) {
    try {
      const stickerSet = await bot.telegram.getStickerSet(result.setName)
  
      await stickerSetsRepository.upsert({
        setName: stickerSet.name,
        title: stickerSet.title,
        data: stickerSet,
      })
    } catch (error) {
      console.warn('Failed to fetch sticker set', result.setName)
    }
  }
}

console.log('Done!')
