#!/usr/bin/env tsx
/**
 * Script de test des clés IA en production
 * Teste chaque provider configuré avec un prompt simple
 */

import postgres from 'postgres';

// Configuration de la base de données PROD
const sql = postgres({
  host: 'localhost',
  port: 5434, // Tunnel SSH prod
  database: 'qadhya',
  username: 'moncabinet',
  password: process.env.POSTGRES_PASSWORD || '',
  ssl: false,
});

interface ApiKey {
  id: string;
  provider: string;
  label: string;
  api_key_encrypted: string;
  base_url: string | null;
  model_default: string | null;
  is_active: boolean;
  tier: string;
}

// Décrypter la clé (simple décodage base64 pour le test)
function decryptKey(encrypted: string): string {
  try {
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  } catch {
    return encrypted; // Si ce n'est pas encodé, retourner tel quel
  }
}

// Tester Ollama (local)
async function testOllama(baseUrl: string, model: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Bonjour, réponds en un mot.',
        stream: false,
      }),
    });

    const latency = Date.now() - start;
    if (!response.ok) {
      return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return {
      success: true,
      message: `✅ Réponse: ${data.response?.substring(0, 50)}...`,
      latency
    };
  } catch (error: any) {
    return { success: false, message: `❌ Erreur: ${error.message}` };
  }
}

// Tester Groq
async function testGroq(apiKey: string, model: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Bonjour, réponds en un mot.' }],
        max_tokens: 10,
      }),
    });

    const latency = Date.now() - start;
    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return {
      success: true,
      message: `✅ Réponse: ${data.choices[0].message.content}`,
      latency
    };
  } catch (error: any) {
    return { success: false, message: `❌ Erreur: ${error.message}` };
  }
}

// Tester DeepSeek
async function testDeepSeek(apiKey: string, model: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const start = Date.now();
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Bonjour, réponds en un mot.' }],
        max_tokens: 10,
      }),
    });

    const latency = Date.now() - start;
    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return {
      success: true,
      message: `✅ Réponse: ${data.choices[0].message.content}`,
      latency
    };
  } catch (error: any) {
    return { success: false, message: `❌ Erreur: ${error.message}` };
  }
}

// Tester Gemini
async function testGemini(apiKey: string, model: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const start = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Bonjour, réponds en un mot.' }] }],
        }),
      }
    );

    const latency = Date.now() - start;
    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return {
      success: true,
      message: `✅ Réponse: ${data.candidates[0].content.parts[0].text}`,
      latency
    };
  } catch (error: any) {
    return { success: false, message: `❌ Erreur: ${error.message}` };
  }
}

// Tester OpenAI
async function testOpenAI(apiKey: string, model: string): Promise<{ success: boolean; message: string; latency?: number }> {
  const start = Date.now();
  try {
    // Test embeddings au lieu de chat pour OpenAI
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: 'Test embedding',
      }),
    });

    const latency = Date.now() - start;
    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `HTTP ${response.status}: ${error.substring(0, 100)}` };
    }

    const data = await response.json();
    return {
      success: true,
      message: `✅ Embedding généré (${data.data[0].embedding.length} dimensions)`,
      latency
    };
  } catch (error: any) {
    return { success: false, message: `❌ Erreur: ${error.message}` };
  }
}

// Test principal
async function main() {
  console.log('🔍 Test des clés IA sur PROD...\n');

  try {
    // Récupérer toutes les clés actives
    const keys = await sql<ApiKey[]>`
      SELECT id, provider, label, api_key_encrypted, base_url, model_default, is_active, tier
      FROM api_keys
      WHERE is_active = true
      ORDER BY provider
    `;

    console.log(`✅ ${keys.length} clés actives trouvées\n`);

    let successCount = 0;
    let failCount = 0;

    // Tester chaque clé
    for (const key of keys) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔑 Provider: ${key.provider.toUpperCase()}`);
      console.log(`📝 Label: ${key.label}`);
      console.log(`🎯 Modèle: ${key.model_default}`);
      console.log(`💰 Tier: ${key.tier}`);
      console.log(`${'='.repeat(60)}`);

      let result: { success: boolean; message: string; latency?: number };

      switch (key.provider) {
        case 'ollama':
          const ollamaUrl = key.base_url || 'http://host.docker.internal:11434';
          result = await testOllama(ollamaUrl, key.model_default || 'qwen2.5:3b');
          break;

        case 'groq':
          const groqKey = decryptKey(key.api_key_encrypted);
          result = await testGroq(groqKey, key.model_default || 'llama-3.3-70b-versatile');
          break;

        case 'deepseek':
          const deepseekKey = decryptKey(key.api_key_encrypted);
          result = await testDeepSeek(deepseekKey, key.model_default || 'deepseek-chat');
          break;

        case 'gemini':
          const geminiKey = decryptKey(key.api_key_encrypted);
          result = await testGemini(geminiKey, key.model_default || 'gemini-2.0-flash-exp');
          break;

        case 'openai':
          const openaiKey = decryptKey(key.api_key_encrypted);
          result = await testOpenAI(openaiKey, key.model_default || 'text-embedding-3-small');
          break;

        default:
          result = { success: false, message: '❌ Provider non supporté' };
      }

      if (result.success) {
        successCount++;
        console.log(`\n✅ SUCCÈS${result.latency ? ` (${result.latency}ms)` : ''}`);
      } else {
        failCount++;
        console.log(`\n❌ ÉCHEC`);
      }

      console.log(`📊 Résultat: ${result.message}`);

      // Mettre à jour last_used_at si succès
      if (result.success) {
        await sql`
          UPDATE api_keys
          SET last_used_at = NOW(), error_count = 0, last_error = NULL
          WHERE id = ${key.id}
        `;
      } else {
        await sql`
          UPDATE api_keys
          SET error_count = error_count + 1, last_error = ${result.message}
          WHERE id = ${key.id}
        `;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 RÉSUMÉ FINAL`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Succès: ${successCount}/${keys.length}`);
    console.log(`❌ Échecs: ${failCount}/${keys.length}`);
    console.log(`📈 Taux de réussite: ${((successCount / keys.length) * 100).toFixed(1)}%`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error: any) {
    console.error('❌ Erreur lors du test:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
