import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import { downloadFromS3 } from "./s3-server";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import md5 from "md5";
import {
    Document,
    RecursiveCharacterTextSplitter,
} from "@pinecone-database/doc-splitter";
import { getEmbeddings } from "./embeddings";
import { convertToAscii } from "./utils";

export const getPineconeClient = () => {
    return new Pinecone({
        environment: process.env.PINECONE_ENVIRONMENT!,
        apiKey: process.env.PINECONE_API_KEY!,
    });
};

type PDFPage = {
    pageContent: string;
    metadata: {
        loc: { pageNumber: number; fileKey: string };
    };
};

export async function loadS3IntoPinecone(fileKey: string) {
    // 1. obtain the pdf -> downlaod and read from pdf
    console.log("downloading s3 into file system");
    const file_name = await downloadFromS3(fileKey);
    if (!file_name) throw new Error("could not download file from s3");
    const loader = new PDFLoader(file_name);
    console.log(loader, "loader");
    const pages = (await loader.load()) as PDFPage[];
    console.log(pages, "pages");

    // 2. split and segment the pdf
    const documents = await Promise.all(
        pages.map((page) => prepareDocument(page, fileKey))
    );

    // 3. vectorise and embed individual documents
    const vectors = await Promise.all(
        documents.flat().map((doc) => embedDocument(doc, fileKey))
    );

    // 4. upload to pinecone
    const client = await getPineconeClient();
    const pineconeIndex = await client.index("ta-apps");

    console.log("Inserting vectors into pinecone");
    const request = vectors.map((vector) => {
        const asciiFileKey = convertToAscii(fileKey);
        return {
            id: vector.id,
            values: vector.values,
            metadata: {
                ...vector.metadata,
                fileKey: asciiFileKey,
            },
        } as PineconeRecord;
    });
    await pineconeIndex.upsert(request);
    console.log("Inserted vectors into pinecone");

    return documents[0];
}

async function embedDocument(doc: Document, fileKey: string) {
    try {
        const embeddings = await getEmbeddings(doc.pageContent);
        const hash = md5(doc.pageContent);

        return {
            id: hash,
            values: embeddings,
            metadata: {
                text: doc.metadata.text,
                pageNumber: doc.metadata.pageNumber,
                fileKey,
            },
        } as PineconeRecord;
    } catch (error) {
        console.log("error embedding document", error);
        throw error;
    }
}

export const truncateStringByBytes = (str: string, bytes: number) => {
    const enc = new TextEncoder();
    return new TextDecoder("utf-8").decode(enc.encode(str).slice(0, bytes));
};

async function prepareDocument(page: PDFPage, fileKey: string) {
    console.log(page, "page in preparedoc");
    let { pageContent, metadata } = page;
    pageContent = pageContent.replace(/\n/g, "");
    // split the docs
    const splitter = new RecursiveCharacterTextSplitter();
    const docs = await splitter.splitDocuments([
        new Document({
            pageContent,
            metadata: {
                pageNumber: metadata.loc.pageNumber,
                text: truncateStringByBytes(pageContent, 36000),
                fileKey,
            },
        }),
    ]);
    return docs;
}

