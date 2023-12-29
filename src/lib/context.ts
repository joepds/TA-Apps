import { Pinecone } from "@pinecone-database/pinecone";
import { getEmbeddings } from "./embeddings";

export async function getMatchesFromEmbeddings(
    embeddings: number[],
    fileKey: string
) {
    try {
        const client = new Pinecone({
            environment: process.env.PINECONE_ENVIRONMENT!,
            apiKey: process.env.PINECONE_API_KEY!,
        });
        const pineconeIndex = await client.index("ta-apps");
        const queryResponse = await pineconeIndex.query({
            vector: embeddings,
            filter: { fileKey: { $eq: fileKey } },
            topK: 5,
            includeMetadata: true,
        });

        return queryResponse.matches || [];
    } catch (error) {
        console.log("error querying embeddings", error);
        throw error;
    }
}

export async function getContext(query: string, fileKey: string) {
    const queryEmbeddings = await getEmbeddings(query);
    const matches = await getMatchesFromEmbeddings(queryEmbeddings, fileKey);

    const qualifyingDocs = matches.filter(
        (match) => match.score && match.score > 0.7
    );

    type Metadata = {
        text: string;
        pageNumber: number;
    };

    let docs = qualifyingDocs.map((match) => (match.metadata as Metadata).text);

    const selectedVectors = qualifyingDocs.map((match) => match.metadata);

    console.log("\nSelected Documents:");
    console.log(qualifyingDocs.map((match) => (match.metadata as Metadata).text).join("\n").substring(0, 3000));

    console.log("\nSelected Vectors:");

    qualifyingDocs.forEach((match, index) => {
        // Tampilkan seluruh objek hasil pencarian
        console.log(`Full Match ${index + 1}:`, match);
    });

}