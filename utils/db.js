/**
 * Lightweight JSON-file database.
 * No native modules required (safe for any host, including Render free tier).
 * NOTE: For heavy production traffic, swap this for Postgres/Mongo later —
 * the function signatures below are intentionally simple so that swap is easy.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function ensureFile(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, '[]', 'utf8');
  }
}

function readAll(name) {
  ensureFile(name);
  const raw = fs.readFileSync(filePath(name), 'utf8');
  try {
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error(`Corrupt data file for ${name}, resetting.`, e);
    return [];
  }
}

function writeAll(name, arr) {
  ensureFile(name);
  fs.writeFileSync(filePath(name), JSON.stringify(arr, null, 2), 'utf8');
}

function insert(name, record) {
  const all = readAll(name);
  all.push(record);
  writeAll(name, all);
  return record;
}

function updateById(name, id, patch) {
  const all = readAll(name);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeAll(name, all);
  return all[idx];
}

function findById(name, id) {
  const all = readAll(name);
  return all.find((r) => r.id === id) || null;
}

function findOne(name, predicate) {
  const all = readAll(name);
  return all.find(predicate) || null;
}

function findMany(name, predicate) {
  const all = readAll(name);
  return predicate ? all.filter(predicate) : all;
}

function removeById(name, id) {
  const all = readAll(name);
  const next = all.filter((r) => r.id !== id);
  writeAll(name, next);
  return next.length !== all.length;
}

module.exports = {
  readAll,
  writeAll,
  insert,
  updateById,
  findById,
  findOne,
  findMany,
  removeById,
};
