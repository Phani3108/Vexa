/**
 * MongoDB Connection Configuration
 *
 * - MONGODB_URI set           → connect to it (Atlas / docker / self-hosted)
 * - MONGODB_URI unset (dev)   → boot an embedded MongoDB (mongodb-memory-server)
 *                               persisted to backend/.data/mongo so data survives restarts
 * - MONGODB_URI unset (prod)  → refuse to start
 */

import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

let isConnected = false;
let embeddedServer = null;

async function startEmbeddedMongo() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = path.resolve(here, '../../.data/mongo');
  fs.mkdirSync(dbPath, { recursive: true });
  embeddedServer = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger', port: Number(process.env.EMBEDDED_MONGO_PORT) || 27018 }
  });
  return embeddedServer.getUri('vexa');
}

export async function connectToMongoDB() {
  if (isConnected) return true;

  let mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is required in production');
    }
    console.warn('⚠️  MONGODB_URI not set — starting embedded MongoDB for local development');
    try {
      mongoUri = await startEmbeddedMongo();
    } catch (err) {
      console.error('❌ Could not start embedded MongoDB:', err.message);
      console.error('   Install dev deps (npm install) or set MONGODB_URI.');
      return false;
    }
  }

  try {
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;

    mongoose.connection.on('disconnected', () => {
      console.error('❌ MongoDB disconnected');
      isConnected = false;
    });
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
      isConnected = true;
    });
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    console.log(`✅ Connected to MongoDB${embeddedServer ? ' (embedded, persisted in backend/.data/mongo)' : ''}`);
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return false;
  }
}

export async function disconnectMongoDB() {
  await mongoose.disconnect().catch(() => {});
  if (embeddedServer) await embeddedServer.stop({ doCleanup: false }).catch(() => {});
  isConnected = false;
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export default mongoose;
