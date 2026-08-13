'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

function ensureDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function readJson(name, fallback) {
  ensureDir();
  const p = path.join(config.dataDir, name);
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    // 损坏的文件，返回兜底值
  }
  return fallback;
}

function writeJson(name, data) {
  ensureDir();
  const p = path.join(config.dataDir, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { readJson, writeJson, ensureDir };
