'use client'
import type { AvatarKind } from '@/types'

function px(x: number, y: number, w: number, h: number, fill: string) {
  return <rect key={`${x}${y}${w}${h}${fill}`} x={x} y={y} width={w} height={h} fill={fill} />
}

function avatarBase({ skin = '#ffd1a8', hair, hairBack = hair, eye = '#1a1438', cheek = '#ff8aa8', mouth = '#b03060', outfit, outfitDark = outfit, accent }: {
  skin?: string; hair?: string; hairBack?: string; eye?: string; cheek?: string;
  mouth?: string; outfit: string; outfitDark?: string; accent?: string
}) {
  return (
    <>
      {px(5,3,6,5,skin)}{px(5,6,1,1,cheek)}{px(10,6,1,1,cheek)}
      {px(7,5,1,1,eye)}{px(9,5,1,1,eye)}{px(8,7,1,1,mouth)}{px(7,8,2,1,skin)}
      {px(4,9,8,5,outfit)}{px(4,13,8,1,outfitDark)}{accent ? px(4,11,8,1,accent) : null}
      {hairBack ? px(4,3,1,5,hairBack) : null}{hairBack ? px(11,3,1,5,hairBack) : null}
      {hair ? px(5,2,6,2,hair) : null}{hair ? px(5,3,1,1,hair) : null}{hair ? px(10,3,1,1,hair) : null}
    </>
  )
}

