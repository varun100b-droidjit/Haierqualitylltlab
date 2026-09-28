// Vercel Serverless Function for HSO Model Extraction from Photo
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Photo or imageBase64 is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        success: false,
        useClientFallback: true,
        note: 'Server Gemini API key not configured. Falling back to local OCR.'
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
    const prompt = `You are an expert OCR vision specialist analyzing an industrial/manufacturing spreadsheet or filter screen.
Examine this image carefully.
Look at the list of models and their associated quantities (e.g. inside parentheses like "(900)" or in adjoining text/columns).

STRICT FILTERING REQUIREMENT:
- Extract ONLY the models whose model name starts with "HSO" (case-insensitive, e.g. "HSO17-3NB-I:AC", "HSO18-3NB-I:AC", "HSO19-5NB-I:AC", "HSO52-3NB-I:AC", "HSO52-5NB-I:AC", etc.).
- Completely IGNORE all other models such as those starting with "HSI" (e.g. HSI17N, HSI18CP, HSI19GHD, HSI52VP) or "HTO" or "(All)". ONLY EXTRACT MODELS STARTING WITH "HSO".
- For each matching HSO model, parse:
  1. "modelName": Exact model string starting with HSO (e.g. "HSO17-3NB-I:AC").
  2. "qty": The numerical quantity (integer) associated with that model, such as the number in parentheses (e.g., if it says "(900)", qty is 900; "(460)" -> 460).

OUTPUT FORMAT:
Return ONLY a valid JSON array of objects:
[
  { "modelName": "HSO17-3NB-I:AC", "qty": 900 },
  { "modelName": "HSO18-3NB-I:AC", "qty": 460 }
]
No backticks, no markdown, just clean raw JSON array.`;

    const payload = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType || 'image/jpeg',
                data: cleanBase64
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json'
      }
    };

    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let extractedData = [];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          let cleaned = candidateText.trim();
          if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json/i, '').replace(/```$/g, '').trim();
          } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```/g, '').replace(/```$/g, '').trim();
          }

          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            extractedData = parsed
              .filter(item => item && typeof item.modelName === 'string' && item.modelName.trim().toUpperCase().startsWith('HSO'))
              .map(item => ({
                modelName: item.modelName.trim(),
                qty: Math.max(1, parseInt(String(item.qty), 10) || 0)
              }));
            break;
          }
        }
      } catch (err) {
        lastError = err?.message || 'Attempt failed';
      }
    }

    const totalQty = extractedData.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    return res.status(200).json({
      success: true,
      items: extractedData,
      totalCount: extractedData.length,
      totalQty,
      note: extractedData.length === 0 ? (lastError || 'No models starting with HSO found in the photo.') : undefined
    });
  } catch (err) {
    console.error('Vercel Smog OCR handler error:', err);
    return res.status(200).json({
      success: false,
      useClientFallback: true,
      error: err.message || 'Error processing photo'
    });
  }
}
