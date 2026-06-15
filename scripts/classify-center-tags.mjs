// 센터 태그 1차 분류 — 확실한 것만 카테고리 지정, 고유명사·코드·니치 태그는 노출 N(searchable=false).
// 애매하거나 목록에 없는 태그는 미설정·노출 그대로 둔다. 이미 카테고리가 있는 태그는 건드리지 않는다.
//
//   node scripts/classify-center-tags.mjs           # 미리보기(dry-run)
//   node scripts/classify-center-tags.mjs --apply    # 실제 반영
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const CATEGORY = {
  '장르': ['로맨스','로맨스판타지','느와르','개그','드라마','액션','미스터리','공포','무협','모험','스포츠','시트콤','러브코미디','로코','소년만화','일상물','잔잔물','달달물','힐링물','시대물','사극','다크판타지','중세판타지','현대판타지','정치물','회사물','재회물','캠퍼스물','판타지','선협','bl','gl','hl','nl','ntr','sm','bdsm','성인','19금','헤테로','여성향','rpg','시뮬레이션','배틀로얄','생존게임'],
  '세계관': ['아포칼립스','포스트아포칼립스','좀비','좀비아포칼립스','디스토피아','이세계','차원이동','사이버펑크','중세시대','조선시대','마피아','조폭','조직','야쿠자','게임','학교','학원','회사','오피스','무인도','전쟁','오메가버스','센티넬버스','네임버스','가이드버스','센티넬','사후세계','동양풍','서양풍','중국풍','빙의','환생','전생','마법','군대/군부물','농촌생활','재혼가정'],
  '직업': ['간호사','의사','소아과의사','경찰','형사','강력계형사','경위','순경','교수','교사','선생님','담임','보건선생님','과외선생님','비서','사장','대표','회장','회사원','직장인','직장상사','군인','직업군인','경호원','경호','마법사','기사','기사단장','용병','암살자','킬러','집사','메이드','하녀','학생','대학생','모델','잡지모델','배우','남배우','가수','아이돌','연예인','스트리머','유튜버','bj','인플루언서','요원','스파이','파일럿','소방관','의원','약제사','무사','호위무사','퇴마사','신부','수녀','주교','대주교','교황','신관','마사지사','타투이스트','카페사장','도서관사서','가정부','av배우','운동선수','체대생','국가대표','조직원','개발자','사기꾼','보스','오너','팀장','이사','대위','공작','황제','황태자','황자','황녀','황후','여황제','왕','공주','귀족','성녀','노비','백정'],
  '남자주인공': ['냉미남','다정남','집착남','능글남','까칠남','직진남','재벌남','나쁜남자','츤데레남','철벽남','근육남','짐승남','너드남','에겐남','테토남','폭스남','클럽남','이혼남','후회남','짝사랑남','존댓말남','유부남','인기남','엄친아','도련님','아저씨','미남','하남자'],
  '여자주인공': ['악녀','미녀','미인','능글녀','절륜녀','병약여주','씹탑녀','여주','막내딸'],
  '성격': ['츤데레','얀데레','다정','무뚝뚝','냉정','집착','능글','순수','순진','까칠','소심','시크','무심','무감정','도도','능청','과묵','단호','음침','또라이','미친놈','사이코','소시오패스','사디스트','마조','멘헤라','광기','이중인격','이중성','포커페이스','능구렁이','쑥맥','모솔','호구','찐따','바보','울보','내숭','애교','수줍음','부끄러움','나른','덤덤','예민','신경질','엄격','젠틀맨','대형견','댕댕이','무성욕자','차가움','과보호','이기주의'],
  '관계': ['첫사랑','소꿉친구','계약연애','계약결혼','정략결혼','위장결혼','사내연애','비밀연애','상사','선후배','선배','후배','사제','스승','제자','형제','친형제','남매','의붓남매','의붓동생','의붓오빠','라이벌','짝사랑','외사랑','삼각관계','다각관계','연상연하','연상','연하','동거','룸메이트','원나잇','재회','재결합','전남친','전여친','친구','남사친','오빠친구','친구남친','운명','신분차이','주종','주종관계','갑을관계','동료','부부','약혼','약혼자','연인','썸','불륜','혐관','나이차','동갑','사촌','삼촌','친삼촌','조카','남편','아내','며느리','형부','새아빠','아빠','엄마','아들','가족','7남매','삼남매','쌍둥이','이란성쌍둥이','동생','여동생','남동생','누나','오빠','형','동생바보','시스콤','여동생바라기','슈가대디','대디','주인','주인님','펫','마스터','이웃','옆집','친오빠','친동생','친형','연애','권태기','장기연애','선결혼후연애','맞선','결혼','이혼','재혼','부성애','육아'],
  '분위기': ['애절','애증','애정','순애','피폐','약피폐','힐링','위험한힐링','자극적','고자극','고수위','스릴','고어','하드코어','하드모드','더티토크','감성','위험','무서움','섹시','퇴폐미','화려함','외로움','후회','상처','트라우마','애틋','설렘','달달'],
}