const AVATARS: Record<AvatarKind, JSX.Element> = {
  wizard: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#e8d4ff"/>
      {px(7,0,2,1,'#5d2e8e')}{px(6,1,4,1,'#5d2e8e')}{px(5,2,6,1,'#5d2e8e')}{px(4,3,8,1,'#5d2e8e')}{px(7,1,1,1,'#ffe07a')}
      {avatarBase({hair:'#8b5cf6',hairBack:'#8b5cf6',outfit:'#5d2e8e',outfitDark:'#3a1880',accent:'#ffe07a'})}
      {px(3,5,1,9,'#7a4a1f')}{px(2,4,3,2,'#a3e0ff')}{px(3,3,1,1,'#fff')}
    </svg>
  ),
  knight: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#c9d6ff"/>
      {px(5,2,6,5,'#c0c0d0')}{px(4,3,1,4,'#a0a0b0')}{px(11,3,1,4,'#a0a0b0')}{px(7,4,2,1,'#1a1438')}
      {px(6,7,4,1,'#a0a0b0')}{px(7,5,1,1,'#ff5ea8')}{px(7,0,2,2,'#ff2e93')}
      {px(7,8,2,1,'#ffd1a8')}{px(3,9,10,5,'#a0a0b0')}{px(4,10,8,3,'#c0c0d0')}{px(7,10,2,3,'#5d2e8e')}
      {px(2,10,2,3,'#8b5cf6')}{px(2,11,2,1,'#ffe07a')}
    </svg>
  ),
  rogue: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#1a1438"/>
      {px(4,2,8,2,'#2d1f4a')}{px(3,3,10,4,'#2d1f4a')}{px(5,4,6,3,'#ffd1a8')}
      {px(7,5,1,1,'#ff5ea8')}{px(9,5,1,1,'#ff5ea8')}{px(8,6,1,1,'#5d0f4a')}
      {px(3,6,2,4,'#2d1f4a')}{px(11,6,2,4,'#2d1f4a')}
      {px(4,8,8,6,'#3a2660')}{px(7,9,2,5,'#5d2e8e')}
      {px(13,7,1,5,'#c0c0d0')}{px(12,11,3,1,'#ffe07a')}
    </svg>
  ),
  maid: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#ffd6ec"/>
      {px(3,3,2,7,'#ff5ea8')}{px(11,3,2,7,'#ff5ea8')}
      {avatarBase({hair:'#ff5ea8',hairBack:'#ff5ea8',outfit:'#1a1438',outfitDark:'#0a0822'})}
      {px(6,1,4,1,'#fff')}{px(5,2,6,1,'#fff')}{px(7,2,2,1,'#ff8fcf')}
      {px(6,10,4,4,'#fff')}{px(7,11,2,1,'#ff5ea8')}
    </svg>
  ),
  vampire: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#3a1a3a"/>
      {px(2,9,2,5,'#5d0f4a')}{px(12,9,2,5,'#5d0f4a')}{px(3,8,10,2,'#5d0f4a')}
      {avatarBase({skin:'#f3e6ff',hair:'#1a1438',hairBack:'#1a1438',outfit:'#2d1f4a',outfitDark:'#1a1438',accent:'#ff2e93'})}
      {px(8,7,1,1,'#fff')}{px(7,5,1,1,'#ff2e93')}{px(9,5,1,1,'#ff2e93')}{px(6,8,4,1,'#5d0f4a')}
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#a3e0ff"/>
      {px(8,0,1,2,'#1a1438')}{px(7,0,3,1,'#ffe07a')}
      {px(4,2,8,6,'#e8e8f0')}{px(4,2,8,1,'#a0a0c0')}{px(4,7,8,1,'#a0a0c0')}
      {px(5,3,6,4,'#1a1438')}{px(6,4,1,1,'#22ffaa')}{px(8,4,1,1,'#22ffaa')}{px(10,4,1,1,'#22ffaa')}{px(6,5,5,1,'#22ffaa')}
      {px(3,8,10,6,'#c0c0d0')}{px(4,9,8,4,'#e8e8f0')}{px(7,10,2,1,'#ff5ea8')}{px(7,11,2,1,'#ff5ea8')}
    </svg>
  ),
  elf: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#d9f5e2"/>
      {px(4,4,1,3,'#ffd1a8')}{px(11,4,1,3,'#ffd1a8')}{px(3,5,1,1,'#ffd1a8')}{px(12,5,1,1,'#ffd1a8')}
      {avatarBase({hair:'#ffd700',hairBack:'#ffb000',outfit:'#22a06b',outfitDark:'#0f5a3a',accent:'#ffe07a'})}
      {px(5,2,6,1,'#22c55e')}{px(7,1,2,1,'#22c55e')}
      {px(12,9,1,5,'#7a4a1f')}{px(11,9,1,1,'#7a4a1f')}{px(11,13,1,1,'#7a4a1f')}
    </svg>
  ),
  ninja: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#2d1f4a"/>
      {px(4,3,8,5,'#1a1438')}{px(5,5,1,1,'#ff5ea8')}{px(10,5,1,1,'#ff5ea8')}
      {px(4,4,8,1,'#ff2e93')}
      {px(4,8,8,6,'#1a1438')}{px(7,9,2,5,'#ff2e93')}
      {px(13,5,1,1,'#c0c0d0')}{px(12,6,3,1,'#c0c0d0')}{px(13,7,1,1,'#c0c0d0')}
    </svg>
  ),
  player: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#fff7c2"/>
      {avatarBase({hair:'#7a4a1f',hairBack:'#5a3a1a',outfit:'#a3e0ff',outfitDark:'#2856c4',accent:'#fff'})}
      {px(4,3,1,3,'#1a1438')}{px(11,3,1,3,'#1a1438')}{px(5,2,6,1,'#1a1438')}
    </svg>
  ),
  custom: (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="100%" height="100%">
      <rect width="16" height="16" fill="#f3e6ff" stroke="#5d2e8e" strokeWidth="1" strokeDasharray="1 1"/>
      <text x="8" y="11" fontSize="9" textAnchor="middle" fontFamily="monospace" fill="#5d2e8e">+</text>
    </svg>
  ),
}

