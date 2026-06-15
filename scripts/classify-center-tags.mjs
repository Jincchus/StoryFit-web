// 센터 태그를 1차 자동 분류한다. '확실한' 키워드만 카테고리를 지정하고,
// 애매하거나 사전에 없는 태그는 미설정(category=null) 그대로 둔다.
// 이미 카테고리가 지정된 태그는 건드리지 않는다.
//
// 사용법:
//   node scripts/classify-center-tags.mjs           # 미리보기(dry-run)
//   node scripts/classify-center-tags.mjs --apply    # 실제 반영
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// 카테고리별 '확실한' 태그(정확히 일치, 소문자·공백 무시). 애매한 건 일부러 제외 → 미설정으로 남김.
const RULES = {
  '장르': ['로맨스','로멘스','판타지','무협','sf','에스에프','미스터리','스릴러','호러','공포','느와르','누아르','코믹','코미디','개그','액션','드라마','일상','로판','현판','bl','gl','백합','하렘','역하렘','성인','19금','청불','bdsm','성애','에로','복수극','추리','모험','학원물','일상물','성장물','판타지로맨스','로맨스판타지','동양풍','서양풍','시대극'],
  '세계관': ['아포칼립스','좀비','좀비물','디스토피아','중세','근미래','미래','사이버펑크','현대','현대물','조선','조선시대','무림','강호','이세계','던전','학원','학교','회사','군대','감옥','교도소','우주','종말','전쟁','재벌','황실','궁중','마피아','조폭','조직물','조직','헌터물','게이트','아카데미','빙의','환생','회귀','차원이동','후궁','황궁','왕궁','마계','마왕성','학원물'],
  '직업': ['군인','의사','경찰','검사','변호사','교사','선생님','아이돌','배우','가수','작가','기자','요리사','셰프','ceo','회장','사장','대표','비서','형사','마법사','기사','용병','헌터','암살자','집사','메이드','학생','교수','간호사','경호원','보디가드','깡패','건달','사냥꾼','모험가','성기사','황제','왕자','공주','귀족','가정교사','조종사','파일럿','탐정','스파이','요원','용사'],
  '남자주인공': ['냉미남','다정남','집착남','능글남','까칠남','순정남','상남자','연하남','연상남','대형견남','차도남','황태자','재벌남','아저씨','도련님','폭군남','얀데레남','직진남','나쁜남자','츤데레남','광공','떡대남','시크남','까도남','훈남','꽃미남','미중년','중년남','상남자'],
  '여자주인공': ['청순녀','백치미','햇살녀','까칠녀','당당녀','순정녀','얀데레녀','동안녀','연하녀','누나','악녀','미소녀','새침녀','막내','여주'],
  '성격': ['츤데레','얀데레','쿨','다정','무뚝뚝','냉정','집착','능글','순수','천진','까칠','소심','활발','내향적','외향적','다혈질','시크','무심','대형견','멍멍이','직설적','도도','차분','사차원','4차원','능청','새디스트','마조히스트','순둥이'],
  '관계': ['첫사랑','소꿉친구','계약연애','계약결혼','정략결혼','사내연애','상사부하','선후배','사제','형제','남매','라이벌','짝사랑','삼각관계','금지된사랑','연상연하','동거','원나잇','재회','전남친','전여친','친구','운명','신분차이','신분차','주종관계','주종','동료','부부','약혼','약혼자','연인','썸','비밀연애','불륜','적과의동침'],
  '분위기': ['애틋함','애틋','애절','절절','설렘','설렘주의','달달','달달함','달콤','달콤살벌','살벌','새콤달콤','힐링','잔잔','잔잔함','두근','두근두근','심쿵','심장폭행','따뜻','따뜻함','훈훈','몽글몽글','청량','로맨틱','다크','어두움','음울','우울','긴장감','긴장','스릴','오싹','섬뜩','격정','격정적','농밀','자극적','코지','평화','진지','애매모호','몽환적','몽환','감성','감성적','잔혹','병맛','코믹'],
}

const CATEGORIES_KEY = 'center_tag_categories'
async function ensureCategory(name) {
  const cfg = await prisma.globalConfig.findUnique({ where: { key: CATEGORIES_KEY } })
  if (!cfg) return // 설정 없음 → 앱 기본 카테고리(분위기 포함) 사용
  let cats
  try { cats = JSON.parse(cfg.value) } catch { return }
  if (Array.isArray(cats) && !cats.includes(name)) {
    cats.push(name)
    await prisma.globalConfig.update({ where: { key: CATEGORIES_KEY }, data: { value: JSON.stringify(cats) } })
    console.log(`카테고리 '${name}' 추가됨`)
  }
}

const lookup = new Map()
for (const [cat, names] of Object.entries(RULES)) {
  for (const n of names) lookup.set(n.trim().toLowerCase(), cat)
}

async function main() {
  if (APPLY) await ensureCategory('분위기')
  const tags = await prisma.centerTag.findMany({ orderBy: { name: 'asc' } })
  const unset = tags.filter(t => !t.category)

  const byCat = {}
  const leftover = []
  for (const t of unset) {
    const cat = lookup.get(t.name.trim().toLowerCase())
    if (cat) { (byCat[cat] ??= []).push(t); }
    else leftover.push(t.name)
  }

  let assigned = 0
  for (const [cat, list] of Object.entries(byCat)) {
    console.log(`\n[${cat}] ${list.length}개`)
    console.log('  ' + list.map(t => t.name).join(', '))
    if (APPLY) {
      await prisma.centerTag.updateMany({ where: { id: { in: list.map(t => t.id) } }, data: { category: cat } })
    }
    assigned += list.length
  }

  console.log(`\n=== ${APPLY ? '완료' : '미리보기 (--apply로 반영)'} ===`)
  console.log(`전체 ${tags.length}개 · 미설정 ${unset.length}개 중 → 분류 ${assigned}개, 미설정 유지 ${leftover.length}개`)
  console.log(`\n[미설정으로 남는 태그 ${leftover.length}개]`)
  console.log(leftover.join(', '))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
