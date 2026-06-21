# 센터 가져오기 — 갤러리/추가 이미지 누락 보강

작성일 2026-06-21. Tikita 일러 누락 제보에서 출발해 전 센터를 점검한 결과와 할 일 정리.

## 1. 점검 결과 (실데이터 확인)

각 센터 원본에는 avatar/cover 외에 **갤러리(여러 장)** 가 있는데, import가 1장만 잡고 나머지를 버리고 있었다.

| 센터 | 소스 추가 이미지 | 잠금 여부 | 우리 수집 | 상태 |
|------|------|------|------|------|
| tikita | 인라인 일러 2장 + 갤러리 27장 | 인라인=공개, 갤러리=**잠금**(Tik·턴) | 인라인+갤러리(preview) | ✅ 수정·백필 완료 |
| **rofan** | 갤러리 풀이미지 여러 장 + blur(잠금 미리보기) | 풀이미지=**공개**(HTTP 200), blur=잠금 | char_image 1장만 | ⚠️ 미수정 |
| **melting** | `json.images[]`(5장) + covers[] | 공개(추정, 세션쿠키로 접근) | cover 1장만 | ⚠️ 미수정 |
| chub | `hasGallery=true` 캐릭터는 갤러리 보유 | 미확인 | avatar 1장 | 🟡 부분(후순위) |
| loveydovey | chatbotImageUrl 1장 | - | 1장 | ✅ 소스가 1장뿐 |
| babechat | main/profile/thumb(동일 이미지 변형) | - | 사용 | ✅ 갤러리 없음 |
| zeta | profile imageUrl 1장 | - | 1장 | 🟢 단일 |
| whif | relatedImages | - | capture.ts가 처리 | ✅ 원래 정상 |

**핵심 결론:** 누락의 주원인은 **잠금이 아니라 "import가 갤러리를 안 가져온 것"**.
rofan·melting 풀이미지는 공개라 제대로 고치면 **원본 그대로 전부 수집 가능**. 잠금은 tikita 갤러리에만 해당.

## 2. 진행 현황 (2026-06-21 기준)

| 항목 | 코드 | 커밋·푸시 | 백필 | 비고 |
|------|------|------|------|------|
| tikita 본체(인라인+갤러리+메타) | ✅ | ✅ `c3d503c`/부모 `53fb7ad` | ✅ 4개 카드 | **완료·검증됨** |
| tikita 표시 보정(D, 잠금/블러 숨김) | ✅ | ❌ 미커밋 | - | 미커밋분에 포함 |
| rofan(A 수집 + C 표시) | ✅ | ❌ 미커밋 | ❌ | 코드만 완료, 타입체크 0에러 |
| melting(B 수집 + C 표시) | ✅ | ❌ 미커밋 | ❌ | 코드만 완료, 타입체크 0에러 |
| chub(F) | ❌ | - | - | 미착수 |

**미커밋 파일(5):** `lib/import/rofan.ts`, `lib/import/capture.ts`,
`app/(rofan)/.../[id]/page.tsx`, `app/(melting)/.../[id]/page.tsx`,
`app/(tikita)/.../[id]/page.tsx`

**남은 일:** rofan·melting 기존 카드 백필(E) → 미커밋 5파일 커밋·푸시 → 재배포 → (선택) chub(F).

## 3. 할 일 상세

### A. rofan 공개 갤러리 수집 — ✅ 코드 완료(미커밋)
- `lib/import/rofan.ts`: 봇 데이터에서 갤러리 이미지 추출 → **공개(비-blur, 비잠금)만** `relatedImages`에 저장.
- blur/잠금(`/blur/` 경로, unlock 대상) 이미지는 제외.

### B. melting 공개 갤러리 수집 — ✅ 코드 완료(미커밋)
- `lib/import/capture.ts`(멜팅 분기): `data.images[]`에서 `isPublic` 공개분만 `sortOrder` 정렬해 `image-gen.melting.chat/public_images/{imagePath}?s=lg` URL로 변환 → `relatedImages`. 대표/커버 중복 제거.

### C. 상세 페이지 표시 — ✅ 코드 완료(미커밋)
- rofan·melting 상세 페이지에 `relatedImages` 갤러리(3열 그리드) 렌더 추가.
- 저장 게이트는 이미 완화됨(`relatedImages: c.relatedImages ?? []`, 전 센터 적용).

### D. tikita 표시 — 잠금/블러 숨김 (요청) — ✅ 코드 완료(미커밋)
- tikita 갤러리는 전부 잠금이라 우리 쪽에서 원본을 못 봄 → **블러/잠금 이미지는 화면에서 숨김**(깔끔).
- `app/(tikita)/tikita/story/[id]/page.tsx`: 갤러리 렌더를 `gallery.filter(g => !g.locked)`로 변경. 결과적으로 tikita는 인라인 일러만 표시(잠금 갤러리 섹션은 비표시).
- 데이터(tikitaMeta.gallery)는 보존하되 표시만 필터.

### E. 기존 등록 카드 백필 — ⬜ 미진행
- rofan·melting 기존 컬렉션을 재조회해 `relatedImages` 채움(tikita 백필 스크립트와 동일 방식, 백업 후 컨테이너에서 실행).

### F. (후순위) chub 갤러리 — ⬜ 미착수
- `hasGallery=true`인 chub 캐릭터의 갤러리 API 조사 후 수집. 이번 범위 밖, 별도 처리.