export const PixelIcons = {
  chat: (
    <svg className="icn" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="1" y="2" width="14" height="9" fill="#ff8fcf"/>
      <rect x="2" y="3" width="12" height="7" fill="#fff"/>
      <rect x="1" y="11" width="3" height="2" fill="#ff8fcf"/>
      <rect x="4" y="5" width="2" height="1" fill="#1a1438"/>
      <rect x="7" y="5" width="2" height="1" fill="#1a1438"/>
      <rect x="10" y="5" width="2" height="1" fill="#1a1438"/>
    </svg>
  ),
  user: (
    <svg className="icn" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="5" y="2" width="6" height="5" fill="#ffd1a8"/>
      <rect x="5" y="2" width="6" height="2" fill="#5d2e8e"/>
      <rect x="3" y="9" width="10" height="5" fill="#8b5cf6"/>
      <rect x="6" y="5" width="1" height="1" fill="#1a1438"/>
      <rect x="9" y="5" width="1" height="1" fill="#1a1438"/>
    </svg>
  ),
  home: (
    <svg className="icn" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="7" y="2" width="2" height="1" fill="#1a1438"/>
      <rect x="6" y="3" width="4" height="1" fill="#1a1438"/>
      <rect x="5" y="4" width="6" height="1" fill="#1a1438"/>
      <rect x="4" y="5" width="8" height="1" fill="#1a1438"/>
      <rect x="3" y="6" width="10" height="1" fill="#1a1438"/>
      <rect x="4" y="7" width="8" height="7" fill="#ff8fcf"/>
      <rect x="7" y="10" width="2" height="4" fill="#5d2e8e"/>
    </svg>
  ),
  settings: (
    <svg className="icn" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="6" y="1" width="4" height="2" fill="#5d2e8e"/>
      <rect x="6" y="13" width="4" height="2" fill="#5d2e8e"/>
      <rect x="1" y="6" width="2" height="4" fill="#5d2e8e"/>
      <rect x="13" y="6" width="2" height="4" fill="#5d2e8e"/>
      <rect x="5" y="5" width="6" height="6" fill="#c9b6ff"/>
      <rect x="6" y="6" width="4" height="4" fill="#8b5cf6"/>
      <rect x="7" y="7" width="2" height="2" fill="#fff"/>
    </svg>
  ),
  sliders: (
    <svg className="icn" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="2" y="4" width="12" height="1" fill="#c9b6ff"/>
      <rect x="5" y="3" width="3" height="3" fill="#ff8fcf"/>
      <rect x="6" y="3" width="1" height="1" fill="#fff"/>
      <rect x="2" y="8" width="12" height="1" fill="#c9b6ff"/>
      <rect x="9" y="7" width="3" height="3" fill="#ff8fcf"/>
      <rect x="10" y="7" width="1" height="1" fill="#fff"/>
      <rect x="2" y="12" width="12" height="1" fill="#c9b6ff"/>
      <rect x="3" y="11" width="3" height="3" fill="#ff8fcf"/>
      <rect x="4" y="11" width="1" height="1" fill="#fff"/>
    </svg>
  ),
  bot: (
    <svg className="icn" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="7" y="1" width="2" height="2" fill="#c9b6ff"/>
      <rect x="3" y="3" width="10" height="8" fill="#8b5cf6"/>
      <rect x="4" y="4" width="8" height="6" fill="#c9b6ff"/>
      <rect x="5" y="5" width="2" height="2" fill="#1a1438"/>
      <rect x="9" y="5" width="2" height="2" fill="#1a1438"/>
      <rect x="6" y="5" width="1" height="1" fill="#a3e0ff"/>
      <rect x="10" y="5" width="1" height="1" fill="#a3e0ff"/>
      <rect x="6" y="8" width="4" height="1" fill="#ff8fcf"/>
      <rect x="1" y="6" width="2" height="3" fill="#8b5cf6"/>
      <rect x="13" y="6" width="2" height="3" fill="#8b5cf6"/>
      <rect x="4" y="11" width="3" height="3" fill="#8b5cf6"/>
      <rect x="9" y="11" width="3" height="3" fill="#8b5cf6"/>
      <rect x="7" y="12" width="2" height="1" fill="#8b5cf6"/>
    </svg>
  ),
  book: (
    <svg className="icn" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="2" y="2" width="5" height="12" fill="#c9b6ff"/>
      <rect x="7" y="2" width="1" height="12" fill="#8b5cf6"/>
      <rect x="8" y="2" width="6" height="12" fill="#ffd1e8"/>
      <rect x="2" y="2" width="1" height="12" fill="#8b5cf6"/>
      <rect x="9" y="4" width="4" height="1" fill="#ff8fcf"/>
      <rect x="9" y="6" width="4" height="1" fill="#ff8fcf"/>
      <rect x="9" y="8" width="3" height="1" fill="#ff8fcf"/>
    </svg>
  ),
}

interface PixelAvatarProps {
  kind?: AvatarKind
  size?: number
  style?: React.CSSProperties
}

export default function PixelAvatar({ kind = 'player', size = 64, style }: PixelAvatarProps) {
  const avatar = AVATARS[kind] ?? AVATARS.player
  return (
    <div style={{ width: size, height: size, imageRendering: 'pixelated', ...style }}>
      {avatar}
    </div>
  )
}
