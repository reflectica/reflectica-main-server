const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require("openai");

// Create clients outside request handlers to reuse connections
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pineconeClient = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT,
});

// Create a simple in-memory cache
const queryCache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

const upsertChunksWithEmbeddings = async (userID, chunksWithEmbeddings) => {
  const indexName = 'user1-summary';
  const index = pineconeClient.index(indexName);
  
  // Optimize batch size - test different values (32, 64, 100)
  const batch_size = 64;
  
  // Process in parallel batches for faster insertion
  const batches = [];
  for (let i = 0; i < chunksWithEmbeddings.length; i += batch_size) {
    const batch = chunksWithEmbeddings.slice(i, i + batch_size);
    batches.push(index.upsert(batch));
  }
  
  await Promise.all(batches);
  console.log(`Upserted ${chunksWithEmbeddings.length} vectors in parallel batches`);
};

// Optimized search function
const searchDocs = async (query, userId, limit = 5) => {
  // Generate cache key
  const cacheKey = `${userId}-${query}-${limit}`;
  
  // Check cache first
  if (queryCache.has(cacheKey)) {
    const { data, timestamp } = queryCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log("Cache hit! Returning cached results");
      return data;
    }
    // Cache expired, remove it
    queryCache.delete(cacheKey);
  }
  
  const indexName = 'user1-summary';
  const index = pineconeClient.index(indexName);
  
  // Get embeddings for the query
  const start = Date.now();
  const embedding = await getQueryEmbedding(query);
  console.log(`Embedding generation time: ${Date.now() - start}ms`);
  
  // Use metadata filtering to narrow search scope
  const searchStart = Date.now();
  const results = await index.query({
    vector: embedding,
    topK: limit,
    includeMetadata: true,
    includeValues: false, // Don't include vector values to reduce payload size
    filter: { userId: userId }, // Add metadata filter if applicable
  });
  console.log(`Pinecone query time: ${Date.now() - searchStart}ms`);
  
  // Store in cache
  queryCache.set(cacheKey, { 
    data: results, 
    timestamp: Date.now() 
  });
  
  return results;
};

// Helper function to get query embedding
const getQueryEmbedding = async (text) => {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small", // Using smaller model for faster performance
    input: text
  });
  return response.data[0].embedding;
};

// Clear old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, { timestamp }] of queryCache.entries()) {
    if (now - timestamp > CACHE_TTL) {
      queryCache.delete(key);
    }
  }
}, 1000 * 60 * 10); // Clean every 10 minutes

module.exports = {
  upsertChunksWithEmbeddings,
  searchDocs
};