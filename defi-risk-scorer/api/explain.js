// api/explain.js
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  const { protocol, pair, hhi, lpCount, whale, riskLabel } = req.body || {};

  if (typeof hhi !== 'number' || typeof lpCount !== 'number') {
    return res.status(400).json({ error: 'Missing or invalid hhi/lpCount in request body' });
  }

  const systemInstruction = `You are a DeFi risk analyst. You explain the practical risk implication of a liquidity pool to someone considering depositing funds. Write exactly ONE short sentence, 25 words or fewer. Be direct and concrete. No hedging, no disclaimers, no markdown, no restating the input numbers. Explain what the data MEANS. Output only the sentence — no preamble, no labels, no quotes.`;

  const userMessage = `Pool data:
Protocol: ${protocol}
Pair: ${pair}
Concentration (HHI, 0 to 1 scale): ${hhi}
Risk level: ${riskLabel}
Active liquidity providers: ${lpCount}${whale ? `\nDominant holder: ${whale}` : ''}

Write one sentence explaining the practical risk implication.`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userMessage }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errText}`);
    }

    const data = await response.json();

    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p) => p.text && !p.thought);
    const explanation = textPart?.text?.trim();

    if (!explanation) {
      console.error('Gemini response shape:', JSON.stringify(data, null, 2));
      throw new Error('No explanation returned from Gemini');
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ explanation });
  } catch (err) {
    console.error('Error generating AI explanation:', err);
    return res.status(502).json({ error: err.message });
  }
}