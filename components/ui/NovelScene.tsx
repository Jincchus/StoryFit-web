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

export default function NovelScene({ text }: { text: string }) {
  const blocks = parseNovelBlocks(text)

  return (
    <div className="novel-scene">
      {blocks.map((block, i) => {
        if (block.type === 'narration') {
          return (
            <div key={i} className="narration-block">
              <NarrationText text={block.text} />
            </div>
          )
        }
        return (
          <div key={i} className="novel-speech-wrap">
            {block.speaker && <div className="novel-speaker">{block.speaker}</div>}
            <div className={`bubble ${block.type === 'thought' ? 'thought-bubble' : ''}`}>
              {block.text}
            </div>
          </div>
        )
      })}
    </div>
  )
}