// 노출 N — 고유명사/특정 작품·세력명/코드/단발성 단어 (검색 태그로 부적합)
const HIDE = ['도쿄리벤저스','오란고교사교클럽','남궁세가','사천당가','화산파','무당파','천마신교','마교주','매화검존','백진사','정파','사방신','산신','성좌','방주','블랙호크스','부대az97','볼티팟','팬텀즈','디그레이더','캣시리즈','천재시리즈','디엣','태한대','nox','노란장판','소금파이','컨트','찌통','젠가','멈춰버린','상식개변','감각연동','언리밋모드','이상현상처리반','m','s','s급','합방','우결','번개','번따','오픈채팅','만남어플','어플만남','도네','백진사']

const lookup = new Map()
for (const [cat, names] of Object.entries(CATEGORY)) {
  for (const n of names) lookup.set(n.trim().toLowerCase(), cat)
}
const hideSet = new Set(HIDE.map(n => n.trim().toLowerCase()))

const CATEGORIES_KEY = 'center_tag_categories'
async function ensureCategory(name) {
  const cfg = await prisma.globalConfig.findUnique({ where: { key: CATEGORIES_KEY } })
  if (!cfg) return
  let cats
  try { cats = JSON.parse(cfg.value) } catch { return }
  if (Array.isArray(cats) && !cats.includes(name)) {
    cats.push(name)
    await prisma.globalConfig.update({ where: { key: CATEGORIES_KEY }, data: { value: JSON.stringify(cats) } })
    console.log(`카테고리 '${name}' 추가됨`)
  }
}

async function main() {
  if (APPLY) await ensureCategory('분위기')
  const tags = await prisma.centerTag.findMany({ orderBy: { name: 'asc' } })

  const byCat = {}
  const toHide = []
  const leftover = []
  for (const t of tags) {
    const key = t.name.trim().toLowerCase()
    if (hideSet.has(key)) { toHide.push(t); continue }
    if (t.category) continue // 이미 분류됨 — 미변경
    const cat = lookup.get(key)
    if (cat) (byCat[cat] ??= []).push(t)
    else leftover.push(t.name)
  }

  let assigned = 0
  for (const [cat, list] of Object.entries(byCat)) {
    console.log(`\n[${cat}] ${list.length}개`)
    console.log('  ' + list.map(t => t.name).join(', '))
    if (APPLY) await prisma.centerTag.updateMany({ where: { id: { in: list.map(t => t.id) } }, data: { category: cat } })
    assigned += list.length
  }

  console.log(`\n[노출 N 처리] ${toHide.length}개`)
  console.log('  ' + toHide.map(t => t.name).join(', '))
  if (APPLY && toHide.length) await prisma.centerTag.updateMany({ where: { id: { in: toHide.map(t => t.id) } }, data: { searchable: false } })

  console.log(`\n=== ${APPLY ? '완료' : '미리보기 (--apply로 반영)'} ===`)
  console.log(`전체 ${tags.length}개 · 분류 ${assigned}개 · 노출N ${toHide.length}개 · 미설정 유지 ${leftover.length}개`)
  console.log(`\n[미설정으로 남는 태그 ${leftover.length}개 — 직접 분류용]`)
  console.log(leftover.join(', '))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
