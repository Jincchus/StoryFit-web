'use client'
import { parseNovelBlocks } from '@/lib/parseBlocks'

function NarrationText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('*') && p.endsWith('*')
          ? <em key={i}>{p.slice(1, -1)}</em>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

interface Props {
  text: string
  personaName?: string
  charName?: string
}

export default function NovelScene({ text, personaName, charName }: Props) {
  const blocks = parseNovelBlocks(text)

  return (
    <div className="novel-scene">
      {blocks.map((block, i) => {
        if (block.type === 'image') {
          return <img key={i} src={block.text} alt="" style={{ maxWidth: '100%', borderRadius: 8, margin: '6px 0', display: 'block' }} />
        }
        if (block.type === 'narration') {
          return (
            <div key={i} className="narration-block">
              <NarrationText text={block.text} />
            </div>
          )
        }

        const isPersona = personaName && block.speaker === personaName
        const isChar = charName && block.speaker === charName
        const speakerClass = isPersona ? 'novel-speaker-persona' : isChar ? 'novel-speaker-char' : ''
        const bubbleClass = [
          'bubble',
          block.type === 'thought' ? 'thought-bubble' : '',
          isPersona ? 'bubble-persona' : isChar ? 'bubble-char' : '',
        ].filter(Boolean).join(' ')

        return (
          <div key={i} className="novel-speech-wrap">
            {block.speaker && (
              <div className={`novel-speaker ${speakerClass}`}>{block.speaker}</div>
            )}
            <div className={bubbleClass}>{block.text}</div>
          </div>
        )
      })}
    </div>
  )
}
