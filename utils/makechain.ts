import { OpenAIChat } from 'langchain/llms';
import { LLMChain, ChatVectorDBQAChain, loadQAChain } from 'langchain/chains';
import { PineconeStore } from 'langchain/vectorstores';
import { PromptTemplate } from 'langchain/prompts';
import { CallbackManager } from 'langchain/callbacks';

const CONDENSE_PROMPT =
  PromptTemplate.fromTemplate(`次のような会話とフォローアップの質問がある場合、フォローアップの質問を独立した質問となるように言い換える。

Chat履歴:
{chat_history}
Follow Up Input: {question}
Standalone question:`);

const QA_PROMPT = PromptTemplate.fromTemplate(
  `あなたは、役に立つアドバイスを提供するAIアシスタントです。あなたには、以下のような長い文書の一部を抽出したものと、質問が与えられています。提供された文脈に基づいて、会話形式の回答を提供しなさい。
  以下の文脈を参照するハイパーリンクのみを提供する必要があります。ハイパーリンクを作らないでください。
  下の長い文章から答えが見つからない場合は、「その質問に関する文章はありませんでした。」と言ってください。答えを作ろうとしないでください。
  質問が文脈に関係ない場合は、文脈に関係する質問にしか答えられないように調整されていることを丁寧に答えてください。
  
  質問: {question}
  =========
  {context}
  =========
  Markdown形式での答え:`,
  );

export const makeChain = (
  vectorstore: PineconeStore,
  onTokenStream?: (token: string) => void,
) => {
  const questionGenerator = new LLMChain({
    llm: new OpenAIChat({ temperature: 0 }),
    prompt: CONDENSE_PROMPT,
  });
  const docChain = loadQAChain(
    new OpenAIChat({
      temperature: 0,
      modelName: 'gpt-3.5-turbo', //change this to older versions (e.g. gpt-3.5-turbo) if you don't have access to gpt-4
      streaming: Boolean(onTokenStream),
      callbackManager: onTokenStream
        ? CallbackManager.fromHandlers({
            async handleLLMNewToken(token) {
              onTokenStream(token);
              console.log(token);
            },
          })
        : undefined,
    }),
    { prompt: QA_PROMPT },
  );

  return new ChatVectorDBQAChain({
    vectorstore,
    combineDocumentsChain: docChain,
    questionGeneratorChain: questionGenerator,
    returnSourceDocuments: true,
    k: 2, //number of source documents to return
  });
};
