const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const pineconeClient = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
  });

const upsertChunksWithEmbeddings = async (userID, chunksWithEmbeddings) => {
    const indexName = 'user1-summary'; 

  
    // Connect to the default index
    const index = pineconeClient.index(indexName);
    
    // Process everything in batches of 64
    const vectorLength = 1536; // The length of each embedding vector
    const batch_size = 1536;
    
    const upsertData = [];
    for (let i = 0; i < chunksWithEmbeddings.length; i += batch_size) {
      // Extract a batch of chunks with embeddings
      const data_batch = chunksWithEmbeddings.slice(i, i + batch_size);
    
      // Map over each chunk in the batch to create upsert objects
      for (const [batchIndex, chunk] of data_batch.entries()) {
        // Ensure each embedding is an array of the correct length
        if (!Array.isArray(chunk.embedding) || chunk.embedding.length !== vectorLength) {
          throw new Error(`Embedding at index ${batchIndex} does not have ${vectorLength} dimensions`);
        }
    
        upsertData.push({
          id: `${userID}-${i + batchIndex}`,
          values: chunk.embedding, // Use the embedding array
          metadata: {
            userID: userID, // Add userID in the metadata for each vector
            text: chunk.text // Include the text chunk as part of the metadata
          },
        });
      }
      console.log("Upserting vector:", upsertData);
      await index.upsert(upsertData); // Pass the array directly to upsert
      console.log("successfully upsert")
    }
  };
    
    
  const searchDocs = async (userID, query) => {
    const indexName = "user1-summary"; // Ensure this is the correct index name
    const pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT,
    });
    const index = pineconeClient.index(indexName);
  
    // Create the embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query,
      encoding_format: "float",
    });
    const queryEmbedding = embeddingResponse.data[0].embedding
    console.log(queryEmbedding)
    // Query the Pinecone index with the embedding
    const res = await index.query({
      vector: queryEmbedding,
      topK: 5,
      includeMetadata: true,
      filter: {
        userID: userID // Filter by userID in metadata
      }
    });
  
    // Define a similarity threshold
    const similarityThreshold = 0.8; // Adjust this value as needed
  
    // Parse the matches to extract metadata text, filtering by similarity
    const matchingTexts = res.matches
      .filter(match => match.metadata.userID === userID && match.score >= similarityThreshold)
      .map(match => match.metadata.text); // Extract only the text from metadata
    return matchingTexts;
  };

  module.exports = {
    upsertChunksWithEmbeddings,
    searchDocs,
  }