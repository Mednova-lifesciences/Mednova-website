import { CONTEXTS, API_CONFIG } from '../config/api.config.js';

export async function handleAssistantRequest(req, res) {
  try {
    const question = (req.body?.question || '').toString().trim();
    const context = CONTEXTS[req.body?.context] ? req.body.context : 'general';

    if (!question) {
      return res.status(400).json({ error: 'A question is required.' });
    }
    if (question.length > API_CONFIG.maxQuestionLength) {
      return res.status(400).json({ error: 'Question is too long (max 600 characters).' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server is not configured with an API key yet.' });
    }

    const response = await fetch(API_CONFIG.openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || API_CONFIG.defaultModel,
        max_tokens: API_CONFIG.maxTokens,
        messages: [
          { role: 'system', content: CONTEXTS[context] },
          { role: 'user', content: question }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('OpenAI API error:', response.status, errBody);
      return res.status(502).json({ error: 'The assistant is temporarily unavailable.' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    res.json({ text: text || 'No response received.' });
  } catch (err) {
    console.error('Unexpected error in /api/assistant:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
