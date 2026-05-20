import { SignJWT, jwtVerify } from 'jose'

const accessSecret = new TextEncoder().encode(process.env.JWT_SECRET!)
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)

export async function signAccessToken(userId: string, isAdmin = false) {
  return new SignJWT({ sub: userId, isAdmin })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(accessSecret)
}

export async function signRefreshToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(refreshSecret)
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessSecret)
  return payload.sub as string
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshSecret)
  return payload.sub as string
}

export function getTokenFromHeader(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
