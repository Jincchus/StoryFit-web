import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticate } from '@/lib/apiAuth' // import route와 동일 심볼

export async function GET(req: NextRequest) {
  const userId = await authenticate(req)
  if (!userId) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const storyId = sp.get('story')
  const charId = sp.get('character')

  if (storyId) {
    const collection = await prisma.characterCollection.findFirst({ where: { id: storyId, userId } })
    if (!collection) return NextResponse.json({ error: '스토리를 찾을 수 없습니다.' }, { status: 404 })
    const links = await prisma.crackStoryCharacter.findMany({
      where: { collectionId: storyId }, orderBy: { order: 'asc' }, include: { character: true },
    })
    return NextResponse.json({ collection, characters: links.map(l => l.character) })
  }
  if (charId) {
    const character = await prisma.character.findFirst({ where: { id: charId, creatorId: userId } })
    if (!character) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 })
    const links = await prisma.crackStoryCharacter.findMany({
      where: { characterId: charId }, include: { collection: true },
    })
    return NextResponse.json({ character, stories: links.map(l => l.collection) })
  }
  return NextResponse.json({ error: 'story 또는 character 파라미터 필요' }, { status: 400 })
}
