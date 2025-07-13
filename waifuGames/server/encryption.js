const CryptoJS = require('crypto-js');
const fs = require('fs').promises;
const path = require('path');

class Encryption {
  constructor() {
    this.keyFile = path.join(__dirname, '.encryption-key');
    this.ensureKey();
  }

  async ensureKey() {
    try {
      this.encryptionKey = await this.loadOrCreateKey();
    } catch (error) {
      console.error('Failed to initialize encryption key:', error);
      // Fallback to a default key (less secure, but functional)
      this.encryptionKey = 'default-encryption-key-please-change';
    }
  }

  async loadOrCreateKey() {
    try {
      const key = await fs.readFile(this.keyFile, 'utf-8');
      return key.trim();
    } catch {
      // Generate a new key
      const newKey = this.generateKey();
      await fs.writeFile(this.keyFile, newKey, 'utf-8');
      console.log('Generated new encryption key');
      return newKey;
    }
  }

  generateKey() {
    // Generate a random 256-bit key
    const array = new Uint8Array(32);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return Buffer.from(array).toString('hex');
  }

  encrypt(text) {
    if (!text) return '';
    try {
      return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
    } catch (error) {
      console.error('Encryption failed:', error);
      return text; // Return original if encryption fails
    }
  }

  decrypt(encryptedText) {
    if (!encryptedText) return '';
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Decryption failed:', error);
      return encryptedText; // Return original if decryption fails
    }
  }
}

module.exports = new Encryption();