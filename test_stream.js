const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '../../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
} catch (e) {
  console.warn('Failed to load .env file');
}

async function main() {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  });

  console.log('Testing streaming with thinkingBudget = -1 (dynamic thinking)...');
  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: '9.11과 9.9 중 어느 숫자가 더 큰가요? 그 이유를 단계별로 생각해서 설명해주세요.',
      config: {
        temperature: 0.7,
        thinkingConfig: {
          thinkingBudget: 2048,
        }
      }
    });

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      console.log('--- Chunk ---');
      console.log('chunk.text:', JSON.stringify(chunk.text));
      console.log('parts:', JSON.stringify(parts, null, 2));
    }
  } catch (error) {
    console.error('Error during streaming:', error);
  }
}

main();
