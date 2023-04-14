import { OpenAIChat } from 'langchain/llms';
import {LLMChain, ChatVectorDBQAChain, loadQAChain, StuffDocumentsChain} from 'langchain/chains';
import { Document } from 'langchain/document';
import { PineconeStore,Chroma} from 'langchain/vectorstores';
import { PromptTemplate } from 'langchain/prompts';
import { CallbackManager } from 'langchain/callbacks';
import {ChainValues} from "langchain/schema";

const CONDENSE_PROMPT =
  PromptTemplate.fromTemplate(`Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.
  Chat History:
  {chat_history}
  Follow Up Input: {question}
  Standalone question: `);

const QA_PROMPT = PromptTemplate.fromTemplate(
    `You are an AI assistant providing helpful advice for japanese. You are given the following extracted parts of some documents and file path and a question. Provide a conversational answer in Japanese based on the context provided. 
  Mention at the beginning where the file and name is. Do NOT make up hyperlinks.
  If you can't find the answer in the context below, don't try to make up an answer.
  If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.
  
  Question: {question}
  =========
  {source}
  =========
  Answer in Markdown:`,
  );


class CustomStuffDocumentsChain extends StuffDocumentsChain{
    async _call(values: ChainValues) {
        if (!(this.inputKey in values)) {
            throw new Error(`Document key ${this.inputKey} not found.`);
        }
        const { [this.inputKey]: docs, ...rest } = values;
        return await this.llmChain.call({
            ...rest,

            "source": (docs as Document[]).map(({ pageContent,metadata }) => (JSON.stringify({
                source: metadata.source+ (metadata.pdf_numpages? `(${metadata.pdf_numpages}ページ)`:""),
                text: pageContent
            })))
        });
    }
}


export const makeChain = (
  vectorstore: PineconeStore | Chroma,
  onTokenStream?: (token: string) => void,
) => {
  
  const questionGenerator = new LLMChain({
    llm: new OpenAIChat({ temperature: 0 }),
    prompt: CONDENSE_PROMPT,
  });

  const llmChain = new LLMChain({ prompt: QA_PROMPT, llm: new OpenAIChat({
          temperature: 0,
          modelName: 'gpt-4', //change this to older versions (e.g. gpt-3.5-turbo) if you don't have access to gpt-4
          streaming: Boolean(onTokenStream),
          callbackManager: onTokenStream
              ? CallbackManager.fromHandlers({
                  async handleLLMNewToken(token) {
                      onTokenStream(token);
                      console.log(token);
                  },
              })
              : undefined,
      }) });
  const docChain = new CustomStuffDocumentsChain({ llmChain });

  return new ChatVectorDBQAChain({
    vectorstore,
    combineDocumentsChain: docChain,
    questionGeneratorChain: questionGenerator,
    returnSourceDocuments: true,
    k: 3, //number of source documents to return
  });
};
