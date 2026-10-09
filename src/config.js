import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockAssistant } from './bedrock.js';
import { OfflineAssistant } from './assistant.js';

export function readConfiguration(environment = {}) {
  const provider = (environment.ASSISTANT_PROVIDER || 'offline').trim().toLowerCase();
  if (!['offline', 'bedrock'].includes(provider)) throw new Error('ASSISTANT_PROVIDER must be offline or bedrock.');
  if (provider === 'offline') return { provider };
  const modelId = environment.BEDROCK_MODEL_ID?.trim();
  const region = (environment.AWS_REGION || environment.AWS_DEFAULT_REGION)?.trim();
  if (!modelId) throw new Error('Set BEDROCK_MODEL_ID to a Converse/tool-use compatible model or inference profile available in your account.');
  if (!region) throw new Error('Set AWS_REGION for the Bedrock model you selected.');
  const maxTurns = Number(environment.BEDROCK_MAX_TURNS || 6);
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 6) throw new Error('BEDROCK_MAX_TURNS must be an integer from 1 to 6.');
  return { provider, region, modelId, maxTurns };
}

export function createAssistant(configuration = { provider: 'offline' }) {
  if (configuration.provider === 'offline') return new OfflineAssistant();
  if (configuration.provider !== 'bedrock' || !configuration.modelId || !configuration.region) throw new Error('Invalid Bedrock configuration.');
  const client = new BedrockRuntimeClient({ region: configuration.region, maxAttempts: 1 });
  const assistant = new BedrockAssistant({ client, modelId: configuration.modelId, maxTurns: configuration.maxTurns || 6 });
  assistant.dispose = () => client.destroy();
  return assistant;
}

export function providerStatus(configuration = { provider: 'offline' }) {
  const common = { provider: configuration.provider, timeZone: 'Asia/Kolkata' };
  if (configuration.provider === 'bedrock') return {
    ...common, configured: true, label: 'Bedrock configured',
    detail: 'AI requests use your AWS account. Model access is checked when you send a message.',
    modelId: configuration.modelId
  };
  return { ...common, configured: false, label: 'Offline demo', detail: 'No AI provider connected. Local requests use a bounded language router.' };
}
