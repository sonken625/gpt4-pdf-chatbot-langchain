import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import { Chroma } from 'langchain/vectorstores';
import { pinecone } from '@/utils/pinecone-client';
import {TextLoader, } from 'langchain/document_loaders';
import { CustomPDFLoader } from '@/utils/customPDFLoader';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { DirectoryLoader } from 'langchain/document_loaders';
import { ChromaClient } from 'chromadb'
/* Name of directory to retrieve your files from */
const filePath = '/Users/koska-user1/OneDrive - トオカツフーズ株式会社/チャットボット用文書保存場所/就業規則';

export const run = async () => {
  
    /*load raw docs from the all files in the directory */
    const directoryLoader = new DirectoryLoader(filePath, {
      '.pdf': (path) => new CustomPDFLoader(path),
    });

    // const loader = new PDFLoader(filePath);
    const rawDocs = (await directoryLoader.load()).filter((value)=>{return value.pageContent.length>0});
    

    /* Split text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 200,
      chunkOverlap: 150,
    });

    const docs = await textSplitter.splitDocuments(rawDocs);
    console.log('split docs', docs);
    console.log('creating vector store...');
    /*create and store the embeddings in the vectorStore*/
    const embeddings = new OpenAIEmbeddings({modelName:"text-embedding-ada-002"});
    const client = new ChromaClient("http://localhost:8882");
    client.reset();

  const test =await Chroma.fromDocuments(docs.slice(0,10), embeddings, {
        collectionName: 'langchain_store',
        url:"http://localhost:8882" // もし別URLでChromaを立ち上げている場合はここを変更する
      });
  
  for (let i = 10; i < docs.length; i += 100) {
    await test.addDocuments(docs.slice(i, i + 10));
    console.log('ingested', i);
  }
  
};




(async () => {
  await run();
  console.log('ingestion complete');
})();
