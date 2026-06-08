import puppeteer, { Browser, Page } from 'puppeteer-core'

// 멜팅(melting.chat) 세션 쿠키는 약 30분마다 만료되어, 매번 사용자가 직접 복사해 갱신해야 했다.
// 로그인 상태를 디스크(userDataDir)에 저장해두는 영속 브라우저 프로필을 두면, 가져오기를
// 시도할 때마다(=사용자 행동에 결부된 활동만으로) 세션이 자연스럽게 재사용·연장될 여지가 생긴다.
// (사용자 행동과 무관한 자동 주기 방문은 계정이 자동화로 탐지·제재될 위험이 있어 의도적으로 두지 않는다.)
// 동일 프로필을 여러 Chromium 프로세스가 동시에 열면 잠금 충돌이 나므로, 프로세스 전역에
// 단일 브라우저 인스턴스를 유지하고 매 작업은 새 탭(page)만 열어 사용한다.
const PROFILE_DIR = process.env.MELTING_PROFILE_DIR || '/app/browser-profiles/melting'

let browserPromise: Promise<Browser> | null = null

async function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    headless: true,
    userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
}

export async function getMeltingBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = launch()
  let browser = await browserPromise
  if (!browser.isConnected()) {
    browserPromise = launch()
    browser = await browserPromise
  }
  return browser
}

export async function withMeltingPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getMeltingBrowser()
  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.5' })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')
    return await fn(page)
  } finally {
    await page.close().catch(() => {})
  }
}
