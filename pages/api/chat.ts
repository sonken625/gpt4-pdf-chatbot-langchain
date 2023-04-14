import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import { Chroma } from 'langchain/vectorstores';
import { makeChain } from '@/utils/makechain';
import { OpenAIChat } from 'langchain/llms';



export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { question, history } = req.body;
  
  if (!question) {
    return res.status(400).json({ message: 'No question in the request' });
  }
  
  const sanitizedQuestion =  await new OpenAIChat({
    temperature: 0,
    modelName: 'gpt-3.5-turbo', //change this to older versions (e.g. gpt-3.5-turbo) if you don't have access to gpt-4
    streaming: false,
  })._call(`
  Extract the main keywords or phrases from this question: ${question}
  Keywords:
  `)

  const vectorStore = await Chroma.fromExistingCollection(
    new OpenAIEmbeddings({}),
    {
      collectionName: 'langchain_store',
      url: 'http://localhost:8882',// もし別URLでChromaを立ち上げている場合はここを変更する
    },
  );
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  
  const sendData = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  sendData(JSON.stringify({ data: '' }));
  const chain = makeChain(vectorStore, (token: string) => {
    sendData(JSON.stringify({ data: token }));
  });

  try {
    const response = await chain.call({
      question: sanitizedQuestion,
      chat_history: history || [],
    });


    console.log('response', response);
    sendData(JSON.stringify({ sourceDocs: response.sourceDocuments }));
  } catch (error) {
    console.log('error', error);
  } finally {
    sendData('[DONE]');
    res.end();
  }
}
