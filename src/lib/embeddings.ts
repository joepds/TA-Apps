import { OpenAIApi, Configuration } from 'openai-edge';

const config = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(config);

export async function getEmbeddings(text: string) {
    try {
        const response = await openai.createEmbedding({
            model: 'text-embedding-ada-002',
            input: text.replace(/\n/g, ' '),
        });
        console.log('API Response Status:', response.status);
        const result = await response.json();
        console.log('API Response:', result);

        if (result.error) {
            console.error('OpenAI API Error:', result.error);
            throw new Error('OpenAI API Error');
        }

        return result.data[0].embedding as number[];
    } catch (error) {
        console.log('error calling openai embeddings api', error);
        throw error;
    }
}