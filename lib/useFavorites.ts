import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type FavType = 'collection' | 'character'

export function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.get('/api/favorites')
      .then((list: { itemType: string; itemId: string }[]) => setFavs(new Set(list.map(f => `${f.itemType}:${f.itemId}`))))
      .catch(() => {})
  }, [])

  const isFav = (type: FavType, id: string) => favs.has(`${type}:${id}`)

  const toggleFav = (type: FavType, id: string) => {
    const key = `${type}:${id}`
    const has = favs.has(key)
    setFavs(prev => {
      const next = new Set(prev)
      if (has) next.delete(key); else next.add(key)
      return next
    })
    const req = has
      ? api.delete('/api/favorites', { itemType: type, itemId: id })
      : api.post('/api/favorites', { itemType: type, itemId: id })
    req.catch(() => {
      setFavs(prev => {
        const next = new Set(prev)
        if (has) next.add(key); else next.delete(key)
        return next
      })
    })
  }

  return { isFav, toggleFav }
}
