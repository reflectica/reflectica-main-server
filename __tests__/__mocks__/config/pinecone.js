// Mock Pinecone configuration for testing
module.exports = {
  upsertChunksWithEmbeddings: jest.fn(),
  searchDocs: jest.fn()
};