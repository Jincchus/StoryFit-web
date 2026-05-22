export async function generateEmbedding(text: string): Promise<number[]> {
  if (process.env.GEMINI_PROVIDER === 'vertex') {
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const token = await auth.getAccessToken()
    const project = process.env.GOOGLE_CLOUD_PROJECT!
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-004:predict`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ content: text, task_type: 'RETRIEVAL_DOCUMENT' }] }),
    })
    const data = await res.json()
    return data.predictions[0].embeddings.values
  }
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(text)
  return Array.from(result.embedding.values)
}
