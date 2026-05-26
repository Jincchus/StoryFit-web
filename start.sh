#!/bin/sh
set -e
echo "CREATE EXTENSION IF NOT EXISTS vector;" | node node_modules/prisma/build/index.js db execute --stdin
node node_modules/prisma/build/index.js db push --skip-generate
echo 'CREATE INDEX IF NOT EXISTS "memory_embedding_hnsw" ON "Memory" USING hnsw (embedding vector_cosine_ops);' | node node_modules/prisma/build/index.js db execute --stdin
node server.js
