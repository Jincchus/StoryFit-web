import puppeteer, { Browser, Page } from 'puppeteer-core'
import { rm } from 'fs/promises'
import path from 'path'

// crack(crack.wrtn.ai)는 Cloudflare 뒤에 있어 서버 측 plain fetch는 리셋된다(리버스
// 엔지니어링 실측 확인). 멜팅(meltingBrowser.ts)과 동일하게, 로그인 세션을 디스크
// (userDataDir)에 저장해두는 영속 브라우저 프로필을 두고 프로세스 전역에 단일 브라우저
// 인스턴스를 유지하며 매 작업은 새 탭(page)만 열어 사용한다.
const PROFILE_DIR = process.env.CRACK_PROFILE_DIR || '/app/browser-profiles/crack'

let browserPromise: Promise<Browser> | null = null

// 컨테이너가 재시작되면 이전 프로세스가 남긴 SingletonLock 등이 프로필 디렉터리(영속 볼륨)에
// 그대로 남아, Chromium이 "다른 컴퓨터의 다른 프로세스가 사용 중"이라고 오판해 실행 자체를
// 거부한다(이전 프로세스는 이미 죽었으므로 안전하게 지워도 된다). 프로세스 내 단일 인스턴스는
// browserPromise로 보장하므로, 매 launch 전에 이전 잠금 흔적만 정리한다.
async function clearStaleLock(): Promise<void> {
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie']
  await Promise.all(lockFiles.map(f => rm(path.join(PROFILE_DIR, f), { force: true }).catch(() => {})))
}

async function launch(): Promise<Browser> {
  await clearStaleLock()
  return puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    headless: true,
    userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
}

export async function getCrackBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = launch()
  let browser = await browserPromise
  if (!browser.isConnected()) {
    browserPromise = launch()
    browser = await browserPromise
  }
  return browser
}

export async function withCrackPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getCrackBrowser()
  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5' })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')
    return await fn(page)
  } finally {
    await page.close().catch(() => {})
  }
}
