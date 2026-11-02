// OpenAI (and Azure OpenAI-compatible) provider adapter
// Runs a full function-calling loop against /v1/chat/completions.
const MAX_ITERATIONS = 5;

function toOpenAITools(toolDefinitions) {
  return toolDefinitions.map(def => ({
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters || { type: 'object', properties: {} }
    }
  }));
}

function endpointFor() {
  if (process.env.AI_PROVIDER === 'azure') {
    // Expect a full deployment URL (including api-version) in AI_BASE_URL for Azure.
    if (!process.env.AI_BASE_URL) {
      throw new Error('AI_BASE_URL is required when AI_PROVIDER=azure');
    }
    return process.env.AI_BASE_URL;
  }
  return process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
}

async function callChatAPI({ systemPrompt, messages, tools }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_API_KEY is not set - cannot call the AI provider');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.AI_PROVIDER === 'azure') {
    headers['api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpointFor(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      temperature: process.env.AI_TEMPERATURE !== undefined ? parseFloat(process.env.AI_TEMPERATURE) : 0.7,
      max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 1024,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: tools && tools.length ? tools : undefined
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`AI provider error (${res.status}): ${errText}`);
  }

  return await res.json();
}

async function runAgentTurn({ systemPrompt, history, message, toolDefinitions, executeTool, context }) {
  const tools = toOpenAITools(toolDefinitions);

  const messages = history.map(h => ({
    role: h.role === 'assistant' ? 'assistant' : 'user',
    content: h.content
  }));
  messages.push({ role: 'user', content: message });

  const executedToolCalls = [];
  let finalText = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await callChatAPI({ systemPrompt, messages, tools });
    const choice = response.choices && response.choices[0];
    const msg = choice && choice.message;

    if (!msg) {
      throw new Error('Unexpected AI provider response shape');
    }

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalText = (msg.content || '').trim();
      break;
    }

    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

    for (const call of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
      executedToolCalls.push({ id: call.id, name: call.function.name, arguments: args });

      let resultContent;
      try {
        const result = await executeTool(call.function.name, args, context);
        resultContent = JSON.stringify(result);
      } catch (err) {
        resultContent = JSON.stringify({ error: err.message });
      }

      messages.push({ role: 'tool', tool_call_id: call.id, content: resultContent });
    }
  }

  return { content: finalText, toolCalls: executedToolCalls };
}

module.exports = { runAgentTurn };
