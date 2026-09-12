// api/env-check.js
export default function handler(req, res) {
  res.status(200).json({
    hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
    hasGraphKey: !!process.env.GRAPH_API_KEY,
    deepseekKeyPrefix: process.env.DEEPSEEK_API_KEY?.slice(0, 8) || null,
    deepseekKeyLength: process.env.DEEPSEEK_API_KEY?.length || 0,
    envKeysVisible: Object.keys(process.env).filter(k =>
      k.includes('DEEPSEEK') || k.includes('GRAPH') || k.includes('DYNAMIC')
    ),
  });
}