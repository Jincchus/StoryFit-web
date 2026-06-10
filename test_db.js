const fs = require('fs')
const path = require('path')

// Read root .env and parse DATABASE_URL
try {
  const envContent = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
  const lines = envContent.split('\n')
  for (const line of lines) {
    const match = line.match(/^\s*DATABASE_URL\s*=\s*(["']?)(.*?)\1\s*$/)
    if (match) {
      let dbUrl = match[2]
      // Replace 'db:5432' with 'localhost:5432' for host access
      dbUrl = dbUrl.replace('@db:5432/', '@localhost:5432/')
      process.env.DATABASE_URL = dbUrl
      console.log('Set DATABASE_URL to:', dbUrl)
      break
    }
  }
} catch (e) {
  console.log('Failed to read root .env:', e.message)
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const collections = await prisma.characterCollection.findMany({
    where: {
      sourceUrl: {
        contains: 'melting.chat'
      }
    },
    include: {
      characters: true
    }
  })
  
  console.log(`Found ${collections.length} melting collections.`)
  for (const col of collections) {
    console.log('---')
    console.log('Collection ID:', col.id)
    console.log('Title:', col.title)
    console.log('Source URL:', col.sourceUrl)
    console.log('MeltingMeta:', JSON.stringify(col.meltingMeta, null, 2))
    if (col.characters.length > 0) {
      console.log('First character name:', col.characters[0].name)
      console.log('First character openingMessage:', col.characters[0].openingMessage)
      console.log('First character additionalInfo length:', col.characters[0].additionalInfo.length)
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())