## 4. 배포 — ⬜ 미진행
- 코드: 서브모듈 main → 부모 master 2단계 푸시. 서버 재배포 필요(표시분).
- 데이터: 백필은 운영 DB 직접(백업 선행). 스키마 변경 없음(relatedImages 기존 컬럼).

---

## 5. 전 센터 JSON 전체 필드 감사 (별도·후속 작업) — ⬜ 미착수

⚠️ **위 1~4의 센터 점검은 "이미지 한정"이었다.** tikita만 JSON 전체 필드를 1:1 대조했고
(나이·제작자·원작·배경모드·갤러리·에피소드 등 비-이미지 누락까지 포착), 나머지 센터는
이미지 필드만 grep으로 확인했다. 데이터 누락 관점에선 불완전하므로 별도 감사가 필요하다.

### 목표
각 센터 원본 JSON의 **모든 필드 vs 우리가 캡처·저장·표시하는 것**을 대조해
누락 필드 지도(표)를 만든다. 이미지뿐 아니라 캐릭터 메타(나이·보이스·성격 분리),
로어북/세계관, 대체 인사말(alternate greetings), 페르소나, 챕터/에피소드,
제작자/원작/인기지표 등 전부 포함.

### 순서 (순차 감사)
1. **tikita 재검증** — 이미 손댄 항목이 실제로 빠짐없이 들어왔는지 필드 단위로 재확인(선행).
2. rofan
3. melting
4. chub
5. zeta
6. loveydovey
7. babechat

각 센터마다: 원본 JSON 덤프 → 필드 목록화 → `우리 캡처/저장/표시` 매핑 →
`있음/누락/부분` 판정표 작성 → 우선순위 정해 보강.

### 진행 메모
- 다음 단계: **tikita 필드 하나씩 함께 데이터 검증**(사용자와 같이) 후 나머지 센터로 확장.

---

## 6. tikita 필드 검증 — 체크리스트 (2026-06-21 업데이트)

- [x] **1. 제작자 라인 완전 제거** — creditLine / creatorNickname 화면에서 제거 완료.
- [x] **2. intro_html 소개글을 상세 페이지에 표시** — 섹션별 체크박스·편집·저장 UI 구현. 섹션 없으면 전체 텍스트 + 체크박스.
- [x] **3a. PERSONA/페르소나 → 페르소나 기본값** — WhifPersonaModal defaultSettings 연결 완료.
- [x] **3b. 세계관 → scenarioDescription 교체** — 상세 페이지에서 섹션별 체크박스로 선택, 저장 후 대화 생성 시 체크된 섹션만 조합. `worldSectionKeys`·`editedSections` tikitaMeta에 저장.
- [x] **3c. 섹션별 이미지 표시** — parseIntroSectionImages()로 섹션별 이미지 추출, 섹션 카드 내 인라인 표시. HEADQUARTERS·BOSS OFFICE 등 이미지 있는 섹션에 자동 반영. 15개 카드 백필 완료.
- [x] **4. detail_md 표시** — tikitaMeta.detailMd로 분리 저장, 상세 페이지 "상세 안내" 섹션에 별도 표시. 15개 카드 백필 완료.
- [x] **5. 표시 제거 항목** — is_adult 배지, creator_notes, creator_nickname, is_cinema, like_count, chat_count, monetization_mode 제거 완료.
- [x] **6. 인라인 일러 소스 수정** — illustrations를 meta.inlineIllustrations에서 직접 읽도록 변경 (캐릭터 배정 문제 우회). 기존 카드 재수집 불필요.
- [x] **7. 분류·태그 현행 유지**.
- [x] **8. 에피소드 제목 표시** — 상세 페이지 에피소드 섹션 추가 완료.
- [x] **9. 모든 캐릭터 설정 표시** — 등장인물 아코디언으로 캐릭터별 설정 보기 구현 완료.

### introSections 파싱 결과 (2026-06-21 백필 완료)
| 스토리 | 주요 섹션 | PERSONA | 세계관 키 |
|--------|-----------|---------|-----------|
| 서재혁·진태성 | PERSONA, ORGANIZATION, RULE, HEADQUARTERS, MISSION, 기본정보, 외모, 성격 | PERSONA | ORGANIZATION+RULE |
| 몸 오면 맘도 오겠지 | 페르소나, 세계관, 서대웅 등 캐릭터명, 경고, 난이도 | 페르소나 | 세계관 |
| 닥치고 이건 게임이야 | 서인혁 등 캐릭터명, 세계관, 프롤로그, 수록곡 | ❌ | 세계관 |
| 소꿉친구 사용설명서 | STORY INTRO, OPENING, 차유준 등 캐릭터명 | ❌ | STORY INTRO? |
| 사제 타락기·부태훈 | 섹션 없음 | ❌ | ❌ |

> **세계관 추출 우선순위**: ORGANIZATION → RULE → 세계관 → STORY INTRO → (없으면 tagline만)

## 7. 남은 작업 목록 (2026-06-21 업데이트)

### 즉시 필요
- ~~tikita 3c~~ ✅ 완료
- ~~tikita 6~~ ✅ 완료
- ~~배포~~ ✅ 2026-06-21 배포 완료

### 이미지 백필 (미진행)
- [ ] rofan 기존 카드 relatedImages 백필
- [ ] melting 기존 카드 relatedImages 백필

### 후순위
- [ ] chub 갤러리 수집 (F)
- [ ] 홈화면 디자인 brainstorming (중단됨)
