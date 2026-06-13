# DB 스키마 점검 (2026-06-13)

Prisma 스키마 17개 모델 전체를 실제 코드 사용처와 대조한 결과.

## 처리 완료

1. **regenerate 파라미터 불일치 수정** (`app/api/conversations/[id]/regenerate/route.ts`)
   - 기존: `gen.temperature/frequencyPenalty/safetyLevel`을 `character.*`에서, `maxOutputTokens/thinkingBudget`은 `conv.*`에서 가져와 chat/continue와 다른 값으로 응답이 생성됨.
   - 수정: chat/continue와 동일하게 `conv.temperature/frequencyPenalty/safetyLevel`로 통일. revision 단계의 `Math.min(character.temperature ?? conv.temperature ?? 0.9, 0.75)`도 conv 폴백 추가.

2. **`Conversation.summary` 컬럼 제거**
   - 코드 전체에서 읽기/쓰기 없음 (요약은 `Memory.summary`로 대체된 레거시 컬럼).
   - `prisma/schema.prisma`에서 필드 제거 후 `db push` 적용.

3. **Lorebook scope/scopeId 제거**
   - `scope`/`scopeId` 필드 삭제. `collectionId String?` FK 추가 (`CharacterCollection`에 `lorebooks Lorebook[]` 역참조, `onDelete: Cascade`).
   - conversation 범위는 기존 `conversationId` FK, collection 범위는 신규 `collectionId` FK로 표현. `@@index([scope, scopeId])` → `@@index([collectionId])`.
   - `matchLorebook`은 scope를 쓰지 않았으므로 `LorebookEntry` 타입에서도 `scope`/`scopeId` 제거, 호출부의 `.map(l => ({...l, scope: ...}))` 제거.
   - 컬렉션/캐릭터 삭제 트랜잭션에서 collection-scope 로어북 수동 `deleteMany` 제거 — `collectionId` cascade로 대체.
   - 영향 파일: `app/api/lorebooks/*`, `app/api/collections/*`, `app/api/characters/[id]/*`, `app/api/conversations/route.ts`, `app/api/conversations/[id]/{chat,regenerate,continue}/route.ts`, `app/(main)/conversations/[id]/_hooks/useLorebook.ts`, `app/(whif)/whif/universes/[id]/page.tsx`, `types/index.ts`, `lib/systemPrompt.test.ts`.

4. **`Lorebook.characterId` 제거**
   - UI에 character-scope 로어북 생성 경로가 없어 항상 null이었음. 필드/관계(`Character.lorebooks`) 삭제.
   - `app/api/lorebooks/route.ts`의 `characterId` 쿼리·생성 파라미터, `import/route.ts`의 `characterId: null`, 캐릭터/컬렉션 삭제 트랜잭션의 `lorebook.updateMany(characterId→null)`, 캐릭터 복제 시 character-scope 로어북 복사 블록(항상 빈 결과) 제거.

## 남은 정리 후보 (보류)

- **`openingMessage` (단수) vs `openingMessages` (Json 배열)**: 여러 곳에서 `openingMessages?.[0]?.content || openingMessage` 폴백 반복. 장기적으로 배열 하나로 통합 가능.
- **onDelete 미지정**: `Character.creator`, `Conversation.user`, `CharacterCollection.user`. 현재 회원 탈퇴 기능이 없어 문제 없으나, 추가 시 Cascade/SetNull 정리 필요.
