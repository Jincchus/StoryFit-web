import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// settings '표시 이름'(displayName)을 가져온다. 페르소나 캐릭터가 없을 때의 {{user}} 치환 기본값.
export function useDisplayName(): string {
  const [name, setName] = useState('나')
  useEffect(() => {
    api.get('/api/user/settings')
      .then((d: any) => { if (d?.displayName) setName(d.displayName) })
      .catch(() => {})
  }, [])
  return name
}
