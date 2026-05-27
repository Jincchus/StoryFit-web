const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
try {
  const envPath = path.join(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = val;
      }
    });
  }
  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace('@db:5432', '@127.0.0.1:5433');
  }
} catch (e) {
  console.warn('Failed to load .env file:', e.message);
}

const prisma = new PrismaClient();

async function runTest() {
  console.log('--- STARTING MEMORY RETRIEVAL INTEGRATION TEST ---');
  
  const testSuffix = Date.now().toString();
  const email = `test_user_${testSuffix}@example.com`;
  
  let user, character, conversation;
  let m1, m2, m3;

  try {
    // 1. Create dummy entities
    console.log('Creating test user, character, and conversation...');
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'dummy_hash',
      }
    });

    character = await prisma.character.create({
      data: {
        name: 'Test NPC',
        additionalInfo: 'Settings details',
      }
    });

    conversation = await prisma.conversation.create({
      data: {
        title: 'Test Chat Room',
        userId: user.id,
        mode: 'roleplay',
      }
    });

    console.log('Creating 3 test memories with different timestamps...');
    // m1: Oldest (100 seconds ago) - content: clothing change
    m1 = await prisma.memory.create({
      data: {
        conversationId: conversation.id,
        summary: '1. 유저가 드레스를 벗고 실내복으로 갈아입음.',
        messageRangeStart: 'msg1',
        messageRangeEnd: 'msg2',
        createdAt: new Date(Date.now() - 100000),
      }
    });

    // m2: Middle (50 seconds ago) - content: book discussion
    m2 = await prisma.memory.create({
      data: {
        conversationId: conversation.id,
        summary: '2. 유저와 캐릭터가 도서관 책들에 관해 대화함.',
        messageRangeStart: 'msg3',
        messageRangeEnd: 'msg4',
        createdAt: new Date(Date.now() - 50000),
      }
    });

    // m3: Newest (now) - content: drinking tea
    m3 = await prisma.memory.create({
      data: {
        conversationId: conversation.id,
        summary: '3. 캐릭터가 홍차를 타서 유저에게 대접함.',
        messageRangeStart: 'msg5',
        messageRangeEnd: 'msg6',
        createdAt: new Date(),
      }
    });

    // 2. Inject dummy embeddings using raw SQL (since embedding is pgvector)
    console.log('Injecting dummy vector embeddings (768 dimensions)...');
    
    // Helper to set vector
    async function setVector(id, idxToSet) {
      const arr = Array(768).fill(0.05); // low base values
      arr[idxToSet] = 0.95; // high dimension match
      const vectorStr = `[${arr.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "Memory" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        id
      );
    }

    await setVector(m1.id, 0);  // dimension 0: clothing
    await setVector(m2.id, 10); // dimension 10: books
    await setVector(m3.id, 20); // dimension 20: tea

    console.log('Embeddings successfully set.');

    // 3. Perform Mock retrieveRelevantMemories logic
    // Let's say the user queries about "books" (dimension 10)
    console.log('\nSimulating query: "도서관 책들" (semantic match with Memory 2)...');
    const queryEmbedding = Array(768).fill(0.05);
    queryEmbedding[10] = 0.90; // matches book embedding
    const queryVector = `[${queryEmbedding.join(',')}]`;

    // Retrieve recent N memories (e.g. top 2)
    const recentMemories = await prisma.memory.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    console.log(`- Fetched ${recentMemories.length} recent memories (expecting Memory 3 and Memory 2)`);

    // Retrieve similar memories
    const relevantMemories = await prisma.$queryRawUnsafe(
      `SELECT id, summary, "createdAt" FROM "Memory"
       WHERE "conversationId" = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      conversation.id,
      queryVector,
      4, // topK limit
    );
    console.log(`- Fetched ${relevantMemories.length} similar memories (ordered by similarity: expecting 2, then others)`);

    // Combine and de-duplicate
    const combinedMap = new Map();
    // Include recent ones first
    for (const m of recentMemories) {
      combinedMap.set(m.id, { id: m.id, summary: m.summary, createdAt: m.createdAt });
    }
    // Fill up to topK with similar ones
    const topK = 3;
    for (const m of relevantMemories) {
      if (combinedMap.size >= topK) break;
      if (!combinedMap.has(m.id)) {
        combinedMap.set(m.id, m);
      }
    }

    // Sort chronologically (createdAt ascending)
    const sorted = Array.from(combinedMap.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    console.log('\n=== CHRONOLOGICALLY SORTED OUTPUT (OLDEST FIRST) ===');
    sorted.forEach((m, idx) => {
      console.log(`${idx + 1}. [Created: ${m.createdAt.toISOString()}] ${m.summary}`);
    });

    // 4. Assert correctness
    console.log('\n--- VERIFYING CORRECTNESS ---');
    const ids = sorted.map(m => m.id);
    const sortedCorrectly = sorted[0].id === m1.id && sorted[1].id === m2.id && sorted[2].id === m3.id;
    
    console.log('Includes Memory 1 (Clothing, similar/oldest):', ids.includes(m1.id) ? 'YES (PASS)' : 'NO (FAIL)');
    console.log('Includes Memory 2 (Books, recent/similar):', ids.includes(m2.id) ? 'YES (PASS)' : 'NO (FAIL)');
    console.log('Includes Memory 3 (Tea, recent/newest):', ids.includes(m3.id) ? 'YES (PASS)' : 'NO (FAIL)');
    console.log('Sorted in chronological order (m1 -> m2 -> m3):', sortedCorrectly ? 'YES (PASS)' : 'NO (FAIL)');

    if (sortedCorrectly && ids.length === 3) {
      console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    } else {
      console.error('\n❌ TEST FAILURE: Output did not match expectations.');
    }

  } catch (err) {
    console.error('Error during test execution:', err);
  } finally {
    // 5. Clean up database records
    console.log('\nCleaning up created test records...');
    try {
      if (conversation) {
        await prisma.conversation.delete({ where: { id: conversation.id } });
        console.log('- Deleted conversation');
      }
      if (character) {
        await prisma.character.delete({ where: { id: character.id } });
        console.log('- Deleted character');
      }
      if (user) {
        await prisma.user.delete({ where: { id: user.id } });
        console.log('- Deleted user');
      }
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr.message);
    }
    await prisma.$disconnect();
  }
}

runTest();
