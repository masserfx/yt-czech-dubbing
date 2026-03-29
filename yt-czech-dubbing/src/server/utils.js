const fs = require('fs');
const path = require('path');

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
async function ensureDir(dir) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

module.exports = { ensureDir };
