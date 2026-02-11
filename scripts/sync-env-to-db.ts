#!/usr/bin/env tsx
/**
 * 🔄 Script de synchronisation .env → Database
 *
 * SOURCE DE VÉRITÉ : /opt/qadhya/.env.production.local
 *
 * Ce script synchronise les clés depuis le fichier .env vers la base de données.
 * À exécuter au démarrage de l'application ou en cas de mise à jour des clés.
 */

import crypto from 'crypto';
import { execSync } from 'child_process';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function encryptApiKey(apiKey: string, encryptionKey: string): string {
  const key = Buffer.from(encryptionKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();
  const result = Buffer.concat([iv, tag, encrypted]);

  return result.toString('base64');
}

async function main() {
  console.log('🔄 Synchronisation .env → Database\n');
  console.log('📂 Source de vérité : /opt/qadhya/.env.production.local\n');

  try {
    // Récupérer les variables depuis le serveur
    console.log('📥 Lecture des clés depuis .env.production.local...');

    const getEnvVars = `
source /opt/qadhya/.env.production.local
echo "GEMINI_API_KEY=\$GEMINI_API_KEY"
echo "OPENAI_API_KEY=\$OPENAI_API_KEY"
echo "GROQ_API_KEY=\$GROQ_API_KEY"
echo "DEEPSEEK_API_KEY=\$DEEPSEEK_API_KEY"
echo "OLLAMA_API_KEY=\$OLLAMA_API_KEY"
echo "ENCRYPTION_KEY=\$ENCRYPTION_KEY"
`;

    const envOutput = execSync(
      `ssh root@84.247.165.187 'bash -c "${getEnvVars.replace(/\n/g, '; ')}"'`
    ).toString();

    const env: Record<string, string> = {};
    envOutput.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        env[key.trim()] = value.trim();
      }
    });

    console.log('  ✅ Variables chargées');

    const encryptionKey = env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY manquante dans .env.production.local');
    }

    // Synchroniser chaque provider
    const providers = [
      { name: 'gemini', key: env.GEMINI_API_KEY, model: 'gemini-2.5-flash' },
      { name: 'openai', key: env.OPENAI_API_KEY, model: 'text-embedding-3-small' },
      { name: 'groq', key: env.GROQ_API_KEY, model: 'llama-3.3-70b-versatile' },
      { name: 'deepseek', key: env.DEEPSEEK_API_KEY, model: 'deepseek-chat' },
      { name: 'ollama', key: env.OLLAMA_API_KEY, model: 'qwen2.5:3b' },
    ];

    console.log('\n🔐 Cryptage et synchronisation vers la DB...\n');

    for (const provider of providers) {
      if (!provider.key) {
        console.log(`  ⚠️  ${provider.name} : Clé manquante, ignoré`);
        continue;
      }

      // Crypter la clé (sauf pour Ollama qui est local)
      let encrypted: string;
      if (provider.name === 'ollama') {
        encrypted = provider.key; // Pas besoin de crypter "local://ollama"
      } else {
        encrypted = encryptApiKey(provider.key, encryptionKey);
      }

      // Mettre à jour la DB
      const updateSql = `
        UPDATE api_keys
        SET
          api_key_encrypted = '${encrypted}',
          model_default = '${provider.model}',
          updated_at = NOW(),
          is_active = true
        WHERE provider = '${provider.name}'
        RETURNING provider, is_active;
      `;

      try {
        const result = execSync(
          `ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -t -A -F'|' -c \\"${updateSql}\\""`
        ).toString().trim();

        if (result) {
          console.log(`  ✅ ${provider.name} : Synchronisé`);
        } else {
          console.log(`  ⚠️  ${provider.name} : Non trouvé dans la DB`);
        }
      } catch (error: any) {
        console.error(`  ❌ ${provider.name} : Erreur - ${error.message}`);
      }
    }

    // Vérification finale
    console.log('\n🔍 Vérification finale...\n');

    const verifySql = `
      SELECT
        provider,
        is_active,
        model_default,
        to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') as derniere_maj
      FROM api_keys
      ORDER BY provider;
    `;

    const verifyResult = execSync(
      `ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \\"${verifySql}\\""`
    ).toString();

    console.log(verifyResult);

    console.log('\n✅ Synchronisation terminée avec succès !');
    console.log('\n📝 Note : Le fichier .env.production.local est la SOURCE DE VÉRITÉ');
    console.log('   Pour modifier une clé : éditer ce fichier puis relancer ce script');

  } catch (error: any) {
    console.error(`\n❌ Erreur : ${error.message}`);
    process.exit(1);
  }
}

main();
