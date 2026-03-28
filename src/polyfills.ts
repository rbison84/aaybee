// Polyfills for React Native
import * as Crypto from 'expo-crypto';

// Polyfill crypto.getRandomValues for uuid
if (typeof global.crypto !== 'object') {
  (global as any).crypto = {};
}

if (typeof global.crypto.getRandomValues !== 'function') {
  (global.crypto as any).getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const randomBytes = Crypto.getRandomBytes(array.byteLength);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(randomBytes);
    return array;
  };
}
