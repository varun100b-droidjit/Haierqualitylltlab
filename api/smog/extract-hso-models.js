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
    const prompt = `You are an expert OCR vision specialist analyzing a photo taken of a computer monitor/screen showing an Excel or ERP filter popup with AC model numbers and production quantities.
Examine this image carefully.

OBJECTIVE:
Extract ALL models that start with "HSO" along with their production quantities.

CRITICAL RULES:
1. Typical HSO models in this image look like:
   - "HSO17-3NB-I:AC (900)" -> modelName: "HSO17-3NB-I:AC", qty: 900
   - "HSO18-3NB-I:AC (460)" -> modelName: "HSO18-3NB-I:AC", qty: 460
   - "HSO19-5NB-I:AC (315)" -> modelName: "HSO19-5NB-I:AC", qty: 315
   - "HSO52-3NB-I:AC (900)" -> modelName: "HSO52-3NB-I:AC", qty: 900
   - "HSO52-5NB-I:AC (373)" -> modelName: "HSO52-5NB-I:AC", qty: 373
2. On photos of computer monitors/screens, the letter 'O' in 'HSO' might look like digit '0' (e.g. "HS017..."). Always normalize it to "HSO".
3. STRICT FILTERING: Extract ONLY models starting with "HSO". Completely IGNORE models starting with "HSI" (e.g. HSI17N..., HSI18CP..., HSI19GHD..., HSI52VP...), ignore "HTO" (e.g. HTO24...), and ignore "(All)".
4. For each model:
   - "modelName": Exact model string starting with HSO (e.g. "HSO17-3NB-I:AC")
   - "qty": The numerical quantity (integer) inside the parentheses or adjacent text.

OUTPUT FORMAT:
Return ONLY a valid JSON array of objects:
[
  { "modelName": "HSO17-3NB-I:AC", "qty": 900 },
  { "modelName": "HSO18-3NB-I:AC", "qty": 460 },
  { "modelName": "HSO19-5NB-I:AC", "qty": 315 },
  { "modelName": "HSO52-3NB-I:AC", "qty": 900 },
  { "modelName": "HSO52-5NB-I:AC", "qty": 373 }
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

    const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
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
              .filter(item => {
                if (!item || typeof item.modelName !== 'string') return false;
                const m = item.modelName.trim().toUpperCase();
                return m.startsWith('HSO') || m.startsWith('HS0') || m.startsWith('H50');
              })
              .map(item => {
                let mName = item.modelName.trim();
                mName = mName.replace(/^H(?:S|5)[O0o][\s\-_]*/i, 'HSO');
                mName = mName.replace(/\s*-\s*/g, '-').replace(/\s*:\s*/g, ':');
                mName = mName.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '');
                mName = mName.replace(/-(?:1|l|\||i):AC$/i, '-I:AC').toUpperCase();

                return {
                  modelName: mName,
                  qty: Math.max(1, parseInt(String(item.qty), 10) || 100)
                };
              });
            if (extractedData.length > 0) {
              break;
            }
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
      useClientFallback: extractedData.length === 0,
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
