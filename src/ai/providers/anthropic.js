// Anthropic (Claude) provider adapter
// Runs a full tool-use loop against /v1/messages and returns the final text.
const MAX_ITERATIONS = 5;

function toAnthropicTools(toolDefinitions) {
  return toolDefinitions.map(def => ({
    name: def.name,
    description: def.description,
    input_schema: def.parameters || { type: 'object', properties: {} }
  }));
}

async function callMessagesAPI({ systemPrompt, messages, tools }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_API_KEY is not set - cannot call Anthropic API');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-haiku-5-5',
      max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 1024,
      temperature: process.env.AI_TEMPERATURE !== undefined ? parseFloat(process.env.AI_TEMPERATURE) : 0.7,
      system: systemPrompt,
      messages,
      tools: tools && tools.length ? tools : undefined
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  return await res.json();
}

// executeTool(name, args, context) => Promise<result>
async function runAgentTurn({ systemPrompt, history, message, toolDefinitions, executeTool, context }) {
  const tools = toAnthropicTools(toolDefinitions);

  // Seed the conversation with prior turns (plain text) plus the new user message.
  const messages = history.map(h => ({
    role: h.role === 'assistant' ? 'assistant' : 'user',
    content: h.content
  }));
  messages.push({ role: 'user', content: message });

  const executedToolCalls = [];
  let finalText = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await callMessagesAPI({ systemPrompt, messages, tools });

    const toolUseBlocks = (response.content || []).filter(b => b.type === 'tool_use');
    const textBlocks = (response.content || []).filter(b => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      finalText = textBlocks.map(b => b.text).join('\n').trim();
      break;
    }

    // Record the assistant's tool-use turn, then execute each tool and feed results back.
    messages.push({ role: 'assistant', content: response.content });

    const toolResultBlocks = [];
    for (const block of toolUseBlocks) {
      executedToolCalls.push({ id: block.id, name: block.name, arguments: block.input });
      try {
        const result = await executeTool(block.name, block.input || {}, context);
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      } catch (err) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify({ error: err.message }),
          is_error: true
        });
      }
    }

    messages.push({ role: 'user', content: toolResultBlocks });

    if (response.stop_reason !== 'tool_use') {
      // Model stopped without more tool calls pending but also gave no text - break to avoid looping forever.
      finalText = textBlocks.map(b => b.text).join('\n').trim();
      break;
    }
  }

  return { content: finalText, toolCalls: executedToolCalls };
}

module.exports = { runAgentTurn };
